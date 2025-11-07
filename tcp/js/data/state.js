// Data storage for structured streams - ALL METRICS ARE CACHED CLIENT-SIDE
// Metrics persist between updates and show last known values until new data arrives
// Only logs are not cached (they're append-only streaming data)
export const telemetryData = {}; // key -> {name, labels, value, cached_rate, last_updated}
export const balanceData = {};   // asset -> {asset, total_balance, wallets, last_updated}
export const openOrdersData = []; // Array of all open orders with all fields (refreshed, not cached)
export const systemData = {};    // metric_name -> {name, value, last_updated}

// Track collapsed/expanded state of sections and subsections
export const sectionState = {
  sections: {},      // streamName -> boolean (true = expanded, false = collapsed)
  subsections: {}    // subsectionId -> boolean
};

// Configuration
export const streams = ['balance', 'system', 'telemetry', 'log'];
export const hostname = window.location.hostname || 'dev-node-1';
export const port = 9000;
export const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
export const connections = {};

// Widget system state
export const widgets = new Map(); // widgetId -> widget instance
export const widgetConfig = {}; // Persistent widget configuration

// Widget registry - defines available widget types and their configurations
export const widgetRegistry = {
  // Telemetry widgets
  'telemetry-gauge': {
    type: 'telemetry',
    subtype: 'group',
    title: 'Gauge Metrics',
    description: 'Display all gauge-type telemetry metrics',
    category: 'telemetry',
    defaultSize: { width: 6, height: 4 }
  },
  'telemetry-counter': {
    type: 'telemetry',
    subtype: 'group',
    title: 'Counter Metrics',
    description: 'Display all counter-type telemetry metrics',
    category: 'telemetry',
    defaultSize: { width: 6, height: 4 }
  },
  'telemetry-histogram': {
    type: 'telemetry',
    subtype: 'group',
    title: 'Histogram Metrics',
    description: 'Display all histogram-type telemetry metrics',
    category: 'telemetry',
    defaultSize: { width: 8, height: 4 }
  },
  'telemetry-metric': {
    type: 'telemetry',
    subtype: 'single',
    title: 'Single Metric',
    description: 'Display a single telemetry metric',
    category: 'telemetry',
    defaultSize: { width: 4, height: 3 },
    dynamic: true // These are created dynamically from metrics
  },

  // Balance widgets
  'balance-assets': {
    type: 'balance',
    subtype: 'group',
    title: 'Asset Balances',
    description: 'Display all asset balances',
    category: 'balance',
    defaultSize: { width: 8, height: 6 }
  },
  'balance-orders': {
    type: 'balance',
    subtype: 'group',
    title: 'Open Orders',
    description: 'Display all open trading orders',
    category: 'balance',
    defaultSize: { width: 10, height: 6 }
  },
  'balance-single': {
    type: 'balance',
    subtype: 'single',
    title: 'Single Asset',
    description: 'Display a single asset balance',
    category: 'balance',
    defaultSize: { width: 6, height: 4 },
    dynamic: true // These are created dynamically from assets
  },
  'balance-orders-single': {
    type: 'balance',
    subtype: 'single',
    title: 'Symbol Orders',
    description: 'Display orders for a specific symbol',
    category: 'balance',
    defaultSize: { width: 8, height: 4 },
    dynamic: true // These are created dynamically from order symbols
  },

  // System widgets
  'system-cpu': {
    type: 'system',
    subtype: 'group',
    title: 'CPU Metrics',
    description: 'Display CPU usage and core information',
    category: 'system',
    defaultSize: { width: 6, height: 4 }
  },
  'system-memory': {
    type: 'system',
    subtype: 'group',
    title: 'Memory Metrics',
    description: 'Display memory and swap usage',
    category: 'system',
    defaultSize: { width: 6, height: 4 }
  },
  'system-metric': {
    type: 'system',
    subtype: 'single',
    title: 'System Metric',
    description: 'Display a single system metric',
    category: 'system',
    defaultSize: { width: 4, height: 3 },
    dynamic: true // These are created dynamically from system metrics
  },

  // Log widgets
  'log-stream': {
    type: 'log',
    subtype: 'stream',
    title: 'Log Stream',
    description: 'Display real-time log messages',
    category: 'log',
    defaultSize: { width: 12, height: 8 }
  }
};

