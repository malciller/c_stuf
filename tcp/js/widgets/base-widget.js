// Base widget class with common functionality for all dashboard widgets

import { storageManager } from '../utils/storage.js';
import { formatTimestamp } from '../utils/formatting.js';

const GRID_SIZE = 20; // 20px grid units

export class BaseWidget {
  constructor(config) {
    this.id = config.id || this.generateId();
    this.type = config.type;
    this.position = config.position || { x: 0, y: 0 }; // Grid units
    this.size = config.size || { width: 4, height: 3 }; // Grid units
    this.config = config.config || {};
    this.element = null;
    this.isInitialized = false;
  }

  generateId() {
    return `widget_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  createElement() {
    const element = document.createElement('div');
    element.className = 'widget';
    element.setAttribute('data-widget-id', this.id);
    element.style.position = 'absolute';
    element.style.left = `${this.position.x * GRID_SIZE}px`;
    element.style.top = `${this.position.y * GRID_SIZE}px`;

    // Add widget content container
    const content = document.createElement('div');
    content.className = 'widget-content';

    // Add remove button (top-right corner of content)
    const removeBtn = document.createElement('button');
    removeBtn.className = 'widget-remove-btn';
    removeBtn.innerHTML = '×';
    removeBtn.title = 'Remove widget';
    removeBtn.setAttribute('aria-label', 'Remove widget');

    content.appendChild(removeBtn);
    element.appendChild(content);

    this.element = element;
    this.setupEventListeners();

    return element;
  }

  setupEventListeners() {
    if (!this.element) return;

    // Remove button
    const removeBtn = this.element.querySelector('.widget-remove-btn');
    if (removeBtn) {
      removeBtn.addEventListener('click', this.handleRemove.bind(this));
    }

    // Right-click context menu
    this.element.addEventListener('contextmenu', this.handleContextMenu.bind(this));
  }


  handleRemove(e) {
    e.stopPropagation();
    if (confirm('Remove this widget from the dashboard?')) {
      // Dispatch custom event for canvas to handle removal
      const removeEvent = new CustomEvent('widgetRemove', {
        detail: { widgetId: this.id },
        bubbles: true
      });
      this.element.dispatchEvent(removeEvent);
    }
  }

  handleContextMenu(e) {
    e.preventDefault();
    // Context menu will be handled by the canvas component
  }

  savePosition() {
    storageManager.updateWidget(this.id, {
      position: { ...this.position }
    });
  }

  updateSize() {
    // Apply calculated size to DOM element
    if (this.element && this.size) {
      const pixelWidth = this.size.width * GRID_SIZE;
      const pixelHeight = this.size.height * GRID_SIZE;

      this.element.style.width = `${pixelWidth}px`;
      this.element.style.height = `${pixelHeight}px`;
    }
  }

  getTitle() {
    return this.type.charAt(0).toUpperCase() + this.type.slice(1);
  }

  update(data) {
    // Override in subclasses
    console.log(`Widget ${this.id} received update:`, data);
  }

  destroy() {
    if (this.element) {
      this.element.remove();
    }
  }

  // Ensure close button exists in widget content (widgets wipe it out with innerHTML)
  ensureCloseButton() {
    if (!this.element) return;

    const content = this.element.querySelector('.widget-content');
    if (!content) return;

    let removeBtn = content.querySelector('.widget-remove-btn');
    if (!removeBtn) {
      // Create and add the close button if it's missing
      removeBtn = document.createElement('button');
      removeBtn.className = 'widget-remove-btn';
      removeBtn.innerHTML = '×';
      removeBtn.title = 'Remove widget';
      removeBtn.setAttribute('aria-label', 'Remove widget');

      content.appendChild(removeBtn);

      // Set up event listener for the newly created button
      removeBtn.addEventListener('click', this.handleRemove.bind(this));
    }
  }

  // Auto-resize based on content (no constraints)
  autoSize() {
    if (!this.element) return;

    const content = this.element.querySelector('.widget-content');
    if (!content) return;

    // Calculate content dimensions
    const contentWidth = content.scrollWidth;
    const contentHeight = content.scrollHeight;

    // Convert to grid units (no min/max constraints)
    const gridWidth = Math.ceil(contentWidth / GRID_SIZE);
    const gridHeight = Math.ceil(contentHeight / GRID_SIZE);

    if (gridWidth !== this.size.width || gridHeight !== this.size.height) {
      this.size.width = gridWidth;
      this.size.height = gridHeight;
      this.updateSize();
    }
  }
}

