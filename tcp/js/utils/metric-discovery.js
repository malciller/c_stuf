// Metric discovery utility - reads from data state and groups metrics by subsections

import { telemetryData, balanceData, systemData, openOrdersData } from '../data/state.js';
import { formatValue, formatTimestamp } from './formatting.js';

export class MetricDiscovery {
  constructor() {
    this.discoveredMetrics = {};
    this.subsections = {};
  }

  // Discover all available metrics from data state
  discoverAllMetrics() {
    this.discoveredMetrics = {
      telemetry: this.discoverTelemetryMetrics(),
      balance: this.discoverBalanceMetrics(),
      system: this.discoverSystemMetrics(),
      log: this.discoverLogMetrics()
    };

    this.groupMetricsBySubsections();
    return this.discoveredMetrics;
  }

  // Group metrics by subsections for display in modal
  groupMetricsBySubsections() {
    this.subsections = {
      telemetry: this.groupTelemetrySubsections(),
      balance: this.groupBalanceSubsections(),
      system: this.groupSystemSubsections(),
      log: this.groupLogSubsections()
    };

    return this.subsections;
  }

  discoverTelemetryMetrics() {
    const metrics = [];

    Object.entries(telemetryData).forEach(([key, metric]) => {
      const metricType = metric.metric_type?.type || 'gauge';
      const labelsStr = Object.keys(metric.labels).length > 0 ?
        Object.entries(metric.labels).map(([k, v]) => `${k}: ${v}`).join(', ') : '';

      // Create individual metric entries for each telemetry metric
      metrics.push({
        id: key,
        key: key,
        name: metric.name,
        labels: metric.labels,
        labelsStr: labelsStr,
        value: metric.value,
        type: metricType,
        lastUpdated: metric.last_updated,
        cachedRate: metric.cached_rate,
        subsection: this.getTelemetrySubsection(metricType),
        widgetType: 'telemetry-metric', // All individual telemetry metrics use this widget type
        displayValue: formatValue(metric.value, metric.name, metric),
        displayTime: formatTimestamp(metric.last_updated)
      });
    });

    return metrics;
  }

  discoverBalanceMetrics() {
    const metrics = [];

    // Asset balances
    Object.entries(balanceData).forEach(([asset, balance]) => {
      const wallets = Array.isArray(balance.wallets) ? balance.wallets : [];

      metrics.push({
        id: `balance-${asset}`,
        key: asset,
        name: asset,
        value: balance.total_balance,
        wallets: wallets,
        subsection: 'assets',
        widgetType: 'balance-single',
        displayValue: formatValue(balance.total_balance, 'balance', balance),
        displayTime: formatTimestamp(balance.last_updated)
      });
    });

    // Open orders (if any)
    if (openOrdersData && openOrdersData.length > 0) {
      // Group orders by symbol for display
      const ordersBySymbol = {};
      openOrdersData.forEach((order, index) => {
        const symbol = order.symbol || 'N/A';
        if (!ordersBySymbol[symbol]) {
          ordersBySymbol[symbol] = [];
        }
        ordersBySymbol[symbol].push({ ...order, id: `order-${index}` });
      });

      Object.entries(ordersBySymbol).forEach(([symbol, orders]) => {
        metrics.push({
          id: `orders-${symbol}`,
          key: symbol,
          name: `${symbol} Orders`,
          value: orders.length,
          orders: orders,
          subsection: 'orders',
          widgetType: 'balance-orders-single',
          displayValue: `${orders.length} orders`,
          displayTime: orders[0]?.last_updated ? formatTimestamp(orders[0].last_updated) : 'N/A'
        });
      });
    }

    return metrics;
  }

