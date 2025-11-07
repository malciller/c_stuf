#define _POSIX_C_SOURCE 200809L
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdarg.h>
#include <errno.h>
#include <unistd.h>
#include <pthread.h>
#include <time.h>
#include <signal.h>
#include <fcntl.h>
#include <netdb.h>
#include <sys/socket.h>
#include <sys/types.h>
#include <arpa/inet.h>

#include <libwebsockets.h>

#define INITIAL_BUF 4096
#define MAX_BUF_SIZE (1024 * 1024 * 10)  // 10MB maximum buffer size
#define MAX_BACKOFF_SEC 30
#define MAX_QUEUE 1024
#define MAX_MESSAGE_QUEUE 2000  // Maximum messages per channel queue
#define BASE_WS_PORT 9000

const char *TCP_HOST = "prod-node-1";
const char *TCP_PORT = "8080";
const char *TCP_TOKEN = "password";
const char *STREAMS[] = {"telemetry", "balance", "log", "system"};
#define STREAM_COUNT (sizeof(STREAMS)/sizeof(STREAMS[0]))

typedef struct message_node {
    char *data;
    size_t len;
    struct message_node *next;
} message_node_t;

typedef struct {
    message_node_t *head;
    message_node_t *tail;
    size_t size;
    size_t max_size;
} message_queue_t;

typedef struct ws_client {
    struct lws *wsi;
    struct ws_client *next;
    char *message_sent;  // Pointer to the message this client is currently sending (or NULL if done)
    size_t message_sent_len;  // Length of message being sent
    message_queue_t client_queue;  // Per-client message queue for broadcasting
} ws_client_t;

typedef struct {
    ws_client_t *clients;
    pthread_mutex_t lock;
    char stream_name[32];

    // Message queue for buffering messages
    message_queue_t message_queue;
} ws_channel_t;

ws_channel_t channels[STREAM_COUNT];
static struct lws_context *g_context = NULL;
static volatile sig_atomic_t g_shutdown = 0;

// ----------------- Signal Handling -----------------
static void signal_handler(int sig) {
    (void)sig;  // Unused parameter
    g_shutdown = 1;
    if (g_context) {
        lws_cancel_service(g_context);
    }
}

// ----------------- Logging -----------------
static void log_msg(const char *fmt, ...) {
    // Skip logging to prevent infinite loop when processing log streams
    // The upstream server captures stderr and sends it back as log messages
    // Only skip messages that are specifically about the "log" stream, not all messages containing "log"
    char buf[1024];
    va_list ap;
    va_start(ap, fmt);
    vsnprintf(buf, sizeof(buf), fmt, ap);
    va_end(ap);

    // Skip logging if the message is specifically about the log stream (contains "stream 'log'" or "stream \"log\"")
    if (strstr(buf, "stream 'log'") != NULL || strstr(buf, "stream \"log\"") != NULL || 
        strstr(buf, "stream log") != NULL) {
        return;
    }

    va_start(ap, fmt);
    time_t t = time(NULL);
    struct tm tm;
    localtime_r(&t, &tm);
    char timestr[32];
    strftime(timestr, sizeof(timestr), "%Y-%m-%d %H:%M:%S", &tm);
    fprintf(stderr, "[%s] ", timestr);
    vfprintf(stderr, fmt, ap);
    fprintf(stderr, "\n");
    va_end(ap);
}

// ----------------- Message Queue Operations -----------------
static void free_message_queue(ws_channel_t *ch) {
    message_node_t *node = ch->message_queue.head;
    while (node) {
        message_node_t *next = node->next;
        free(node->data);
        free(node);
        node = next;
    }
    ch->message_queue.head = NULL;
    ch->message_queue.tail = NULL;
    ch->message_queue.size = 0;
}

