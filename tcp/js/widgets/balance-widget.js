// Balance-specific widgets

import { BaseWidget } from './base-widget.js';
import { balanceData, openOrdersData } from '../data/state.js';
import { formatValue, formatTimestamp } from '../utils/formatting.js';
import { subscribeToStream, unsubscribeFromStream } from '../utils/websocket.js';

export class BalanceAssetsWidget extends BaseWidget {
  constructor(config) {
    super(config);
    this.type = 'balance-assets';
    this.updateInterval = null;
  }

  createElement() {
    super.createElement();

    this.updateContent();
    this.subscribeToUpdates();

    return this.element;
  }

  updateContent() {
    const content = this.element.querySelector('.widget-content');
    if (!content) return;

    const balances = Object.values(balanceData);
    if (balances.length === 0) {
      content.innerHTML = '<div class="text-slate-400 text-sm">No asset balances available</div>';
      return;
    }

    // Sort by total balance descending
    balances.sort((a, b) => (b.total_balance || 0) - (a.total_balance || 0));

    const html = balances.slice(0, 8).map(balance => this.createAssetCard(balance)).join('');
    content.innerHTML = `<div class="grid grid-cols-1 gap-2">${html}</div>`;

    this.ensureCloseButton();
    this.autoSize();
  }

  createAssetCard(balance) {
    const wallets = Array.isArray(balance.wallets) ? balance.wallets : [];

    return `
      <div class="bg-slate-900/50 rounded p-3 border border-slate-700">
        <div class="flex justify-between items-start mb-2">
          <div class="text-sm font-medium text-slate-200">${balance.asset}</div>
          <div class="text-sm font-mono font-bold text-green-300">
            ${formatValue(balance.total_balance, 'balance', balance)}
          </div>
        </div>
        ${wallets.length > 0 ? `
          <div class="text-xs text-slate-400">
            ${wallets.length} wallet${wallets.length !== 1 ? 's' : ''}
          </div>
        ` : ''}
      </div>
    `;
  }

  update(data) {
    this.updateContent();
  }

  subscribeToUpdates() {
    this.updateCallback = (data) => this.update(data);
    subscribeToStream('balance', this.updateCallback);
  }

  destroy() {
    if (this.updateCallback) {
      unsubscribeFromStream('balance', this.updateCallback);
    }
    super.destroy();
  }
}

export class BalanceOrdersWidget extends BaseWidget {
  constructor(config) {
    super(config);
    this.type = 'balance-orders';
    this.updateCallback = null;
    // Use the configured symbol
    this.targetSymbol = config.config?.symbol || config.config?.metricKey || null;
  }

  createElement() {
    super.createElement();

    this.updateContent();
    this.subscribeToUpdates();

    return this.element;
  }

  updateContent() {
    const content = this.element.querySelector('.widget-content');
    if (!content) return;

    if (openOrdersData.length === 0) {
      content.innerHTML = '<div class="text-slate-400 text-sm">No open orders</div>';
      return;
    }

    // If we have a specific target symbol, filter orders by that symbol
    let ordersToShow = openOrdersData;
    if (this.targetSymbol) {
      ordersToShow = openOrdersData.filter(order =>
        order.symbol === this.targetSymbol
      );
    }

    if (ordersToShow.length === 0) {
      content.innerHTML = `<div class="text-slate-400 text-sm">No orders for ${this.targetSymbol || 'selected symbol'}</div>`;
      return;
    }

    const html = ordersToShow.slice(0, 6).map(order => this.createOrderCard(order)).join('');
    content.innerHTML = `<div class="grid grid-cols-1 gap-2">${html}</div>`;

    this.ensureCloseButton();
    this.autoSize();
  }

