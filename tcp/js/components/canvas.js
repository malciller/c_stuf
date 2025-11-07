// Canvas component with dot grid background for widget placement

import { dragDropManager } from '../utils/drag-drop.js';

const GRID_SIZE = 20;
const GRID_DOT_SIZE = 1;

export class Canvas {
  constructor(container) {
    this.container = container;
    this.widgets = new Map();
    this.element = null;
    this.gridElement = null;
    this.dragDropManager = new dragDropManager.constructor(this);

    // Zoom state
    this.scale = 1.0;
    this.minScale = 0.25;
    this.maxScale = 2.0;
    this.baseWidth = 0; // Will be set after element creation
    this.baseHeight = 0; // Will be set after element creation
    this.isZooming = false;
    this.lastTouchDistance = 0;

    this.init();
  }

  init() {
    // Create main canvas container
    this.element = document.createElement('div');
    this.element.className = 'canvas-container';
    this.element.style.position = 'relative';
    this.element.style.width = '100%'; // Full container width initially
    this.element.style.height = '100%'; // Full container height initially
    this.element.style.overflow = 'hidden';
    this.element.style.backgroundColor = '#0f172a'; // slate-950

    // Replace container content
    this.container.innerHTML = '';
    this.container.appendChild(this.element);

    // Store base dimensions after element is in DOM
    this.baseWidth = this.element.offsetWidth;
    this.baseHeight = this.element.offsetHeight;
    console.log('Initial base dimensions set:', this.baseWidth, 'x', this.baseHeight);

    // Test if canvas can be resized
    const testWidth = this.baseWidth + 50;
    this.element.style.width = `${testWidth}px`;
    const actualWidth = this.element.offsetWidth;
    console.log('Resize test: set to', testWidth, 'px, actual:', actualWidth, 'px');
    if (actualWidth !== testWidth) {
      console.warn('Canvas resize test failed - element may not be resizable');
    }
    // Reset to base size
    this.element.style.width = `${this.baseWidth}px`;

    // Create grid background
    this.createGridBackground();

    // Setup event listeners
    this.setupEventListeners();
  }

  createGridBackground() {
    this.gridElement = document.createElement('div');
    this.gridElement.className = 'canvas-grid';
    this.gridElement.style.position = 'absolute';
    this.gridElement.style.top = '0';
    this.gridElement.style.left = '0';
    this.gridElement.style.width = '100%';
    this.gridElement.style.height = '100%';
    this.gridElement.style.pointerEvents = 'none';
    this.gridElement.style.zIndex = '1';

    // Create SVG for dot grid pattern
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', '100%');

    // Create pattern
    const pattern = document.createElementNS('http://www.w3.org/2000/svg', 'pattern');
    pattern.setAttribute('id', 'dot-grid');
    pattern.setAttribute('x', '0');
    pattern.setAttribute('y', '0');
    pattern.setAttribute('width', GRID_SIZE);
    pattern.setAttribute('height', GRID_SIZE);
    pattern.setAttribute('patternUnits', 'userSpaceOnUse');

    // Create dot
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', GRID_DOT_SIZE);
    circle.setAttribute('cy', GRID_DOT_SIZE);
    circle.setAttribute('r', GRID_DOT_SIZE);
    circle.setAttribute('fill', '#374151'); // slate-700

    pattern.appendChild(circle);

    // Create rectangle with pattern
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('width', '100%');
    rect.setAttribute('height', '100%');
    rect.setAttribute('fill', 'url(#dot-grid)');

    svg.appendChild(pattern);
    svg.appendChild(rect);
    this.gridElement.appendChild(svg);

    this.element.appendChild(this.gridElement);
  }