// ----------------- Message Broadcasting -----------------
static void broadcast_message(ws_channel_t *ch, const char *data, size_t len) {
    // Early return if no clients connected
    if (!ch->clients) {
        return;
    }

    // Process each client - continue even if one fails
    ws_client_t *client = ch->clients;
    while (client) {
        // Check if we need to drop oldest messages to make room
        while (client->client_queue.size >= client->client_queue.max_size) {
            if (!client->client_queue.head) break;  // Safety check

            message_node_t *oldest = client->client_queue.head;
            client->client_queue.head = oldest->next;
            if (!client->client_queue.head) {
                client->client_queue.tail = NULL;
            }
            free(oldest->data);
            free(oldest);
            client->client_queue.size--;

            if (client->client_queue.size % 100 == 0) {
                log_msg("WARNING: Dropped oldest messages in client queue for stream '%s' (queue size: %zu)", ch->stream_name, client->client_queue.size);
            }
        }

        // Allocate memory for the message node
        message_node_t *node = malloc(sizeof(message_node_t));
        if (!node) {
            log_msg("ERROR: Failed to allocate message node for client broadcast on stream '%s' - skipping this client", ch->stream_name);
            client = client->next;
            continue;
        }

        // Allocate memory for the message data
        node->data = malloc(len + 1);
        if (!node->data) {
            free(node);
            log_msg("ERROR: Failed to allocate message data for client broadcast on stream '%s' - skipping this client", ch->stream_name);
            client = client->next;
            continue;
        }

        // Copy the message data
        memcpy(node->data, data, len);
        node->data[len] = '\0';  // Null terminate for safety
        node->len = len;
        node->next = NULL;

        // Add to client's queue
        if (client->client_queue.tail) {
            client->client_queue.tail->next = node;
            client->client_queue.tail = node;
        } else {
            client->client_queue.head = client->client_queue.tail = node;
        }
        client->client_queue.size++;

        // Request writeable callback for this client
        lws_callback_on_writable(client->wsi);

        client = client->next;
    }
}

// ----------------- TCP Connect -----------------
static int connect_host(const char *host, const char *port) {
    struct addrinfo hints = {0}, *res = NULL, *rp;
    hints.ai_family = AF_UNSPEC;
    hints.ai_socktype = SOCK_STREAM;

    int s = getaddrinfo(host, port, &hints, &res);
    if (s != 0) {
        log_msg("getaddrinfo(%s:%s) failed: %s", host, port, gai_strerror(s));
        return -1;
    }

    int fd = -1;
    for (rp = res; rp != NULL; rp = rp->ai_next) {
        fd = socket(rp->ai_family, rp->ai_socktype, rp->ai_protocol);
        if (fd == -1) {
            log_msg("ERROR: socket() failed for %s:%s: %s", host, port, strerror(errno));
            continue;
        }

        // Set socket to non-blocking mode
        int flags = fcntl(fd, F_GETFL, 0);
        if (flags == -1) {
            log_msg("ERROR: fcntl(F_GETFL) failed for %s:%s: %s", host, port, strerror(errno));
            close(fd);
            fd = -1;
            continue;
        }
        if (fcntl(fd, F_SETFL, flags | O_NONBLOCK) == -1) {
            log_msg("ERROR: fcntl(F_SETFL) failed for %s:%s: %s", host, port, strerror(errno));
            close(fd);
            fd = -1;
            continue;
        }

        if (connect(fd, rp->ai_addr, rp->ai_addrlen) == 0) break;
        if (errno == EINPROGRESS) {
            // Non-blocking connect in progress - wait a bit and check
            fd_set writefds;
            struct timeval tv = {1, 0}; // 1 second timeout
            FD_ZERO(&writefds);
            FD_SET(fd, &writefds);
            int ret = select(fd + 1, NULL, &writefds, NULL, &tv);
            if (ret > 0) {
                // Check if connect succeeded
                int optval;
                socklen_t optlen = sizeof(optval);
                if (getsockopt(fd, SOL_SOCKET, SO_ERROR, &optval, &optlen) == 0 && optval == 0) {
                    break; // Connection successful
                }
            }
        }
        log_msg("ERROR: connect() failed for %s:%s: %s", host, port, strerror(errno));
        close(fd);
        fd = -1;
    }
    freeaddrinfo(res);
    return fd;
}

