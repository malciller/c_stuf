# Dio TCP Stream Reader

A TCP to WebSocket bridge for the Dio trading engine that enables real-time streaming of trading data to web clients.

## Overview

This project consists of two main components:

1. **C WebSocket Server** (`stream_reader.c`): Connects to a Dio trading engine via TCP and broadcasts data to WebSocket clients
2. **JavaScript Web Client**: A dashboard interface that displays streaming data through configurable widgets

The system supports multiple data streams including telemetry metrics, balance information, trading logs, and system status.

## Prerequisites

### C Server Requirements
- GCC compiler
- libwebsockets library
- POSIX compliant system (Linux/macOS)

### Web Client Requirements
- Modern web browser with WebSocket support
- No additional dependencies (uses CDN-hosted libraries)

## Installation

### Building the C Server

1. Install libwebsockets:
   ```bash
   # Ubuntu/Debian
   sudo apt-get install libwebsockets-dev

   # macOS with Homebrew
   brew install libwebsockets

   # Or build from source
   git clone https://github.com/warmcat/libwebsockets.git
   cd libwebsockets
   mkdir build && cd build
   cmake ..
   make && sudo make install
   ```

2. Build the server:
   ```bash
   gcc -o stream_reader stream_reader.c -lwebsockets -lpthread -lm
   ```

## Configuration

### Server Configuration

Edit the constants at the top of `stream_reader.c`:

```c
const char *TCP_HOST = "prod-node-1";        // Dio trading engine host
const char *TCP_PORT = "8080";              // Dio trading engine port
const char *TCP_TOKEN = "password";         // Authentication token
const char *STREAMS[] = {"telemetry", "balance", "log", "system"};  // Streams to subscribe to
```

### Client Configuration

The web client automatically detects the server host and port. By default it connects to:
- Host: Current hostname (or 'dev-node-1' for localhost)
- Port: 9000
- Protocol: ws:// (or wss:// for HTTPS)

To override these defaults, modify the constants in `js/data/state.js`:

```javascript
export const hostname = window.location.hostname || 'dev-node-1';
export const port = 9000;
export const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
```

## Usage

### Running the Server

1. Ensure the Dio trading engine is running and accessible
2. Run the compiled server:
   ```bash
   ./stream_reader
   ```

The server will:
- Connect to the configured Dio TCP endpoint
- Subscribe to specified data streams
- Start a WebSocket server on port 9000
- Begin broadcasting received data to connected clients

### Running the Web Client

1. Open `index.html` in a web browser
2. The client will automatically connect to the WebSocket server
3. Add widgets to display different types of data:
   - Telemetry widgets (gauges, counters, histograms)
   - Balance widgets
   - Log viewers
   - System status displays

## Data Streams

The system handles four main data stream types:

- **telemetry**: Performance metrics and statistics
- **balance**: Account balance and wallet information
- **log**: Trading engine logs and events
- **system**: System health and status metrics

## Architecture

```
Dio Trading Engine (TCP)
        |
        | TCP connection
        v
C WebSocket Server
        |
        | WebSocket connections
        v
JavaScript Web Client
    - Canvas-based widget system
    - Real-time data visualization
    - Persistent widget configurations
```

## Features

- Real-time data streaming from TCP to WebSocket
- Configurable widget-based dashboard
- Automatic reconnection on connection loss
- Message queuing and buffering
- Dark theme UI with Tailwind CSS
- Persistent widget layouts and settings
- Support for multiple concurrent WebSocket clients

## Troubleshooting

### Connection Issues
- Verify Dio trading engine is running and accessible
- Check TCP_HOST and TCP_PORT configuration
- Ensure firewall allows connections on configured ports

### WebSocket Connection Failures
- Confirm server is running and WebSocket port (9000) is accessible
- Check browser console for connection errors
- Verify hostname and port configuration in client

### Build Issues
- Ensure libwebsockets development headers are installed
- Check compiler output for missing dependencies
- Verify GCC version supports required C standards

