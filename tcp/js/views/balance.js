// Balance view - handles parsing and rendering balance and order data

import { balanceData, openOrdersData, sectionState } from '../data/state.js';
import { formatValue, formatTimestamp } from '../utils/formatting.js';
import { restoreSubsectionState } from '../utils/ui.js';

export function parseBalanceMessage(msg) {
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
        // Debug: log order fields if quantity/price are missing (only log if truly missing)
        if (!order.order_qty && !order.qty && !order.quantity && !order.amount && !order.size && !order.vol && !order.volume && !order.orig_qty && !order.original_qty) {
          console.warn('Order missing quantity field. Available fields:', Object.keys(order));
          console.warn('Full order object:', JSON.stringify(order, null, 2));
        }
        if (!order.limit_price && !order.price && !order.limit) {
          console.warn('Order missing price field. Available fields:', Object.keys(order));
        }
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

export function updateBalanceTable(changedAssets = new Set()) {
  const container = document.getElementById('table-balance');
  if (!container) return;

  // Save current subsection states before updating
  ['balance-assets', 'balance-orders'].forEach(subsectionId => {
    const content = document.getElementById(`content-${subsectionId}`);
    if (content) {
      const isHidden = content.style.display === 'none';
      sectionState.subsections[subsectionId] = !isHidden;
    }
  });

  const balances = Object.values(balanceData);
  if (balances.length === 0 && openOrdersData.length === 0) {
    container.innerHTML = '<div class="py-12 text-center"><div class="text-slate-400 text-lg mb-2">Waiting for balance data...</div><div class="text-slate-500 text-sm">Asset balances and open orders will appear here</div></div>';
    return;
  }

  let html = '';

  // Build asset cards
  if (balances.length > 0) {
    // Sort balances by asset name
    balances.sort((a, b) => a.asset.localeCompare(b.asset));

    html += '<div class="mb-8">';
    html += '<div class="flex items-center space-x-2 mb-4 cursor-pointer hover:text-slate-100 transition-colors" onclick="window.toggleSubsection(\'balance-assets\')">';
    html += '<svg class="w-4 h-4 text-slate-400 transition-transform transform" id="icon-balance-assets" style="transform: rotate(0deg);">';
    html += '<path fill="none" stroke="currentColor" stroke-width="2" d="M6 9l6 6 6-6"/>';
    html += '</svg>';
    html += '<h3 class="text-lg font-semibold text-slate-200">Asset Balances</h3>';
    html += '</div>';
    html += '<div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4" id="content-balance-assets">';

    balances.forEach(balance => {
      const isChanged = changedAssets.has(balance.asset);
      const wallets = Array.isArray(balance.wallets) ? balance.wallets : [];

      html += `
        <div class="bg-slate-800 border border-slate-700 rounded-lg p-5 shadow-lg card-glow ${isChanged ? 'ring-2 ring-green-400/50 bg-slate-750' : ''}">
          <div class="flex items-center justify-between mb-3">
            <h4 class="text-xl font-bold text-slate-200">${balance.asset}</h4>
            <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-700 text-slate-300 border border-slate-600">
              ${wallets.length} wallet${wallets.length !== 1 ? 's' : ''}
            </span>
          </div>

          <div class="space-y-3">
            <div class="text-center">
              <div class="text-2xl font-mono font-bold text-green-300 mb-1">
                ${formatValue(balance.total_balance, 'balance', balance)}
              </div>
              <div class="text-slate-400 text-xs">Total Balance</div>
            </div>

            ${wallets.length > 0 ? `
              <div class="border-t border-slate-700 pt-3">
                <div class="text-xs text-slate-400 mb-2 font-semibold uppercase tracking-wide">Wallet Breakdown:</div>
                <div class="space-y-2">
                  ${wallets.map(wallet => {
                    // Create a more informative wallet label
                    let walletLabel = '';
                    if (wallet.wallet_type && wallet.wallet_id) {
                      if (wallet.wallet_type === 'aggregated' && wallet.wallet_id === 'all') {
                        walletLabel = 'All Wallets';
                      } else if (wallet.wallet_id && wallet.wallet_id !== 'all') {
                        walletLabel = `${wallet.wallet_type} (${wallet.wallet_id})`;
                      } else {
                        walletLabel = wallet.wallet_type.charAt(0).toUpperCase() + wallet.wallet_type.slice(1);
                      }
                    } else if (wallet.wallet_type) {
                      walletLabel = wallet.wallet_type.charAt(0).toUpperCase() + wallet.wallet_type.slice(1);
                    } else if (wallet.wallet_id) {
                      walletLabel = wallet.wallet_id;
                    } else {
                      walletLabel = 'Unknown';
                    }
                    
                    // Calculate percentage of total if we have total_balance
                    const percentage = balance.total_balance > 0 
                      ? ((wallet.balance / balance.total_balance) * 100).toFixed(1)
                      : '0.0';
                    
                    return `
                      <div class="bg-slate-900/50 rounded p-2 border border-slate-700">
                        <div class="flex justify-between items-center mb-1">
                          <span class="text-slate-300 text-xs font-medium">${walletLabel}</span>
                          <span class="text-slate-400 text-xs">${percentage}%</span>
                        </div>
                        <div class="flex justify-between items-center">
                          <span class="text-slate-400 text-xs">Balance:</span>
                          <span class="text-slate-200 font-mono text-xs font-semibold">${formatValue(wallet.balance, 'balance', wallet)}</span>
                        </div>
                        ${wallet.last_updated && wallet.last_updated !== balance.last_updated ? `
                          <div class="text-slate-500 text-xs mt-1 text-right">
                            Updated: ${formatTimestamp(wallet.last_updated)}
                          </div>
                        ` : ''}
                      </div>
                    `;
                  }).join('')}
                </div>
              </div>
            ` : ''}

            <div class="text-right text-slate-500 text-xs border-t border-slate-700 pt-2">
              ${formatTimestamp(balance.last_updated)}
            </div>
          </div>
        </div>
      `;
    });

    html += '</div></div>';
  }

  // Build open orders cards
  if (openOrdersData.length > 0) {
    html += '<div class="mt-8">';
    html += '<div class="flex items-center space-x-2 mb-4 cursor-pointer hover:text-slate-100 transition-colors" onclick="window.toggleSubsection(\'balance-orders\')">';
    html += '<svg class="w-4 h-4 text-slate-400 transition-transform transform" id="icon-balance-orders" style="transform: rotate(0deg);">';
    html += '<path fill="none" stroke="currentColor" stroke-width="2" d="M6 9l6 6 6-6"/>';
    html += '</svg>';
    html += '<h3 class="text-lg font-semibold text-slate-200">Open Orders</h3>';
    html += '</div>';
    html += '<div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4" id="content-balance-orders">';

    openOrdersData.forEach(order => {
      html += `
        <div class="bg-slate-800 border border-slate-700 rounded-lg p-4 shadow-lg card-glow">
          <div class="flex items-center justify-between mb-3">
            <div class="flex items-center space-x-2">
              <h4 class="text-lg font-bold text-slate-200">${order.symbol || 'N/A'}</h4>
              <span class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-900/50 text-blue-300 border border-blue-700">
                ${order.order_id ? order.order_id.substring(0, 8) + '...' : 'N/A'}
              </span>
            </div>
            <span class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-slate-700 text-slate-300 border border-slate-600">
              ${order.side || 'unknown'}
            </span>
          </div>

          <div class="space-y-2">
            <div class="flex justify-between items-center">
              <span class="text-slate-400 text-sm">Quantity:</span>
              <span class="text-slate-200 font-mono">${formatValue(order.order_qty || order.qty || order.quantity || order.amount || order.size || order.vol || order.volume || order.orig_qty || order.original_qty, 'quantity', order)}</span>
            </div>
            <div class="flex justify-between items-center">
              <span class="text-slate-400 text-sm">Price:</span>
              <span class="text-slate-200 font-mono">${formatValue(order.limit_price || order.price || order.limit, 'price', order)}</span>
            </div>
            ${order.remaining_qty !== undefined ? `
              <div class="flex justify-between items-center">
                <span class="text-slate-400 text-sm">Remaining:</span>
                <span class="text-yellow-300 font-mono">${formatValue(order.remaining_qty, 'quantity', order)}</span>
              </div>
            ` : ''}
            ${order.avg_price !== undefined && order.avg_price !== null && order.avg_price !== 0 ? `
              <div class="flex justify-between items-center">
                <span class="text-slate-400 text-sm">Avg Price:</span>
                <span class="text-green-300 font-mono">${formatValue(order.avg_price, 'price', order)}</span>
              </div>
            ` : ''}
            ${order.order_status ? `
              <div class="flex justify-between items-center">
                <span class="text-slate-400 text-sm">Status:</span>
                <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${order.order_status === 'new' ? 'bg-blue-900/50 text-blue-300' : order.order_status === 'filled' ? 'bg-green-900/50 text-green-300' : order.order_status === 'cancelled' ? 'bg-red-900/50 text-red-300' : 'bg-slate-700 text-slate-300'}">
                  ${order.order_status}
                </span>
              </div>
            ` : ''}
            <div class="text-right text-slate-500 text-xs border-t border-slate-700 pt-2 mt-3">
              ${formatTimestamp(order.last_updated)}
            </div>
          </div>
        </div>
      `;
    });

    html += '</div></div>';
  }

  container.innerHTML = html;
  
  // Restore subsection states after update
  if (balances.length > 0) {
    restoreSubsectionState('balance-assets');
  }
  if (openOrdersData.length > 0) {
    restoreSubsectionState('balance-orders');
  }
}

