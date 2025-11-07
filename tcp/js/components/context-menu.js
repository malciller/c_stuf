// Right-click context menu component

export class ContextMenu {
  constructor(canvas) {
    this.canvas = canvas;
    this.element = null;
    this.currentWidget = null;
    this.isVisible = false;
    this.init();
  }

  init() {
    this.createMenu();
    this.setupEventListeners();
  }

  createMenu() {
    this.element = document.createElement('div');
    this.element.className = 'context-menu';
    this.element.style.display = 'none';

    this.element.innerHTML = `
      <div class="context-menu-item" data-action="delete">
        <span class="context-menu-text">Delete Widget</span>
      </div>
      <div class="context-menu-item" data-action="duplicate">
        <span class="context-menu-text">Duplicate</span>
      </div>
      <div class="context-menu-item" data-action="resize">
        <span class="context-menu-text">Auto-resize</span>
      </div>
      <div class="context-menu-separator"></div>
      <div class="context-menu-item" data-action="bring-to-front">
        <span class="context-menu-text">Bring to Front</span>
      </div>
      <div class="context-menu-item" data-action="send-to-back">
        <span class="context-menu-text">Send to Back</span>
      </div>
    `;

    document.body.appendChild(this.element);
  }

  setupEventListeners() {
    // Handle menu item clicks
    this.element.addEventListener('click', (e) => {
      const menuItem = e.target.closest('.context-menu-item');
      if (!menuItem) return;

      const action = menuItem.getAttribute('data-action');
      this.handleAction(action);
    });

    // Close menu when clicking outside
    document.addEventListener('click', (e) => {
      if (!this.element.contains(e.target)) {
        this.hide();
      }
    });

    // Close menu on escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isVisible) {
        this.hide();
      }
    });
  }

  show(widget, x, y) {
    this.currentWidget = widget;

    // Position menu
    const menuRect = this.element.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    // Adjust position to stay within viewport
    let adjustedX = x;
    let adjustedY = y;

    if (x + menuRect.width > viewportWidth) {
      adjustedX = x - menuRect.width;
    }

    if (y + menuRect.height > viewportHeight) {
      adjustedY = y - menuRect.height;
    }

    this.element.style.left = `${adjustedX}px`;
    this.element.style.top = `${adjustedY}px`;
    this.element.style.display = 'block';
    this.isVisible = true;

    // Prevent default context menu from showing
    event?.preventDefault();
  }

  hide() {
    this.element.style.display = 'none';
    this.isVisible = false;
    this.currentWidget = null;
  }

  handleAction(action) {
    if (!this.currentWidget) return;

    switch (action) {
      case 'delete':
        this.deleteWidget();
        break;
      case 'duplicate':
        this.duplicateWidget();
        break;
      case 'resize':
        this.resizeWidget();
        break;
      case 'bring-to-front':
        this.bringToFront();
        break;
      case 'send-to-back':
        this.sendToBack();
        break;
    }

    this.hide();
  }

  deleteWidget() {
    if (confirm('Delete this widget?')) {
      this.canvas.removeWidget(this.currentWidget.id);
    }
  }

  duplicateWidget() {
    // Import storage manager to save new widget
    import('../utils/storage.js').then(module => {
      const storageManager = module.storageManager;

      // Create new widget config
      const newConfig = {
        ...this.currentWidget.config,
        id: `${this.currentWidget.type}_${Date.now()}`,
        position: {
          x: this.currentWidget.position.x + 1,
          y: this.currentWidget.position.y + 1
        }
      };

      // Create and instantiate the widget using the global function
      if (window.createWidgetFromConfig) {
        window.createWidgetFromConfig(newConfig);
      } else {
        // Fallback: use the context menu's own method
        this.createWidgetFromConfig(newConfig);
      }
    });
  }

  resizeWidget() {
    this.currentWidget.autoSize();
  }

  bringToFront() {
    // Get all widget elements and their computed z-index values
    const widgetElements = Array.from(this.canvas.element.children)
      .filter(el => el.classList.contains('widget'));

    // Find the maximum z-index among all widgets
    const maxZ = Math.max(...widgetElements.map(el => {
      const computedZ = getComputedStyle(el).zIndex;
      return computedZ === 'auto' ? 0 : parseInt(computedZ) || 0;
    }));

    // Set this widget to one level above the maximum
    this.currentWidget.element.style.zIndex = maxZ + 1;
  }

  sendToBack() {
    // Set to a z-index lower than the CSS default (widgets have z-index: 5 by default)
    // This ensures the widget goes behind other widgets that haven't had their z-index explicitly set
    this.currentWidget.element.style.zIndex = '1';
  }

  createWidgetFromConfig(config) {
    // Import the appropriate widget class
    let WidgetClass;
    const type = config.type;

    switch (type) {
      case 'telemetry-gauge':
        import('../widgets/telemetry-widget.js').then(module => {
          WidgetClass = module.TelemetryGaugeWidget;
          this.instantiateWidget(WidgetClass, config);
        });
        break;
      case 'telemetry-counter':
        import('../widgets/telemetry-widget.js').then(module => {
          WidgetClass = module.TelemetryCounterWidget;
          this.instantiateWidget(WidgetClass, config);
        });
        break;
      case 'telemetry-histogram':
        import('../widgets/telemetry-widget.js').then(module => {
          WidgetClass = module.TelemetryHistogramWidget;
          this.instantiateWidget(WidgetClass, config);
        });
        break;
      case 'telemetry-metric':
        import('../widgets/telemetry-widget.js').then(module => {
          WidgetClass = module.TelemetryMetricWidget;
          this.instantiateWidget(WidgetClass, config);
        });
        break;
      case 'balance-assets':
        import('../widgets/balance-widget.js').then(module => {
          WidgetClass = module.BalanceAssetsWidget;
          this.instantiateWidget(WidgetClass, config);
        });
        break;
      case 'balance-orders':
        import('../widgets/balance-widget.js').then(module => {
          WidgetClass = module.BalanceOrdersWidget;
          this.instantiateWidget(WidgetClass, config);
        });
        break;
      case 'balance-single':
        import('../widgets/balance-widget.js').then(module => {
          WidgetClass = module.BalanceSingleWidget;
          this.instantiateWidget(WidgetClass, config);
        });
        break;
      case 'balance-orders-single':
        import('../widgets/balance-widget.js').then(module => {
          WidgetClass = module.BalanceOrdersSingleWidget;
          this.instantiateWidget(WidgetClass, config);
        });
        break;
      case 'system-cpu':
        import('../widgets/system-widget.js').then(module => {
          WidgetClass = module.SystemCpuWidget;
          this.instantiateWidget(WidgetClass, config);
        });
        break;
      case 'system-memory':
        import('../widgets/system-widget.js').then(module => {
          WidgetClass = module.SystemMemoryWidget;
          this.instantiateWidget(WidgetClass, config);
        });
        break;
      case 'system-metric':
        import('../widgets/system-widget.js').then(module => {
          WidgetClass = module.SystemMetricWidget;
          this.instantiateWidget(WidgetClass, config);
        });
        break;
      case 'log-stream':
        import('../widgets/log-widget.js').then(module => {
          WidgetClass = module.LogStreamWidget;
          this.instantiateWidget(WidgetClass, config);
        });
        break;
      default:
        console.error(`Unknown widget type: ${type}`);
    }
  }

  instantiateWidget(WidgetClass, config) {
    const widget = new WidgetClass(config);
    this.canvas.addWidget(widget);
  }
}

