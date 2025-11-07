// Telemetry view - handles parsing and rendering telemetry metrics

import { telemetryData, sectionState } from '../data/state.js';
import { formatValue, formatTime, formatTimestamp, getMetricType } from '../utils/formatting.js';
import { restoreSubsectionState } from '../utils/ui.js';

export function parseTelemetryMessage(msg) {
  try {
    const data = JSON.parse(msg);

    // Telemetry messages can be either an array directly or an object with a "metrics" field
    let metrics = null;
    if (Array.isArray(data)) {
      metrics = data;
    } else if (data && typeof data === 'object' && Array.isArray(data.metrics)) {
      metrics = data.metrics;
    } else {
      console.warn('Telemetry message format not recognized:', typeof data, data);
      return;
    }

    if (!metrics || metrics.length === 0) {
      // Empty metrics array - metrics are cached client-side, so keep existing data
      return;
    }

    // Cache metrics: only add/update metrics, never remove existing ones
    // This ensures metrics persist and show last known values between updates
    metrics.forEach(item => {
      if (!item || typeof item !== 'object') return;

      const { name, labels = {}, last_updated, cached_rate = 0, metric_type } = item;
      if (!name || !metric_type) return;

      const { type, value } = metric_type;
      // Accept gauge, counter, and histogram types
      if (type !== 'gauge' && type !== 'counter' && type !== 'histogram') {
        // Skip histogram types that don't have a simple value
        if (type === 'histogram' && metric_type.data === 'histogram_data_not_serialized') {
          return;
        }
        return;
      }

      // Create composite key from name and labels
      const labelsStr = JSON.stringify(labels);
      const key = `${name}|${labelsStr}`;

      telemetryData[key] = {
        name,
        labels,
        value: value !== undefined ? value : null,
        cached_rate,
        last_updated,
        metric_type,  // Store the full metric_type object so we can access type later
        key
      };
    });
  } catch (error) {
    console.error('Error parsing telemetry message:', error);
    console.error('Message length:', msg ? msg.length : 0);
    if (msg && msg.length > 0) {
      console.error('Message preview (first 200 chars):', msg.substring(0, 200));
      if (msg.length > 4090) {
        console.warn('Message appears to be truncated at ~4096 bytes. Check server buffer size.');
      }
    }
  }
}

export function updateTelemetryTable(changedKeys = new Set()) {
  const container = document.getElementById('table-telemetry');
  if (!container) return;

  // Save current subsection states before updating
  ['gauge', 'counter', 'histogram'].forEach(type => {
    const content = document.getElementById(`content-telemetry-${type}`);
    if (content) {
      const isHidden = content.style.display === 'none';
      sectionState.subsections[`telemetry-${type}`] = !isHidden;
    }
  });

  const metrics = Object.values(telemetryData);
  if (metrics.length === 0) {
    container.innerHTML = '<div class="py-12 text-center"><div class="text-slate-400 text-lg mb-2">Waiting for telemetry data...</div><div class="text-slate-500 text-sm">Metrics will appear here once received</div></div>';
    return;
  }

  // Group metrics by type
  const metricsByType = {
    gauge: [],
    counter: [],
    histogram: []
  };

  metrics.forEach(metric => {
    const type = metric.metric_type?.type || 'gauge';
    if (metricsByType[type]) {
      metricsByType[type].push(metric);
    }
  });

  // Sort each group
  Object.keys(metricsByType).forEach(type => {
    metricsByType[type].sort((a, b) => {
      if (a.name !== b.name) return a.name.localeCompare(b.name);
      return JSON.stringify(a.labels).localeCompare(JSON.stringify(b.labels));
    });
  });

  const createMetricCard = (metric, type) => {
    const isChanged = changedKeys.has(metric.key);
    const labelsStr = Object.keys(metric.labels).length > 0 ?
      Object.entries(metric.labels).map(([k, v]) => `${k}: ${v}`).join(', ') :
      '';

    let valueClass = 'text-2xl font-mono font-bold';
    let typeColor = '';

    switch (type) {
      case 'gauge':
        typeColor = 'text-cyan-400';
        valueClass += ' text-cyan-300';
        break;
      case 'counter':
        typeColor = 'text-green-400';
        valueClass += ' text-green-300';
        break;
      case 'histogram':
        typeColor = 'text-purple-400';
        valueClass += ' text-purple-300';
        break;
    }

    return `
      <div class="bg-slate-800 border border-slate-700 rounded-lg p-4 shadow-lg card-glow ${isChanged ? 'ring-2 ring-cyan-400/50 bg-slate-750' : ''}">
        <div class="flex items-start justify-between mb-2">
          <div class="flex-1">
            <h4 class="text-slate-200 font-medium text-sm mb-1">${metric.name.replace(/_/g, ' ')}</h4>
            ${labelsStr ? `<div class="text-slate-400 text-xs">${labelsStr}</div>` : ''}
          </div>
          <span class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-slate-700 ${typeColor} border border-slate-600">
            ${type}
          </span>
        </div>
        <div class="text-center">
          <div class="${valueClass} mb-1">
            ${formatValue(metric.value, metric.name, metric)}
          </div>
          ${metric.cached_rate ? `
            <div class="text-slate-400 text-xs">
              Rate: ${getMetricType(metric, metric.name) === 'time' ? formatTime(metric.cached_rate) : formatValue(metric.cached_rate, metric.name + '_rate', metric)}
            </div>
          ` : ''}
          <div class="text-slate-500 text-xs mt-2">
            ${formatTimestamp(metric.last_updated)}
          </div>
        </div>
      </div>
    `;
  };

  const cardsHtml = Object.entries(metricsByType)
    .filter(([type, metrics]) => metrics.length > 0)
    .map(([type, typeMetrics]) => `
      <div class="mb-6">
        <div class="flex items-center space-x-2 mb-4 cursor-pointer hover:text-slate-100 transition-colors" onclick="window.toggleSubsection('telemetry-${type}')">
          <svg class="w-4 h-4 text-slate-400 transition-transform transform" id="icon-telemetry-${type}" style="transform: rotate(0deg);">
            <path fill="none" stroke="currentColor" stroke-width="2" d="M6 9l6 6 6-6"/>
          </svg>
          <h3 class="text-lg font-semibold text-slate-200 capitalize">${type} Metrics</h3>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4" id="content-telemetry-${type}">
          ${typeMetrics.map(metric => createMetricCard(metric, type)).join('')}
        </div>
      </div>
    `).join('');

  container.innerHTML = cardsHtml;
  
  // Restore subsection states after update
  Object.keys(metricsByType).forEach(type => {
    if (metricsByType[type].length > 0) {
      restoreSubsectionState(`telemetry-${type}`);
    }
  });
}