// ----------------- Send Stream Header -----------------
static int send_stream_header(int fd, const char *stream) {
    // If token is set, send token first
    if (TCP_TOKEN != NULL && strlen(TCP_TOKEN) > 0) {
        size_t token_len = strlen(TCP_TOKEN);
        char *token_buf = malloc(token_len + 2);
        if (!token_buf) return -1;
        memcpy(token_buf, TCP_TOKEN, token_len);
        token_buf[token_len] = '\n';
        token_buf[token_len + 1] = '\0';
        ssize_t w = send(fd, token_buf, strlen(token_buf), 0);
        free(token_buf);
        if (w <= 0) {
            log_msg("failed to send token: %s", strerror(errno));
            return -1;
        }
    }

    // Send stream type
    size_t len = strlen(stream);
    char *buf = malloc(len + 2);
    if (!buf) return -1;
    memcpy(buf, stream, len);
    buf[len] = '\n';
    buf[len + 1] = '\0';
    ssize_t w = send(fd, buf, strlen(buf), 0);
    free(buf);
    if (w <= 0) {
        log_msg("failed to send stream header: %s", strerror(errno));
        return -1;
    }
    return 0;
}

// ----------------- TCP Message Handler -----------------
static void handle_tcp_message(const char *stream, const char *msg) {
    time_t now = time(NULL);
    char ts[32];
    struct tm tm;
    localtime_r(&now, &tm);
    strftime(ts, sizeof(ts), "%Y-%m-%dT%H:%M:%S%z", &tm);
    size_t msg_len = strlen(msg);
    printf("%s | %s | [%zu bytes]\n", ts, stream, msg_len);
    fflush(stdout);

    for (size_t i = 0; i < STREAM_COUNT; i++) {
        if (strcmp(stream, channels[i].stream_name) == 0) {
            pthread_mutex_lock(&channels[i].lock);

            // Broadcast message to all connected WebSocket clients
            broadcast_message(&channels[i], msg, msg_len);

            // Log client count for this stream
            size_t client_count = 0;
            ws_client_t *client = channels[i].clients;
            while (client) {
                client_count++;
                client = client->next;
            }
            if (client_count > 0 && client_count % 10 == 0) {
                log_msg("INFO: Stream '%s' has %zu connected clients", channels[i].stream_name, client_count);
            }

            pthread_mutex_unlock(&channels[i].lock);
            break;
        }
    }
}

