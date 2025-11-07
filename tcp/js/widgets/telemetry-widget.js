// Telemetry-specific widgets

import { BaseWidget } from './base-widget.js';
import { telemetryData } from '../data/state.js';
import { formatValue, formatTime, formatTimestamp, getMetricType } from '../utils/formatting.js';
import { subscribeToStream, unsubscribeFromStream } from '../utils/websocket.js';

export class TelemetryGaugeWidget extends BaseWidget {
  constructor(config) {
    super(config);
    this.type = 'telemetry-gauge';
    this.updateCallback = null;
    // For individual metrics, use the specific key
    this.targetKey = config.config?.key || null;
  }

  createElement() {
    super.createElement();

    this.updateContent();
    this.subscribeToUpdates();

    return this.element;
  }

  updateContent() {
    const content = this.element.querySelector('.widget-content');
    if (!content) return;

    if (this.targetKey) {
      // Show single metric
      const metric = telemetryData[this.targetKey];
      if (!metric) {
        content.innerHTML = '<div class="text-slate-400 text-sm">Metric not available</div>';
        return;
      }

      content.innerHTML = this.createSingleGaugeCard(metric);
      this.ensureCloseButton();
      this.autoSize();
    } else {
      // Show all gauge metrics
      const gauges = Object.values(telemetryData).filter(metric =>
        metric.metric_type?.type === 'gauge'
      );

      if (gauges.length === 0) {
        content.innerHTML = '<div class="text-slate-400 text-sm">No gauge metrics available</div>';
        return;
      }

      // Create gauge cards
      const html = gauges.slice(0, 6).map(metric => this.createGaugeCard(metric)).join('');
      content.innerHTML = `<div class="grid grid-cols-1 gap-2">${html}</div>`;

      this.ensureCloseButton();
      // Auto-size based on content
      this.autoSize();
    }
  }

  createSingleGaugeCard(metric) {
    const labelsStr = Object.keys(metric.labels).length > 0 ?
      Object.entries(metric.labels).map(([k, v]) => `${k}: ${v}`).join(', ') :
      '';

    return `
      <div class="text-center">
        <div class="text-lg font-medium text-slate-200 mb-2">${metric.name.replace(/_/g, ' ')}</div>
        ${labelsStr ? `<div class="text-sm text-slate-400 mb-4">${labelsStr}</div>` : ''}
        <div class="text-3xl font-mono font-bold text-cyan-300 mb-2">
          ${formatValue(metric.value, metric.name, metric)}
        </div>
        ${metric.cached_rate ? `
          <div class="text-sm text-slate-400 mt-2">
            Rate: ${getMetricType(metric, metric.name) === 'time' ? formatTime(metric.cached_rate) : formatValue(metric.cached_rate, metric.name + '_rate', metric)}
          </div>
        ` : ''}
        <div class="text-xs text-slate-500 mt-4">
          ${formatTimestamp(metric.last_updated)}
        </div>
      </div>
    `;
  }

  createGaugeCard(metric) {
    const labelsStr = Object.keys(metric.labels).length > 0 ?
      Object.entries(metric.labels).map(([k, v]) => `${k}: ${v}`).join(', ') :
      '';

    return `
      <div class="bg-slate-900/50 rounded p-2 border border-slate-700">
        <div class="flex justify-between items-start mb-1">
          <div class="flex-1 min-w-0">
            <div class="text-xs font-medium text-slate-200 truncate">${metric.name.replace(/_/g, ' ')}</div>
            ${labelsStr ? `<div class="text-xs text-slate-400 truncate">${labelsStr}</div>` : ''}
          </div>
          <div class="text-sm font-mono font-bold text-cyan-300 ml-2">
            ${formatValue(metric.value, metric.name, metric)}
          </div>
        </div>
        ${metric.cached_rate ? `
          <div class="text-xs text-slate-400">
            Rate: ${getMetricType(metric, metric.name) === 'time' ? formatTime(metric.cached_rate) : formatValue(metric.cached_rate, metric.name + '_rate', metric)}
          </div>
        ` : ''}
      </div>
    `;
  }

