// System-specific widgets

import { BaseWidget } from './base-widget.js';
import { systemData } from '../data/state.js';
import { formatValue, formatMemory, formatTimestamp } from '../utils/formatting.js';
import { subscribeToStream, unsubscribeFromStream } from '../utils/websocket.js';

export class SystemCpuWidget extends BaseWidget {
  constructor(config) {
    super(config);
    this.type = 'system-cpu';
    this.updateInterval = null;
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

    const cpuUsage = systemData.cpu_usage;
    const coreUsages = systemData.core_usages;
    const cpuCores = systemData.cpu_cores;

    if (!cpuUsage) {
      content.innerHTML = '<div class="text-slate-400 text-sm">CPU data not available</div>';
      return;
    }

    const usage = cpuUsage.value;
    const cores = cpuCores ? cpuCores.value : 'N/A';

    content.innerHTML = `
      <div class="text-center">
        <div class="text-3xl font-mono font-bold ${this.getUsageColor(usage)} mb-2">
          ${usage.toFixed(1)}%
        </div>
        <div class="text-sm text-slate-400 mb-4">CPU Usage</div>

        <div class="w-full bg-slate-700 rounded-full h-3 mb-2">
          <div class="bg-blue-500 h-3 rounded-full transition-all duration-300" style="width: ${usage}%"></div>
        </div>

        <div class="text-xs text-slate-400 mb-4">${cores} cores</div>

        ${Array.isArray(coreUsages?.value) && coreUsages.value.length > 0 ? `
          <div class="grid grid-cols-4 gap-1 text-xs">
            ${coreUsages.value.map((usage, index) => `
              <div class="text-center">
                <div class="text-slate-400">C${index}</div>
                <div class="${this.getUsageColor(usage)} font-mono">${usage.toFixed(0)}%</div>
              </div>
            `).join('')}
          </div>
        ` : ''}

        <div class="text-xs text-slate-500 mt-4">
          ${formatTimestamp(cpuUsage.last_updated)}
        </div>
      </div>
    `;

    this.ensureCloseButton();
    this.autoSize();
  }

  getUsageColor(usage) {
    if (usage > 80) return 'text-red-400';
    if (usage > 60) return 'text-yellow-400';
    return 'text-green-400';
  }

  update(data) {
    this.updateContent();
  }

  subscribeToUpdates() {
    this.updateCallback = (data) => this.update(data);
    subscribeToStream('system', this.updateCallback);
  }

  startUpdates() {
    this.updateInterval = setInterval(() => {
      this.updateContent();
    }, 2000);
  }

  destroy() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }
    if (this.updateCallback) {
      unsubscribeFromStream('system', this.updateCallback);
    }
    super.destroy();
  }
}

