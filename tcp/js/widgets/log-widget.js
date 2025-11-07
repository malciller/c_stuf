// Log-specific widgets

import { BaseWidget } from './base-widget.js';
import { subscribeToStream, unsubscribeFromStream } from '../utils/websocket.js';

export class LogStreamWidget extends BaseWidget {
  constructor(config) {
    super(config);
    this.type = 'log-stream';
    this.updateCallback = null;
    this.maxLines = 50;
    this.logLines = [];
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

    if (this.logLines.length === 0) {
      content.innerHTML = '<div class="text-slate-400 text-sm text-center py-8">Waiting for log messages...</div>';
      return;
    }

    const logHtml = this.logLines.slice(-this.maxLines).map(line => this.formatLogLine(line)).join('');
    content.innerHTML = `
      <div class="font-mono text-xs bg-slate-900 rounded p-2 h-96 overflow-y-auto custom-scrollbar log-tail-effect">
        ${logHtml}
      </div>
    `;

    this.ensureCloseButton();

    // Auto-scroll to bottom
    const logContainer = content.querySelector('.custom-scrollbar');
    if (logContainer) {
      logContainer.scrollTop = logContainer.scrollHeight;
    }
  }

  formatLogLine(logEntry) {
    if (typeof logEntry === 'string') {
      return `<div class="text-slate-200 py-1">${this.escapeHtml(logEntry)}</div>`;
    }

    // Handle structured log entries
    const { timestamp, level = 'INFO', section = 'unknown', message, id } = logEntry;

    let levelClass = 'text-slate-300';
    switch (level.toUpperCase()) {
      case 'ERROR':
        levelClass = 'text-red-300';
        break;
      case 'WARN':
      case 'WARNING':
        levelClass = 'text-yellow-300';
        break;
      case 'INFO':
        levelClass = 'text-blue-300';
        break;
      case 'DEBUG':
        levelClass = 'text-gray-300';
        break;
    }

    const timeStr = timestamp || new Date().toLocaleTimeString();
    const levelStr = level.padEnd(5);
    const sectionStr = section.padEnd(10).substring(0, 10);

    return `
      <div class="py-1 flex items-start space-x-2">
        <span class="text-slate-400 whitespace-nowrap">${timeStr}</span>
        <span class="font-bold ${levelClass} whitespace-nowrap">${levelStr}</span>
        <span class="text-slate-300 whitespace-nowrap">${sectionStr}</span>
        ${id ? `<span class="text-slate-500 whitespace-nowrap">#${id}</span>` : ''}
        <span class="text-slate-200 flex-1 break-words">${this.escapeHtml(message || logEntry)}</span>
      </div>
    `;
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  addLogEntry(entry) {
    this.logLines.push(entry);

    // Keep only the last maxLines entries
    if (this.logLines.length > this.maxLines * 2) {
      this.logLines = this.logLines.slice(-this.maxLines);
    }

    this.updateContent();
  }

  clearLogs() {
    this.logLines = [];
    this.updateContent();
  }

  update(data) {
    // Data should be a log entry
    if (data) {
      this.addLogEntry(data);
    }
  }

  subscribeToUpdates() {
    this.updateCallback = (data) => this.update(data);
    subscribeToStream('log', this.updateCallback);

    // Periodic cleanup
    this.cleanupInterval = setInterval(() => {
      if (this.logLines.length > this.maxLines) {
        this.logLines = this.logLines.slice(-this.maxLines);
        this.updateContent();
      }
    }, 30000); // Clean up every 30 seconds
  }

  destroy() {
    if (this.updateCallback) {
      unsubscribeFromStream('log', this.updateCallback);
    }
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    super.destroy();
  }
}