  update(data) {
    // Update when telemetry data changes
    this.updateContent();
  }

  subscribeToUpdates() {
    this.updateCallback = (data) => this.update(data);
    subscribeToStream('telemetry', this.updateCallback);
  }

  destroy() {
    if (this.updateCallback) {
      unsubscribeFromStream('telemetry', this.updateCallback);
    }
    super.destroy();
  }
}

export class TelemetryCounterWidget extends BaseWidget {
  constructor(config) {
    super(config);
    this.type = 'telemetry-counter';
    this.updateCallback = null;
    // For individual metrics, use the specific key
    this.targetKey = config.config?.key || null;
  }

  createElement() {
    super.createElement();

    this.updateContent();
    this.subscribeToUpdates();

    return this.element;
  }

  updateContent() {
    const content = this.element.querySelector('.widget-content');
    if (!content) return;

    if (this.targetKey) {
      // Show single metric
      const metric = telemetryData[this.targetKey];
      if (!metric) {
        content.innerHTML = '<div class="text-slate-400 text-sm">Metric not available</div>';
        return;
      }

      content.innerHTML = this.createSingleCounterCard(metric);
      this.ensureCloseButton();
      this.autoSize();
    } else {
      // Show all counter metrics
      const counters = Object.values(telemetryData).filter(metric =>
        metric.metric_type?.type === 'counter'
      );

      if (counters.length === 0) {
        content.innerHTML = '<div class="text-slate-400 text-sm">No counter metrics available</div>';
        return;
      }

      const html = counters.slice(0, 6).map(metric => this.createCounterCard(metric)).join('');
      content.innerHTML = `<div class="grid grid-cols-1 gap-2">${html}</div>`;

      this.ensureCloseButton();
      this.autoSize();
    }
  }

  createSingleCounterCard(metric) {
    const labelsStr = Object.keys(metric.labels).length > 0 ?
      Object.entries(metric.labels).map(([k, v]) => `${k}: ${v}`).join(', ') :
      '';

    return `
      <div class="text-center">
        <div class="text-lg font-medium text-slate-200 mb-2">${metric.name.replace(/_/g, ' ')}</div>
        ${labelsStr ? `<div class="text-sm text-slate-400 mb-4">${labelsStr}</div>` : ''}
        <div class="text-3xl font-mono font-bold text-green-300 mb-2">
          ${formatValue(metric.value, metric.name, metric)}
        </div>
        ${metric.cached_rate ? `
          <div class="text-sm text-slate-400 mt-2">
            Rate: ${formatValue(metric.cached_rate, metric.name + '_rate', metric)}
          </div>
        ` : ''}
        <div class="text-xs text-slate-500 mt-4">
          ${formatTimestamp(metric.last_updated)}
        </div>
      </div>
    `;
  }

  createCounterCard(metric) {
    const labelsStr = Object.keys(metric.labels).length > 0 ?
      Object.entries(metric.labels).map(([k, v]) => `${k}: ${v}`).join(', ') :
      '';

    return `
      <div class="bg-slate-900/50 rounded p-2 border border-slate-700">
        <div class="flex justify-between items-start mb-1">
          <div class="flex-1 min-w-0">
            <div class="text-xs font-medium text-slate-200 truncate">${metric.name.replace(/_/g, ' ')}</div>
            ${labelsStr ? `<div class="text-xs text-slate-400 truncate">${labelsStr}</div>` : ''}
          </div>
          <div class="text-sm font-mono font-bold text-green-300 ml-2">
            ${formatValue(metric.value, metric.name, metric)}
          </div>
        </div>
        ${metric.cached_rate ? `
          <div class="text-xs text-slate-400">
            Rate: ${formatValue(metric.cached_rate, metric.name + '_rate', metric)}
          </div>
        ` : ''}
      </div>
    `;
  }

  update(data) {
    this.updateContent();
  }

