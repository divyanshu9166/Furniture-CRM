'use client';

import { useState, useMemo } from 'react';
import {
  Search, Truck, Package, Clock, DollarSign,
  RefreshCw, Link2, Unlink, ExternalLink, ShoppingBag, Store,
  Globe,
} from 'lucide-react';
import { orders, orderStatuses, orderSources, marketplaceChannels } from '@/data/orders';

const statusColors = {
  Confirmed: 'bg-info-light text-info',
  Processing: 'bg-accent-light text-accent',
  Shipped: 'bg-purple-light text-purple',
  Delivered: 'bg-success-light text-success',
  Cancelled: 'bg-danger-light text-danger',
};

const paymentColors = {
  Paid: 'bg-success-light text-success',
  Partial: 'bg-warning-light text-warning',
  Pending: 'bg-danger-light text-danger',
};

const sourceConfig = {
  Store: { color: '#f59e0b', bg: 'bg-amber-500/10 text-amber-700 border-amber-500/20' },
  Amazon: { color: '#FF9900', bg: 'bg-orange-500/10 text-orange-300 border-orange-500/20' },
  Flipkart: { color: '#2874F0', bg: 'bg-blue-500/10 text-blue-700 border-blue-500/20' },
  Shopify: { color: '#96BF48', bg: 'bg-green-500/10 text-green-700 border-green-500/20' },
};