  createOrderCard(order) {
    return `
      <div class="bg-slate-900/50 rounded p-2 border border-slate-700">
        <div class="flex justify-between items-start mb-1">
          <div class="flex-1 min-w-0">
            <div class="text-xs font-medium text-slate-200 truncate">${order.symbol || 'N/A'}</div>
            <div class="text-xs text-slate-400">${order.side || 'unknown'}</div>
          </div>
          <div class="text-xs font-mono text-blue-300 ml-2">
            ${order.order_id ? order.order_id.substring(0, 6) + '...' : 'N/A'}
          </div>
        </div>
        <div class="flex justify-between text-xs">
          <span class="text-slate-400">Qty:</span>
          <span class="text-slate-200 font-mono">${formatValue(order.order_qty || order.qty || order.quantity || order.amount || order.size || order.vol || order.volume || order.orig_qty || order.original_qty, 'quantity', order)}</span>
        </div>
        <div class="flex justify-between text-xs">
          <span class="text-slate-400">Price:</span>
          <span class="text-slate-200 font-mono">${formatValue(order.limit_price || order.price || order.limit, 'price', order)}</span>
        </div>
      </div>
    `;
  }

  update(data) {
    this.updateContent();
  }

  startUpdates() {
    this.updateInterval = setInterval(() => {
      this.updateContent();
    }, 2000);
  }

  destroy() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }
    super.destroy();
  }
}

export class BalanceSingleWidget extends BaseWidget {
  constructor(config) {
    super(config);
    this.type = 'balance-single';
    this.updateCallback = null;
    // Use the configured asset key
    this.targetAsset = config.config?.asset || config.config?.metricKey || null;
  }

  createElement() {
    super.createElement();

    this.updateContent();
    this.subscribeToUpdates();

    return this.element;
  }

  updateContent() {
    const content = this.element.querySelector('.widget-content');
    if (!content) return;

    // If we have a specific target asset, show that one
    if (this.targetAsset && balanceData[this.targetAsset]) {
      const balance = balanceData[this.targetAsset];
      const wallets = Array.isArray(balance.wallets) ? balance.wallets : [];

      content.innerHTML = `
        <div class="text-center">
          <div class="text-lg font-medium text-slate-200 mb-1">${balance.asset}</div>
          <div class="text-2xl font-mono font-bold text-green-300 mb-2">
            ${formatValue(balance.total_balance, 'balance', balance)}
          </div>
          <div class="text-sm text-slate-400 mb-4">Total Balance</div>

          ${wallets.length > 0 ? `
            <div class="space-y-1">
              ${wallets.slice(0, 3).map(wallet => `
                <div class="flex justify-between text-xs">
                  <span class="text-slate-400 truncate">${this.getWalletLabel(wallet)}</span>
                  <span class="text-slate-200 font-mono">${formatValue(wallet.balance, 'balance', wallet)}</span>
                </div>
              `).join('')}
              ${wallets.length > 3 ? `<div class="text-xs text-slate-500 mt-2">+${wallets.length - 3} more</div>` : ''}
            </div>
          ` : ''}

          <div class="text-xs text-slate-500 mt-4">
            ${formatTimestamp(balance.last_updated)}
          </div>
        </div>
      `;

      this.ensureCloseButton();
      this.autoSize();
    } else {
      // Fallback: show first available asset
      const balances = Object.values(balanceData);
      if (balances.length === 0) {
        content.innerHTML = '<div class="text-slate-400 text-sm">No asset balances available</div>';
        return;
      }

      const balance = balances[0];
      const wallets = Array.isArray(balance.wallets) ? balance.wallets : [];

      content.innerHTML = `
        <div class="text-center">
          <div class="text-lg font-medium text-slate-200 mb-1">${balance.asset}</div>
          <div class="text-2xl font-mono font-bold text-green-300 mb-2">
            ${formatValue(balance.total_balance, 'balance', balance)}
          </div>
          <div class="text-sm text-slate-400 mb-4">Total Balance</div>

          ${wallets.length > 0 ? `
            <div class="space-y-1">
              ${wallets.slice(0, 3).map(wallet => `
                <div class="flex justify-between text-xs">
                  <span class="text-slate-400 truncate">${this.getWalletLabel(wallet)}</span>
                  <span class="text-slate-200 font-mono">${formatValue(wallet.balance, 'balance', wallet)}</span>
                </div>
              `).join('')}
              ${wallets.length > 3 ? `<div class="text-xs text-slate-500 mt-2">+${wallets.length - 3} more</div>` : ''}
            </div>
          ` : ''}

          <div class="text-xs text-slate-500 mt-4">
            ${formatTimestamp(balance.last_updated)}
          </div>
        </div>
      `;

      this.ensureCloseButton();
      this.autoSize();
    }
  }

