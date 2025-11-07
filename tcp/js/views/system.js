// System view - handles parsing and rendering system metrics

import { systemData, sectionState } from '../data/state.js';
import { formatValue, formatMemory, formatTimestamp } from '../utils/formatting.js';
import { restoreSubsectionState } from '../utils/ui.js';

export function parseSystemMessage(msg) {
  try {
    const data = JSON.parse(msg);
    if (!data || typeof data !== 'object') return;

    const { timestamp } = data;
    const last_updated = timestamp;

    // Cache system metrics: only add/update metrics, never remove existing ones
    // This ensures system metrics persist and show last known values between updates
    Object.entries(data).forEach(([key, value]) => {
      // Skip non-metric fields
      if (key === 'type' || key === 'timestamp') return;

      // Handle arrays (like core_usages) - store them as-is
      if (Array.isArray(value)) {
        systemData[key] = {
          name: key,
          value: value,
          last_updated
        };
        return;
      }

      // Skip complex objects (but allow arrays)
      if (typeof value === 'object' && value !== null) return;

      systemData[key] = {
        name: key,
        value,
        last_updated
      };
    });
  } catch (error) {
    console.error('Error parsing system message:', error);
    console.error('Message length:', msg ? msg.length : 0);
    if (msg && msg.length > 0) {
      console.error('Message preview (first 200 chars):', msg.substring(0, 200));
      if (msg.length > 4090) {
        console.warn('Message appears to be truncated at ~4096 bytes. Check server buffer size.');
      }
    }
  }
}

