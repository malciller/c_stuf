// Widget selection modal component

import { widgetRegistry } from '../data/state.js';
import { metricDiscovery } from '../utils/metric-discovery.js';

export class WidgetMenu {
  constructor(canvas) {
    this.canvas = canvas;
    this.element = null;
    this.isOpen = false;
    this.selectedWidgets = new Set();
    this.selectedSubsections = new Set();
    this.metricsData = {};
    this.collapsedSubsections = new Set(); // Will be populated dynamically based on subsection sizes
    this.init();
  }

  init() {
    this.createModal();
    this.setupEventListeners();
  }

  createModal() {
    // Create modal overlay
    this.element = document.createElement('div');
    this.element.className = 'widget-modal-overlay';
    this.element.style.display = 'none';

    // Create modal content
    const modalContent = document.createElement('div');
    modalContent.className = 'widget-modal-content';

    // Create modal header
    const header = document.createElement('div');
    header.className = 'widget-modal-header';

    const title = document.createElement('h2');
    title.textContent = 'Add Widgets';
    title.className = 'widget-modal-title';

    const closeBtn = document.createElement('button');
    closeBtn.className = 'widget-modal-close';
    closeBtn.innerHTML = '×';
    closeBtn.setAttribute('aria-label', 'Close modal');

    header.appendChild(title);
    header.appendChild(closeBtn);

    // Create search input
    const searchContainer = document.createElement('div');
    searchContainer.className = 'widget-modal-search';

    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.placeholder = 'Search widgets...';
    searchInput.className = 'widget-modal-search-input';

    searchContainer.appendChild(searchInput);

    // Create widget categories
    const categories = this.createCategories();

    // Create footer with confirmation button
    const footer = document.createElement('div');
    footer.className = 'widget-modal-footer';

    const selectedCount = document.createElement('div');
    selectedCount.className = 'widget-modal-selected-count';
    selectedCount.textContent = '0 widgets selected';

    const addButton = document.createElement('button');
    addButton.className = 'widget-modal-add-btn';
    addButton.textContent = 'Add Selected Widgets';
    addButton.disabled = true;

    footer.appendChild(selectedCount);
    footer.appendChild(addButton);

    // Assemble modal
    modalContent.appendChild(header);
    modalContent.appendChild(searchContainer);
    modalContent.appendChild(categories);
    modalContent.appendChild(footer);

    this.element.appendChild(modalContent);

    // Add to document
    document.body.appendChild(this.element);

    // Store references
    this.searchInput = searchInput;
    this.categoriesContainer = categories;
    this.selectedCount = selectedCount;
    this.addButton = addButton;
  }

  createCategories() {
    const container = document.createElement('div');
    container.className = 'widget-modal-categories';

    // Discover available metrics
    this.metricsData = metricDiscovery.discoverAllMetrics();
    this.subsectionsData = metricDiscovery.getAllSubsections();
    const subsections = this.subsectionsData;

    // Populate collapsedSubsections based on subsection sizes (>5 metrics = large)
    this.collapsedSubsections.clear();
    Object.entries(subsections).forEach(([category, categorySubsections]) => {
      categorySubsections.forEach(subsection => {
        const subsectionId = `${category}-${subsection.title.toLowerCase().replace(/\s+/g, '-')}`;
        if (subsection.metrics.length > 5) {
          this.collapsedSubsections.add(subsectionId);
        }
      });
    });

    // Create category sections
    Object.entries(subsections).forEach(([category, categorySubsections]) => {
      if (categorySubsections.length === 0) return;

      const categorySection = document.createElement('div');
      categorySection.className = 'widget-modal-category';

      const categoryTitle = document.createElement('h3');
      categoryTitle.className = 'widget-modal-category-title';
      categoryTitle.textContent = category.charAt(0).toUpperCase() + category.slice(1);

      // Create subsection groups
      categorySubsections.forEach(subsection => {
        const subsectionElement = this.createSubsectionElement(subsection, category);
        categorySection.appendChild(subsectionElement);
      });

      container.appendChild(categorySection);
    });

    return container;
  }

