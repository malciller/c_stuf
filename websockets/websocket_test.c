#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>
#include <libwebsockets.h>



struct per_session_data 
{

};


int callback(struct lws *wsi, enum lws_callback_reasons reason, void *user, void *in, size_t len) {
    switch (reason) {
        case LWS_CALLBACK_ESTABLISHED:  // New connection
            printf("Connection established.\n");
            // Schedule first timer to fire immediately (0 us = next poll cycle)
            lws_set_timer_usecs(wsi, 0);
            break;

        case LWS_CALLBACK_TIMER:  // Timer expired—send timestamp
            {
                time_t t = time(NULL);
                char timestamp[32];
                snprintf(timestamp, sizeof(timestamp), "%ld\n", t);  // Safe format with newline
                lws_write(wsi, timestamp, strlen(timestamp), LWS_WRITE_TEXT);
                printf("Sent: %s", timestamp);

                // Reschedule for 1 second later (1,000,000 us)
                lws_set_timer_usecs(wsi, 1000000ULL);
            }
            break;

        case LWS_CALLBACK_CLOSED:  // Disconnect (cancels timer auto)
            printf("Connection closed.\n");
            // Optional: lws_set_timer_usecs(wsi, -1ULL); to explicitly cancel
            break;

        // Add more cases as needed (e.g., LWS_CALLBACK_RECEIVE for incoming data)
        default:
            break;
    }
    return 0;
}


int main(int argc, char**argv)
{
    static struct lws_protocols protocols[] =   
    {    
        {

            "demo-protocol", // protocol name, should match the websocket protocol in frontend
            callback, //callback function pointer
            sizeof(struct per_session_data), //size of data for each session
            0, //id (unsigned int)
            0, // rx_buffer_size (size_t, 0 for default)
            NULL, //user (void *, fr protocol-specific data if needed)
            4096 // tx_packet_size (size_t, common default for text packets)
        },
        { NULL, NULL, 0, 0, 0, NULL, 0 } // terminator: match all fields with null
    };

    // create websocket context
    struct lws_context_creation_info info = 
    {
        .port = 3001, //listening port
        .protocols = protocols //protocol list
    };
    struct lws_context *context = lws_create_context(&info);

    //check if websocket context creation was successful
    if (!context) 
    {
        printf("Failed to create Websocket context.\n");
        return -1;
    }

    //enter the loop and wat for websocket connections
    while (1)
    {
        lws_service(context, 50);
    }

    //clean up and close the websocket context
    lws_context_destroy(context);

    return 0;
}