// WebSocket connection management

import { protocol, hostname, port, connections, widgets } from '../data/state.js';
import { updateStatus } from './ui.js';
import { parseTelemetryMessage } from '../views/telemetry.js';
import { parseBalanceMessage } from '../views/balance.js';
import { parseSystemMessage } from '../views/system.js';
import { addMessage } from '../views/log.js';
import { telemetryData, balanceData, systemData, openOrdersData } from '../data/state.js';

// Widget update subscribers
const widgetSubscribers = {
  telemetry: new Set(),
  balance: new Set(),
  system: new Set(),
  log: new Set()
};

export function subscribeToStream(streamName, callback) {
  if (widgetSubscribers[streamName]) {
    widgetSubscribers[streamName].add(callback);
  }
}

export function unsubscribeFromStream(streamName, callback) {
  if (widgetSubscribers[streamName]) {
    widgetSubscribers[streamName].delete(callback);
  }
}

function notifyWidgets(streamName, data) {
  if (widgetSubscribers[streamName]) {
    widgetSubscribers[streamName].forEach(callback => {
      try {
        callback(data);
      } catch (error) {
        console.error(`Error in widget callback for ${streamName}:`, error);
      }
    });
  }
}

export function connectStream(streamName) {
  try {
    updateStatus(streamName, 'connecting', 'Connecting...');

    const ws = new WebSocket(`${protocol}//${hostname}:${port}/${streamName}`);

    ws.onopen = () => {
      try {
        updateStatus(streamName, 'connected', 'Connected');

        if (streamName === 'log') {
          // Logs stream: use addMessage
          addMessage(streamName, 'Connection established');

          // For logs stream, show a helpful message after a delay
          setTimeout(() => {
            try {
              const messagesEl = document.getElementById(`messages-${streamName}`);
              if (messagesEl && messagesEl.children.length === 1) { // Only "Connection established" message
                addMessage(streamName, 'Waiting for periodic log updates...');
              }
            } catch (error) {
              console.error(`${streamName}: Error checking for empty stream:`, error);
            }
          }, 2000); // Wait 2 seconds to see if data arrives
        } else {
          // Structured streams: initialize table with connection message
          const container = document.getElementById(`table-${streamName}`);
          if (container) {
            container.innerHTML = '<div class="py-8 text-center text-gray-500">Connected, waiting for data...</div>';
          }
        }
      } catch (error) {
        console.error(`${streamName}: Error in onopen handler:`, error);
      }
    };

    ws.onmessage = (event) => {
      try {
        const msg = event.data;

        // Validate message data
        if (!msg || msg.trim() === '') {
          console.warn(`${streamName}: Received empty message, ignoring`);
          return;
        }

        // Handle different stream types
        if (streamName === 'log') {
          // Logs stream: parse and notify widgets
          let logData;
          try {
            logData = JSON.parse(msg);
          } catch (e) {
            // Fallback for non-JSON messages
            logData = msg;
          }
          notifyWidgets('log', logData);
        } else {
          // Structured data streams: parse and notify widgets
          if (streamName === 'telemetry') {
            parseTelemetryMessage(msg);
            notifyWidgets('telemetry', { type: 'update', data: telemetryData });
          } else if (streamName === 'balance') {
            parseBalanceMessage(msg);
            notifyWidgets('balance', { type: 'update', data: { balances: balanceData, orders: openOrdersData } });
          } else if (streamName === 'system') {
            parseSystemMessage(msg);
            notifyWidgets('system', { type: 'update', data: systemData });
          }
        }
      } catch (error) {
        console.error(`${streamName}: Error processing WebSocket message:`, error);
        if (streamName === 'log') {
          addMessage(streamName, `Error processing message: ${error.message}`);
        } else {
          console.error(`${streamName}: Failed to parse structured data: ${error.message}`);
        }
      }
    };

    ws.onerror = (err) => {
      try {
        console.error(`${streamName}: WebSocket error`, err);
        updateStatus(streamName, 'error', 'Error');
        if (streamName === 'log') {
          addMessage(streamName, 'WebSocket error occurred');
        } else {
          const container = document.getElementById(`table-${streamName}`);
          if (container) {
            container.innerHTML = '<div class="py-8 text-center text-red-600">WebSocket error occurred</div>';
          }
        }
      } catch (error) {
        console.error(`${streamName}: Error in onerror handler:`, error);
      }
    };

    ws.onclose = (event) => {
      try {
        updateStatus(streamName, 'disconnected', 'Disconnected');

        // Provide more informative messages based on the stream and close reason
        let closeMessage = `Connection closed (${event.code})`;
        if (streamName === 'log' && event.code === 1000) {
          closeMessage = 'Periodic log update completed - will reconnect for next update';
        } else if (event.code === 1006) {
          closeMessage = 'Connection lost - attempting to reconnect';
        } else if (event.code === 1000) {
          closeMessage = 'Connection closed normally - will reconnect';
        }

        if (streamName === 'log') {
          addMessage(streamName, closeMessage);
        } else {
          const container = document.getElementById(`table-${streamName}`);
          if (container) {
            container.innerHTML = `<div class="py-8 text-center text-gray-500">${closeMessage}</div>`;
          }
        }

        // Auto-reconnect after 5 seconds
        setTimeout(() => connectStream(streamName), 5000);
      } catch (error) {
        console.error(`${streamName}: Error in onclose handler:`, error);
      }
    };

    connections[streamName] = ws;
  } catch (error) {
    console.error(`${streamName}: Error creating WebSocket connection:`, error);
    updateStatus(streamName, 'error', 'Failed to connect');
    if (streamName === 'log') {
      addMessage(streamName, `Failed to create connection: ${error.message}`);
    } else {
      const container = document.getElementById(`table-${streamName}`);
      if (container) {
        container.innerHTML = `<div class="py-8 text-center text-red-600">Failed to create connection: ${error.message}</div>`;
      }
    }
    // Retry connection after error
    setTimeout(() => connectStream(streamName), 5000);
  }
}

