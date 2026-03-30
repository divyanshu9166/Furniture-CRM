'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  Search, Truck, Package, Clock, DollarSign,
  RefreshCw, Link2, Unlink, ExternalLink, ShoppingBag, Store,
  Globe, Plus
} from 'lucide-react';
import { getOrders, createOrder } from '@/app/actions/orders';
import { getMarketplaceChannels } from '@/app/actions/settings';
import { getProducts } from '@/app/actions/products';
import Modal from '@/components/Modal';
import ReturningCustomerCard from '@/components/ReturningCustomerCard';
import { searchContacts, getCustomerProfile } from '@/app/actions/invoices';

const orderStatuses = ['All', 'Confirmed', 'Processing', 'Shipped', 'Delivered', 'Cancelled'];
const orderSources = ['All', 'Store', 'Amazon', 'Flipkart', 'Shopify'];

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
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('orders');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [sourceFilter, setSourceFilter] = useState('All');
  const [syncing, setSyncing] = useState({});
  const [channels, setChannels] = useState([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [products, setProducts] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [orderQty, setOrderQty] = useState(1);
  const [orderCustomer, setOrderCustomer] = useState({ name: '', phone: '' });
  const [orderCustomerSuggestions, setOrderCustomerSuggestions] = useState([]);
  const [showOrderCustomerDropdown, setShowOrderCustomerDropdown] = useState(false);
  const [orderCustomerProfile, setOrderCustomerProfile] = useState(null);
  const [orderCustomerProfileLoading, setOrderCustomerProfileLoading] = useState(false);

  useEffect(() => {
    Promise.all([getOrders(), getMarketplaceChannels(), getProducts()]).then(([ordersRes, channelsRes, productsRes]) => {
      if (ordersRes.success) setOrders(ordersRes.data);
      if (channelsRes.success) setChannels(channelsRes.data);
      if (productsRes.success) setProducts(productsRes.data);
      setLoading(false);
    });
  }, []);

  const filtered = useMemo(() => orders.filter(o =>
    (statusFilter === 'All' || o.status === statusFilter) &&
    (sourceFilter === 'All' || o.source === sourceFilter) &&
    (o.customer.toLowerCase().includes(search.toLowerCase()) || o.id.toLowerCase().includes(search.toLowerCase()) || o.product.toLowerCase().includes(search.toLowerCase()))
  ), [statusFilter, sourceFilter, search, orders]);

  const totalRevenue = orders.filter(o => o.payment === 'Paid').reduce((s, o) => s + o.amount, 0);
  const pendingPayment = orders.filter(o => o.payment !== 'Paid').reduce((s, o) => s + o.amount, 0);
  const marketplaceOrders = orders.filter(o => o.source !== 'Store').length;

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
  }, [orders]);

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 w-48 bg-surface rounded-lg" />
        <div className="flex gap-3">{[1,2,3,4,5].map(i => <div key={i} className="h-20 min-w-[160px] bg-surface rounded-2xl flex-1" />)}</div>
        <div className="h-64 bg-surface rounded-2xl" />
      </div>
    );
  }

  const handleOrderCustomerSearch = async (value, field) => {
    setOrderCustomer(prev => ({ ...prev, [field]: value }));
    setOrderCustomerProfile(null);
    setOrderCustomerProfileLoading(false);
    if (value.length >= 2) {
      const res = await searchContacts(value);
      if (res.success && res.data.length > 0) {
        setOrderCustomerSuggestions(res.data);
        setShowOrderCustomerDropdown(true);
      } else {
        setOrderCustomerSuggestions([]);
        setShowOrderCustomerDropdown(false);
        if (field === 'phone' && value.replace(/\D/g, '').length === 10) {
          setOrderCustomerProfileLoading(true);
          const profileRes = await getCustomerProfile(value);
          setOrderCustomerProfileLoading(false);
          if (profileRes.success && profileRes.data) setOrderCustomerProfile(profileRes.data);
        }
      }
    } else {
      setShowOrderCustomerDropdown(false);
    }
  };

  const selectOrderCustomer = async (contact) => {
    setOrderCustomer({ name: contact.name, phone: contact.phone });
    setShowOrderCustomerDropdown(false);
    setOrderCustomerSuggestions([]);
    setOrderCustomerProfileLoading(true);
    const profileRes = await getCustomerProfile(contact.phone, contact.id);
    setOrderCustomerProfileLoading(false);
    if (profileRes.success) setOrderCustomerProfile(profileRes.data);
  };

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

  return (
    <div className="space-y-6 animate-[fade-in_0.5s_ease-out]">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-foreground">Orders</h1>
          <p className="text-xs md:text-sm text-muted mt-1">{orders.length} orders · ₹{(totalRevenue/1000).toFixed(0)}K collected · {marketplaceOrders} from marketplaces</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowCreateModal(true)} className="flex items-center gap-2 px-4 py-2.5 bg-accent hover:bg-accent-hover text-white rounded-xl text-sm font-semibold transition-all">
            <Plus className="w-4 h-4" /> New Offline Order
          </button>
          <button onClick={handleSyncAll} className="flex items-center gap-2 px-4 py-2.5 bg-surface border border-border hover:border-accent/30 text-foreground rounded-xl text-sm font-semibold transition-all">
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
          <div className="glass-card p-4 space-y-3">
            <div className="flex gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
                <input type="search" autoComplete="off" placeholder="Search orders by customer, product, or ID..." value={search} onChange={e => setSearch(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-gray-800 rounded-xl border border-border text-sm focus:ring-2 focus:ring-accent/30 focus:border-accent/50 outline-none transition-all" />
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              {/* Source filter */}
              <div className="flex items-center gap-2 overflow-x-auto hide-scrollbar">
                <span className="text-[10px] uppercase tracking-wider text-muted font-semibold flex-shrink-0">Source</span>
                <div className="flex gap-1">
                  {orderSources.map(s => (
                    <button key={s} onClick={() => setSourceFilter(s)} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 flex-shrink-0 ${sourceFilter === s ? 'bg-accent text-white shadow-sm' : 'text-muted hover:text-foreground hover:bg-surface-hover border border-transparent hover:border-border'}`}>
                      {s !== 'All' && <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: sourceConfig[s]?.color }} />}
                      {s}
                    </button>
                  ))}
                </div>
              </div>
              <div className="hidden sm:block w-px bg-border self-stretch" />
              {/* Status filter */}
              <div className="flex items-center gap-2 overflow-x-auto hide-scrollbar">
                <span className="text-[10px] uppercase tracking-wider text-muted font-semibold flex-shrink-0">Status</span>
                <div className="flex gap-1">
                  {orderStatuses.filter(s => s !== 'All').map(s => (
                    <button key={s} onClick={() => setStatusFilter(statusFilter === s ? 'All' : s)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex-shrink-0 ${statusFilter === s ? 'bg-accent text-white shadow-sm' : 'text-muted hover:text-foreground hover:bg-surface-hover border border-transparent hover:border-border'}`}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
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
                      <p className="text-lg font-bold text-foreground">{sourceStats[channel.name]?.count || 0}</p>
                      <p className="text-[10px] text-muted">Orders</p>
                    </div>
                    <div className="bg-surface rounded-lg p-2.5 text-center">
                      <p className="text-lg font-bold text-amber-700">{sourceStats[channel.name]?.pending || 0}</p>
                      <p className="text-[10px] text-muted">Pending</p>
                    </div>
                    <div className="bg-surface rounded-lg p-2.5 text-center">
                      <p className="text-sm font-bold text-success">₹{((sourceStats[channel.name]?.revenue || 0) / 1000).toFixed(0)}K</p>
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

      {/* ─── NEW OFFLINE ORDER MODAL ─── */}
      <Modal isOpen={showCreateModal} onClose={() => { setShowCreateModal(false); setSelectedProduct(null); setOrderQty(1); setOrderCustomer({ name: '', phone: '' }); setOrderCustomerProfile(null); }} title="New Offline Order">
        <form className="space-y-4" onSubmit={async (e) => {
          e.preventDefault();
          setSubmitting(true);
          const f = e.target;
          const qty = parseInt(f.quantity.value) || 1;
          const price = selectedProduct ? selectedProduct.price : 0;
          const res = await createOrder({
            customer: orderCustomer.name.trim() || f.customerName.value.trim(),
            phone: orderCustomer.phone.trim() || f.customerPhone.value.trim(),
            productId: selectedProduct?.id,
            quantity: qty,
            amount: price * qty,
            source: 'STORE',
            payment: f.payment.value,
            notes: f.notes.value,
          });
          if (res.success) {
            setShowCreateModal(false);
            setSelectedProduct(null);
            setOrderQty(1);
            setOrderCustomer({ name: '', phone: '' });
            setOrderCustomerProfile(null);
            const refreshed = await getOrders();
            if (refreshed.success) setOrders(refreshed.data);
          } else {
            alert(res.error || 'Failed to create order');
          }
          setSubmitting(false);
        }}>
          {/* Customer */}
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-muted mb-1.5">Customer Name <span className="text-red-500">*</span></label>
                <input type="text" name="customerName" required placeholder="e.g. Rahul Sharma"
                  value={orderCustomer.name}
                  onChange={e => handleOrderCustomerSearch(e.target.value, 'name')}
                  className="w-full px-4 py-2.5 bg-surface rounded-xl border border-border text-sm focus:outline-none focus:border-accent/50" />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted mb-1.5">Phone Number <span className="text-red-500">*</span></label>
                <input type="tel" name="customerPhone" required placeholder="e.g. 9876543210"
                  value={orderCustomer.phone}
                  onChange={e => handleOrderCustomerSearch(e.target.value, 'phone')}
                  className="w-full px-4 py-2.5 bg-surface rounded-xl border border-border text-sm focus:outline-none focus:border-accent/50" />
              </div>
            </div>
            {showOrderCustomerDropdown && orderCustomerSuggestions.length > 0 && (
              <div className="bg-surface border border-border rounded-xl shadow-lg max-h-[160px] overflow-y-auto">
                {orderCustomerSuggestions.map(c => (
                  <button key={c.id} type="button" onClick={() => selectOrderCustomer(c)}
                    className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-surface-hover transition-colors text-left border-b border-border/50 last:border-0">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{c.name}</p>
                      <p className="text-xs text-muted">{c.phone}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
            <ReturningCustomerCard profile={orderCustomerProfile} loading={orderCustomerProfileLoading} />
          </div>

          {/* Product */}
          <div>
            <label className="block text-xs font-medium text-muted mb-1.5">Product <span className="text-red-500">*</span></label>
            <select name="productId" required className="w-full px-4 py-2.5 bg-surface rounded-xl border border-border text-sm focus:outline-none focus:border-accent/50"
              onChange={e => {
                const p = products.find(p => p.id === parseInt(e.target.value));
                setSelectedProduct(p || null);
                setOrderQty(1);
              }}>
              <option value="">— Select a product —</option>
              {products.map(p => (
                <option key={p.id} value={p.id}>{p.name} — ₹{p.price.toLocaleString()} ({p.stock} in stock)</option>
              ))}
            </select>
          </div>

          {/* Qty + Amount */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-muted mb-1.5">Quantity</label>
              <input type="number" name="quantity" min="1" max={selectedProduct?.stock || 999} value={orderQty}
                onChange={e => setOrderQty(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-full px-4 py-2.5 bg-surface rounded-xl border border-border text-sm focus:outline-none focus:border-accent/50" />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted mb-1.5">Total Amount</label>
              <div className="w-full px-4 py-2.5 bg-surface/50 rounded-xl border border-border text-sm font-semibold text-accent">
                {selectedProduct ? `₹${(selectedProduct.price * orderQty).toLocaleString()}` : '—'}
              </div>
            </div>
          </div>

          {/* Payment */}
          <div>
            <label className="block text-xs font-medium text-muted mb-1.5">Payment Status</label>
            <select name="payment" className="w-full px-4 py-2.5 bg-surface rounded-xl border border-border text-sm focus:outline-none focus:border-accent/50">
              <option value="PENDING">Pending</option>
              <option value="PARTIAL">Partial</option>
              <option value="PAID">Paid</option>
            </select>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-medium text-muted mb-1.5">Notes (optional)</label>
            <textarea name="notes" rows={2} placeholder="Any special instructions..." className="w-full px-4 py-2.5 bg-surface rounded-xl border border-border text-sm resize-none focus:outline-none focus:border-accent/50" />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => { setShowCreateModal(false); setSelectedProduct(null); setOrderQty(1); }}
              className="px-4 py-2.5 rounded-xl text-sm text-muted hover:text-foreground hover:bg-surface-hover transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={submitting || !selectedProduct}
              className="px-6 py-2.5 bg-accent hover:bg-accent-hover disabled:bg-accent/50 text-white rounded-xl text-sm font-semibold transition-all flex items-center gap-2">
              {submitting ? <><RefreshCw className="w-4 h-4 animate-spin" /> Creating...</> : 'Create Order'}
            </button>
          </div>
        </form>
      </Modal>

    </div>
  );
}
