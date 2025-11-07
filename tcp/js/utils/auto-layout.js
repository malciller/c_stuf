// Auto-layout utility for placing widgets on the canvas

const GRID_SIZE = 20;

export class AutoLayout {
  constructor(canvas) {
    this.canvas = canvas;
    this.margin = 1; // Grid units between widgets
  }

  async placeWidgets(widgetIds) {
    // Legacy method - kept for compatibility
    return this.placeMetricWidgets(widgetIds);
  }

  async placeMetricWidgets(metricIds) {
    const widgetsToPlace = [];
    const widgetConfigs = [];

    // Import metric discovery to get metric details
    const { metricDiscovery } = await import('./metric-discovery.js');

    // Prepare widget configurations from metrics
    for (const metricId of metricIds) {
      const metric = metricDiscovery.getMetricById(metricId);
      if (metric) {
        const widgetConfig = await this.createWidgetConfigFromMetric(metric);
        if (widgetConfig) {
          widgetsToPlace.push(widgetConfig);
          widgetConfigs.push(widgetConfig);
        }
      }
    }

    // Calculate positions using auto-layout algorithm
    const positions = this.calculateLayout(widgetsToPlace);

    // Create and place widgets
    for (let i = 0; i < widgetsToPlace.length; i++) {
      const widgetConfig = widgetsToPlace[i];
      widgetConfig.position = positions[i];
      await this.createAndPlaceWidget(widgetConfig);
    }

    return widgetConfigs;
  }

  async createWidgetConfigFromMetric(metric) {
    // Create widget configuration from metric data
    return {
      id: `${metric.widgetType}_${metric.id}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: metric.widgetType,
      position: { x: 0, y: 0 }, // Will be set by layout algorithm
      size: await this.getWidgetSizeForMetric(metric),
      config: {
        metricId: metric.id,
        metricKey: metric.key,
        metricName: metric.name,
        // Additional config based on metric type
        ...(await this.getAdditionalConfigForMetric(metric))
      }
    };
  }

  async getWidgetSizeForMetric(metric) {
    // Import widget registry to get default sizes
    const { widgetRegistry } = await import('../data/state.js');
    const registryEntry = widgetRegistry[metric.widgetType];

    return registryEntry ? { ...registryEntry.defaultSize } : { width: 4, height: 3 };
  }

  async getAdditionalConfigForMetric(metric) {
    // Add metric-specific configuration
    switch (metric.widgetType) {
      case 'telemetry-metric':
      case 'telemetry-counter':
      case 'telemetry-histogram':
        return {
          labels: metric.labels,
          metricType: metric.type,
          key: metric.key
        };
      case 'balance-single':
        return {
          asset: metric.key,
          wallets: metric.wallets
        };
      case 'balance-orders':
        return {
          symbol: metric.key,
          orders: metric.orders
        };
      case 'system-metric':
        return {
          systemKey: metric.key
        };
      default:
        return {};
    }
  }

  calculateLayout(widgets) {
    const positions = [];
    const canvasWidth = Math.floor(this.canvas.element.clientWidth / GRID_SIZE);
    const canvasHeight = Math.floor(this.canvas.element.clientHeight / GRID_SIZE);

    // Simple row-based layout: left to right, top to bottom
    let currentX = 0;
    let currentY = 0;
    let maxHeightInRow = 0;

    for (const widget of widgets) {
      const widgetWidth = widget.size.width;
      const widgetHeight = widget.size.height;

      // Check if widget fits in current row
      if (currentX + widgetWidth > canvasWidth) {
        // Move to next row
        currentX = 0;
        currentY += maxHeightInRow + this.margin;
        maxHeightInRow = 0;
      }

      // Check if widget fits in canvas height
      if (currentY + widgetHeight > canvasHeight) {
        // Wrap to next "page" (leave some space)
        currentY = Math.max(currentY + widgetHeight + this.margin * 2, currentY + 4);
      }

      // Place widget
      positions.push({ x: currentX, y: currentY });

      // Update position for next widget
      currentX += widgetWidth + this.margin;
      maxHeightInRow = Math.max(maxHeightInRow, widgetHeight);
    }

    return positions;
  }

  async createAndPlaceWidget(widgetConfig, skipStorage = false) {
    const registryEntry = await this.getRegistryEntry(widgetConfig.type);
    if (!registryEntry) return;

    let WidgetClass;
    const { type } = registryEntry;

    try {
      switch (type) {
        case 'telemetry':
          const telemetryModule = await import('../widgets/telemetry-widget.js');
          WidgetClass = this.getTelemetryWidgetClass(widgetConfig.type, telemetryModule);
          break;
        case 'balance':
          const balanceModule = await import('../widgets/balance-widget.js');
          WidgetClass = this.getBalanceWidgetClass(widgetConfig.type, balanceModule);
          break;
        case 'system':
          const systemModule = await import('../widgets/system-widget.js');
          WidgetClass = this.getSystemWidgetClass(widgetConfig.type, systemModule);
          break;
        case 'log':
          const logModule = await import('../widgets/log-widget.js');
          WidgetClass = this.getLogWidgetClass(widgetConfig.type, logModule);
          break;
        default:
          console.warn(`Unsupported widget type: ${type}`);
          return;
      }

      if (WidgetClass) {
        const widget = new WidgetClass(widgetConfig);
        this.canvas.addWidget(widget);

        // Save to storage unless explicitly skipped (e.g., when loading from saved config)
        if (!skipStorage) {
          const { storageManager } = await import('./storage.js');
          storageManager.addWidget(widgetConfig);
        }
      }
    } catch (error) {
      console.error(`Error creating widget ${widgetConfig.type}:`, error);
    }
  }

  async getRegistryEntry(widgetType) {
    const { widgetRegistry } = await import('../data/state.js');
    return widgetRegistry[widgetType];
  }

  getTelemetryWidgetClass(widgetType, module) {
    switch (widgetType) {
      case 'telemetry-gauge': return module.TelemetryGaugeWidget;
      case 'telemetry-counter': return module.TelemetryCounterWidget;
      case 'telemetry-histogram': return module.TelemetryHistogramWidget;
      case 'telemetry-metric': return module.TelemetryMetricWidget;
    }
  }

  getBalanceWidgetClass(widgetType, module) {
    switch (widgetType) {
      case 'balance-assets': return module.BalanceAssetsWidget;
      case 'balance-orders': return module.BalanceOrdersWidget;
      case 'balance-single': return module.BalanceSingleWidget;
      case 'balance-orders-single': return module.BalanceOrdersSingleWidget;
    }
  }

  getSystemWidgetClass(widgetType, module) {
    switch (widgetType) {
      case 'system-cpu': return module.SystemCpuWidget;
      case 'system-memory': return module.SystemMemoryWidget;
      case 'system-metric': return module.SystemMetricWidget;
    }
  }

  getLogWidgetClass(widgetType, module) {
    switch (widgetType) {
      case 'log-stream': return module.LogStreamWidget;
    }
  }
}

// Utility function to get optimal layout for given widgets
export function getOptimalLayout(widgets, canvasWidth, canvasHeight) {
  const layout = new AutoLayout({ element: { clientWidth: canvasWidth, clientHeight: canvasHeight } });
  return layout.calculateLayout(widgets);
}