export function updateSystemTable(changedMetrics = new Set()) {
  const container = document.getElementById('table-system');
  if (!container) return;

  // Save current subsection states before updating
  ['system-cpu', 'system-memory', 'system-other'].forEach(subsectionId => {
    const content = document.getElementById(`content-${subsectionId}`);
    if (content) {
      const isHidden = content.style.display === 'none';
      sectionState.subsections[subsectionId] = !isHidden;
    }
  });

  if (Object.keys(systemData).length === 0) {
    container.innerHTML = '<div class="py-12 text-center"><div class="text-slate-400 text-lg mb-2">Waiting for system data...</div><div class="text-slate-500 text-sm">System metrics will appear here once received</div></div>';
    return;
  }

  // Group system metrics by category
  const cpuMetrics = {};
  const memoryMetrics = {};
  const otherMetrics = {};

  Object.entries(systemData).forEach(([key, metric]) => {
    if (key.includes('cpu') || key.includes('core') || key === 'cpu_usage' || key === 'cpu_cores' || key === 'cpu_vendor' || key === 'cpu_model' || key === 'core_usages' || key === 'load_avg') {
      cpuMetrics[key] = metric;
    } else if (key.includes('memory') || key.includes('mem') || key.includes('swap')) {
      memoryMetrics[key] = metric;
    } else if (key !== 'timestamp' && key !== 'type') {
      otherMetrics[key] = metric;
    }
  });

  const createProgressBar = (value, max = 100, color = 'blue') => {
    const percentage = Math.min((value / max) * 100, 100);
    const colorClasses = {
      blue: 'bg-blue-500',
      green: 'bg-green-500',
      yellow: 'bg-yellow-500',
      red: 'bg-red-500'
    };

    return `
      <div class="w-full bg-slate-700 rounded-full h-2 mb-2">
        <div class="${colorClasses[color] || 'bg-blue-500'} h-2 rounded-full transition-all duration-300" style="width: ${percentage}%"></div>
      </div>
      <div class="text-xs text-slate-400">${percentage.toFixed(1)}%</div>
    `;
  };

  let html = '';

  // CPU Metrics Card
  if (Object.keys(cpuMetrics).length > 0) {
    html += `
      <div class="mb-6">
        <div class="flex items-center space-x-2 mb-4 cursor-pointer hover:text-slate-100 transition-colors" onclick="window.toggleSubsection('system-cpu')">
          <svg class="w-4 h-4 text-slate-400 transition-transform transform" id="icon-system-cpu" style="transform: rotate(0deg);">
            <path fill="none" stroke="currentColor" stroke-width="2" d="M6 9l6 6 6-6"/>
          </svg>
          <h3 class="text-lg font-semibold text-slate-200">CPU Metrics</h3>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4" id="content-system-cpu">
    `;

    // Overall CPU usage
    if (cpuMetrics.cpu_usage !== undefined) {
      const usage = cpuMetrics.cpu_usage.value;
      const color = usage > 80 ? 'red' : usage > 60 ? 'yellow' : 'green';
      const cores = cpuMetrics.cpu_cores ? cpuMetrics.cpu_cores.value : 'N/A';
      html += `
        <div class="bg-slate-800 border border-slate-700 rounded-lg p-5 shadow-lg card-glow">
          <div class="flex items-center justify-between mb-3">
            <h4 class="text-lg font-semibold text-slate-200">CPU Usage</h4>
            <span class="text-2xl font-mono font-bold ${usage > 80 ? 'text-red-400' : usage > 60 ? 'text-yellow-400' : 'text-green-400'}">
              ${usage.toFixed(1)}%
            </span>
          </div>
          ${createProgressBar(usage, 100, color)}
          <div class="text-xs text-slate-400 mt-2">${cores} cores</div>
        </div>
      `;
    }

    // CPU cores breakdown
    if (cpuMetrics.core_usages && Array.isArray(cpuMetrics.core_usages.value)) {
      html += `
        <div class="bg-slate-800 border border-slate-700 rounded-lg p-5 shadow-lg card-glow">
          <h4 class="text-lg font-semibold text-slate-200 mb-3">Core Usage</h4>
          <div class="grid grid-cols-2 gap-2">
            ${cpuMetrics.core_usages.value.map((usage, index) => `
              <div class="flex justify-between items-center text-xs">
                <span class="text-slate-400">Core ${index}</span>
                <span class="text-slate-200 font-mono ${usage > 80 ? 'text-red-400' : usage > 60 ? 'text-yellow-400' : 'text-green-400'}">
                  ${usage.toFixed(1)}%
                </span>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }

    html += '</div></div>';
  }

  // Memory Metrics Card
  if (Object.keys(memoryMetrics).length > 0) {
    html += `
      <div class="mb-6">
        <div class="flex items-center space-x-2 mb-4 cursor-pointer hover:text-slate-100 transition-colors" onclick="window.toggleSubsection('system-memory')">
          <svg class="w-4 h-4 text-slate-400 transition-transform transform" id="icon-system-memory" style="transform: rotate(0deg);">
            <path fill="none" stroke="currentColor" stroke-width="2" d="M6 9l6 6 6-6"/>
          </svg>
          <h3 class="text-lg font-semibold text-slate-200">Memory Metrics</h3>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4" id="content-system-memory">
    `;

    // Memory usage
    if (memoryMetrics.memory_total && memoryMetrics.memory_used !== undefined) {
      const total = memoryMetrics.memory_total.value;
      const used = memoryMetrics.memory_used.value;
      const usage = (used / total) * 100;
      const color = usage > 90 ? 'red' : usage > 70 ? 'yellow' : 'blue';

      html += `
        <div class="bg-slate-800 border border-slate-700 rounded-lg p-5 shadow-lg card-glow">
          <div class="flex items-center justify-between mb-3">
            <h4 class="text-lg font-semibold text-slate-200">Memory Usage</h4>
            <span class="text-2xl font-mono font-bold ${usage > 90 ? 'text-red-400' : usage > 70 ? 'text-yellow-400' : 'text-blue-400'}">
              ${usage.toFixed(1)}%
            </span>
          </div>
          ${createProgressBar(usage, 100, color)}
          <div class="text-xs text-slate-400 mt-2">
            ${formatMemory(used)} / ${formatMemory(total)}
          </div>
        </div>
      `;
    }

    // Swap usage
    if (memoryMetrics.swap_total && memoryMetrics.swap_used !== undefined) {
      const total = memoryMetrics.swap_total.value;
      const used = memoryMetrics.swap_used.value;
      const usage = total > 0 ? (used / total) * 100 : 0;
      const color = usage > 50 ? 'yellow' : 'blue';

      html += `
        <div class="bg-slate-800 border border-slate-700 rounded-lg p-5 shadow-lg card-glow">
          <div class="flex items-center justify-between mb-3">
            <h4 class="text-lg font-semibold text-slate-200">Swap Usage</h4>
            <span class="text-2xl font-mono font-bold ${usage > 50 ? 'text-yellow-400' : 'text-blue-400'}">
              ${usage.toFixed(1)}%
            </span>
          </div>
          ${createProgressBar(usage, 100, color)}
          <div class="text-xs text-slate-400 mt-2">
            ${formatMemory(used)} / ${formatMemory(total)}
          </div>
        </div>
      `;
    }

    html += '</div></div>';
  }

  // Other System Metrics
  if (Object.keys(otherMetrics).length > 0) {
    html += `
      <div class="mb-6">
        <div class="flex items-center space-x-2 mb-4 cursor-pointer hover:text-slate-100 transition-colors" onclick="window.toggleSubsection('system-other')">
          <svg class="w-4 h-4 text-slate-400 transition-transform transform" id="icon-system-other" style="transform: rotate(0deg);">
            <path fill="none" stroke="currentColor" stroke-width="2" d="M6 9l6 6 6-6"/>
          </svg>
          <h3 class="text-lg font-semibold text-slate-200">System Metrics</h3>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4" id="content-system-other">
    `;

    Object.entries(otherMetrics).forEach(([key, metric]) => {
      // Skip arrays and complex objects - they're handled in specific sections
      if (Array.isArray(metric.value) || (typeof metric.value === 'object' && metric.value !== null)) {
        return;
      }

      const isChanged = changedMetrics.has(key);
      html += `
        <div class="bg-slate-800 border border-slate-700 rounded-lg p-4 shadow-lg card-glow ${isChanged ? 'ring-2 ring-purple-400/50 bg-slate-750' : ''}">
          <div class="flex items-center justify-between mb-2">
            <h4 class="text-sm font-medium text-slate-200 capitalize">${key.replace(/_/g, ' ')}</h4>
            <span class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-slate-700 text-slate-300 border border-slate-600">
              system
            </span>
          </div>
          <div class="text-center">
            <div class="text-xl font-mono font-bold text-purple-300 mb-1">
              ${formatValue(metric.value, key, metric)}
            </div>
            <div class="text-slate-500 text-xs">
              ${formatTimestamp(metric.last_updated)}
            </div>
          </div>
        </div>
      `;
    });

    html += '</div></div>';
  }

  container.innerHTML = html;
  
  // Restore subsection states after update
  if (Object.keys(cpuMetrics).length > 0) {
    restoreSubsectionState('system-cpu');
  }
  if (Object.keys(memoryMetrics).length > 0) {
    restoreSubsectionState('system-memory');
  }
  if (Object.keys(otherMetrics).length > 0) {
    restoreSubsectionState('system-other');
  }
}