// ----------------- TCP Read Loop -----------------
static int read_loop_dispatch(int fd, const char *stream) {
    size_t cap = INITIAL_BUF;
    char *buf = malloc(cap);
    if (!buf) return -1;
    size_t used = 0;

    while (1) {
        // Use select to wait for data availability with a timeout
        fd_set readfds;
        struct timeval tv = {0, 10000}; // 10ms timeout
        FD_ZERO(&readfds);
        FD_SET(fd, &readfds);

        int ret = select(fd + 1, &readfds, NULL, NULL, &tv);
        if (ret < 0) {
            if (errno == EINTR) continue; // Interrupted by signal, retry
            log_msg("ERROR: select() failed for stream %s: %s (errno=%d)", stream, strerror(errno), errno);
            free(buf);
            return -1;
        }
        if (ret == 0) {
            // Timeout - check if we should continue processing
            continue;
        }

        // Data is available, try to read
        ssize_t n = recv(fd, buf + used, (ssize_t)(cap - used), 0);
        if (n < 0) {
            if (errno == EAGAIN || errno == EWOULDBLOCK) {
                // No data available right now, continue
                continue;
            }
            log_msg("ERROR: recv() failed for stream %s: %s (errno=%d)", stream, strerror(errno), errno);
            free(buf);
            return -1;
        }
        if (n == 0) {
            log_msg("INFO: Connection closed by server for stream %s (normal EOF)", stream);
            free(buf);
            return 0;  // Normal completion, don't reconnect
        }
        used += (size_t)n;

        size_t start = 0;
        for (size_t i = 0; i < used; i++) {
            if (buf[i] == '\n') {
                size_t len = i - start;
                char *msg = malloc(len + 1);
                if (!msg) {
                    log_msg("ERROR: Failed to allocate message buffer for stream %s", stream);
                    continue;
                }
                memcpy(msg, buf + start, len);
                msg[len] = '\0';
                if (len > 0 && msg[len - 1] == '\r') msg[len - 1] = '\0';
                handle_tcp_message(stream, msg);
                free(msg);
                start = i + 1;
            }
        }

        if (start < used) {
            memmove(buf, buf + start, used - start);
            used -= start;
        } else {
            used = 0;
        }

        if (used == cap) {
            size_t newcap = cap * 2;
            // Prevent buffer from growing beyond maximum size
            if (newcap > MAX_BUF_SIZE) {
                log_msg("ERROR: Buffer would exceed maximum size (%zu bytes) for stream %s", MAX_BUF_SIZE, stream);
                free(buf);
                return -1;
            }
            char *nptr = realloc(buf, newcap);
            if (!nptr) {
                log_msg("ERROR: Failed to realloc buffer for stream %s", stream);
                free(buf);
                return -1;
            }
            buf = nptr;
            cap = newcap;
            log_msg("DEBUG: Buffer grown to %zu bytes for stream %s", cap, stream);
        }
    }
}

// ----------------- TCP Thread -----------------
typedef struct {
    char *host;
    char *port;
    char *stream;
} stream_spec_t;

static void *tcp_thread(void *arg) {
    stream_spec_t *spec = (stream_spec_t *)arg;
    int backoff = 1;

    for (;;) {
        log_msg("connecting to %s:%s for stream '%s'", spec->host, spec->port, spec->stream);
        int fd = connect_host(spec->host, spec->port);
        if (fd < 0) { sleep(backoff); backoff = backoff < MAX_BACKOFF_SEC ? backoff * 2 : MAX_BACKOFF_SEC; continue; }

        if (send_stream_header(fd, spec->stream) != 0) { close(fd); sleep(backoff); backoff = backoff < MAX_BACKOFF_SEC ? backoff * 2 : MAX_BACKOFF_SEC; continue; }

        backoff = 1;
        log_msg("subscribed to stream '%s'", spec->stream);
        int result = read_loop_dispatch(fd, spec->stream);
        close(fd);

        if (result == 0) {
            // Normal completion (EOF), wait before reconnecting for periodic updates
            log_msg("INFO: Stream '%s' completed normally, will reconnect for next periodic update", spec->stream);
            sleep(5);  // Wait 5 seconds before reconnecting for periodic updates
        } else {
            // Error occurred, exponential backoff
            sleep(backoff);
            backoff = backoff < MAX_BACKOFF_SEC ? backoff * 2 : MAX_BACKOFF_SEC;
        }
    }
    return NULL;
}

