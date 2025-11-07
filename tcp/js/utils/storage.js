// localStorage configuration management for widget persistence

const STORAGE_KEY = 'diodashboard_config';

export class StorageManager {
  constructor() {
    this.config = this.loadConfig();
  }

  loadConfig() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (error) {
      console.error('Error loading dashboard configuration:', error);
    }

    // Default configuration
    return {
      version: '1.0',
      widgets: []
    };
  }

  saveConfig(config) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
      this.config = config;
    } catch (error) {
      console.error('Error saving dashboard configuration:', error);
    }
  }

  addWidget(widgetConfig) {
    const config = { ...this.config };
    config.widgets.push(widgetConfig);
    this.saveConfig(config);
  }

  updateWidget(widgetId, updates) {
    const config = { ...this.config };
    const widgetIndex = config.widgets.findIndex(w => w.id === widgetId);
    if (widgetIndex !== -1) {
      config.widgets[widgetIndex] = { ...config.widgets[widgetIndex], ...updates };
      this.saveConfig(config);
    }
  }

  removeWidget(widgetId) {
    const config = { ...this.config };
    config.widgets = config.widgets.filter(w => w.id !== widgetId);
    this.saveConfig(config);
  }

  getWidgets() {
    return this.config.widgets || [];
  }

  getWidgetById(widgetId) {
    return this.config.widgets.find(w => w.id === widgetId);
  }

  clearAll() {
    this.saveConfig({ version: '1.0', widgets: [] });
  }

  exportConfig() {
    return JSON.stringify(this.config, null, 2);
  }

  importConfig(jsonString) {
    try {
      const config = JSON.parse(jsonString);
      if (config.version && Array.isArray(config.widgets)) {
        this.saveConfig(config);
        return true;
      }
    } catch (error) {
      console.error('Error importing configuration:', error);
    }
    return false;
  }
}

// Singleton instance
export const storageManager = new StorageManager();

