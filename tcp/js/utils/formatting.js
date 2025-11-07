// Formatting utilities for displaying metrics and values

export function formatTimestamp(timestamp) {
  if (!timestamp) return 'N/A';
  try {
    const date = new Date(timestamp * 1000);
    return date.toLocaleTimeString();
  } catch (error) {
    return timestamp.toString();
  }
}

export function formatTime(value) {
  if (value === null || value === undefined || value === 0) return '0 s';

  const absValue = Math.abs(value);

  // Use threshold-based unit selection for simplicity and predictability
  let unit, scaled, decimals;

  if (absValue >= 3600) {
    // >= 1 hour: use hours
    unit = 'h';
    scaled = absValue / 3600;
    decimals = scaled >= 10 ? 0 : scaled >= 1 ? 1 : 2;
  } else if (absValue >= 60) {
    // >= 1 minute but < 1 hour: use minutes
    unit = 'm';
    scaled = absValue / 60;
    decimals = scaled >= 10 ? 0 : scaled >= 1 ? 1 : 2;
  } else if (absValue >= 1) {
    // >= 1 second but < 1 minute: use seconds
    unit = 's';
    scaled = absValue / 1;
    decimals = scaled >= 10 ? 0 : scaled >= 1 ? 1 : 2;
  } else if (absValue >= 1e-3) {
    // >= 1 millisecond but < 1 second: use milliseconds
    unit = 'ms';
    scaled = absValue / 1e-3;
    decimals = 3; // Preserve precision for milliseconds
  } else if (absValue >= 1e-6) {
    // >= 1 microsecond but < 1 millisecond: use microseconds
    unit = 'μs';
    scaled = absValue / 1e-6;
    decimals = 3; // Preserve precision for microseconds
  } else {
    // < 1 microsecond: use nanoseconds
    unit = 'ns';
    scaled = absValue / 1e-9;
    decimals = 0; // Whole numbers for nanoseconds
  }

  // Format with appropriate precision
  let formatted = scaled.toFixed(decimals);

  // Remove trailing zeros after decimal
  formatted = formatted.replace(/\.?0+$/, '');

  // Ensure we don't end up with just a decimal point
  if (formatted === '.') {
    formatted = '0';
  }

  return (value < 0 ? '-' : '') + formatted + ' ' + unit;
}

export function formatMemory(value) {
  if (value === null || value === undefined || value === 0) return '0 B';

  const absValue = Math.abs(value);
  const units = [
    { name: 'B', factor: 1 },
    { name: 'KB', factor: 1024 },
    { name: 'MB', factor: 1024 * 1024 },
    { name: 'GB', factor: 1024 * 1024 * 1024 },
    { name: 'TB', factor: 1024 * 1024 * 1024 * 1024 }
  ];

  // Find the largest unit that keeps the value >= 1
  for (let i = units.length - 1; i >= 0; i--) {
    const unit = units[i];
    if (absValue >= unit.factor) {
      const scaled = absValue / unit.factor;

      // Format with appropriate precision for 3 significant digits
      let formatted;
      if (scaled >= 100) {
        formatted = scaled.toFixed(0);
      } else if (scaled >= 10) {
        formatted = scaled.toFixed(1);
      } else {
        formatted = scaled.toFixed(2);
      }

      // Remove trailing zeros after decimal
      formatted = formatted.replace(/\.?0+$/, '');

      return (value < 0 ? '-' : '') + formatted + ' ' + unit.name;
    }
  }

  // Fallback to bytes for very small values
  return (value < 0 ? '-' : '') + absValue.toFixed(0) + ' B';
}

export function getMetricType(metric, metricName) {
  // First check for metadata fields in the metric object
  if (metric) {
    // Check common unit/metadata field names
    const unitFields = ['unit', 'metric_unit', 'type_hint', 'units'];
    for (const field of unitFields) {
      if (metric[field]) {
        const unit = metric[field].toLowerCase();

        // Time units
        if (unit.includes('second') || unit.includes('sec') || unit === 's' ||
            unit.includes('minute') || unit === 'm' ||
            unit.includes('hour') || unit === 'h' ||
            unit.includes('millisecond') || unit === 'ms' ||
            unit.includes('microsecond') || unit === 'μs' || unit === 'us' ||
            unit.includes('nanosecond') || unit === 'ns' ||
            unit.includes('time') || unit.includes('duration') ||
            unit.includes('latency') || unit.includes('delay')) {
          return 'time';
        }

        // Memory units
        if (unit.includes('byte') || unit === 'b' ||
            unit.includes('kilobyte') || unit === 'kb' ||
            unit.includes('megabyte') || unit === 'mb' ||
            unit.includes('gigabyte') || unit === 'gb' ||
            unit.includes('terabyte') || unit === 'tb' ||
            unit.includes('memory') || unit.includes('mem') ||
            unit.includes('size') || unit.includes('allocated') ||
            unit.includes('used') || unit.includes('buffer') ||
            unit.includes('cache')) {
          return 'memory';
        }
      }
    }
  }

  // Fall back to name pattern matching
  if (metricName) {
    const name = metricName.toLowerCase();

    // Time patterns
    const timePatterns = ['time', 'duration', 'latency', 'elapsed', 'wait', 'delay', 'period', 'interval'];
    if (timePatterns.some(pattern => name.includes(pattern))) {
      return 'time';
    }

    // Memory patterns
    const memoryPatterns = ['memory', 'mem', 'bytes', 'size', 'allocated', 'used', 'buffer', 'cache'];
    if (memoryPatterns.some(pattern => name.includes(pattern))) {
      return 'memory';
    }
  }

  return 'number';
}

export function formatValue(value, metricName, metric) {
  if (value === null || value === undefined) return 'N/A';

  // Handle arrays
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    // For arrays, show first few values or summary
    if (value.length <= 5) {
      return value.map(v => typeof v === 'number' ? v.toFixed(2) : String(v)).join(', ');
    }
    return `[${value.length} items]`;
  }

  // Handle objects
  if (typeof value === 'object' && value !== null) {
    return JSON.stringify(value).substring(0, 50) + (JSON.stringify(value).length > 50 ? '...' : '');
  }

  if (typeof value === 'number') {
    // Determine metric type and apply appropriate formatting
    const metricType = getMetricType(metric, metricName);

    if (metricType === 'time') {
      return formatTime(value);
    } else if (metricType === 'memory') {
      return formatMemory(value);
    } else {
      // Default number formatting
      if (value % 1 === 0) return value.toString();
      return value.toFixed(6).replace(/\.?0+$/, '');
    }
  }

  return value.toString();
}