export default function OrdersPage() {
  const [tab, setTab] = useState('orders');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [sourceFilter, setSourceFilter] = useState('All');
  const [syncing, setSyncing] = useState({});
  const [channels, setChannels] = useState(marketplaceChannels);

  const filtered = useMemo(() => orders.filter(o =>
    (statusFilter === 'All' || o.status === statusFilter) &&
    (sourceFilter === 'All' || o.source === sourceFilter) &&
    (o.customer.toLowerCase().includes(search.toLowerCase()) || o.id.toLowerCase().includes(search.toLowerCase()) || o.product.toLowerCase().includes(search.toLowerCase()))
  ), [statusFilter, sourceFilter, search]);

  const totalRevenue = orders.filter(o => o.payment === 'Paid').reduce((s, o) => s + o.amount, 0);
  const pendingPayment = orders.filter(o => o.payment !== 'Paid').reduce((s, o) => s + o.amount, 0);
  const marketplaceOrders = orders.filter(o => o.source !== 'Store').length;

  const handleSync = (channelId) => {
    setSyncing(prev => ({ ...prev, [channelId]: true }));
    setTimeout(() => {
      setSyncing(prev => ({ ...prev, [channelId]: false }));
      setChannels(prev => prev.map(ch =>
        ch.id === channelId ? { ...ch, lastSync: new Date().toLocaleString('en-IN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: true }) } : ch
      ));
    }, 2000);
  };

  const handleSyncAll = () => {
    channels.filter(ch => ch.connected).forEach(ch => handleSync(ch.id));
  };

  const handleToggleConnect = (channelId) => {
    setChannels(prev => prev.map(ch =>
      ch.id === channelId ? { ...ch, connected: !ch.connected } : ch
    ));
  };

  const getSourceBadge = (source) => {
    const config = sourceConfig[source] || sourceConfig.Store;
    return (
      <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${config.bg}`}>
        {source}
      </span>
    );
  };

  // Per-source stats
  const sourceStats = useMemo(() => {
    const stats = {};
    orderSources.filter(s => s !== 'All').forEach(source => {
      const sourceOrders = orders.filter(o => o.source === source);
      stats[source] = {
        count: sourceOrders.length,
        revenue: sourceOrders.filter(o => o.payment === 'Paid').reduce((s, o) => s + o.amount, 0),
        pending: sourceOrders.filter(o => o.status !== 'Delivered' && o.status !== 'Cancelled').length,
      };
    });
    return stats;
  }, []);

  return (
    <div className="space-y-6 animate-[fade-in_0.5s_ease-out]">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-foreground">Orders</h1>
          <p className="text-xs md:text-sm text-muted mt-1">{orders.length} orders · ₹{(totalRevenue/1000).toFixed(0)}K collected · {marketplaceOrders} from marketplaces</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleSyncAll} className="flex items-center gap-2 px-4 py-2.5 bg-accent hover:bg-accent-hover text-white rounded-xl text-sm font-semibold transition-all">
            <RefreshCw className={`w-4 h-4 ${Object.values(syncing).some(Boolean) ? 'animate-spin' : ''}`} /> Sync All
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex bg-surface rounded-xl border border-border p-0.5 w-fit">
        <button onClick={() => setTab('orders')} className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${tab === 'orders' ? 'bg-accent text-white' : 'text-muted hover:text-foreground'}`}>Orders</button>
        <button onClick={() => setTab('channels')} className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium transition-all ${tab === 'channels' ? 'bg-accent text-white' : 'text-muted hover:text-foreground'}`}>
          <Globe className="w-3.5 h-3.5" /> Channels
        </button>
      </div>

      {/* ─── ORDERS TAB ─── */}
      {tab === 'orders' && (
        <>
          {/* Stats */}
          <div className="flex gap-3 overflow-x-auto hide-scrollbar pb-1">
            <div className="glass-card p-4 flex items-center gap-3 min-w-[160px] flex-shrink-0">
              <div className="p-2.5 rounded-xl bg-accent-light"><Package className="w-5 h-5 text-accent" /></div>
              <div><p className="text-xs text-muted">Total Orders</p><p className="text-lg font-bold text-foreground">{orders.length}</p></div>
            </div>
            <div className="glass-card p-4 flex items-center gap-3 min-w-[160px] flex-shrink-0">
              <div className="p-2.5 rounded-xl bg-purple-light"><Truck className="w-5 h-5 text-purple" /></div>
              <div><p className="text-xs text-muted">In Transit</p><p className="text-lg font-bold text-foreground">{orders.filter(o => o.status === 'Shipped').length}</p></div>
            </div>
            <div className="glass-card p-4 flex items-center gap-3 min-w-[160px] flex-shrink-0">
              <div className="p-2.5 rounded-xl bg-success-light"><DollarSign className="w-5 h-5 text-success" /></div>
              <div><p className="text-xs text-muted">Revenue Collected</p><p className="text-lg font-bold text-success">₹{(totalRevenue/1000).toFixed(0)}K</p></div>
            </div>
            <div className="glass-card p-4 flex items-center gap-3 min-w-[160px] flex-shrink-0">
              <div className="p-2.5 rounded-xl bg-warning-light"><Clock className="w-5 h-5 text-warning" /></div>
              <div><p className="text-xs text-muted">Pending Payment</p><p className="text-lg font-bold text-warning">₹{(pendingPayment/1000).toFixed(0)}K</p></div>
            </div>
            <div className="glass-card p-4 flex items-center gap-3 min-w-[160px] flex-shrink-0">
              <div className="p-2.5 rounded-xl bg-blue-500/10"><ShoppingBag className="w-5 h-5 text-blue-700" /></div>
              <div><p className="text-xs text-muted">Marketplace</p><p className="text-lg font-bold text-blue-700">{marketplaceOrders}</p></div>
            </div>
          </div>

          {/* Filters */}
          <div className="flex flex-col md:flex-row md:items-center gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
              <input type="text" placeholder="Search orders..." value={search} onChange={e => setSearch(e.target.value)} className="w-full pl-10 pr-4 py-2.5 bg-surface rounded-xl border border-border text-sm" />
            </div>

            {/* Source filter */}
            <div className="flex gap-1 overflow-x-auto hide-scrollbar">
              {orderSources.map(s => (
                <button key={s} onClick={() => setSourceFilter(s)} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${sourceFilter === s ? 'bg-accent text-white' : 'text-muted hover:text-foreground hover:bg-surface-hover'}`}>
                  {s !== 'All' && <span className="w-2 h-2 rounded-full" style={{ backgroundColor: sourceConfig[s]?.color || '#f59e0b' }} />}
                  {s}
                </button>
              ))}
            </div>

            {/* Status filter */}
            <div className="flex gap-1 overflow-x-auto hide-scrollbar">
              {orderStatuses.map(s => (
                <button key={s} onClick={() => setStatusFilter(s)} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${statusFilter === s ? 'bg-accent text-white' : 'text-muted hover:text-foreground hover:bg-surface-hover'}`}>{s}</button>
              ))}
            </div>
          </div>

          {/* Orders Table */}
          <div className="glass-card overflow-hidden">
            <div className="overflow-x-auto">
            <table className="crm-table">
              <thead>
                <tr>
                  <th>Order ID</th>
                  <th>Source</th>
                  <th>Customer</th>
                  <th>Product</th>
                  <th>Qty</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Payment</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(order => (
                  <tr key={order.id}>
                    <td className="font-mono text-accent font-medium">{order.id}</td>
                    <td>{getSourceBadge(order.source)}</td>
                    <td className="font-medium text-foreground">{order.customer}</td>
                    <td>{order.product}</td>
                    <td className="text-center">{order.quantity}</td>
                    <td className="font-semibold text-foreground">₹{order.amount.toLocaleString()}</td>
                    <td><span className={`badge ${statusColors[order.status]}`}>{order.status}</span></td>
                    <td><span className={`badge ${paymentColors[order.payment]}`}>{order.payment}</span></td>
                    <td className="text-muted">{order.date}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length === 0 && (
              <div className="text-center py-10 text-muted text-sm">No orders match your filters</div>
            )}
            </div>
          </div>
        </>
      )}

      {/* ─── CHANNELS TAB ─── */}
      {tab === 'channels' && (
        <div className="space-y-6">
          {/* Channel overview stats */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {orderSources.filter(s => s !== 'All').map(source => (
              <div key={source} className="glass-card p-4 cursor-pointer hover:border-accent/30 transition-all" onClick={() => { setTab('orders'); setSourceFilter(source); }}>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold" style={{ backgroundColor: `${sourceConfig[source].color}20`, color: sourceConfig[source].color }}>
                      {source === 'Store' ? <Store className="w-4.5 h-4.5" /> : source[0]}
                    </div>
                    <span className="text-sm font-semibold text-foreground">{source}</span>
                  </div>
                  <span className="text-xs text-muted">{sourceStats[source].count} orders</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted">Revenue: <span className="text-success font-medium">₹{(sourceStats[source].revenue / 1000).toFixed(0)}K</span></span>
                  <span className="text-muted">Active: <span className="text-foreground font-medium">{sourceStats[source].pending}</span></span>
                </div>
              </div>
            ))}
          </div>

          {/* Marketplace Connections */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-foreground">Marketplace Connections</h2>
              <button onClick={handleSyncAll} className="flex items-center gap-2 px-3 py-1.5 bg-surface border border-border hover:border-accent/30 rounded-lg text-xs font-medium text-foreground transition-all">
                <RefreshCw className={`w-3.5 h-3.5 ${Object.values(syncing).some(Boolean) ? 'animate-spin' : ''}`} /> Sync All Now
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {channels.map(channel => (
                <div key={channel.id} className="glass-card p-5 relative overflow-hidden">
                  {/* Accent bar */}
                  <div className="absolute top-0 left-0 right-0 h-1 rounded-t-xl" style={{ backgroundColor: channel.color }} />

                  {/* Header */}
                  <div className="flex items-center justify-between mb-4 mt-1">
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 rounded-xl flex items-center justify-center text-lg font-bold" style={{ backgroundColor: `${channel.color}20`, color: channel.color }}>
                        {channel.logo}
                      </div>
                      <div>
                        <h3 className="font-semibold text-foreground">{channel.name}</h3>
                        <p className="text-xs text-muted">Seller: {channel.sellerId}</p>
                      </div>
                    </div>
                    <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${channel.connected ? 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20' : 'bg-red-500/10 text-red-700 border-red-500/20'}`}>
                      <div className={`w-1.5 h-1.5 rounded-full ${channel.connected ? 'bg-emerald-600' : 'bg-red-600'}`} />
                      {channel.connected ? 'Connected' : 'Disconnected'}
                    </div>
                  </div>

                  {/* Stats */}
                  <div className="grid grid-cols-3 gap-3 mb-4">
                    <div className="bg-surface rounded-lg p-2.5 text-center">
                      <p className="text-lg font-bold text-foreground">{channel.totalOrders}</p>
                      <p className="text-[10px] text-muted">Orders</p>
                    </div>
                    <div className="bg-surface rounded-lg p-2.5 text-center">
                      <p className="text-lg font-bold text-amber-700">{channel.pendingOrders}</p>
                      <p className="text-[10px] text-muted">Pending</p>
                    </div>
                    <div className="bg-surface rounded-lg p-2.5 text-center">
                      <p className="text-sm font-bold text-success">₹{(channel.revenue / 1000).toFixed(0)}K</p>
                      <p className="text-[10px] text-muted">Revenue</p>
                    </div>
                  </div>

                  {/* Last sync */}
                  <div className="flex items-center justify-between text-xs text-muted mb-4 px-1">
                    <span className="flex items-center gap-1.5">
                      <Clock className="w-3 h-3" />
                      Last sync: {channel.lastSync}
                    </span>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleSync(channel.id)}
                      disabled={!channel.connected || syncing[channel.id]}
                      className="flex-1 flex items-center justify-center gap-2 py-2 bg-surface border border-border rounded-lg text-xs font-medium text-foreground hover:border-accent/30 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${syncing[channel.id] ? 'animate-spin' : ''}`} />
                      {syncing[channel.id] ? 'Syncing...' : 'Sync Now'}
                    </button>
                    <button
                      onClick={() => handleToggleConnect(channel.id)}
                      className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-medium transition-all border ${channel.connected
                        ? 'bg-red-500/10 text-red-700 border-red-500/20 hover:bg-red-500/20'
                        : 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20 hover:bg-emerald-500/20'
                      }`}
                    >
                      {channel.connected ? <><Unlink className="w-3.5 h-3.5" /> Disconnect</> : <><Link2 className="w-3.5 h-3.5" /> Connect</>}
                    </button>
                    <button
                      onClick={() => { setTab('orders'); setSourceFilter(channel.name); }}
                      className="flex items-center justify-center gap-1 px-3 py-2 bg-surface border border-border rounded-lg text-xs font-medium text-muted hover:text-foreground hover:border-accent/30 transition-all"
                      title="View orders"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Sync settings */}
          <div className="glass-card p-6">
            <h3 className="text-base font-semibold text-foreground mb-4">Sync Settings</h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between py-3 border-b border-border">
                <div>
                  <p className="text-sm font-medium text-foreground">Auto-Sync Orders</p>
                  <p className="text-xs text-muted">Automatically sync new orders every 15 minutes</p>
                </div>
                <button className="w-11 h-6 rounded-full bg-accent relative transition-colors">
                  <div className="w-5 h-5 bg-black rounded-full absolute top-0.5 right-0.5 transition-all" />
                </button>
              </div>
              <div className="flex items-center justify-between py-3 border-b border-border">
                <div>
                  <p className="text-sm font-medium text-foreground">Sync Inventory</p>
                  <p className="text-xs text-muted">Keep stock levels in sync across all marketplaces</p>
                </div>
                <button className="w-11 h-6 rounded-full bg-accent relative transition-colors">
                  <div className="w-5 h-5 bg-black rounded-full absolute top-0.5 right-0.5 transition-all" />
                </button>
              </div>
              <div className="flex items-center justify-between py-3 border-b border-border">
                <div>
                  <p className="text-sm font-medium text-foreground">Auto-Update Tracking</p>
                  <p className="text-xs text-muted">Push shipping updates back to marketplace platforms</p>
                </div>
                <button className="w-11 h-6 rounded-full bg-accent relative transition-colors">
                  <div className="w-5 h-5 bg-black rounded-full absolute top-0.5 right-0.5 transition-all" />
                </button>
              </div>
              <div className="flex items-center justify-between py-3">
                <div>
                  <p className="text-sm font-medium text-foreground">Notify on New Order</p>
                  <p className="text-xs text-muted">Get notified when a new marketplace order comes in</p>
                </div>
                <button className="w-11 h-6 rounded-full bg-accent relative transition-colors">
                  <div className="w-5 h-5 bg-black rounded-full absolute top-0.5 right-0.5 transition-all" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