// ----------------- WebSocket Callback -----------------
static int ws_callback(struct lws *wsi, enum lws_callback_reasons reason,
                       void *user, void *in, size_t len) {
    (void)len;  // Unused parameter
    ws_channel_t *ch = (ws_channel_t *)user;

    // Skip callbacks for protocols with NULL user (e.g., default protocols)
    // except for HTTP_CONFIRM_UPGRADE which needs to route connections
    if (!ch && reason != LWS_CALLBACK_HTTP_CONFIRM_UPGRADE) {
        return 0;
    }

    switch (reason) {
        case LWS_CALLBACK_HTTP_CONFIRM_UPGRADE: {
            // Handle WebSocket upgrade requests and route to correct channel
            // Note: 'in' contains the protocol name (e.g., "websocket"), not the URI path
            char path[256];
            int path_len = lws_hdr_copy(wsi, path, sizeof(path), WSI_TOKEN_GET_URI);
            if (path_len <= 0) {
                log_msg("DEBUG: Failed to get URI path from HTTP upgrade request");
                return -1;
            }

            // Ensure null termination
            if (path_len >= (int)sizeof(path)) path_len = (int)sizeof(path) - 1;
            path[path_len] = '\0';

            log_msg("DEBUG: HTTP confirm upgrade for protocol '%s', URI path '%s'", (char *)in, path);

            // Extract stream name from path (remove leading '/')
            const char *stream_name = path;
            if (*stream_name == '/') stream_name++;

            // Find matching channel
            for (size_t i = 0; i < STREAM_COUNT; i++) {
                if (strcmp(stream_name, channels[i].stream_name) == 0) {
                    log_msg("DEBUG: Routing connection to stream '%s'", stream_name);

                    // Set the protocol for this connection
                    lws_set_wsi_user(wsi, &channels[i]);
                    return 0;  // Allow the upgrade
                }
            }

            log_msg("DEBUG: No matching stream found for path '%s', rejecting", path);
            return -1;  // Reject the connection
        }
        default: break;
    }


    switch (reason) {
        case LWS_CALLBACK_ESTABLISHED: {
            log_msg("DEBUG: LWS_CALLBACK_ESTABLISHED called for stream '%s'", ch->stream_name);

            // Fallback routing: if HTTP_CONFIRM_UPGRADE failed to set user correctly,
            // try to route based on URI path here
            if (!ch || strcmp(ch->stream_name, "") == 0) {
                log_msg("DEBUG: Channel not properly set, attempting fallback routing");

                char path[256];
                int path_len = lws_hdr_copy(wsi, path, sizeof(path), WSI_TOKEN_GET_URI);
                if (path_len > 0) {
                    if (path_len >= (int)sizeof(path)) path_len = (int)sizeof(path) - 1;
                    path[path_len] = '\0';

                    const char *stream_name = path;
                    if (*stream_name == '/') stream_name++;

                    // Find matching channel and set user
                    for (size_t i = 0; i < STREAM_COUNT; i++) {
                        if (strcmp(stream_name, channels[i].stream_name) == 0) {
                            log_msg("DEBUG: Fallback routing connection to stream '%s'", stream_name);
                            lws_set_wsi_user(wsi, &channels[i]);
                            ch = &channels[i];  // Update local pointer
                            break;
                        }
                    }
                }

                if (!ch || strcmp(ch->stream_name, "") == 0) {
                    log_msg("DEBUG: Fallback routing failed, connection will be unusable");
                    return -1;  // Reject connection
                }
            }

            ws_client_t *c = malloc(sizeof(ws_client_t));
            if (!c) {
                log_msg("ERROR: Failed to allocate client structure");
                return -1;
            }
            c->wsi = wsi;
            c->message_sent = NULL;
            c->message_sent_len = 0;
            c->client_queue.head = NULL;
            c->client_queue.tail = NULL;
            c->client_queue.size = 0;
            c->client_queue.max_size = MAX_MESSAGE_QUEUE;
            pthread_mutex_lock(&ch->lock);
            c->next = ch->clients;
            ch->clients = c;
            log_msg("DEBUG: WebSocket client connected to stream '%s'", ch->stream_name);
            // Request writeable callback if there are messages in the queue
            if (ch->message_queue.size > 0) {
                log_msg("DEBUG: Requesting writeable callback for new client on stream '%s' (queue size: %zu)", ch->stream_name, ch->message_queue.size);
                lws_callback_on_writable(wsi);
            }
            pthread_mutex_unlock(&ch->lock);
            break;
        }
        case LWS_CALLBACK_CLOSED: {
            pthread_mutex_lock(&ch->lock);
            ws_client_t **pp = &ch->clients;
            while (*pp) {
                if ((*pp)->wsi == wsi) {
                    ws_client_t *tmp = *pp;
                    *pp = tmp->next;

                    // Client disconnected - clean up any partial message it was working on
                    if (tmp->message_sent) {
                        free(tmp->message_sent);
                        tmp->message_sent = NULL;
                    }

                    // Clean up client's message queue
                    message_node_t *node = tmp->client_queue.head;
                    while (node) {
                        message_node_t *next = node->next;
                        free(node->data);
                        free(node);
                        node = next;
                    }

                    free(tmp);
                    break;
                }
                pp = &(*pp)->next;
            }

            pthread_mutex_unlock(&ch->lock);
            break;
        }
        case LWS_CALLBACK_SERVER_WRITEABLE: {
            pthread_mutex_lock(&ch->lock);

            // Find this client in the list
            ws_client_t *client = ch->clients;
            while (client && client->wsi != wsi) {
                client = client->next;
            }
            if (!client) {
                // Client not found (shouldn't happen, but be safe)
                pthread_mutex_unlock(&ch->lock);
                break;
            }

            // Check if this client is completing a partial message send
            if (client->message_sent) {
                // This is a continuation of a partial write
                // The message was already dequeued and sent partially
                // Mark it as complete and free the message
                free(client->message_sent);
                client->message_sent = NULL;
                client->message_sent_len = 0;

                // Check if there are more messages in the client's queue
                if (client->client_queue.size > 0) {
                    // Request another writeable callback to send the next message
                    lws_callback_on_writable(wsi);
                }
                pthread_mutex_unlock(&ch->lock);
                break;
            }

            // Try to dequeue the next message from this client's queue
            message_node_t *node = NULL;
            if (client->client_queue.head) {
                node = client->client_queue.head;
                client->client_queue.head = node->next;
                if (!client->client_queue.head) {
                    client->client_queue.tail = NULL;
                }
                client->client_queue.size--;
            }

            if (!node) {
                // No messages in client's queue
                client->message_sent = NULL;
                client->message_sent_len = 0;
                pthread_mutex_unlock(&ch->lock);
                break;
            }

            // Allocate buffer dynamically to handle large messages
            unsigned char *buf = malloc(LWS_PRE + node->len);
            if (!buf) {
                log_msg("ERROR: Failed to allocate buffer for message to client on stream '%s'", ch->stream_name);
                free(node->data);
                free(node);
                pthread_mutex_unlock(&ch->lock);
                break;
            }

            memcpy(&buf[LWS_PRE], node->data, node->len);

            // Send to the current client
            ssize_t ret = lws_write(wsi, &buf[LWS_PRE], node->len, LWS_WRITE_TEXT);
            free(buf);

            if (ret < 0) {
                // Connection is dead - will be cleaned up in CLOSED callback
                log_msg("WARNING: Write failed for client on stream '%s', connection may be dead (ret=%zd)", ch->stream_name, ret);
                free(node->data);
                free(node);
                client->message_sent = NULL;
                client->message_sent_len = 0;
                pthread_mutex_unlock(&ch->lock);
                break;
            }

            // If ret < node->len, libwebsockets is buffering the remainder
            // It will call us again when ready
            if ((size_t)ret < node->len) {
                // Partial write - track this message for completion
                client->message_sent = node->data;  // Keep the data for cleanup later
                client->message_sent_len = node->len;
                free(node);  // Free the node but keep the data
                pthread_mutex_unlock(&ch->lock);
                break;
            }

            // Full message sent successfully - free it
            free(node->data);
            free(node);
            client->message_sent = NULL;
            client->message_sent_len = 0;

            // Check if there are more messages in the client's queue
            if (client->client_queue.size > 0) {
                // Request another writeable callback to send the next message
                lws_callback_on_writable(wsi);
            }

            pthread_mutex_unlock(&ch->lock);
            break;
        }
        case LWS_CALLBACK_EVENT_WAIT_CANCELLED: {
            // Check this channel for pending messages and request writeable callbacks
            pthread_mutex_lock(&ch->lock);
            int client_count = 0;
            ws_client_t *client = ch->clients;
            while (client) {
                client_count++;
                client = client->next;
            }
            log_msg("DEBUG: LWS_CALLBACK_EVENT_WAIT_CANCELLED for stream '%s', clients=%d", ch->stream_name, client_count);
            // EVENT_WAIT_CANCELLED is not needed for immediate streaming - messages are sent directly
            pthread_mutex_unlock(&ch->lock);
            break;
        }
        default: break;
    }
    return 0;
}