  setupEventListeners() {
    // Handle canvas clicks (for selection/deselection)
    this.element.addEventListener('click', (e) => {
      if (e.target === this.element) {
        // Clicked on empty canvas - deselect all widgets
        this.deselectAllWidgets();
      }
    });

    // Handle global touch events (for zoom and selection/deselection)
    // Use document level to capture touches anywhere on canvas, including widgets
    document.addEventListener('touchstart', this.handleTouchStart.bind(this), { passive: false });
    document.addEventListener('touchmove', this.handleTouchMove.bind(this), { passive: false });
    document.addEventListener('touchend', this.handleTouchEnd.bind(this), { passive: false });

    // Handle widget removal events
    this.element.addEventListener('widgetRemove', this.handleWidgetRemove.bind(this));

    // Handle right-click on canvas
    this.element.addEventListener('contextmenu', (e) => {
      if (e.target === this.element) {
        e.preventDefault();
        // Could show canvas context menu here
      }
    });

    // Handle window resize
    window.addEventListener('resize', this.handleResize.bind(this));

    // Handle keyboard zoom (Cmd/Ctrl +/-)
    window.addEventListener('keydown', this.handleKeyDown.bind(this));
  }

  handleResize() {
    console.log('Window resized - updating canvas to fit widgets');

    // Update canvas to fit all widgets, accounting for new viewport size
    this.updateCanvasToFitWidgets();

    // Ensure widgets stay within bounds (though they can now be anywhere)
    this.widgets.forEach(widget => {
      this.constrainWidgetToBounds(widget);
    });
  }

  handleKeyDown(e) {
    // Handle Cmd/Ctrl +/- for zoom
    if ((e.ctrlKey || e.metaKey) && (e.key === '=' || e.key === '+')) {
      e.preventDefault();
      const newScale = Math.min(this.maxScale, this.scale * 1.2);
      this.setScale(newScale);
    }
    else if ((e.ctrlKey || e.metaKey) && e.key === '-') {
      e.preventDefault();
      const newScale = Math.max(this.minScale, this.scale / 1.2);
      this.setScale(newScale);
    }
    else if ((e.ctrlKey || e.metaKey) && e.key === '0') {
      e.preventDefault();
      this.setScale(1.0); // Reset to 100%
    }
  }

  handleTouchStart(e) {
    // Handle pinch-to-zoom gesture if we have 2+ touches
    if (e.touches.length >= 2) {
      e.preventDefault();
      this.isZooming = true;

      // Calculate initial distance between first two touches
      const touch1 = e.touches[0];
      const touch2 = e.touches[1];
      this.lastTouchDistance = this.getTouchDistance(touch1, touch2);
    }
  }

  handleTouchMove(e) {
    console.log('Canvas handleTouchMove:', e.touches.length, 'touches, isZooming:', this.isZooming);

    if (this.isZooming && e.touches.length >= 2) {
      console.log('Processing pinch move');

      e.preventDefault();

      // Calculate new distance between first two touches
      const touch1 = e.touches[0];
      const touch2 = e.touches[1];
      const currentDistance = this.getTouchDistance(touch1, touch2);

      console.log('Touch distance:', currentDistance, 'last:', this.lastTouchDistance);

      if (this.lastTouchDistance > 0) {
        // Calculate scale change
        const scaleChange = currentDistance / this.lastTouchDistance;
        let newScale = this.scale * scaleChange;

        console.log('Scale change:', scaleChange, 'new scale:', newScale);

        // Constrain scale within limits
        newScale = Math.max(this.minScale, Math.min(this.maxScale, newScale));

        // Apply zoom
        this.setScale(newScale);
      }

      this.lastTouchDistance = currentDistance;
    }
  }

  handleTouchEnd(e) {
    console.log('Canvas handleTouchEnd:', e.touches.length, 'remaining touches');

    // End pinch gesture if fewer than 2 touches remain
    if (e.touches.length < 2) {
      console.log('Ending pinch gesture');
      this.isZooming = false;
      this.lastTouchDistance = 0;
    }

    // Handle selection/deselection when not zooming
    if (!this.isZooming && e.changedTouches.length === 1 && e.touches.length === 0) {
      // SIMPLIFIED: Just deselect all widgets for now (we can refine this later)
      this.deselectAllWidgets();
    }
  }