export class SystemMemoryWidget extends BaseWidget {
  constructor(config) {
    super(config);
    this.type = 'system-memory';
    this.updateInterval = null;
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

    const memoryTotal = systemData.memory_total;
    const memoryUsed = systemData.memory_used;
    const swapTotal = systemData.swap_total;
    const swapUsed = systemData.swap_used;

    if (!memoryTotal || !memoryUsed) {
      content.innerHTML = '<div class="text-slate-400 text-sm">Memory data not available</div>';
      return;
    }

    const total = memoryTotal.value;
    const used = memoryUsed.value;
    const usagePercent = (used / total) * 100;

    content.innerHTML = `
      <div class="text-center">
        <div class="text-3xl font-mono font-bold ${this.getUsageColor(usagePercent)} mb-2">
          ${usagePercent.toFixed(1)}%
        </div>
        <div class="text-sm text-slate-400 mb-4">Memory Usage</div>

        <div class="w-full bg-slate-700 rounded-full h-3 mb-2">
          <div class="bg-blue-500 h-3 rounded-full transition-all duration-300" style="width: ${usagePercent}%"></div>
        </div>

        <div class="text-xs text-slate-400 mb-4">
          ${formatMemory(used)} / ${formatMemory(total)}
        </div>

        ${swapTotal && swapUsed ? (() => {
          const swapUsage = swapTotal.value > 0 ? (swapUsed.value / swapTotal.value) * 100 : 0;
          return `
            <div class="mt-4 pt-4 border-t border-slate-700">
              <div class="text-sm font-medium text-slate-200 mb-2">Swap</div>
              <div class="text-lg font-mono font-bold ${swapUsage > 50 ? 'text-yellow-400' : 'text-green-400'} mb-1">
                ${swapUsage.toFixed(1)}%
              </div>
              <div class="w-full bg-slate-700 rounded-full h-2 mb-1">
                <div class="bg-yellow-500 h-2 rounded-full transition-all duration-300" style="width: ${swapUsage}%"></div>
              </div>
              <div class="text-xs text-slate-400">
                ${formatMemory(swapUsed.value)} / ${formatMemory(swapTotal.value)}
              </div>
            </div>
          `;
        })() : ''}

        <div class="text-xs text-slate-500 mt-4">
          ${formatTimestamp(memoryUsed.last_updated)}
        </div>
      </div>
    `;

    this.ensureCloseButton();
    this.autoSize();
  }

  getUsageColor(usage) {
    if (usage > 90) return 'text-red-400';
    if (usage > 70) return 'text-yellow-400';
    return 'text-blue-400';
  }

  update(data) {
    this.updateContent();
  }

  subscribeToUpdates() {
    this.updateCallback = (data) => this.update(data);
    subscribeToStream('system', this.updateCallback);
  }

  destroy() {
    if (this.updateCallback) {
      unsubscribeFromStream('system', this.updateCallback);
    }
    super.destroy();
  }
}

export class SystemMetricWidget extends BaseWidget {
  constructor(config) {
    super(config);
    this.type = 'system-metric';
    this.updateCallback = null;
    this.targetKey = config.config?.systemKey || config.config?.metricKey || null;
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
    if (this.targetKey && systemData[this.targetKey]) {
      const metric = systemData[this.targetKey];

      content.innerHTML = `
        <div class="text-center">
          <div class="text-2xl font-mono font-bold text-purple-300 mb-2">
            ${formatValue(metric.value, this.targetKey, metric)}
          </div>
          <div class="text-sm text-slate-400 mb-4">${this.targetKey.replace(/_/g, ' ')}</div>
          <div class="text-xs text-slate-500">
            ${formatTimestamp(metric.last_updated)}
          </div>
        </div>
      `;

      this.ensureCloseButton();
      this.autoSize();
    } else {
      // Fallback: show first available metric
      const metrics = Object.entries(systemData).filter(([key, metric]) =>
        key !== 'timestamp' && key !== 'type' && !Array.isArray(metric.value) &&
        typeof metric.value !== 'object'
      );

      if (metrics.length === 0) {
        content.innerHTML = '<div class="text-slate-400 text-sm">No system metrics available</div>';
        return;
      }

      const [key, metric] = metrics[0];
      this.targetKey = key;

      content.innerHTML = `
        <div class="text-center">
          <div class="text-2xl font-mono font-bold text-purple-300 mb-2">
            ${formatValue(metric.value, key, metric)}
          </div>
          <div class="text-sm text-slate-400 mb-4">${key.replace(/_/g, ' ')}</div>
          <div class="text-xs text-slate-500">
            ${formatTimestamp(metric.last_updated)}
          </div>
        </div>
      `;

      this.ensureCloseButton();
      this.autoSize();
    }
  }

  update(data) {
    this.updateContent();
  }

  subscribeToUpdates() {
    this.updateCallback = (data) => this.update(data);
    subscribeToStream('system', this.updateCallback);
  }

  destroy() {
    if (this.updateCallback) {
      unsubscribeFromStream('system', this.updateCallback);
    }
    super.destroy();
  }
}