  subscribeToUpdates() {
    this.updateCallback = (data) => this.update(data);
    subscribeToStream('telemetry', this.updateCallback);
  }

  destroy() {
    if (this.updateCallback) {
      unsubscribeFromStream('telemetry', this.updateCallback);
    }
    super.destroy();
  }
}

export class TelemetryHistogramWidget extends BaseWidget {
  constructor(config) {
    super(config);
    this.type = 'telemetry-histogram';
    this.updateCallback = null;
    // For individual metrics, use the specific key
    this.targetKey = config.config?.key || null;
  }

  createElement() {
    super.createElement();

    this.updateContent();
    this.subscribeToUpdates();

    return this.element;
  }

  updateContent() {
    const content = this.element.querySelector('.widget-content');
    if (!content) return;

    if (this.targetKey) {
      // Show single metric
      const metric = telemetryData[this.targetKey];
      if (!metric) {
        content.innerHTML = '<div class="text-slate-400 text-sm">Metric not available</div>';
        return;
      }

      content.innerHTML = this.createSingleHistogramCard(metric);
      this.ensureCloseButton();
      this.autoSize();
    } else {
      // Show all histogram metrics
      const histograms = Object.values(telemetryData).filter(metric =>
        metric.metric_type?.type === 'histogram'
      );

      if (histograms.length === 0) {
        content.innerHTML = '<div class="text-slate-400 text-sm">No histogram metrics available</div>';
        return;
      }

      const html = histograms.slice(0, 4).map(metric => this.createHistogramCard(metric)).join('');
      content.innerHTML = `<div class="grid grid-cols-1 gap-2">${html}</div>`;

      this.ensureCloseButton();
      this.autoSize();
    }
  }

  createSingleHistogramCard(metric) {
    const labelsStr = Object.keys(metric.labels).length > 0 ?
      Object.entries(metric.labels).map(([k, v]) => `${k}: ${v}`).join(', ') :
      '';

    return `
      <div class="text-center">
        <div class="text-lg font-medium text-slate-200 mb-2">${metric.name.replace(/_/g, ' ')}</div>
        ${labelsStr ? `<div class="text-sm text-slate-400 mb-4">${labelsStr}</div>` : ''}
        <div class="text-2xl font-mono font-bold text-purple-300 mb-2">
          ${formatValue(metric.value, metric.name, metric)}
        </div>
        ${metric.cached_rate ? `
          <div class="text-sm text-slate-400 mt-2">
            Rate: ${formatValue(metric.cached_rate, metric.name + '_rate', metric)}
          </div>
        ` : ''}
        <div class="text-xs text-slate-500 mt-4">
          ${formatTimestamp(metric.last_updated)}
        </div>
      </div>
    `;
  }

  createHistogramCard(metric) {
    const labelsStr = Object.keys(metric.labels).length > 0 ?
      Object.entries(metric.labels).map(([k, v]) => `${k}: ${v}`).join(', ') :
      '';

    return `
      <div class="bg-slate-900/50 rounded p-3 border border-slate-700">
        <div class="text-xs font-medium text-slate-200 mb-2">${metric.name.replace(/_/g, ' ')}</div>
        ${labelsStr ? `<div class="text-xs text-slate-400 mb-2">${labelsStr}</div>` : ''}
        <div class="text-sm font-mono font-bold text-purple-300">
          ${formatValue(metric.value, metric.name, metric)}
        </div>
        ${metric.cached_rate ? `
          <div class="text-xs text-slate-400 mt-1">
            Rate: ${formatValue(metric.cached_rate, metric.name + '_rate', metric)}
          </div>
        ` : ''}
      </div>
    `;
  }

  update(data) {
    this.updateContent();
  }

  subscribeToUpdates() {
    this.updateCallback = (data) => this.update(data);
    subscribeToStream('telemetry', this.updateCallback);
  }

  destroy() {
    if (this.updateCallback) {
      unsubscribeFromStream('telemetry', this.updateCallback);
    }
    super.destroy();
  }
}