  getTouchDistance(touch1, touch2) {
    const dx = touch1.clientX - touch2.clientX;
    const dy = touch1.clientY - touch2.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  setScale(newScale) {
    console.log('setScale called with:', newScale);
    this.scale = newScale;
    this.updateCanvasSize();

    // Add visual feedback
    console.log(`🔍 Zoom level: ${(this.scale * 100).toFixed(1)}%`);
    if (this.scale < 1) {
      const expansionFactor = (1 / this.scale).toFixed(1);
      console.log(`📏 Canvas expanded ${expansionFactor}x - scroll to see more space!`);
    } else if (this.scale > 1) {
      console.log(`🔍 Zoomed in - everything appears larger`);
    } else {
      console.log(`📐 100% zoom - normal view`);
    }
  }

  updateCanvasSize() {
    console.log('updateCanvasSize called with scale:', this.scale);
    console.log('Base dimensions:', this.baseWidth, 'x', this.baseHeight);

    // CANVA-STYLE ZOOM: Expand canvas proportionally to zoom level
    // Lower zoom = more expansion = see more area

    const expansionFactor = 1.0 / this.scale;
    const canvasWidth = Math.max(this.baseWidth, this.baseWidth * expansionFactor);
    const canvasHeight = Math.max(this.baseHeight, this.baseHeight * expansionFactor);

    console.log('Zoom scale:', this.scale);
    console.log('Expansion factor:', expansionFactor.toFixed(2));
    console.log('Canvas size:', canvasWidth, 'x', canvasHeight);

    this.element.style.width = `${canvasWidth}px`;
    this.element.style.height = `${canvasHeight}px`;
    this.element.style.transform = `scale(${this.scale})`;
    this.element.style.transformOrigin = 'top left';

    // Enable scrolling when needed
    const container = this.element.parentElement;
    if (container) {
      if (canvasWidth * this.scale > window.innerWidth || canvasHeight * this.scale > window.innerHeight) {
        container.style.overflow = 'auto';
        console.log('Scrolling enabled');
      } else {
        container.style.overflow = 'hidden';
      }
    }

    // Update grid to match new canvas size
    this.updateGridSize();
  }

  updateGridSize() {
    if (this.gridElement) {
      // Grid should cover the entire canvas area
      this.gridElement.style.width = '100%';
      this.gridElement.style.height = '100%';

      // Update SVG to match new canvas dimensions
      const svg = this.gridElement.querySelector('svg');
      if (svg) {
        const rect = svg.querySelector('rect');
        if (rect) {
          // Make sure the pattern covers the entire expanded area
          rect.setAttribute('width', '100%');
          rect.setAttribute('height', '100%');
          console.log('Updated grid SVG to cover expanded canvas');
        }
      }
    }
  }

  addWidget(widget) {
    if (this.widgets.has(widget.id)) {
      console.debug(`Widget ${widget.id} already exists on canvas`);
      return;
    }

    // Create widget element if it doesn't exist
    if (!widget.element) {
      widget.createElement();
    }

    // Add to canvas
    this.element.appendChild(widget.element);
    this.widgets.set(widget.id, widget);

    // Make widget draggable on canvas
    this.dragDropManager.makeWidgetDraggable(widget);

    // Add widget selection handlers
    this.setupWidgetSelection(widget);

    // Ensure widget stays within bounds
    this.constrainWidgetToBounds(widget);

    // Update canvas to fit all widgets
    this.updateCanvasToFitWidgets();
  }

  removeWidget(widgetId) {
    const widget = this.widgets.get(widgetId);
    if (widget) {
      widget.destroy();
      this.widgets.delete(widgetId);

      // Also remove from persistent storage to prevent widget from reappearing on reload
      import('../utils/storage.js').then(module => {
        module.storageManager.removeWidget(widgetId);
      });

      // Update canvas to fit remaining widgets
      this.updateCanvasToFitWidgets();
    }
  }

  handleWidgetRemove(e) {
    const { widgetId } = e.detail;
    this.removeWidget(widgetId);
  }

  getWidget(widgetId) {
    return this.widgets.get(widgetId);
  }

  getAllWidgets() {
    return Array.from(this.widgets.values());
  }

  deselectAllWidgets() {
    this.widgets.forEach(widget => {
      widget.element.classList.remove('selected');
    });
  }

  selectWidget(widgetId) {
    this.deselectAllWidgets();
    const widget = this.widgets.get(widgetId);
    if (widget) {
      widget.element.classList.add('selected');
    }
  }

  setupWidgetSelection(widget) {
    const element = widget.element;

    // Handle click events (mouse)
    element.addEventListener('click', (e) => {
      // Don't select if clicking on remove button
      if (e.target.closest('.widget-remove-btn')) return;
      // Don't select if we just finished dragging (prevents accidental selection after drag)
      if (this.dragDropManager.hasJustFinishedDrag()) return;
      this.selectWidget(widget.id);
    });

    // Handle touch events (touchscreen)
    element.addEventListener('touchend', (e) => {
      // Don't select if touching on remove button
      if (e.target.closest('.widget-remove-btn')) return;
      // Don't select if we just finished dragging (prevents accidental selection after drag)
      if (this.dragDropManager.hasJustFinishedDrag()) return;
      this.selectWidget(widget.id);
    });
  }

  constrainWidgetToBounds(widget) {
    // Only enforce minimum bounds (0,0) - allow widgets anywhere on the canvas
    widget.position.x = Math.max(0, widget.position.x);
    widget.position.y = Math.max(0, widget.position.y);

    // Update element position
    widget.element.style.left = `${widget.position.x * GRID_SIZE}px`;
    widget.element.style.top = `${widget.position.y * GRID_SIZE}px`;
  }

  calculateWidgetBounds() {
    if (this.widgets.size === 0) {
      // Return minimum bounds if no widgets
      return {
        width: this.container.offsetWidth,
        height: this.container.offsetHeight
      };
    }

    let maxX = 0;
    let maxY = 0;

    // Find the furthest edges of all widgets
    this.widgets.forEach(widget => {
      const widgetRight = widget.position.x + widget.size.width;
      const widgetBottom = widget.position.y + widget.size.height;

      maxX = Math.max(maxX, widgetRight);
      maxY = Math.max(maxY, widgetBottom);
    });

    // Convert to pixels and add padding (2 grid units = 40px)
    const padding = 2;
    const width = (maxX + padding) * GRID_SIZE;
    const height = (maxY + padding) * GRID_SIZE;

    console.log('Calculated widget bounds:', { maxX, maxY, width, height });

    return { width, height };
  }

  updateCanvasToFitWidgets() {
    console.log('updateCanvasToFitWidgets called');

    // Calculate the bounds needed for all widgets
    const widgetBounds = this.calculateWidgetBounds();

    // Get current viewport size
    const viewportWidth = this.container.offsetWidth;
    const viewportHeight = this.container.offsetHeight;

    // Set base dimensions to the larger of widget bounds or viewport size
    this.baseWidth = Math.max(widgetBounds.width, viewportWidth);
    this.baseHeight = Math.max(widgetBounds.height, viewportHeight);

    console.log('Updated base dimensions:', {
      widgetBounds,
      viewport: { width: viewportWidth, height: viewportHeight },
      newBase: { width: this.baseWidth, height: this.baseHeight }
    });

    // Update canvas size with zoom scaling
    this.updateCanvasSize();
  }

  getGridPosition(clientX, clientY) {
    // Convert viewport coordinates to canvas coordinates (accounting for zoom)
    const canvasRect = this.element.getBoundingClientRect();
    const canvasX = (clientX - canvasRect.left) / this.scale;
    const canvasY = (clientY - canvasRect.top) / this.scale;

    const x = Math.round(canvasX / GRID_SIZE);
    const y = Math.round(canvasY / GRID_SIZE);
    return { x, y };
  }

  snapToGrid(x, y) {
    return {
      x: Math.round(x / GRID_SIZE) * GRID_SIZE,
      y: Math.round(y / GRID_SIZE) * GRID_SIZE
    };
  }

  clear() {
    // Destroy all widgets (UI cleanup only)
    this.widgets.forEach(widget => widget.destroy());
    this.widgets.clear();
  }

  exportLayout() {
    const layout = {};
    this.widgets.forEach(widget => {
      layout[widget.id] = {
        position: { ...widget.position },
        size: { ...widget.size }
      };
    });
    return layout;
  }
}

