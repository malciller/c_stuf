# Dio TCP Stream Reader

A TCP to WebSocket bridge for the Dio trading engine that enables real-time streaming of trading data.

## Overview

This project provides a C WebSocket server (`stream_reader.c`) that connects to a Dio trading engine via TCP and broadcasts data to WebSocket clients.

The system supports multiple data streams including telemetry metrics, balance information, trading logs, and system status.

For an example frontend implementation, please see [https://github.com/malciller/js_stuf](https://github.com/malciller/js_stuf/tree/main/diodashboard)

## Prerequisites

### C Server Requirements
- GCC compiler
- libwebsockets library
- POSIX compliant system (Linux/macOS)

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
WebSocket Clients
```

## Features

- Real-time data streaming from TCP to WebSocket
- Automatic reconnection on connection loss
- Message queuing and buffering
- Support for multiple concurrent WebSocket clients

## Troubleshooting

### Connection Issues
- Verify Dio trading engine is running and accessible
- Check TCP_HOST and TCP_PORT configuration
- Ensure firewall allows connections on configured ports

### Build Issues
- Ensure libwebsockets development headers are installed
- Check compiler output for missing dependencies
- Verify GCC version supports required C standards

