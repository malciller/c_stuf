// Drag and drop utility functions for widget management on canvas

const GRID_SIZE = 20;

export class DragDropManager {
  constructor(canvas) {
    this.canvas = canvas;
    this.draggedWidget = null;
    this.dragOffset = { x: 0, y: 0 };
    this.isDragging = false;
    this.justFinishedDrag = false;
  }

  // Check if a drag operation just finished (prevents accidental selection)
  hasJustFinishedDrag() {
    return this.justFinishedDrag;
  }

  // Helper method to extract coordinates from mouse or touch events
  getEventCoordinates(e) {
    if (e.touches && e.touches.length > 0) {
      // Touch event
      return {
        clientX: e.touches[0].clientX,
        clientY: e.touches[0].clientY
      };
    } else {
      // Mouse event
      return {
        clientX: e.clientX,
        clientY: e.clientY
      };
    }
  }

  // Convert viewport coordinates to canvas coordinates (accounting for zoom scale)
  getCanvasCoordinates(e) {
    const viewportCoords = this.getEventCoordinates(e);
    const canvasRect = this.canvas.element.getBoundingClientRect();

    // Convert from viewport coordinates to canvas coordinates
    // Account for canvas scale transform
    const canvasX = (viewportCoords.clientX - canvasRect.left) / this.canvas.scale;
    const canvasY = (viewportCoords.clientY - canvasRect.top) / this.canvas.scale;

    return {
      canvasX: canvasX,
      canvasY: canvasY,
      viewportX: viewportCoords.clientX,
      viewportY: viewportCoords.clientY
    };
  }

  // Make widget draggable on canvas
  makeWidgetDraggable(widget) {
    const element = widget.element;

    element.style.cursor = 'grab';

    element.addEventListener('mousedown', (e) => {
      if (e.target.classList.contains('widget-remove-btn')) return;
      this.startDrag(e, widget);
    });

    element.addEventListener('touchstart', (e) => {
      if (e.target.classList.contains('widget-remove-btn')) return;

      // Don't start drag if canvas is currently in pinch-to-zoom gesture
      if (this.canvas.isZooming) return;

      // Don't start drag if this might be part of a multi-touch gesture (pinch)
      // Let the canvas touch handler decide if this is a zoom or drag gesture
      if (e.touches.length > 1) return;

      this.startDrag(e, widget);
    }, { passive: false });

    // Prevent context menu during drag
    element.addEventListener('contextmenu', (e) => {
      if (this.isDragging) {
        e.preventDefault();
      }
    });

    // Prevent text selection during drag
    element.addEventListener('selectstart', (e) => {
      if (this.isDragging) e.preventDefault();
    });
  }

  // Start dragging a widget
  startDrag(e, widget) {
    this.draggedWidget = widget;
    this.isDragging = true;

    // Calculate offset from pointer to widget top-left (in canvas coordinates)
    const coords = this.getCanvasCoordinates(e);
    const widgetRect = widget.element.getBoundingClientRect();

    // Convert widget position to canvas coordinates
    const widgetLeft = parseFloat(widget.element.style.left) || 0;
    const widgetTop = parseFloat(widget.element.style.top) || 0;

    // Calculate offset in canvas coordinate space
    this.dragOffset.x = coords.canvasX - widgetLeft;
    this.dragOffset.y = coords.canvasY - widgetTop;

    // Add dragging styles
    widget.element.classList.add('dragging');
    widget.element.style.zIndex = '1000';
    widget.element.style.cursor = 'grabbing';

    // Add global event listeners
    document.addEventListener('mousemove', this.handleDrag.bind(this));
    document.addEventListener('mouseup', this.endDrag.bind(this));
    document.addEventListener('touchmove', this.handleDrag.bind(this), { passive: false });
    document.addEventListener('touchend', this.endDrag.bind(this), { passive: false });

    e.preventDefault();
  }

  // Handle drag movement
  handleDrag(e) {
    if (!this.isDragging || !this.draggedWidget) return;

    // Prevent default touch behaviors (scrolling, etc.) during drag
    e.preventDefault();

    // Get canvas coordinates (accounting for zoom scale)
    const coords = this.getCanvasCoordinates(e);

    // Calculate new position in canvas pixels
    let newX = coords.canvasX - this.dragOffset.x;
    let newY = coords.canvasY - this.dragOffset.y;

    // Snap to grid
    newX = Math.round(newX / GRID_SIZE) * GRID_SIZE;
    newY = Math.round(newY / GRID_SIZE) * GRID_SIZE;

    // Only enforce minimum bounds (0,0) - allow widgets anywhere on canvas
    newX = Math.max(0, newX);
    newY = Math.max(0, newY);

    // Update widget position
    this.draggedWidget.element.style.left = `${newX}px`;
    this.draggedWidget.element.style.top = `${newY}px`;

    // Update widget position in grid units
    this.draggedWidget.position.x = Math.round(newX / GRID_SIZE);
    this.draggedWidget.position.y = Math.round(newY / GRID_SIZE);
  }

  // End dragging
  endDrag(e) {
    if (!this.isDragging || !this.draggedWidget) return;

    this.isDragging = false;

    // Remove dragging styles
    this.draggedWidget.element.classList.remove('dragging');
    this.draggedWidget.element.style.zIndex = '';
    this.draggedWidget.element.style.cursor = 'grab';

    // Deselect the widget to prevent it from staying selected after drag
    this.draggedWidget.element.classList.remove('selected');

    // Save position
    this.draggedWidget.savePosition();

    // Update canvas to fit all widgets after position change
    this.canvas.updateCanvasToFitWidgets();

    // Remove event listeners
    document.removeEventListener('mousemove', this.handleDrag.bind(this));
    document.removeEventListener('mouseup', this.endDrag.bind(this));
    document.removeEventListener('touchmove', this.handleDrag.bind(this));
    document.removeEventListener('touchend', this.endDrag.bind(this));

    // Set flag to prevent accidental selection on next click
    this.justFinishedDrag = true;

    // Clear the flag after a short delay to allow normal selection on subsequent interactions
    setTimeout(() => {
      this.justFinishedDrag = false;
    }, 100);

    this.draggedWidget = null;
  }
}

// Export singleton instance
export const dragDropManager = new DragDropManager();

