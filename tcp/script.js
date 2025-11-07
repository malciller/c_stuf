    const streams = ['telemetry', 'balance', 'log', 'system'];
    // Dynamically detect hostname from current page URL t
    const hostname = window.location.hostname || 'dev-node-1';
    const port = 9000;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const connections = {};

    // Data storage for structured streams - ALL METRICS ARE CACHED CLIENT-SIDE
    // Metrics persist between updates and show last known values until new data arrives
    // Only logs are not cached (they're append-only streaming data)
    const telemetryData = {}; // key -> {name, labels, value, cached_rate, last_updated}
    const balanceData = {};   // asset -> {asset, total_balance, wallets, last_updated}
    const openOrdersData = []; // Array of all open orders with all fields (refreshed, not cached)
    const systemData = {};    // metric_name -> {name, value, last_updated}

    function parseTelemetryMessage(msg) {
      try {
        const data = JSON.parse(msg);

        // Telemetry messages can be either an array directly or an object with a "metrics" field
        let metrics = null;
        if (Array.isArray(data)) {
          metrics = data;
        } else if (data && typeof data === 'object' && Array.isArray(data.metrics)) {
          metrics = data.metrics;
        } else {
          console.warn('Telemetry message format not recognized:', typeof data, data);
          return;
        }

        if (!metrics || metrics.length === 0) {
          // Empty metrics array - metrics are cached client-side, so keep existing data
          return;
        }

        // Cache metrics: only add/update metrics, never remove existing ones
        // This ensures metrics persist and show last known values between updates
        metrics.forEach(item => {
          if (!item || typeof item !== 'object') return;

          const { name, labels = {}, last_updated, cached_rate = 0, metric_type } = item;
          if (!name || !metric_type) return;

          const { type, value } = metric_type;
          // Accept gauge, counter, and histogram types
          if (type !== 'gauge' && type !== 'counter' && type !== 'histogram') {
            // Skip histogram types that don't have a simple value
            if (type === 'histogram' && metric_type.data === 'histogram_data_not_serialized') {
              return;
            }
            return;
          }

          // Create composite key from name and labels
          const labelsStr = JSON.stringify(labels);
          const key = `${name}|${labelsStr}`;

          telemetryData[key] = {
            name,
            labels,
            value: value !== undefined ? value : null,
            cached_rate,
            last_updated,
            key
          };
        });
      } catch (error) {
        console.error('Error parsing telemetry message:', error);
        console.error('Message length:', msg ? msg.length : 0);
        if (msg && msg.length > 0) {
          console.error('Message preview (first 200 chars):', msg.substring(0, 200));
          if (msg.length > 4090) {
            console.warn('Message appears to be truncated at ~4096 bytes. Check server buffer size.');
          }
        }
      }
    }

    function parseBalanceMessage(msg) {
      try {
        const data = JSON.parse(msg);
        if (!data || typeof data !== 'object') return;

        const { balances = [], open_orders = [], timestamp } = data;
        const last_updated = timestamp;

        // Store all open orders with all their fields
        // Open orders are refreshed each update (not cached) since they change frequently
        openOrdersData.length = 0; // Clear existing orders
        open_orders.forEach(order => {
          if (order) {
            openOrdersData.push({ ...order });
          }
        });

        // Cache balances: only add/update balances, never remove existing ones
        // This ensures balances persist and show last known values between updates
        balances.forEach(balance => {
          if (!balance || !balance.asset) return;

          // Store all fields from the balance object
          balanceData[balance.asset] = {
            ...balance,  // Copy all properties from the balance object (including wallets array)
            last_updated  // Add timestamp
          };
        });
      } catch (error) {
        console.error('Error parsing balance message:', error);
        console.error('Message length:', msg ? msg.length : 0);
        if (msg && msg.length > 0) {
          console.error('Message preview (first 200 chars):', msg.substring(0, 200));
          if (msg.length > 4090) {
            console.warn('Message appears to be truncated at ~4096 bytes. Check server buffer size.');
          }
        }
      }
    }

    function parseSystemMessage(msg) {
      try {
        const data = JSON.parse(msg);
        if (!data || typeof data !== 'object') return;

        const { timestamp } = data;
        const last_updated = timestamp;

        // Cache system metrics: only add/update metrics, never remove existing ones
        // This ensures system metrics persist and show last known values between updates
        Object.entries(data).forEach(([key, value]) => {
          // Skip non-metric fields
          if (key === 'type' || key === 'timestamp') return;

          // Skip complex objects like arrays
          if (Array.isArray(value) || (typeof value === 'object' && value !== null)) return;

          systemData[key] = {
            name: key,
            value,
            last_updated
          };
        });
      } catch (error) {
        console.error('Error parsing system message:', error);
        console.error('Message length:', msg ? msg.length : 0);
        if (msg && msg.length > 0) {
          console.error('Message preview (first 200 chars):', msg.substring(0, 200));
          if (msg.length > 4090) {
            console.warn('Message appears to be truncated at ~4096 bytes. Check server buffer size.');
          }
        }
      }
    }

    function formatTimestamp(timestamp) {
      if (!timestamp) return 'N/A';
      try {
        const date = new Date(timestamp * 1000);
        return date.toLocaleTimeString();
      } catch (error) {
        return timestamp.toString();
      }
    }

    function formatTime(value) {
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

    function formatMemory(value) {
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

    function getMetricType(metric, metricName) {
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

    function formatValue(value, metricName, metric) {
      if (value === null || value === undefined) return 'N/A';

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

    function updateTelemetryTable(changedKeys = new Set()) {
      const container = document.getElementById('table-telemetry');
      if (!container) return;

      const metrics = Object.values(telemetryData);
      if (metrics.length === 0) {
        container.innerHTML = '<div style="padding: 20px; text-align: center; color: #666;">Waiting for telemetry data...</div>';
        return;
      }

      // Sort metrics alphabetically by name, then by labels
      metrics.sort((a, b) => {
        // Primary sort: name ascending
        if (a.name !== b.name) return a.name.localeCompare(b.name);

        // Secondary sort: labels ascending
        return JSON.stringify(a.labels).localeCompare(JSON.stringify(b.labels));
      });

      const tableHtml = `
        <table class="data-table">
          <thead>
            <tr>
              <th>Metric Name</th>
              <th>Labels</th>
              <th>Value</th>
              <th>Cached Rate</th>
              <th>Last Updated</th>
            </tr>
          </thead>
          <tbody>
            ${metrics.map(metric => {
              const isChanged = changedKeys.has(metric.key);
              const labelsStr = Object.keys(metric.labels).length > 0 ?
                Object.entries(metric.labels).map(([k, v]) => `${k}: ${v}`).join(', ') :
                'None';

              return `
                <tr class="${isChanged ? 'row-highlight' : ''}" data-key="${metric.key}">
                  <td>${metric.name}</td>
                  <td style="font-size: 0.8em;">${labelsStr}</td>
                  <td>${formatValue(metric.value, metric.name, metric)}</td>
                  <td>${getMetricType(metric, metric.name) === 'time' ? formatTime(metric.cached_rate) : formatValue(metric.cached_rate, metric.name + '_rate', metric)}</td>
                  <td style="font-size: 0.8em;">${formatTimestamp(metric.last_updated)}</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      `;

      container.innerHTML = tableHtml;
    }

    function updateBalanceTable(changedAssets = new Set()) {
      const container = document.getElementById('table-balance');
      if (!container) return;

      const balances = Object.values(balanceData);
      if (balances.length === 0 && openOrdersData.length === 0) {
        container.innerHTML = '<div style="padding: 20px; text-align: center; color: #666;">Waiting for balance data...</div>';
        return;
      }

      // Format field names for display
      const formatFieldName = (field) => {
        return field.split('_').map(word =>
          word.charAt(0).toUpperCase() + word.slice(1)
        ).join(' ');
      };

      let html = '';

      // Build balances table with expanded wallets
      if (balances.length > 0) {
        // Collect all unique field names across all balance entries (excluding wallets)
        const allFields = new Set();
        balances.forEach(balance => {
          Object.keys(balance).forEach(field => {
            if (field !== 'wallets' && field !== 'last_updated') {
              allFields.add(field);
            }
          });
        });

        // Collect all wallet field names
        const walletFields = new Set();
        balances.forEach(balance => {
          if (Array.isArray(balance.wallets)) {
            balance.wallets.forEach(wallet => {
              Object.keys(wallet).forEach(field => {
                walletFields.add(field);
              });
            });
          }
        });

        // Convert to arrays and sort
        const balanceFieldNames = Array.from(allFields).sort();
        const walletFieldNames = Array.from(walletFields).sort();
        
        // Put asset first
        const assetIndex = balanceFieldNames.indexOf('asset');
        if (assetIndex > 0) {
          balanceFieldNames.splice(assetIndex, 1);
          balanceFieldNames.unshift('asset');
        }

        // Sort balances alphabetically by asset name
        balances.sort((a, b) => {
          return a.asset.localeCompare(b.asset);
        });

        html += '<h3 style="margin-top: 0;">Balances</h3>';
        html += '<table class="data-table">';
        html += '<thead><tr>';
        // Balance fields
        balanceFieldNames.forEach(field => {
          html += `<th>${formatFieldName(field)}</th>`;
        });
        // Wallet fields as columns
        walletFieldNames.forEach(field => {
          html += `<th>Wallet ${formatFieldName(field)}</th>`;
        });
        html += '<th>Last Updated</th>';
        html += '</tr></thead><tbody>';

        // Create rows - one row per wallet, or one row if no wallets
        balances.forEach(balance => {
          const isChanged = changedAssets.has(balance.asset);
          const wallets = Array.isArray(balance.wallets) ? balance.wallets : [];

          if (wallets.length === 0) {
            // No wallets - single row
            html += `<tr class="${isChanged ? 'row-highlight' : ''}" data-asset="${balance.asset}">`;
            balanceFieldNames.forEach(field => {
              let value = balance[field];
              let style = '';
              if (field === 'asset') {
                value = `<strong>${value}</strong>`;
              } else {
                value = formatValue(value);
              }
              html += `<td${style}>${value}</td>`;
            });
            // Empty wallet columns
            walletFieldNames.forEach(() => {
              html += '<td>N/A</td>';
            });
            html += `<td style="font-size: 0.8em;">${formatTimestamp(balance.last_updated)}</td>`;
            html += '</tr>';
          } else {
            // One row per wallet
            wallets.forEach((wallet, walletIndex) => {
              html += `<tr class="${isChanged ? 'row-highlight' : ''}" data-asset="${balance.asset}">`;
              // Balance fields (repeat for each wallet row)
              balanceFieldNames.forEach(field => {
                let value = balance[field];
                let style = '';
                if (field === 'asset') {
                  value = walletIndex === 0 ? `<strong>${value}</strong>` : '';
                } else if (field === 'total_balance') {
                  value = walletIndex === 0 ? formatValue(value) : '';
                } else {
                  value = walletIndex === 0 ? formatValue(value) : '';
                }
                html += `<td${style}>${value}</td>`;
              });
              // Wallet fields
              walletFieldNames.forEach(field => {
                let value = wallet[field];
                let style = '';
                if (field === 'last_updated') {
                  value = formatTimestamp(value);
                  style = ' style="font-size: 0.8em;"';
                } else {
                  value = formatValue(value);
                }
                html += `<td${style}>${value}</td>`;
              });
              html += `<td style="font-size: 0.8em;">${walletIndex === 0 ? formatTimestamp(balance.last_updated) : ''}</td>`;
              html += '</tr>';
            });
          }
        });

        html += '</tbody></table>';
      }

      // Build open orders table
      if (openOrdersData.length > 0) {
        // Collect all unique field names across all open orders
        const orderFields = new Set();
        openOrdersData.forEach(order => {
          Object.keys(order).forEach(field => {
            orderFields.add(field);
          });
        });

        const orderFieldNames = Array.from(orderFields).sort();
        // Put order_id first, then symbol
        const orderIdIndex = orderFieldNames.indexOf('order_id');
        if (orderIdIndex > 0) {
          orderFieldNames.splice(orderIdIndex, 1);
          orderFieldNames.unshift('order_id');
        }
        const symbolIndex = orderFieldNames.indexOf('symbol');
        if (symbolIndex > 1) {
          orderFieldNames.splice(symbolIndex, 1);
          orderFieldNames.splice(1, 0, 'symbol');
        }

        html += '<h3 style="margin-top: 20px;">Open Orders</h3>';
        html += '<table class="data-table">';
        html += '<thead><tr>';
        orderFieldNames.forEach(field => {
          html += `<th>${formatFieldName(field)}</th>`;
        });
        html += '</tr></thead><tbody>';

        openOrdersData.forEach(order => {
          html += '<tr>';
          orderFieldNames.forEach(field => {
            let value = order[field];
            let style = '';
            if (field === 'order_id' || field === 'symbol') {
              value = `<strong>${formatValue(value)}</strong>`;
            } else if (field === 'last_updated') {
              value = formatTimestamp(value);
              style = ' style="font-size: 0.8em;"';
            } else {
              value = formatValue(value);
            }
            html += `<td${style}>${value}</td>`;
          });
          html += '</tr>';
        });

        html += '</tbody></table>';
      }

      container.innerHTML = html;
    }

    function updateSystemTable(changedMetrics = new Set()) {
      const container = document.getElementById('table-system');
      if (!container) return;

      const metrics = Object.values(systemData);
      if (metrics.length === 0) {
        container.innerHTML = '<div style="padding: 20px; text-align: center; color: #666;">Waiting for system data...</div>';
        return;
      }

      // Sort metrics alphabetically by name
      metrics.sort((a, b) => {
        return a.name.localeCompare(b.name);
      });

      const tableHtml = `
        <table class="data-table">
          <thead>
            <tr>
              <th>Metric Name</th>
              <th>Value</th>
              <th>Last Updated</th>
            </tr>
          </thead>
          <tbody>
            ${metrics.map(metric => {
              const isChanged = changedMetrics.has(metric.name);

              return `
                <tr class="${isChanged ? 'row-highlight' : ''}" data-metric="${metric.name}">
                  <td><strong>${metric.name.replace(/_/g, ' ')}</strong></td>
                  <td>${formatValue(metric.value, metric.name, metric)}</td>
                  <td style="font-size: 0.8em;">${formatTimestamp(metric.last_updated)}</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      `;

      container.innerHTML = tableHtml;
    }

    function highlightRow(rowElement) {
      if (!rowElement) return;

      // Add highlight class
      rowElement.classList.add('row-highlight');

      // Remove highlight class after animation completes (2 seconds)
      setTimeout(() => {
        if (rowElement) {
          rowElement.classList.remove('row-highlight');
        }
      }, 2000);
    }

    function createStreamSection(streamName) {
      try {
        const section = document.createElement('div');
        section.className = 'stream-section';
        section.id = `stream-${streamName}`;

        // Sanitize stream name for HTML
        const displayName = String(streamName).charAt(0).toUpperCase() + String(streamName).slice(1);
        const sanitizedName = displayName.replace(/[<>]/g, '');

        // Create different content based on stream type
        let contentHtml = '';
        if (streamName === 'log') {
          // Keep messages div for logs (streaming text)
          contentHtml = `<div class="messages" id="messages-${streamName}"></div>`;
        } else {
          // Create table container for structured data streams
          contentHtml = `<div class="data-table-container" id="table-${streamName}"></div>`;
        }

        section.innerHTML = `
          <div class="stream-header">
            <div class="stream-name">${sanitizedName}</div>
            <div class="status-indicator status-disconnected" id="status-${streamName}">Disconnected</div>
          </div>
          ${contentHtml}
        `;

        return section;
      } catch (error) {
        console.error(`Error creating stream section for ${streamName}:`, error);
        // Return a minimal error section
        const errorSection = document.createElement('div');
        errorSection.className = 'stream-section';
        errorSection.innerHTML = `
          <div class="stream-header">
            <div class="stream-name">Error</div>
            <div class="status-indicator status-error">Error</div>
          </div>
          <div class="messages">Failed to create stream section</div>
        `;
        return errorSection;
      }
    }

    function updateStatus(streamName, status, message = '') {
      try {
        const statusEl = document.getElementById(`status-${streamName}`);
        if (!statusEl) {
          console.error(`updateStatus: Could not find status element for stream ${streamName}`);
          return;
        }
        statusEl.className = `status-indicator status-${status}`;
        statusEl.textContent = message || status.charAt(0).toUpperCase() + status.slice(1);
      } catch (error) {
        console.error(`updateStatus: Error updating status for stream ${streamName}:`, error);
      }
    }

    function addMessage(streamName, message) {
      try {
        const messagesEl = document.getElementById(`messages-${streamName}`);
        if (!messagesEl) {
          console.error(`addMessage: Could not find messages element for stream ${streamName}`);
          return;
        }

        const messageEl = document.createElement('div');
        messageEl.className = `message message-${streamName}`;

        const timestamp = new Date().toLocaleTimeString();
        // Sanitize message to prevent HTML injection
        const sanitizedMessage = String(message).replace(/[<>]/g, '');
        messageEl.innerHTML = `<span class="timestamp">[${timestamp}]</span> ${sanitizedMessage}`;

        messagesEl.appendChild(messageEl);
        messagesEl.scrollTop = messagesEl.scrollHeight;
      } catch (error) {
        console.error(`addMessage: Error adding message for stream ${streamName}:`, error);
      }
    }

    function connectStream(streamName) {
      try {
        updateStatus(streamName, 'connecting', 'Connecting...');

        const ws = new WebSocket(`${protocol}//${hostname}:${port}/${streamName}`);

        ws.onopen = () => {
          try {
            console.log(`${streamName}: Connected`);
            updateStatus(streamName, 'connected', 'Connected');

            if (streamName === 'log') {
              // Logs stream: use addMessage
              addMessage(streamName, 'Connection established');

              // For logs stream, show a helpful message after a delay
              setTimeout(() => {
                try {
                  const messagesEl = document.getElementById(`messages-${streamName}`);
                  if (messagesEl && messagesEl.children.length === 1) { // Only "Connection established" message
                    addMessage(streamName, 'Waiting for periodic log updates...');
                  }
                } catch (error) {
                  console.error(`${streamName}: Error checking for empty stream:`, error);
                }
              }, 2000); // Wait 2 seconds to see if data arrives
            } else {
              // Structured streams: initialize table with connection message
              const container = document.getElementById(`table-${streamName}`);
              if (container) {
                container.innerHTML = '<div style="padding: 20px; text-align: center; color: #666;">Connected, waiting for data...</div>';
              }
            }
          } catch (error) {
            console.error(`${streamName}: Error in onopen handler:`, error);
          }
        };

        ws.onmessage = (event) => {
          try {
            const msg = event.data;
            console.log(`${streamName}:`, msg);

            // Validate message data
            if (!msg || msg.trim() === '') {
              console.warn(`${streamName}: Received empty message, ignoring`);
              return;
            }

            // Handle different stream types
            if (streamName === 'log') {
              // Logs stream: keep existing behavior
              addMessage(streamName, msg);
            } else {
              // Structured data streams: parse JSON and update tables
              const changedKeys = new Set();

              if (streamName === 'telemetry') {
                const oldKeys = new Set(Object.keys(telemetryData));
                parseTelemetryMessage(msg);
                const newKeys = new Set(Object.keys(telemetryData));

                // Find changed/added keys
                for (const key of newKeys) {
                  if (!oldKeys.has(key)) {
                    changedKeys.add(key); // New metric
                  } else {
                    // Check if value changed
                    const oldMetric = telemetryData[key];
                    const newMetric = telemetryData[key];
                    if (oldMetric.value !== newMetric.value ||
                        oldMetric.cached_rate !== newMetric.cached_rate ||
                        oldMetric.last_updated !== newMetric.last_updated) {
                      changedKeys.add(key);
                    }
                  }
                }
                updateTelemetryTable(changedKeys);
              } else if (streamName === 'balance') {
                // Store old balance data for comparison
                const oldBalanceData = {};
                Object.keys(balanceData).forEach(asset => {
                  oldBalanceData[asset] = JSON.parse(JSON.stringify(balanceData[asset]));
                });
                const oldAssets = new Set(Object.keys(balanceData));
                
                parseBalanceMessage(msg);
                const newAssets = new Set(Object.keys(balanceData));

                // Find changed/added assets
                for (const asset of newAssets) {
                  if (!oldAssets.has(asset)) {
                    changedKeys.add(asset); // New asset
                  } else {
                    // Check if any values changed by comparing JSON strings
                    const oldBalance = oldBalanceData[asset];
                    const newBalance = balanceData[asset];
                    
                    // Deep comparison of all fields including nested arrays
                    const oldJson = JSON.stringify(oldBalance);
                    const newJson = JSON.stringify(newBalance);
                    
                    if (oldJson !== newJson) {
                      changedKeys.add(asset);
                    }
                  }
                }
                updateBalanceTable(changedKeys);
              } else if (streamName === 'system') {
                const oldMetrics = new Set(Object.keys(systemData));
                parseSystemMessage(msg);
                const newMetrics = new Set(Object.keys(systemData));

                // Find changed/added metrics
                for (const metric of newMetrics) {
                  if (!oldMetrics.has(metric)) {
                    changedKeys.add(metric); // New metric
                  } else {
                    // Check if values changed
                    const oldSys = systemData[metric];
                    const newSys = systemData[metric];
                    if (oldSys.value !== newSys.value ||
                        oldSys.last_updated !== newSys.last_updated) {
                      changedKeys.add(metric);
                    }
                  }
                }
                updateSystemTable(changedKeys);
              }
            }
          } catch (error) {
            console.error(`${streamName}: Error processing WebSocket message:`, error);
            if (streamName === 'log') {
              addMessage(streamName, `Error processing message: ${error.message}`);
            } else {
              console.error(`${streamName}: Failed to parse structured data: ${error.message}`);
            }
          }
        };

        ws.onerror = (err) => {
          try {
            console.error(`${streamName}: WebSocket error`, err);
            updateStatus(streamName, 'error', 'Error');
            if (streamName === 'log') {
              addMessage(streamName, 'WebSocket error occurred');
            } else {
              const container = document.getElementById(`table-${streamName}`);
              if (container) {
                container.innerHTML = '<div style="padding: 20px; text-align: center; color: #d32f2f;">WebSocket error occurred</div>';
              }
            }
          } catch (error) {
            console.error(`${streamName}: Error in onerror handler:`, error);
          }
        };

        ws.onclose = (event) => {
          try {
            console.log(`${streamName}: WebSocket closed`, event.code, event.reason);
            updateStatus(streamName, 'disconnected', 'Disconnected');

            // Provide more informative messages based on the stream and close reason
            let closeMessage = `Connection closed (${event.code})`;
            if (streamName === 'log' && event.code === 1000) {
              closeMessage = 'Periodic log update completed - will reconnect for next update';
            } else if (event.code === 1006) {
              closeMessage = 'Connection lost - attempting to reconnect';
            } else if (event.code === 1000) {
              closeMessage = 'Connection closed normally - will reconnect';
            }

            if (streamName === 'log') {
              addMessage(streamName, closeMessage);
            } else {
              const container = document.getElementById(`table-${streamName}`);
              if (container) {
                container.innerHTML = `<div style="padding: 20px; text-align: center; color: #666;">${closeMessage}</div>`;
              }
            }

            // Auto-reconnect after 5 seconds
            setTimeout(() => connectStream(streamName), 5000);
          } catch (error) {
            console.error(`${streamName}: Error in onclose handler:`, error);
          }
        };

        connections[streamName] = ws;
      } catch (error) {
        console.error(`${streamName}: Error creating WebSocket connection:`, error);
        updateStatus(streamName, 'error', 'Failed to connect');
        if (streamName === 'log') {
          addMessage(streamName, `Failed to create connection: ${error.message}`);
        } else {
          const container = document.getElementById(`table-${streamName}`);
          if (container) {
            container.innerHTML = `<div style="padding: 20px; text-align: center; color: #d32f2f;">Failed to create connection: ${error.message}</div>`;
          }
        }
        // Retry connection after error
        setTimeout(() => connectStream(streamName), 5000);
      }
    }

    window.onload = () => {
      try {
        const container = document.getElementById('streams-container');

        if (!container) {
          console.error('Could not find streams container element');
          return;
        }

        if ('WebSocket' in window) {
          streams.forEach(streamName => {
            try {
              const section = createStreamSection(streamName);
              container.appendChild(section);
              connectStream(streamName);
            } catch (error) {
              console.error(`Error initializing stream ${streamName}:`, error);
              // Continue with other streams even if one fails
            }
          });
        } else {
          container.innerHTML = '<div class="stream-section"><div class="stream-name">Error</div><div class="messages">WebSockets not supported in this browser</div></div>';
        }
      } catch (error) {
        console.error('Error during page initialization:', error);
      }
    };