  getWalletLabel(wallet) {
    if (wallet.wallet_type && wallet.wallet_id) {
      if (wallet.wallet_type === 'aggregated' && wallet.wallet_id === 'all') {
        return 'All Wallets';
      } else if (wallet.wallet_id && wallet.wallet_id !== 'all') {
        return `${wallet.wallet_type} (${wallet.wallet_id})`;
      } else {
        return wallet.wallet_type.charAt(0).toUpperCase() + wallet.wallet_type.slice(1);
      }
    } else if (wallet.wallet_type) {
      return wallet.wallet_type.charAt(0).toUpperCase() + wallet.wallet_type.slice(1);
    } else if (wallet.wallet_id) {
      return wallet.wallet_id;
    }
    return 'Unknown';
  }

  update(data) {
    this.updateContent();
  }

  subscribeToUpdates() {
    this.updateCallback = (data) => this.update(data);
    subscribeToStream('balance', this.updateCallback);
  }

  destroy() {
    if (this.updateCallback) {
      unsubscribeFromStream('balance', this.updateCallback);
    }
    super.destroy();
  }
}


export class BalanceOrdersSingleWidget extends BaseWidget {
  constructor(config) {
    super(config);
    this.type = 'balance-orders-single';
    this.updateCallback = null;
    // Use the configured symbol
    this.targetSymbol = config.config?.symbol || config.config?.metricKey || null;
  }

  createElement() {
    super.createElement();

    this.updateContent();
    this.subscribeToUpdates();

    return this.element;
  }

  updateContent() {
    const content = this.element.querySelector('.widget-content');
    if (!content) return;

    if (!this.targetSymbol) {
      content.innerHTML = '<div class="text-slate-400 text-sm">No symbol configured</div>';
      return;
    }

    if (openOrdersData.length === 0) {
      content.innerHTML = '<div class="text-slate-400 text-sm">No open orders</div>';
      return;
    }

    // Filter orders by the target symbol
    const ordersToShow = openOrdersData.filter(order =>
      order.symbol === this.targetSymbol
    );

    if (ordersToShow.length === 0) {
      content.innerHTML = `<div class="text-slate-400 text-sm">No orders for ${this.targetSymbol}</div>`;
      return;
    }

    // Calculate aggregated statistics
    const stats = this.calculateOrderStats(ordersToShow);

    content.innerHTML = `
      <div class="text-center">
        <div class="text-lg font-medium text-slate-200 mb-4">${this.targetSymbol} Orders</div>

        <div class="grid grid-cols-2 gap-4 mb-4">
          <div class="text-center">
            <div class="text-2xl font-mono font-bold text-green-400">${stats.buyCount}</div>
            <div class="text-xs text-slate-400">Buy Orders</div>
          </div>
          <div class="text-center">
            <div class="text-2xl font-mono font-bold text-red-400">${stats.sellCount}</div>
            <div class="text-xs text-slate-400">Sell Orders</div>
          </div>
        </div>

        <div class="text-center mb-4">
          <div class="text-lg font-mono font-bold text-blue-400">${stats.totalCount}</div>
          <div class="text-xs text-slate-400">Total Orders</div>
        </div>

        <div class="space-y-3">
          <div class="flex justify-between items-center">
            <span class="text-sm text-slate-400">Buy Value:</span>
            <span class="text-sm font-mono font-bold text-green-400">${this.formatUSD(stats.buyValue)}</span>
          </div>
          <div class="flex justify-between items-center">
            <span class="text-sm text-slate-400">Sell Value:</span>
            <span class="text-sm font-mono font-bold text-red-400">${this.formatUSD(stats.sellValue)}</span>
          </div>
          <div class="flex justify-between items-center pt-2 border-t border-slate-700">
            <span class="text-sm text-slate-400">Difference:</span>
            <span class="text-sm font-mono font-bold ${stats.difference >= 0 ? 'text-green-400' : 'text-red-400'}">${this.formatUSD(Math.abs(stats.difference))}</span>
          </div>
        </div>
      </div>
    `;

    this.ensureCloseButton();
    this.autoSize();
  }

