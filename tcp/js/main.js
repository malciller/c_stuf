// Main entry point for the DioDashboard widget system

import { streams } from './data/state.js';
import { Canvas } from './components/canvas.js';
import { WidgetMenu } from './components/widget-menu.js';
import { ContextMenu } from './components/context-menu.js';
import { connectStream } from './utils/websocket.js';
import { storageManager } from './utils/storage.js';
import { widgetRegistry } from './data/state.js';

let canvas;
let widgetMenu;
let contextMenu;

window.onload = () => {
  try {
    const container = document.getElementById('canvas-container');
    const addWidgetBtn = document.getElementById('add-widget-btn');

    if (!container) {
      console.error('Could not find canvas container element');
      return;
    }

    // Initialize canvas
    canvas = new Canvas(container);

    // Initialize widget menu
    widgetMenu = new WidgetMenu(canvas);

    // Initialize context menu
    contextMenu = new ContextMenu(canvas);

    // Setup add widget button
    if (addWidgetBtn) {
      addWidgetBtn.addEventListener('click', () => {
        widgetMenu.open();
      });
    }

    // Setup clear all button
    const clearAllBtn = document.getElementById('clear-all-btn');
    if (clearAllBtn) {
      clearAllBtn.addEventListener('click', () => {
        if (confirm('Clear all widgets from the dashboard? This cannot be undone.')) {
          // Clear storage first
          storageManager.clearAll();
          // Then clear canvas UI
          canvas.clear();
        }
      });
    }

    // Setup canvas context menu
    canvas.element.addEventListener('contextmenu', (e) => {
      // Only show context menu if clicking on empty canvas
      if (e.target === canvas.element || e.target === canvas.gridElement) {
        e.preventDefault();
        contextMenu.show(null, e.clientX, e.clientY);
      }
    });

    // Load saved configuration
    loadSavedConfiguration();

    // Connect to WebSocket streams
    if ('WebSocket' in window) {
      streams.forEach(streamName => {
        try {
          connectStream(streamName);
        } catch (error) {
          console.error(`Error initializing stream ${streamName}:`, error);
        }
      });
    } else {
      console.error('WebSockets not supported in this browser');
    }

  } catch (error) {
    console.error('Error during page initialization:', error);
  }
};

async function loadSavedConfiguration() {
  try {
    const config = storageManager.config;
    if (config.widgets && config.widgets.length > 0) {
      for (const widgetConfig of config.widgets) {
        await createWidgetFromConfig(widgetConfig);
      }
    }
  } catch (error) {
    console.error('Error loading saved configuration:', error);
  }
}

async function createWidgetFromConfig(config) {
  const { AutoLayout } = await import('./utils/auto-layout.js');
  const autoLayout = new AutoLayout(canvas);
  await autoLayout.createAndPlaceWidget(config, true); // skipStorage=true when loading from saved config
}


// Handle widget right-click context menu
window.addEventListener('contextmenu', (e) => {
  const widgetElement = e.target.closest('.widget');
  if (widgetElement) {
    e.preventDefault();
    const widgetId = widgetElement.getAttribute('data-widget-id');
    const widget = canvas.getWidget(widgetId);
    if (widget) {
      contextMenu.show(widget, e.clientX, e.clientY);
    }
  }
});