  createSubsectionElement(subsection, category) {
    const subsectionElement = document.createElement('div');
    subsectionElement.className = 'widget-modal-subsection';

    const subsectionId = `${category}-${subsection.title.toLowerCase().replace(/\s+/g, '-')}`;

    // Subsection header with checkbox and toggle
    const header = document.createElement('div');
    header.className = 'widget-modal-subsection-header';

    // Subsection checkbox
    const subsectionCheckbox = document.createElement('input');
    subsectionCheckbox.type = 'checkbox';
    subsectionCheckbox.className = 'widget-modal-checkbox widget-modal-subsection-checkbox';
    subsectionCheckbox.id = `subsection-${subsectionId}`;
    subsectionCheckbox.setAttribute('data-subsection-id', subsectionId);

    const subsectionLabel = document.createElement('label');
    subsectionLabel.className = 'widget-modal-subsection-label';
    // No 'for' attribute - label should NOT trigger checkbox, only direct checkbox clicks should

    const icon = document.createElement('span');
    icon.className = 'widget-modal-subsection-icon';
    icon.textContent = subsection.icon;

    const title = document.createElement('span');
    title.className = 'widget-modal-subsection-title';
    title.textContent = subsection.title;

    const count = document.createElement('span');
    count.className = 'widget-modal-subsection-count';
    count.textContent = `(${subsection.metrics.length})`;

    subsectionLabel.appendChild(icon);
    subsectionLabel.appendChild(title);
    subsectionLabel.appendChild(count);

    // Expand/collapse toggle button
    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'widget-modal-subsection-toggle';
    toggleBtn.setAttribute('aria-label', 'Toggle subsection');
    toggleBtn.innerHTML = '▼'; // Down arrow

    header.appendChild(subsectionCheckbox);
    header.appendChild(subsectionLabel);
    header.appendChild(toggleBtn);

    // Metrics grid (collapsible)
    const metricsGrid = document.createElement('div');
    metricsGrid.className = 'widget-modal-metrics-grid';

    subsection.metrics.forEach(metric => {
      const metricCard = this.createMetricCard(metric, subsectionId);
      metricsGrid.appendChild(metricCard);
    });

    subsectionElement.appendChild(header);
    subsectionElement.appendChild(metricsGrid);

    // Check if this subsection should be collapsed
    if (this.collapsedSubsections.has(subsectionId)) {
      metricsGrid.classList.add('collapsed');
      toggleBtn.innerHTML = '▶'; // Right arrow
      toggleBtn.classList.add('collapsed');
    }

    // Add event listeners
    subsectionCheckbox.addEventListener('change', this.handleSubsectionCheckboxChange.bind(this));
    
    // Only direct clicks on checkbox should trigger select all - stop propagation so header doesn't toggle
    subsectionCheckbox.addEventListener('click', (e) => {
      e.stopPropagation();
    });
    
    toggleBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.toggleSubsection(subsectionId, toggleBtn, metricsGrid);
    });

    // Make header clickable to toggle dropdown - everything except checkbox and toggle button
    header.addEventListener('click', (e) => {
      // Only toggle if clicking directly on checkbox or toggle button (which handle their own clicks)
      if (e.target !== subsectionCheckbox && e.target !== toggleBtn) {
        this.toggleSubsection(subsectionId, toggleBtn, metricsGrid);
      }
    });

    return subsectionElement;
  }

  createMetricCard(metric, subsectionId) {
    const card = document.createElement('div');
    card.className = 'widget-modal-metric-card';
    card.setAttribute('data-metric-id', metric.id);

    // Checkbox container
    const checkboxContainer = document.createElement('div');
    checkboxContainer.className = 'widget-modal-card-checkbox';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'widget-modal-checkbox widget-modal-metric-checkbox';
    checkbox.id = `metric-${metric.id}`;
    checkbox.value = metric.id;
    checkbox.setAttribute('data-subsection-id', subsectionId);

    const checkboxLabel = document.createElement('label');
    checkboxLabel.className = 'widget-modal-checkbox-label';
    checkboxLabel.setAttribute('for', `metric-${metric.id}`);

    checkboxContainer.appendChild(checkbox);
    checkboxContainer.appendChild(checkboxLabel);

    // Metric preview (similar to how it appears on canvas)
    const preview = this.createMetricPreview(metric);

    card.appendChild(checkboxContainer);
    card.appendChild(preview);

    // Add checkbox change listener
    checkbox.addEventListener('change', this.handleCheckboxChange.bind(this));

    return card;
  }

  createMetricPreview(metric) {
    const preview = document.createElement('div');
    preview.className = 'widget-modal-metric-preview';

    // Create a mini version of the actual widget
    switch (metric.widgetType) {
      case 'telemetry-metric':
      case 'telemetry-counter':
      case 'telemetry-histogram':
        preview.innerHTML = this.createTelemetryPreview(metric);
        break;
      case 'balance-single':
        preview.innerHTML = this.createBalancePreview(metric);
        break;
      case 'balance-orders':
        preview.innerHTML = this.createOrdersPreview(metric);
        break;
      case 'balance-orders-single':
        preview.innerHTML = this.createOrdersPreview(metric);
        break;
      case 'system-cpu':
        preview.innerHTML = this.createCpuPreview(metric);
        break;
      case 'system-memory':
        preview.innerHTML = this.createMemoryPreview(metric);
        break;
      case 'system-metric':
        preview.innerHTML = this.createSystemMetricPreview(metric);
        break;
      case 'log-stream':
        preview.innerHTML = this.createLogPreview(metric);
        break;
      default:
        preview.innerHTML = `<div class="text-slate-400 text-xs">Unknown metric type</div>`;
    }

    return preview;
  }

  createTelemetryPreview(metric) {
    const labelsHtml = metric.labelsStr ? `<div class="text-slate-400 text-xs truncate">${metric.labelsStr}</div>` : '';
    const rateHtml = metric.cachedRate ? `<div class="text-xs text-slate-500">Rate: ${metric.cachedRate}</div>` : '';

    return `
      <div class="bg-slate-800 border border-slate-700 rounded p-2 min-h-[60px]">
        <div class="text-xs font-medium text-slate-200 truncate mb-1">${metric.name}</div>
        ${labelsHtml}
        <div class="text-sm font-mono font-bold text-cyan-300 mt-1">${metric.displayValue}</div>
        ${rateHtml}
      </div>
    `;
  }

  createBalancePreview(metric) {
    return `
      <div class="bg-slate-800 border border-slate-700 rounded p-2 min-h-[60px]">
        <div class="text-sm font-medium text-slate-200 mb-1">${metric.name}</div>
        <div class="text-lg font-mono font-bold text-green-300">${metric.displayValue}</div>
        ${metric.wallets ? `<div class="text-xs text-slate-400 mt-1">${metric.wallets.length} wallet${metric.wallets.length !== 1 ? 's' : ''}</div>` : ''}
      </div>
    `;
  }

  createOrdersPreview(metric) {
    return `
      <div class="bg-slate-800 border border-slate-700 rounded p-2 min-h-[60px]">
        <div class="text-sm font-medium text-slate-200 mb-1">${metric.name}</div>
        <div class="text-lg font-mono font-bold text-blue-300">${metric.displayValue}</div>
        <div class="text-xs text-slate-400 mt-1">Open orders</div>
      </div>
    `;
  }

  createCpuPreview(metric) {
    return `
      <div class="bg-slate-800 border border-slate-700 rounded p-3 min-h-[60px]">
        <div class="text-sm font-medium text-slate-200 mb-2">CPU Usage</div>
        <div class="text-xl font-mono font-bold text-blue-300">${metric.displayValue}</div>
        <div class="w-full bg-slate-700 rounded-full h-2 mt-2">
          <div class="bg-blue-500 h-2 rounded-full" style="width: ${metric.value}%"></div>
        </div>
      </div>
    `;
  }

  createMemoryPreview(metric) {
    return `
      <div class="bg-slate-800 border border-slate-700 rounded p-3 min-h-[60px]">
        <div class="text-sm font-medium text-slate-200 mb-2">Memory Usage</div>
        <div class="text-xl font-mono font-bold text-blue-300">${metric.displayValue}</div>
        <div class="w-full bg-slate-700 rounded-full h-2 mt-2">
          <div class="bg-blue-500 h-2 rounded-full" style="width: ${metric.value}%"></div>
        </div>
      </div>
    `;
  }

  createSystemMetricPreview(metric) {
    return `
      <div class="bg-slate-800 border border-slate-700 rounded p-2 min-h-[60px]">
        <div class="text-xs font-medium text-slate-200 truncate mb-1">${metric.name}</div>
        <div class="text-sm font-mono font-bold text-purple-300">${metric.displayValue}</div>
      </div>
    `;
  }

  createLogPreview(metric) {
    return `
      <div class="bg-slate-800 border border-slate-700 rounded p-3 min-h-[60px]">
        <div class="text-sm font-medium text-slate-200 mb-2">Log Stream</div>
        <div class="text-xs text-slate-400">Real-time log messages</div>
        <div class="mt-2 h-8 bg-slate-900 rounded p-1 font-mono text-xs overflow-hidden">
          <div class="text-green-400">[INFO]</div>
          <div class="text-blue-400">[DEBUG]</div>
          <div class="text-yellow-400">[WARN]</div>
        </div>
      </div>
    `;
  }

  getWidgetIcon(type) {
    const icons = {
      telemetry: '',
      balance: '',
      system: '',
      log: ''
    };
    return icons[type] || '';
  }

  setupEventListeners() {
    // Close modal when clicking overlay
    this.element.addEventListener('click', (e) => {
      if (e.target === this.element) {
        this.close();
      }
    });

    // Close button
    const closeBtn = this.element.querySelector('.widget-modal-close');
    closeBtn.addEventListener('click', () => this.close());

    // Search functionality
    this.searchInput.addEventListener('input', this.handleSearch.bind(this));

    // Add button
    this.addButton.addEventListener('click', this.handleAddWidgets.bind(this));

    // ESC key to close
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen) {
        this.close();
      }
    });
  }

  handleSubsectionCheckboxChange(e) {
    const subsectionId = e.target.getAttribute('data-subsection-id');
    const isChecked = e.target.checked;

    // Find all metric checkboxes in this subsection
    const subsectionElement = e.target.closest('.widget-modal-subsection');
    const metricCheckboxes = subsectionElement.querySelectorAll('.widget-modal-metric-checkbox');

    metricCheckboxes.forEach(checkbox => {
      checkbox.checked = isChecked;
      const metricId = checkbox.value;
      if (isChecked) {
        this.selectedWidgets.add(metricId);
      } else {
        this.selectedWidgets.delete(metricId);
      }
    });

    // Update subsection selection tracking
    if (isChecked) {
      this.selectedSubsections.add(subsectionId);
    } else {
      this.selectedSubsections.delete(subsectionId);
    }

    this.updateSelectedCount();
  }

  handleCheckboxChange(e) {
    const metricId = e.target.value;
    const subsectionId = e.target.getAttribute('data-subsection-id');

    if (e.target.checked) {
      this.selectedWidgets.add(metricId);
    } else {
      this.selectedWidgets.delete(metricId);
      // Also uncheck subsection if this was the last metric
      this.checkSubsectionState(subsectionId);
    }

    this.updateSelectedCount();
  }

  checkSubsectionState(subsectionId) {
    // Check if all metrics in subsection are still selected
    const subsectionElement = document.querySelector(`[data-subsection-id="${subsectionId}"]`);
    if (!subsectionElement) return;

    const parent = subsectionElement.closest('.widget-modal-subsection');
    const metricCheckboxes = parent.querySelectorAll('.widget-modal-metric-checkbox');
    const checkedBoxes = parent.querySelectorAll('.widget-modal-metric-checkbox:checked');

    const subsectionCheckbox = parent.querySelector('.widget-modal-subsection-checkbox');
    subsectionCheckbox.checked = metricCheckboxes.length === checkedBoxes.length;

    if (subsectionCheckbox.checked) {
      this.selectedSubsections.add(subsectionId);
    } else {
      this.selectedSubsections.delete(subsectionId);
    }
  }

  handleAddWidgets() {
    if (this.selectedWidgets.size === 0 && this.selectedSubsections.size === 0) return;

    // Import auto-layout utility
    import('../utils/auto-layout.js').then(module => {
      const autoLayout = new module.AutoLayout(this.canvas);

      // Collect all metric IDs to create widgets for
      const allMetricIds = new Set(this.selectedWidgets);

      // For selected subsections, add all metrics from those subsections
      for (const subsectionId of this.selectedSubsections) {
        const metrics = this.getMetricsForSubsection(subsectionId);
        metrics.forEach(metric => allMetricIds.add(metric.id));
      }

      // Create individual widgets for each selected metric
      const selectedMetricIds = Array.from(allMetricIds);
      autoLayout.placeMetricWidgets(selectedMetricIds);

      // Clear selection and close modal
      this.selectedWidgets.clear();
      this.selectedSubsections.clear();
      this.updateSelectedCount();
      this.close();
    });
  }

  toggleSubsection(subsectionId, toggleBtn, metricsGrid) {
    const isCollapsed = this.collapsedSubsections.has(subsectionId);

    if (isCollapsed) {
      // Expand
      this.collapsedSubsections.delete(subsectionId);
      metricsGrid.classList.remove('collapsed');
      toggleBtn.innerHTML = '▼';
      toggleBtn.classList.remove('collapsed');
    } else {
      // Collapse
      this.collapsedSubsections.add(subsectionId);
      metricsGrid.classList.add('collapsed');
      toggleBtn.innerHTML = '▶';
      toggleBtn.classList.add('collapsed');
    }
  }

  getMetricsForSubsection(subsectionId) {
    // Parse subsection ID to get category and subsection type
    const [category, subsectionType] = subsectionId.split('-');

    // Defensive check: ensure subsectionsData exists
    if (!this.subsectionsData || !this.subsectionsData[category]) {
      return [];
    }

    const subsections = this.subsectionsData[category] || [];
    const subsection = subsections.find(sub => sub.title.toLowerCase().replace(/\s+/g, '-') === subsectionType);
    return subsection ? subsection.metrics : [];
  }

  handleSearch(e) {
    const searchTerm = e.target.value.toLowerCase();
    const cards = this.element.querySelectorAll('.widget-modal-card');

    cards.forEach(card => {
      const title = card.querySelector('.widget-modal-card-title').textContent.toLowerCase();
      const description = card.querySelector('.widget-modal-card-description').textContent.toLowerCase();

      if (title.includes(searchTerm) || description.includes(searchTerm)) {
        card.style.display = '';
      } else {
        card.style.display = 'none';
      }
    });
  }

  updateSelectedCount() {
    const widgetCount = this.selectedWidgets.size;
    const subsectionCount = this.selectedSubsections.size;

    // Calculate total estimated widgets (subsection selections will create multiple widgets)
    let totalCount = widgetCount;
    for (const subsectionId of this.selectedSubsections) {
      const metrics = this.getMetricsForSubsection(subsectionId);
      totalCount += metrics.length;
    }

    this.selectedCount.textContent = `${totalCount} widget${totalCount !== 1 ? 's' : ''} selected`;
    this.addButton.disabled = totalCount === 0;
  }

  open() {
    // Refresh metrics data
    this.metricsData = metricDiscovery.discoverAllMetrics();
    this.subsectionsData = metricDiscovery.getAllSubsections();

    // Rebuild the categories with fresh data
    const categories = this.createCategories();
    const existingCategories = this.element.querySelector('.widget-modal-categories');
    if (existingCategories) {
      existingCategories.replaceWith(categories);
      this.categoriesContainer = categories;
    }

    // Reset selections when opening (but preserve collapsed state)
    this.selectedWidgets.clear();
    this.selectedSubsections.clear();
    const checkboxes = this.element.querySelectorAll('.widget-modal-checkbox');
    checkboxes.forEach(checkbox => checkbox.checked = false);
    this.updateSelectedCount();

    this.element.style.display = 'flex';
    this.isOpen = true;
    this.searchInput.focus();

    // Prevent body scroll
    document.body.style.overflow = 'hidden';
  }

  close() {
    this.element.style.display = 'none';
    this.isOpen = false;
    this.searchInput.value = '';

    // Restore body scroll
    document.body.style.overflow = '';

    // Clear search filter
    const cards = this.element.querySelectorAll('.widget-modal-card');
    cards.forEach(card => card.style.display = '');
  }

  toggle() {
    if (this.isOpen) {
      this.close();
    } else {
      this.open();
    }
  }
}