  calculateOrderStats(orders) {
    let buyCount = 0;
    let sellCount = 0;
    let buyValue = 0;
    let sellValue = 0;

    orders.forEach(order => {
      const side = (order.side || '').toLowerCase();
      const quantity = this.extractQuantity(order);
      const price = this.extractPrice(order);
      const usdValue = quantity * price;

      if (side === 'buy' || side === 'bid') {
        buyCount++;
        buyValue += usdValue;
      } else if (side === 'sell' || side === 'ask') {
        sellCount++;
        sellValue += usdValue;
      }
    });

    return {
      buyCount,
      sellCount,
      totalCount: buyCount + sellCount,
      buyValue,
      sellValue,
      difference: buyValue - sellValue
    };
  }

  extractQuantity(order) {
    // Try multiple possible field names for quantity
    const quantityFields = ['order_qty', 'qty', 'quantity', 'amount', 'size', 'vol', 'volume', 'orig_qty', 'original_qty'];
    for (const field of quantityFields) {
      if (order[field] !== undefined && order[field] !== null) {
        const value = parseFloat(order[field]);
        if (!isNaN(value)) return value;
      }
    }
    return 0;
  }

  extractPrice(order) {
    // Try multiple possible field names for price
    const priceFields = ['limit_price', 'price', 'limit'];
    for (const field of priceFields) {
      if (order[field] !== undefined && order[field] !== null) {
        const value = parseFloat(order[field]);
        if (!isNaN(value)) return value;
      }
    }
    return 0;
  }

  formatUSD(value) {
    if (value === 0) return '$0.00';

    // For values >= $1, show with 2 decimal places
    if (Math.abs(value) >= 1) {
      return `$${value.toFixed(2)}`;
    }

    // For smaller values, show with more precision
    return `$${value.toFixed(6).replace(/\.?0+$/, '')}`;
  }

  createOrderCard(order) {
    return `
      <div class="bg-slate-900/50 rounded p-2 border border-slate-700">
        <div class="flex justify-between items-start mb-1">
          <div class="flex-1 min-w-0">
            <div class="text-xs font-medium text-slate-200">${order.side || 'unknown'}</div>
          </div>
          <div class="text-xs font-mono text-blue-300 ml-2">
            ${order.order_id ? order.order_id.substring(0, 6) + '...' : 'N/A'}
          </div>
        </div>
        <div class="flex justify-between text-xs">
          <span class="text-slate-400">Qty:</span>
          <span class="text-slate-200 font-mono">${formatValue(order.order_qty || order.qty || order.quantity || order.amount || order.size || order.vol || order.volume || order.orig_qty || order.original_qty, 'quantity', order)}</span>
        </div>
        <div class="flex justify-between text-xs">
          <span class="text-slate-400">Price:</span>
          <span class="text-slate-200 font-mono">${formatValue(order.limit_price || order.price || order.limit, 'price', order)}</span>
        </div>
      </div>
    `;
  }

  update(data) {
    this.updateContent();
  }

  subscribeToUpdates() {
    this.updateCallback = (data) => this.update(data);
    subscribeToStream('balance', this.updateCallback);
  }

  destroy() {
    if (this.updateCallback) {
      unsubscribeFromStream('balance', this.updateCallback);
    }
    super.destroy();
  }
}