  discoverSystemMetrics() {
    const metrics = [];

    Object.entries(systemData).forEach(([key, metric]) => {
      if (key === 'timestamp' || key === 'type') return;

      // Skip arrays (handled separately) and complex objects
      if (Array.isArray(metric.value) || (typeof metric.value === 'object' && metric.value !== null)) {
        return;
      }

      // Create individual metric entries for each system metric
      metrics.push({
        id: `system-${key}`,
        key: key,
        name: key.replace(/_/g, ' '),
        value: metric.value,
        subsection: this.getSystemSubsection(key),
        widgetType: 'system-metric',
        displayValue: formatValue(metric.value, key, metric),
        displayTime: formatTimestamp(metric.last_updated)
      });
    });

    // Add CPU and Memory as separate subsections if data available
    if (systemData.cpu_usage) {
      metrics.push({
        id: 'system-cpu-usage',
        key: 'cpu_usage',
        name: 'CPU Usage',
        value: systemData.cpu_usage.value,
        subsection: 'cpu',
        widgetType: 'system-cpu',
        displayValue: `${systemData.cpu_usage.value.toFixed(1)}%`,
        displayTime: formatTimestamp(systemData.cpu_usage.last_updated)
      });
    }

    if (systemData.memory_used && systemData.memory_total) {
      const usagePercent = (systemData.memory_used.value / systemData.memory_total.value) * 100;
      metrics.push({
        id: 'system-memory-usage',
        key: 'memory_usage',
        name: 'Memory Usage',
        value: usagePercent,
        subsection: 'memory',
        widgetType: 'system-memory',
        displayValue: `${usagePercent.toFixed(1)}%`,
        displayTime: formatTimestamp(systemData.memory_used.last_updated)
      });
    }

    return metrics;
  }

  discoverLogMetrics() {
    // Log is a single stream widget
    return [{
      id: 'log-stream',
      key: 'log',
      name: 'Log Stream',
      value: 'Streaming logs',
      subsection: 'logs',
      widgetType: 'log-stream',
      displayValue: 'Real-time logs',
      displayTime: 'Live'
    }];
  }

  getTelemetrySubsection(metricType) {
    switch (metricType) {
      case 'gauge': return 'gauges';
      case 'counter': return 'counters';
      case 'histogram': return 'histograms';
      default: return 'metrics';
    }
  }

  getSystemSubsection(key) {
    if (key.includes('cpu') || key.includes('core') || key === 'cpu_usage' || key === 'load_avg') {
      return 'cpu';
    } else if (key.includes('memory') || key.includes('mem') || key.includes('swap')) {
      return 'memory';
    } else {
      return 'system';
    }
  }

  groupTelemetrySubsections() {
    const groups = {
      gauges: { title: 'Gauge Metrics', metrics: [] },
      counters: { title: 'Counter Metrics', metrics: [] },
      histograms: { title: 'Histogram Metrics', metrics: [] }
    };

    this.discoveredMetrics.telemetry.forEach(metric => {
      if (groups[metric.subsection]) {
        groups[metric.subsection].metrics.push(metric);
      }
    });

    return Object.values(groups).filter(group => group.metrics.length > 0);
  }

  groupBalanceSubsections() {
    const groups = {
      assets: { title: 'Asset Balances', metrics: [] },
      orders: { title: 'Open Orders', metrics: [] }
    };

    this.discoveredMetrics.balance.forEach(metric => {
      if (groups[metric.subsection]) {
        groups[metric.subsection].metrics.push(metric);
      }
    });

    return Object.values(groups).filter(group => group.metrics.length > 0);
  }

  groupSystemSubsections() {
    const groups = {
      cpu: { title: 'CPU Metrics', metrics: [] },
      memory: { title: 'Memory Metrics', metrics: [] },
      system: { title: 'System Metrics', metrics: [] }
    };

    this.discoveredMetrics.system.forEach(metric => {
      if (groups[metric.subsection]) {
        groups[metric.subsection].metrics.push(metric);
      }
    });

    return Object.values(groups).filter(group => group.metrics.length > 0);
  }

  groupLogSubsections() {
    return [{
      title: 'Log Stream',
      metrics: this.discoveredMetrics.log,
      icon: ''
    }];
  }

  // Get all subsections across all categories
  getAllSubsections() {
    if (Object.keys(this.subsections).length === 0) {
      this.discoverAllMetrics();
    }
    return this.subsections;
  }

  // Get metrics for a specific subsection
  getMetricsForSubsection(category, subsectionId) {
    const categorySubsections = this.subsections[category] || [];
    const subsection = categorySubsections.find(sub => sub.title.toLowerCase().replace(/\s+/g, '-') === subsectionId);
    return subsection ? subsection.metrics : [];
  }

  // Get individual metric by ID
  getMetricById(metricId) {
    for (const category of Object.values(this.discoveredMetrics)) {
      const metric = category.find(m => m.id === metricId);
      if (metric) return metric;
    }
    return null;
  }

  // Update discovered metrics (call when data changes)
  refreshMetrics() {
    this.discoverAllMetrics();
  }
}

// Singleton instance
export const metricDiscovery = new MetricDiscovery();