export class TelemetryMetricWidget extends BaseWidget {
  constructor(config) {
    super(config);
    this.type = 'telemetry-metric';
    this.updateCallback = null;
    this.updateInterval = null;
    // Use the configured metric key
    this.targetKey = config.config?.key || config.config?.metricKey || null;
    this.selectedMetric = null;
  }

  createElement() {
    super.createElement();

    this.updateContent();
    this.subscribeToUpdates();

    return this.element;
  }

  updateContent() {
    const content = this.element.querySelector('.widget-content');
    if (!content) return;

    // If we have a specific target key, show that metric
    if (this.targetKey && telemetryData[this.targetKey]) {
      const metric = telemetryData[this.targetKey];

      const labelsStr = Object.keys(metric.labels).length > 0 ?
        Object.entries(metric.labels).map(([k, v]) => `${k}: ${v}`).join(', ') :
        '';

      content.innerHTML = `
        <div class="text-center">
          <div class="text-lg font-medium text-slate-200 mb-2">${metric.name.replace(/_/g, ' ')}</div>
          ${labelsStr ? `<div class="text-sm text-slate-400 mb-4">${labelsStr}</div>` : ''}
          <div class="text-3xl font-mono font-bold text-cyan-300 mb-2">
            ${formatValue(metric.value, metric.name, metric)}
          </div>
          <div class="text-xs text-slate-500">
            ${formatTimestamp(metric.last_updated)}
          </div>
          ${metric.cached_rate ? `
            <div class="text-sm text-slate-400 mt-2">
              Rate: ${getMetricType(metric, metric.name) === 'time' ? formatTime(metric.cached_rate) : formatValue(metric.cached_rate, metric.name + '_rate', metric)}
            </div>
          ` : ''}
        </div>
      `;

      this.ensureCloseButton();
      this.autoSize(4, 3, 6, 4);
      return;
    }

    // Fallback: show first available metric if no target key is configured
    const metrics = Object.values(telemetryData);
    if (metrics.length === 0) {
      content.innerHTML = '<div class="text-slate-400 text-sm">No metrics available</div>';
      return;
    }

    // Select metric to show (first one or previously selected)
    const metric = this.selectedMetric || metrics[0];
    this.selectedMetric = metric;

    const labelsStr = Object.keys(metric.labels).length > 0 ?
      Object.entries(metric.labels).map(([k, v]) => `${k}: ${v}`).join(', ') :
      '';

    content.innerHTML = `
      <div class="text-center">
        <div class="text-lg font-medium text-slate-200 mb-2">${metric.name.replace(/_/g, ' ')}</div>
        ${labelsStr ? `<div class="text-sm text-slate-400 mb-4">${labelsStr}</div>` : ''}
        <div class="text-3xl font-mono font-bold text-cyan-300 mb-2">
          ${formatValue(metric.value, metric.name, metric)}
        </div>
        <div class="text-xs text-slate-500">
          ${formatTimestamp(metric.last_updated)}
        </div>
        ${metric.cached_rate ? `
          <div class="text-sm text-slate-400 mt-2">
            Rate: ${getMetricType(metric, metric.name) === 'time' ? formatTime(metric.cached_rate) : formatValue(metric.cached_rate, metric.name + '_rate', metric)}
          </div>
        ` : ''}
      </div>
    `;

    this.ensureCloseButton();
    this.autoSize(4, 3, 6, 4);
  }

  update(data) {
    this.updateContent();
  }

  subscribeToUpdates() {
    this.updateCallback = (data) => this.update(data);
    subscribeToStream('telemetry', this.updateCallback);
  }

  startUpdates() {
    this.updateInterval = setInterval(() => {
      this.updateContent();
    }, 2000); // More frequent updates for single metric
  }

  destroy() {
    if (this.updateCallback) {
      unsubscribeFromStream('telemetry', this.updateCallback);
    }
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }
    super.destroy();
  }
}