// ----------------- Main -----------------
int main(void) {
    pthread_t tcp_threads[STREAM_COUNT];
    stream_spec_t specs[STREAM_COUNT];
    struct lws_protocols protocols[STREAM_COUNT + 1];

    // Set up signal handlers for graceful shutdown
    signal(SIGINT, signal_handler);
    signal(SIGTERM, signal_handler);

    for (size_t i = 0; i < STREAM_COUNT; i++) {
        strncpy(channels[i].stream_name, STREAMS[i], sizeof(channels[i].stream_name));
        pthread_mutex_init(&channels[i].lock, NULL);
        channels[i].clients = NULL;
        channels[i].message_queue.head = NULL;
        channels[i].message_queue.tail = NULL;
        channels[i].message_queue.size = 0;
        channels[i].message_queue.max_size = MAX_MESSAGE_QUEUE;

        protocols[i].name = STREAMS[i];
        protocols[i].callback = ws_callback;
        protocols[i].per_session_data_size = 0;
        protocols[i].rx_buffer_size = 0;
        protocols[i].id = 0;
        protocols[i].user = &channels[i];
    }
    protocols[STREAM_COUNT].name = NULL;
    protocols[STREAM_COUNT].callback = ws_callback;
    protocols[STREAM_COUNT].per_session_data_size = 0;
    protocols[STREAM_COUNT].rx_buffer_size = 0;
    protocols[STREAM_COUNT].id = 0;
    protocols[STREAM_COUNT].user = NULL;

    struct lws_context_creation_info info;
    memset(&info, 0, sizeof(info));
    info.port = BASE_WS_PORT;
    info.protocols = protocols;
    info.gid = -1;
    info.uid = -1;

    struct lws_context *context = lws_create_context(&info);
    if (!context) { fprintf(stderr, "libwebsockets init failed\n"); return 1; }

    g_context = context;

    // Start TCP threads after WebSocket context is initialized
    for (size_t i = 0; i < STREAM_COUNT; i++) {
        specs[i].host = strdup(TCP_HOST);
        specs[i].port = strdup(TCP_PORT);
        specs[i].stream = strdup(STREAMS[i]);
        if (!specs[i].host || !specs[i].port || !specs[i].stream) {
            log_msg("ERROR: Failed to allocate memory for thread spec %zu", i);
            return 1;
        }
        pthread_create(&tcp_threads[i], NULL, tcp_thread, &specs[i]);
    }

    log_msg("WebSocket server listening on port %d", BASE_WS_PORT);

    // Main service loop
    while (!g_shutdown) {
        lws_service(context, 50);
    }

    log_msg("Shutting down...");

    // Clean up message queues
    for (size_t i = 0; i < STREAM_COUNT; i++) {
        pthread_mutex_lock(&channels[i].lock);
        free_message_queue(&channels[i]);
        pthread_mutex_unlock(&channels[i].lock);
    }

    // Clean up thread specs
    for (size_t i = 0; i < STREAM_COUNT; i++) {
        free(specs[i].host);
        free(specs[i].port);
        free(specs[i].stream);
    }

    // Wait for TCP threads to finish (they will detect closed connections and exit)
    for (size_t i = 0; i < STREAM_COUNT; i++) {
        pthread_join(tcp_threads[i], NULL);
    }

    lws_context_destroy(context);
    return 0;
}
