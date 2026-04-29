'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  Search, Plus, Package, AlertTriangle, TrendingUp, Grid3x3, List,
  Warehouse, QrCode, RefreshCw, ArrowDown, ArrowUp, Bell,
  CheckCircle2, XCircle, Clock, Layers, Boxes, Timer, MapPin, FileText
} from 'lucide-react';
import { getProducts, getCategories, getWarehouses, createProduct, updateStock } from '@/app/actions/products';
import { getStockGroups, createStockGroup } from '@/app/actions/stock-groups';
import { getBatches, createBatch, getAgingAnalysis } from '@/app/actions/batches';
import { getGodownStock, getGodowns, getStockLedger } from '@/app/actions/godowns';
import Modal from '@/components/Modal';

const stockBadge = (stock, reorderLevel) => {
  if (stock === 0) return { text: 'Out of Stock', cls: 'bg-danger-light text-danger' };
  if (stock <= reorderLevel) return { text: 'Low Stock', cls: 'bg-warning-light text-warning' };
  return { text: 'In Stock', cls: 'bg-success-light text-success' };
};

export default function InventoryPage() {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState(['All']);
  const [warehouses, setWarehouses] = useState(['All']);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [warehouseFilter, setWarehouseFilter] = useState('All');
  const [view, setView] = useState('grid');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showStockModal, setShowStockModal] = useState(null);
  const [tab, setTab] = useState('products');
  const [productImages, setProductImages] = useState([]);
  const [addingProduct, setAddingProduct] = useState(false);

  // Deep inventory state
  const [stockGroups, setStockGroups] = useState([]);
  const [batches, setBatches] = useState([]);
  const [agingData, setAgingData] = useState([]);
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [groupForm, setGroupForm] = useState({ name: '', parentId: '' });
  const [batchForm, setBatchForm] = useState({ productId: '', batchNumber: '', purchaseDate: '', expiryDate: '', quantity: 1, remainingQty: 1, costPrice: 0 });
  const [deepLoading, setDeepLoading] = useState(false);

  // Location view state
  const [godownStocks, setGodownStocks] = useState([]);
  const [godowns, setGodowns] = useState([]);
  const [locationLoading, setLocationLoading] = useState(false);
  const [selectedLocationGodown, setSelectedLocationGodown] = useState('');
  const [locationSearch, setLocationSearch] = useState('');

  // Stock Ledger state
  const [ledgerEntries, setLedgerEntries] = useState([]);
  const [ledgerLoading, setLedgerLoading] = useState(false);

  useEffect(() => {
    Promise.all([getProducts(), getCategories(), getWarehouses(), getGodowns()]).then(([pRes, cRes, wRes, gdRes]) => {
      if (pRes.success) setProducts(pRes.data);
      setCategories(['All', ...cRes.map(c => c.name)]);
      setWarehouses(['All', ...wRes.map(w => w.name)]);
      if (gdRes.success) setGodowns(gdRes.data);
      setLoading(false);
    });
  }, []);

  const refreshProducts = async () => {
    const res = await getProducts();
    if (res.success) setProducts(res.data);
  };

  const loadDeepInventory = async () => {
    setDeepLoading(true);
    const [sgRes, bRes, aRes] = await Promise.all([getStockGroups(), getBatches(), getAgingAnalysis()]);
    if (sgRes.success) setStockGroups(sgRes.data);
    if (bRes.success) setBatches(bRes.data);
    if (aRes.success) setAgingData(aRes.data);
    setDeepLoading(false);
  };

  const loadLocationData = async () => {
    setLocationLoading(true);
    const [gsRes, gdRes] = await Promise.all([getGodownStock(), getGodowns()]);
    if (gsRes.success) setGodownStocks(gsRes.data);
    if (gdRes.success) setGodowns(gdRes.data);
    setLocationLoading(false);
  };

  const loadLedger = async () => {
    setLedgerLoading(true);
    const res = await getStockLedger({ limit: 200 });
    if (res.success) setLedgerEntries(res.data);
    setLedgerLoading(false);
  };

  useEffect(() => {
    if (['stockGroups', 'batches', 'aging'].includes(tab) && stockGroups.length === 0 && !deepLoading) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      loadDeepInventory();
    }
    if (tab === 'location' && godownStocks.length === 0 && !locationLoading) {
      loadLocationData();
    }
    if (tab === 'ledger' && ledgerEntries.length === 0 && !ledgerLoading) {
      loadLedger();
    }
  }, [tab]);

  const filtered = useMemo(() => products.filter(p =>
    (category === 'All' || p.category === category) &&
    (warehouseFilter === 'All' || p.warehouse === warehouseFilter) &&
    (p.name.toLowerCase().includes(search.toLowerCase()) || p.category.toLowerCase().includes(search.toLowerCase()) || p.sku.toLowerCase().includes(search.toLowerCase()))
  ), [category, warehouseFilter, search, products]);

  // Group godown stocks by product for location view
  const locationProducts = useMemo(() => {
    const map = {};
    const filteredGdStocks = godownStocks.filter(s =>
      (!selectedLocationGodown || s.godownId === Number(selectedLocationGodown)) &&
      (!locationSearch || s.product?.name?.toLowerCase().includes(locationSearch.toLowerCase()) || s.product?.sku?.toLowerCase().includes(locationSearch.toLowerCase()))
    );
    for (const s of filteredGdStocks) {
      if (!map[s.productId]) {
        map[s.productId] = { product: s.product, locations: [], totalQty: 0 };
      }
      map[s.productId].locations.push({ godown: s.godown, quantity: s.quantity });
      map[s.productId].totalQty += s.quantity;
    }
    return Object.values(map).sort((a, b) => b.totalQty - a.totalQty);
  }, [godownStocks, selectedLocationGodown, locationSearch]);

  const totalStock = products.reduce((sum, p) => sum + p.stock, 0);
  const lowStockItems = products.filter(p => p.stock > 0 && p.stock <= p.reorderLevel);
  const outOfStockItems = products.filter(p => p.stock === 0);
  const totalValue = products.reduce((sum, p) => sum + (p.price * p.stock), 0);
  const needsReorder = [...lowStockItems, ...outOfStockItems].sort((a, b) => a.stock - b.stock);

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 w-64 bg-surface rounded-lg" />
        <div className="flex gap-3">{[1,2,3,4,5].map(i => <div key={i} className="h-20 min-w-[160px] bg-surface rounded-2xl flex-1" />)}</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">{[1,2,3,4].map(i => <div key={i} className="h-64 bg-surface rounded-2xl" />)}</div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-[fade-in_0.5s_ease-out]">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-foreground">Inventory & Warehouse</h1>
          <p className="text-xs md:text-sm text-muted mt-1">{products.length} products · {totalStock} total units across {godowns.length || 1} locations</p>
        </div>
        <button onClick={() => setShowAddModal(true)} className="flex items-center gap-2 px-4 py-2.5 bg-accent hover:bg-accent-hover text-white rounded-xl text-sm font-semibold transition-all">
          <Plus className="w-4 h-4" /> Add Product
        </button>
      </div>

      {/* Tabs */}
      <div className="overflow-x-auto hide-scrollbar -mx-3.5 md:mx-0">
        <div className="flex bg-surface rounded-xl border border-border p-0.5 w-max min-w-full md:w-fit mx-3.5 md:mx-0">
          <button onClick={() => setTab('products')} className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs md:text-sm font-medium transition-all flex-shrink-0 ${tab === 'products' ? 'bg-accent text-white' : 'text-muted hover:text-foreground'}`}>
            <Package className="w-3.5 h-3.5" /> Products
          </button>
          <button onClick={() => setTab('location')} className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs md:text-sm font-medium transition-all flex-shrink-0 ${tab === 'location' ? 'bg-accent text-white' : 'text-muted hover:text-foreground'}`}>
            <MapPin className="w-3.5 h-3.5" /> Location
          </button>
          <button onClick={() => setTab('alerts')} className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs md:text-sm font-medium transition-all flex-shrink-0 ${tab === 'alerts' ? 'bg-accent text-white' : 'text-muted hover:text-foreground'}`}>
            <Bell className="w-3.5 h-3.5" /> Alerts
            {needsReorder.length > 0 && (
              <span className="w-4 h-4 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">{needsReorder.length}</span>
            )}
          </button>
          <button onClick={() => setTab('ledger')} className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs md:text-sm font-medium transition-all flex-shrink-0 ${tab === 'ledger' ? 'bg-accent text-white' : 'text-muted hover:text-foreground'}`}>
            <FileText className="w-3.5 h-3.5" /> Ledger
          </button>
          <button onClick={() => setTab('stockGroups')} className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs md:text-sm font-medium transition-all flex-shrink-0 ${tab === 'stockGroups' ? 'bg-accent text-white' : 'text-muted hover:text-foreground'}`}>
            <Layers className="w-3.5 h-3.5" /> Groups
          </button>
          <button onClick={() => setTab('batches')} className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs md:text-sm font-medium transition-all flex-shrink-0 ${tab === 'batches' ? 'bg-accent text-white' : 'text-muted hover:text-foreground'}`}>
            <Boxes className="w-3.5 h-3.5" /> Batches
          </button>
          <button onClick={() => setTab('aging')} className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs md:text-sm font-medium transition-all flex-shrink-0 ${tab === 'aging' ? 'bg-accent text-white' : 'text-muted hover:text-foreground'}`}>
            <Timer className="w-3.5 h-3.5" /> Aging
          </button>
        </div>
      </div>


      {tab === 'products' && (
        <>
          {/* Stats */}
          <div className="flex gap-3 overflow-x-auto hide-scrollbar pb-1">
            <div className="glass-card p-4 flex items-center gap-3 min-w-[160px] flex-shrink-0">
              <div className="p-2.5 rounded-xl bg-accent-light"><Package className="w-5 h-5 text-accent" /></div>
              <div><p className="text-xs text-muted">Total Products</p><p className="text-lg font-bold text-foreground">{products.length}</p></div>
            </div>
            <div className="glass-card p-4 flex items-center gap-3 min-w-[160px] flex-shrink-0">
              <div className="p-2.5 rounded-xl bg-success-light"><TrendingUp className="w-5 h-5 text-success" /></div>
              <div><p className="text-xs text-muted">Inventory Value</p><p className="text-lg font-bold text-foreground">₹{(totalValue / 100000).toFixed(1)}L</p></div>
            </div>
            <div className="glass-card p-4 flex items-center gap-3 min-w-[160px] flex-shrink-0">
              <div className="p-2.5 rounded-xl bg-warning-light"><AlertTriangle className="w-5 h-5 text-warning" /></div>
              <div><p className="text-xs text-muted">Low Stock</p><p className="text-lg font-bold text-warning">{lowStockItems.length}</p></div>
            </div>
            <div className="glass-card p-4 flex items-center gap-3 min-w-[160px] flex-shrink-0">
              <div className="p-2.5 rounded-xl bg-danger-light"><XCircle className="w-5 h-5 text-danger" /></div>
              <div><p className="text-xs text-muted">Out of Stock</p><p className="text-lg font-bold text-danger">{outOfStockItems.length}</p></div>
            </div>
            <div className="glass-card p-4 flex items-center gap-3 min-w-[160px] flex-shrink-0">
              <div className="p-2.5 rounded-xl bg-info-light"><Warehouse className="w-5 h-5 text-info" /></div>
              <div><p className="text-xs text-muted">Locations</p><p className="text-lg font-bold text-foreground">{godowns.length || (warehouses.length - 1)}</p></div>
            </div>
          </div>

          {/* Filters */}
          <div className="flex flex-col md:flex-row md:items-center gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
              <input type="text" placeholder="Search by name, category, or SKU..." value={search} onChange={e => setSearch(e.target.value)} className="w-full pl-10 pr-4 py-2.5 bg-surface rounded-xl border border-border text-sm" />
            </div>
            <div className="flex gap-1 overflow-x-auto hide-scrollbar">
              {categories.map(cat => (
                <button key={cat} onClick={() => setCategory(cat)} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${category === cat ? 'bg-accent text-white' : 'text-muted hover:text-foreground hover:bg-surface-hover'}`}>{cat}</button>
              ))}
            </div>
            <div className="flex bg-surface rounded-lg border border-border p-0.5 ml-auto">
              <button onClick={() => setView('grid')} className={`p-2 rounded-md transition-all ${view === 'grid' ? 'bg-accent/20 text-accent' : 'text-muted'}`}><Grid3x3 className="w-4 h-4" /></button>
              <button onClick={() => setView('list')} className={`p-2 rounded-md transition-all ${view === 'list' ? 'bg-accent/20 text-accent' : 'text-muted'}`}><List className="w-4 h-4" /></button>
            </div>
          </div>

          {view === 'grid' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filtered.map(product => {
                const badge = stockBadge(product.stock, product.reorderLevel);
                const isBestSeller = product.sold >= 30;
                // Get godown distribution for this product
                const godownDist = godownStocks.filter(gs => gs.productId === product.id);
                return (
                  <div key={product.id} className="glass-card overflow-hidden group hover:scale-[1.02] transition-transform cursor-pointer" onClick={() => setShowStockModal(product)}>
                    <div className="h-32 bg-surface flex items-center justify-center relative overflow-hidden">
                      {product.image && !product.image.includes('/') ? (
                        <span className="text-5xl">{product.image}</span>
                      ) : product.image ? (
                        <img src={product.image.split(',')[0]} alt={product.name} className="w-full h-full object-cover" />
                      ) : (
                        <Package className="w-10 h-10 text-muted/30" />
                      )}
                      {isBestSeller && (
                        <span className="absolute top-2 left-2 badge bg-accent text-white text-[10px]">Best Seller</span>
                      )}
                      <span className="absolute top-2 right-2 text-[10px] font-mono text-muted bg-surface-hover px-1.5 py-0.5 rounded">{product.sku}</span>
                    </div>
                    <div className="p-4">
                      <div className="flex items-start justify-between mb-1">
                        <h3 className="text-sm font-semibold text-foreground leading-tight">{product.name}</h3>
                      </div>
                      <p className="text-xs text-muted mb-1">{product.category} · {product.material}</p>
                      <p className="text-[10px] text-muted mb-2 flex items-center gap-1"><Warehouse className="w-3 h-3" /> {product.warehouse}</p>
                      
                      {/* Godown distribution */}
                      {godownDist.length > 0 && (
                        <div className="flex flex-wrap gap-1 mb-2">
                          {godownDist.map(gs => (
                            <span key={gs.id} className="text-[9px] px-1.5 py-0.5 rounded bg-surface-hover text-muted">
                              {gs.godown?.name}: {gs.quantity}
                            </span>
                          ))}
                        </div>
                      )}
                      
                      <div className="flex items-center justify-between">
                        <span className="text-base font-bold text-accent">₹{product.price.toLocaleString()}</span>
                        <span className={`badge text-[10px] ${badge.cls}`}>{badge.text}</span>
                      </div>
                      <div className="flex items-center justify-between mt-2 pt-2 border-t border-border">
                        <span className="text-xs text-muted">{product.stock} in stock</span>
                        <span className="text-xs text-muted">{product.sold} sold</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="glass-card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="crm-table">
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>SKU</th>
                      <th>Category</th>
                      <th>Price</th>
                      <th>Stock</th>
                      <th>Godown Split</th>
                      <th>Reorder At</th>
                      <th>Sold</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(product => {
                      const badge = stockBadge(product.stock, product.reorderLevel);
                      const godownDist = godownStocks.filter(gs => gs.productId === product.id);
                      return (
                        <tr key={product.id} className="cursor-pointer" onClick={() => setShowStockModal(product)}>
                          <td>
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-lg bg-surface flex items-center justify-center overflow-hidden flex-shrink-0">
                                {product.image && !product.image.includes('/') ? (
                                  <span className="text-xl">{product.image}</span>
                                ) : product.image ? (
                                  <img src={product.image.split(',')[0]} alt={product.name} className="w-full h-full object-cover" />
                                ) : (
                                  <Package className="w-5 h-5 text-muted/30" />
                                )}
                              </div>
                              <div>
                                <p className="font-medium text-foreground">{product.name}</p>
                                <p className="text-xs text-muted">{product.material} · {product.color}</p>
                              </div>
                            </div>
                          </td>
                          <td className="font-mono text-xs text-muted">{product.sku}</td>
                          <td>{product.category}</td>
                          <td className="text-accent font-semibold">₹{product.price.toLocaleString()}</td>
                          <td className={`font-medium ${product.stock <= product.reorderLevel ? 'text-danger' : 'text-foreground'}`}>{product.stock}</td>
                          <td>
                            <div className="flex flex-wrap gap-1">
                              {godownDist.length > 0 ? godownDist.map(gs => (
                                <span key={gs.id} className="text-[9px] px-1.5 py-0.5 rounded bg-surface-hover text-muted">{gs.godown?.name}: {gs.quantity}</span>
                              )) : <span className="text-[10px] text-muted">—</span>}
                            </div>
                          </td>
                          <td className="text-muted">{product.reorderLevel}</td>
                          <td>{product.sold}</td>
                          <td><span className={`badge ${badge.cls}`}>{badge.text}</span></td>
                          <td>
                            <button onClick={(e) => { e.stopPropagation(); setShowStockModal(product); }} className="px-2 py-1 rounded-lg bg-surface-hover text-xs text-muted hover:text-accent transition-colors">
                              Update Stock
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* ─── LOCATION VIEW TAB ─── */}
      {tab === 'location' && (
        <div className="space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
              <input value={locationSearch} onChange={e => setLocationSearch(e.target.value)} placeholder="Search products..." className="w-full pl-10 pr-4 py-2 bg-surface border border-border rounded-lg text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent/50" />
            </div>
            <select value={selectedLocationGodown} onChange={e => setSelectedLocationGodown(e.target.value)} className="px-3 py-2 bg-surface border border-border rounded-lg text-sm text-foreground">
              <option value="">All Locations</option>
              {godowns.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
            <button onClick={loadLocationData} className="p-2 bg-surface border border-border rounded-lg text-muted hover:text-foreground"><RefreshCw className="w-4 h-4" /></button>
          </div>

          {locationLoading ? (
            <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent" /></div>
          ) : (
            <div className="space-y-3">
              {locationProducts.map((item, idx) => (
                <div key={idx} className="glass-card p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h3 className="font-semibold text-foreground text-sm">{item.product?.name}</h3>
                      <p className="text-[10px] text-muted font-mono">{item.product?.sku} · {item.product?.category?.name}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold text-foreground">{item.totalQty}</p>
                      <p className="text-[10px] text-muted">Total Units</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
                    {item.locations.map((loc, li) => {
                      const pct = item.totalQty > 0 ? Math.round((loc.quantity / item.totalQty) * 100) : 0;
                      return (
                        <div key={li} className="bg-surface rounded-lg p-2.5 border border-border/50">
                          <div className="flex items-center gap-1.5 mb-1">
                            <Warehouse className="w-3 h-3 text-muted" />
                            <span className="text-xs font-medium text-foreground truncate">{loc.godown?.name}</span>
                          </div>
                          <div className="flex items-end justify-between">
                            <span className={`text-base font-bold ${loc.quantity <= 0 ? 'text-red-400' : loc.quantity < 5 ? 'text-amber-400' : 'text-emerald-400'}`}>{loc.quantity}</span>
                            <span className="text-[9px] text-muted">{pct}%</span>
                          </div>
                          <div className="h-1 bg-border rounded-full mt-1 overflow-hidden">
                            <div className="h-full bg-accent/60 rounded-full" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
              {locationProducts.length === 0 && (
                <div className="glass-card p-10 text-center">
                  <MapPin className="w-10 h-10 text-muted/30 mx-auto mb-3" />
                  <p className="text-foreground font-medium">No stock allocated to godowns yet</p>
                  <p className="text-xs text-muted mt-1">Go to Godowns → Sync Stock to allocate existing product stock to your godowns.</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ─── STOCK LEDGER TAB ─── */}
      {tab === 'ledger' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted">Complete audit trail of all stock movements</p>
            <button onClick={loadLedger} className="p-2 bg-surface border border-border rounded-lg text-muted hover:text-foreground"><RefreshCw className="w-4 h-4" /></button>
          </div>
          {ledgerLoading ? (
            <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent" /></div>
          ) : (
            <div className="glass-card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-border">
                    {['Date', 'Product', 'Godown', 'Type', 'Qty', 'Balance', 'Reference', 'Notes'].map(h => <th key={h} className="px-3 py-3 text-left text-xs font-medium text-muted uppercase whitespace-nowrap">{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {ledgerEntries.map(e => {
                      const typeColors = {
                        'IN': 'bg-emerald-500/10 text-emerald-400', 'OUT': 'bg-red-500/10 text-red-400',
                        'TRANSFER_IN': 'bg-blue-500/10 text-blue-400', 'TRANSFER_OUT': 'bg-orange-500/10 text-orange-400',
                        'ADJUSTMENT': 'bg-amber-500/10 text-amber-400', 'PRODUCTION': 'bg-purple-500/10 text-purple-400',
                        'SALE': 'bg-red-500/10 text-red-400', 'RETURN': 'bg-cyan-500/10 text-cyan-400',
                      };
                      return (
                        <tr key={e.id} className="border-b border-border/50 hover:bg-surface-hover transition-colors">
                          <td className="px-3 py-2.5 text-muted text-xs whitespace-nowrap">{new Date(e.createdAt).toLocaleDateString('en-IN')} {new Date(e.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</td>
                          <td className="px-3 py-2.5">
                            <p className="text-foreground font-medium text-xs">{e.product?.name}</p>
                            <p className="text-[10px] text-muted font-mono">{e.product?.sku}</p>
                          </td>
                          <td className="px-3 py-2.5 text-foreground text-xs">{e.godown?.name}</td>
                          <td className="px-3 py-2.5">
                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${typeColors[e.entryType] || 'bg-gray-500/10 text-gray-400'}`}>{e.entryType.replace('_', ' ')}</span>
                          </td>
                          <td className="px-3 py-2.5">
                            <span className={`font-semibold flex items-center gap-0.5 ${e.quantity > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                              {e.quantity > 0 ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
                              {Math.abs(e.quantity)}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-foreground font-medium text-xs">{e.balanceAfter}</td>
                          <td className="px-3 py-2.5 text-muted text-[10px]">{e.referenceType || '—'}</td>
                          <td className="px-3 py-2.5 text-muted text-[10px] max-w-[200px] truncate">{e.notes || '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {ledgerEntries.length === 0 && <div className="text-center py-12 text-muted">No stock movements yet. Movements will appear here when stock is adjusted, transferred, or sold.</div>}
            </div>
          )}
        </div>
      )}

      {/* ─── STOCK ALERTS TAB ─── */}
      {tab === 'alerts' && (
        <div className="space-y-6">
          {needsReorder.length === 0 ? (
            <div className="glass-card p-10 text-center">
              <CheckCircle2 className="w-10 h-10 text-success mx-auto mb-3" />
              <p className="text-foreground font-medium">All stock levels are healthy!</p>
              <p className="text-xs text-muted mt-1">No products need reordering right now.</p>
            </div>
          ) : (
            <>
              <div className="glass-card p-4 border-l-4 border-l-warning">
                <p className="text-sm text-foreground font-medium">{needsReorder.length} products need attention</p>
                <p className="text-xs text-muted mt-1">{outOfStockItems.length} out of stock, {lowStockItems.length} below reorder level</p>
              </div>

              <div className="glass-card overflow-hidden">
                <table className="crm-table">
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>SKU</th>
                      <th>Current Stock</th>
                      <th>Reorder Level</th>
                      <th>Shortfall</th>
                      <th>Warehouse</th>
                      <th>Last Restocked</th>
                      <th>Priority</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {needsReorder.map(product => {
                      const shortfall = product.reorderLevel - product.stock;
                      const isOut = product.stock === 0;
                      return (
                        <tr key={product.id}>
                          <td>
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-lg bg-surface flex items-center justify-center overflow-hidden flex-shrink-0">
                                {product.image && !product.image.includes('/') ? (
                                  <span className="text-lg">{product.image}</span>
                                ) : product.image ? (
                                  <img src={product.image.split(',')[0]} alt={product.name} className="w-full h-full object-cover" />
                                ) : (
                                  <Package className="w-4 h-4 text-muted/30" />
                                )}
                              </div>
                              <div>
                                <p className="font-medium text-foreground">{product.name}</p>
                                <p className="text-xs text-muted">{product.category}</p>
                              </div>
                            </div>
                          </td>
                          <td className="font-mono text-xs text-muted">{product.sku}</td>
                          <td className={`font-bold ${isOut ? 'text-danger' : 'text-warning'}`}>{product.stock}</td>
                          <td className="text-muted">{product.reorderLevel}</td>
                          <td className="text-danger font-medium">
                            {shortfall > 0 ? `Need ${shortfall} more` : 'Restocked'}
                          </td>
                          <td className="text-xs text-muted">{product.warehouse}</td>
                          <td className="text-xs text-muted">{product.lastRestocked}</td>
                          <td>
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${isOut ? 'bg-red-500/10 text-red-700 border-red-500/20' : 'bg-amber-500/10 text-amber-700 border-amber-500/20'}`}>
                              {isOut ? 'Urgent' : 'Low'}
                            </span>
                          </td>
                          <td>
                            <button
                              onClick={() => setShowStockModal(product)}
                              className="px-3 py-1.5 rounded-lg bg-accent/10 text-accent text-xs font-medium hover:bg-accent/20 transition-colors border border-accent/20"
                            >
                              Restock
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* ─── STOCK GROUPS TAB ─── */}
      {tab === 'stockGroups' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button onClick={() => setShowGroupModal(true)} className="px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent/90 flex items-center gap-2"><Plus className="w-4 h-4" /> Add Stock Group</button>
          </div>
          {deepLoading ? <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent" /></div> : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {stockGroups.map(g => (
                <div key={g.id} className="glass-card p-5">
                  <h3 className="font-semibold text-foreground">{g.name}</h3>
                  <p className="text-xs text-muted mt-1">Parent: {g.parent?.name || 'Root'}</p>
                  <div className="flex items-center gap-4 mt-3 text-sm text-muted">
                    <span>{g._count?.products || 0} products</span>
                    <span>{g._count?.children || 0} sub-groups</span>
                  </div>
                </div>
              ))}
              {stockGroups.length === 0 && <div className="col-span-full text-center py-12 text-muted">No stock groups created yet</div>}
            </div>
          )}
          <Modal isOpen={showGroupModal} onClose={() => setShowGroupModal(false)} title="Add Stock Group">
            <div className="space-y-4">
              <div>
                <label className="text-sm text-muted mb-1 block">Group Name *</label>
                <input value={groupForm.name} onChange={e => setGroupForm(p => ({ ...p, name: e.target.value }))} className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/50" />
              </div>
              <div>
                <label className="text-sm text-muted mb-1 block">Parent Group</label>
                <select value={groupForm.parentId} onChange={e => setGroupForm(p => ({ ...p, parentId: e.target.value }))} className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm text-foreground">
                  <option value="">None (Root)</option>
                  {stockGroups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
              </div>
              <button onClick={async () => {
                const res = await createStockGroup({ name: groupForm.name, parentId: groupForm.parentId ? Number(groupForm.parentId) : undefined });
                if (res.success) { setShowGroupModal(false); setGroupForm({ name: '', parentId: '' }); loadDeepInventory(); }
                else alert(res.error);
              }} disabled={!groupForm.name} className="w-full py-2.5 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent/90 disabled:opacity-50">Create Stock Group</button>
            </div>
          </Modal>
        </div>
      )}

      {/* ─── BATCHES TAB ─── */}
      {tab === 'batches' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button onClick={() => setShowBatchModal(true)} className="px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent/90 flex items-center gap-2"><Plus className="w-4 h-4" /> Add Batch</button>
          </div>
          {deepLoading ? <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent" /></div> : (
            <div className="glass-card overflow-hidden">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-border">
                  {['Product', 'SKU', 'Batch #', 'Purchase Date', 'Expiry', 'Original Qty', 'Remaining', 'Cost Price'].map(h => <th key={h} className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">{h}</th>)}
                </tr></thead>
                <tbody>
                  {batches.map(b => (
                    <tr key={b.id} className="border-b border-border/50 hover:bg-surface-hover transition-colors">
                      <td className="px-4 py-3 text-foreground font-medium">{b.product?.name}</td>
                      <td className="px-4 py-3 text-muted font-mono text-xs">{b.product?.sku}</td>
                      <td className="px-4 py-3 text-foreground">{b.batchNumber}</td>
                      <td className="px-4 py-3 text-muted">{new Date(b.purchaseDate).toLocaleDateString('en-IN')}</td>
                      <td className="px-4 py-3 text-muted">{b.expiryDate ? new Date(b.expiryDate).toLocaleDateString('en-IN') : '—'}</td>
                      <td className="px-4 py-3 text-foreground">{b.quantity}</td>
                      <td className="px-4 py-3"><span className={`font-medium ${b.remainingQty <= 0 ? 'text-red-400' : b.remainingQty < b.quantity * 0.2 ? 'text-amber-400' : 'text-emerald-400'}`}>{b.remainingQty}</span></td>
                      <td className="px-4 py-3 text-foreground">₹{b.costPrice?.toLocaleString('en-IN')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {batches.length === 0 && <div className="text-center py-12 text-muted">No batch records found</div>}
            </div>
          )}
          <Modal isOpen={showBatchModal} onClose={() => setShowBatchModal(false)} title="Add Batch">
            <div className="space-y-4">
              <div>
                <label className="text-sm text-muted mb-1 block">Product *</label>
                <select value={batchForm.productId} onChange={e => setBatchForm(p => ({ ...p, productId: e.target.value }))} className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm text-foreground">
                  <option value="">Select Product</option>
                  {products.map(p => <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm text-muted mb-1 block">Batch Number *</label>
                  <input value={batchForm.batchNumber} onChange={e => setBatchForm(p => ({ ...p, batchNumber: e.target.value }))} className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/50" />
                </div>
                <div>
                  <label className="text-sm text-muted mb-1 block">Cost Price</label>
                  <input type="number" min="0" value={batchForm.costPrice} onChange={e => setBatchForm(p => ({ ...p, costPrice: e.target.value }))} className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/50" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm text-muted mb-1 block">Purchase Date</label>
                  <input type="date" value={batchForm.purchaseDate} onChange={e => setBatchForm(p => ({ ...p, purchaseDate: e.target.value }))} className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm text-foreground" />
                </div>
                <div>
                  <label className="text-sm text-muted mb-1 block">Expiry Date</label>
                  <input type="date" value={batchForm.expiryDate} onChange={e => setBatchForm(p => ({ ...p, expiryDate: e.target.value }))} className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm text-foreground" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm text-muted mb-1 block">Quantity *</label>
                  <input type="number" min="1" value={batchForm.quantity} onChange={e => setBatchForm(p => ({ ...p, quantity: e.target.value, remainingQty: e.target.value }))} className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm text-foreground" />
                </div>
                <div>
                  <label className="text-sm text-muted mb-1 block">Remaining Qty</label>
                  <input type="number" min="0" value={batchForm.remainingQty} onChange={e => setBatchForm(p => ({ ...p, remainingQty: e.target.value }))} className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm text-foreground" />
                </div>
              </div>
              <button onClick={async () => {
                const res = await createBatch({
                  productId: Number(batchForm.productId), batchNumber: batchForm.batchNumber,
                  purchaseDate: batchForm.purchaseDate || undefined, expiryDate: batchForm.expiryDate || undefined,
                  quantity: Number(batchForm.quantity), remainingQty: Number(batchForm.remainingQty), costPrice: Number(batchForm.costPrice)
                });
                if (res.success) { setShowBatchModal(false); setBatchForm({ productId: '', batchNumber: '', purchaseDate: '', expiryDate: '', quantity: 1, remainingQty: 1, costPrice: 0 }); loadDeepInventory(); }
                else alert(res.error);
              }} disabled={!batchForm.productId || !batchForm.batchNumber} className="w-full py-2.5 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent/90 disabled:opacity-50">Create Batch</button>
            </div>
          </Modal>
        </div>
      )}

      {/* ─── AGING ANALYSIS TAB ─── */}
      {tab === 'aging' && (
        <div className="space-y-4">
          {deepLoading ? <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent" /></div> : (
            <>
              {agingData.length > 0 ? (
                <>
                  {/* Batch-based aging (when batch records exist) */}
                  <div className="glass-card p-3 border-l-4 border-accent">
                    <p className="text-xs text-muted">Showing batch-level aging. Each row represents a product batch received from a supplier.</p>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                    {['0-30 days', '31-60 days', '61-90 days', '91-180 days', '180+ days'].map(bracket => {
                      const items = agingData.filter(a => a.bracket === bracket);
                      const value = items.reduce((s, a) => s + a.value, 0);
                      const colors = { '0-30 days': 'text-emerald-400', '31-60 days': 'text-blue-400', '61-90 days': 'text-amber-400', '91-180 days': 'text-orange-400', '180+ days': 'text-red-400' };
                      return (
                        <div key={bracket} className="glass-card p-4">
                          <p className="text-xs text-muted">{bracket}</p>
                          <p className={`text-lg font-semibold ${colors[bracket]}`}>₹{value.toLocaleString('en-IN')}</p>
                          <p className="text-xs text-muted">{items.length} batches</p>
                        </div>
                      );
                    })}
                  </div>
                  <div className="glass-card overflow-hidden">
                    <table className="w-full text-sm">
                      <thead><tr className="border-b border-border">
                        {['Product', 'SKU', 'Category', 'Batch #', 'Age (Days)', 'Bracket', 'Remaining', 'Value'].map(h => <th key={h} className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">{h}</th>)}
                      </tr></thead>
                      <tbody>
                        {agingData.map((a, i) => (
                          <tr key={i} className="border-b border-border/50 hover:bg-surface-hover transition-colors">
                            <td className="px-4 py-3 text-foreground font-medium">{a.product?.name}</td>
                            <td className="px-4 py-3 text-muted font-mono text-xs">{a.product?.sku}</td>
                            <td className="px-4 py-3 text-muted">{a.product?.category?.name || '—'}</td>
                            <td className="px-4 py-3 text-foreground">{a.batchNumber}</td>
                            <td className="px-4 py-3 text-foreground">{a.ageDays}</td>
                            <td className="px-4 py-3">
                              <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                                a.bracket === '180+ days' ? 'bg-red-500/10 text-red-400' :
                                a.bracket === '91-180 days' ? 'bg-orange-500/10 text-orange-400' :
                                a.bracket === '61-90 days' ? 'bg-amber-500/10 text-amber-400' :
                                'bg-emerald-500/10 text-emerald-400'
                              }`}>{a.bracket}</span>
                            </td>
                            <td className="px-4 py-3 text-foreground">{a.remainingQty}</td>
                            <td className="px-4 py-3 text-foreground">₹{a.value?.toLocaleString('en-IN')}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : (
                <>
                  {/* Product-based aging fallback (when no batch records) */}
                  <div className="glass-card p-3 border-l-4 border-amber-500">
                    <p className="text-xs text-foreground font-medium">Showing product-level aging based on last restock date.</p>
                    <p className="text-xs text-muted mt-0.5">For batch-level aging (FIFO/FEFO), add batches in the Batches tab when you receive stock.</p>
                  </div>
                  {(() => {
                    const now = new Date();
                    const productAging = products
                      .filter(p => p.stock > 0)
                      .map(p => {
                        const refDate = p.lastRestocked ? new Date(p.lastRestocked) : new Date(p.createdAt || now);
                        const ageDays = Math.floor((now - refDate) / (1000 * 60 * 60 * 24));
                        let bracket = '0-30 days';
                        if (ageDays > 180) bracket = '180+ days';
                        else if (ageDays > 90) bracket = '91-180 days';
                        else if (ageDays > 60) bracket = '61-90 days';
                        else if (ageDays > 30) bracket = '31-60 days';
                        return { ...p, ageDays, bracket, value: p.stock * (p.costPrice || 0) };
                      })
                      .sort((a, b) => b.ageDays - a.ageDays);

                    const bracketColors = { '0-30 days': 'text-emerald-400', '31-60 days': 'text-blue-400', '61-90 days': 'text-amber-400', '91-180 days': 'text-orange-400', '180+ days': 'text-red-400' };
                    const bracketBg = { '0-30 days': 'bg-emerald-500/10', '31-60 days': 'bg-blue-500/10', '61-90 days': 'bg-amber-500/10', '91-180 days': 'bg-orange-500/10', '180+ days': 'bg-red-500/10' };

                    return (
                      <>
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                          {['0-30 days', '31-60 days', '61-90 days', '91-180 days', '180+ days'].map(bracket => {
                            const items = productAging.filter(p => p.bracket === bracket);
                            const value = items.reduce((s, p) => s + p.value, 0);
                            return (
                              <div key={bracket} className="glass-card p-4">
                                <p className="text-xs text-muted">{bracket}</p>
                                <p className={`text-lg font-semibold ${bracketColors[bracket]}`}>₹{value.toLocaleString('en-IN')}</p>
                                <p className="text-xs text-muted">{items.length} products</p>
                              </div>
                            );
                          })}
                        </div>
                        <div className="glass-card overflow-hidden">
                          <table className="w-full text-sm">
                            <thead><tr className="border-b border-border">
                              {['Product', 'SKU', 'Category', 'Last Restocked', 'Age (Days)', 'Bracket', 'Stock', 'Value'].map(h => <th key={h} className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">{h}</th>)}
                            </tr></thead>
                            <tbody>
                              {productAging.length === 0
                                ? <tr><td colSpan={8} className="text-center py-12 text-muted">No in-stock products found.</td></tr>
                                : productAging.map((p, i) => (
                                  <tr key={i} className="border-b border-border/50 hover:bg-surface-hover transition-colors">
                                    <td className="px-4 py-3 text-foreground font-medium">{p.name}</td>
                                    <td className="px-4 py-3 text-muted font-mono text-xs">{p.sku}</td>
                                    <td className="px-4 py-3 text-muted">{p.category || '—'}</td>
                                    <td className="px-4 py-3 text-muted">{p.lastRestocked ? new Date(p.lastRestocked).toLocaleDateString('en-IN') : 'Not recorded'}</td>
                                    <td className="px-4 py-3 text-foreground">{p.ageDays}d</td>
                                    <td className="px-4 py-3">
                                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${bracketBg[p.bracket]} ${bracketColors[p.bracket]}`}>{p.bracket}</span>
                                    </td>
                                    <td className="px-4 py-3 text-foreground">{p.stock}</td>
                                    <td className="px-4 py-3 text-foreground">₹{p.value.toLocaleString('en-IN')}</td>
                                  </tr>
                                ))
                              }
                            </tbody>
                          </table>
                        </div>
                      </>
                    );
                  })()}
                </>
              )}
            </>
          )}
        </div>
      )}

      {/* Add Product Modal */}
      <Modal isOpen={showAddModal} onClose={() => { setShowAddModal(false); setProductImages([]); }} title="Add New Product">
        <form className="space-y-4" onSubmit={async (e) => {
          e.preventDefault();
          setAddingProduct(true);
          const f = e.target;
          // Upload images first
          let imageUrl = '';
          if (productImages.length > 0) {
            const formData = new FormData();
            formData.set('folder', 'products');
            productImages.forEach(p => formData.append('files', p.file));
            try {
              const uploadRes = await fetch('/api/upload', { method: 'POST', body: formData });
              const uploadData = await uploadRes.json();
              if (uploadData.success && uploadData.urls.length > 0) {
                imageUrl = uploadData.urls.join(',');
              }
            } catch (err) { console.error('Image upload failed:', err); }
          }
          const selectedGodownId = f.godownId?.value ? Number(f.godownId.value) : undefined;
          const res = await createProduct({
            name: f.productName.value, sku: f.sku.value, category: f.category.value,
            price: Number(f.price.value), material: f.material.value, color: f.color.value,
            stock: Number(f.stock.value), reorderLevel: Number(f.reorderLevel.value),
            warehouse: f.warehouse.value, description: f.description.value, image: imageUrl || '',
            godownId: selectedGodownId,
          });
          if (res.success) { setShowAddModal(false); setProductImages([]); refreshProducts(); if (godownStocks.length > 0) loadLocationData(); }
          else if (res.error) alert(res.error);
          setAddingProduct(false);
        }}>
          {/* Product Images */}
          <div>
            <label className="block text-xs font-medium text-muted mb-1.5">Product Images</label>
            <div className="flex gap-3 flex-wrap">
              {productImages.map((img, i) => (
                <div key={i} className="relative w-20 h-20 rounded-xl overflow-hidden border border-border group">
                  <img src={img.preview} alt="" className="w-full h-full object-cover" />
                  <button type="button" onClick={() => { URL.revokeObjectURL(img.preview); setProductImages(prev => prev.filter((_, j) => j !== i)); }}
                    className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity">×</button>
                </div>
              ))}
              {productImages.length < 5 && (
                <label className="w-20 h-20 rounded-xl border-2 border-dashed border-border hover:border-accent/50 flex flex-col items-center justify-center cursor-pointer transition-colors">
                  <Plus className="w-5 h-5 text-muted" />
                  <span className="text-[10px] text-muted mt-0.5">Add</span>
                  <input type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden" onChange={(e) => {
                    const files = Array.from(e.target.files || []);
                    if (productImages.length + files.length > 5) { alert('Maximum 5 images'); return; }
                    const previews = files.map(f => ({ file: f, preview: URL.createObjectURL(f) }));
                    setProductImages(prev => [...prev, ...previews]);
                    e.target.value = '';
                  }} />
                </label>
              )}
            </div>
            <p className="text-[10px] text-muted mt-1">Upload up to 5 images (JPG, PNG, WebP · max 10MB each)</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-muted mb-1.5">Product Name</label>
              <input type="text" name="productName" required placeholder="e.g., Royal L-Shaped Sofa" className="w-full" />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted mb-1.5">SKU Code</label>
              <input type="text" name="sku" required placeholder="e.g., SOF-005" className="w-full" />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-muted mb-1.5">Category</label>
              <input type="text" name="category" required placeholder="e.g., Sofas, Beds, Tables" className="w-full" list="categoryList" />
              <datalist id="categoryList">
                {categories.filter(c => c !== 'All').map(c => <option key={c} value={c} />)}
              </datalist>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted mb-1.5">Price (₹)</label>
              <input type="number" name="price" required placeholder="0" className="w-full" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-muted mb-1.5">Material</label>
              <input type="text" name="material" placeholder="e.g., Sheesham Wood" className="w-full" />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted mb-1.5">Color</label>
              <input type="text" name="color" placeholder="e.g., Walnut" className="w-full" />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-muted mb-1.5">Stock Quantity</label>
              <input type="number" name="stock" placeholder="0" className="w-full" />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted mb-1.5">Reorder Level</label>
              <input type="number" name="reorderLevel" placeholder="5" className="w-full" />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted mb-1.5">Warehouse</label>
              <input type="text" name="warehouse" placeholder="e.g., Main Store" className="w-full" list="warehouseList" />
              <datalist id="warehouseList">
                {warehouses.filter(w => w !== 'All').map(w => <option key={w} value={w} />)}
              </datalist>
            </div>
          </div>
          {/* Receiving Godown — where the initial stock goes (like Odoo's target warehouse) */}
          {godowns.length > 0 && (
            <div className="p-3 bg-accent/5 border border-accent/20 rounded-xl">
              <label className="block text-xs font-medium text-foreground mb-1.5 flex items-center gap-1.5">
                <Warehouse className="w-3.5 h-3.5 text-accent" /> Receiving Godown / Location *
              </label>
              <select name="godownId" required className="w-full px-3 py-2.5 bg-surface border border-border rounded-xl text-sm text-foreground">
                <option value="">Select godown where stock will be stored</option>
                {godowns.map(g => (
                  <option key={g.id} value={g.id}>
                    {g.name} {g.isDefault ? '⭐ (Default)' : ''} — {g.branch?.name || 'Unassigned'}
                  </option>
                ))}
              </select>
              <p className="text-[10px] text-muted mt-1">This is the physical location where the stock will be stored</p>
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-muted mb-1.5">Description</label>
            <textarea rows={3} name="description" placeholder="Product description..." className="w-full" />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => { setShowAddModal(false); setProductImages([]); }} className="px-4 py-2.5 rounded-xl text-sm text-muted hover:text-foreground hover:bg-surface-hover transition-colors">Cancel</button>
            <button type="submit" disabled={addingProduct} className="px-6 py-2.5 bg-accent hover:bg-accent-hover disabled:bg-accent/50 text-white rounded-xl text-sm font-semibold transition-all flex items-center gap-2">
              {addingProduct ? <><RefreshCw className="w-4 h-4 animate-spin" /> Adding...</> : 'Add Product'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Stock Update Modal */}
      <Modal isOpen={!!showStockModal} onClose={() => setShowStockModal(null)} title="Update Stock" size="md">
        {showStockModal && (
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-xl bg-surface flex items-center justify-center overflow-hidden flex-shrink-0">
                {showStockModal.image && !showStockModal.image.includes('/') ? (
                  <span className="text-3xl">{showStockModal.image}</span>
                ) : showStockModal.image ? (
                  <img src={showStockModal.image.split(',')[0]} alt={showStockModal.name} className="w-full h-full object-cover" />
                ) : (
                  <Package className="w-8 h-8 text-muted/30" />
                )}
              </div>
              <div>
                <h3 className="font-semibold text-foreground">{showStockModal.name}</h3>
                <p className="text-xs text-muted font-mono">{showStockModal.sku} · {showStockModal.warehouse}</p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="bg-surface rounded-xl p-3 text-center">
                <p className="text-xl font-bold text-foreground">{showStockModal.stock}</p>
                <p className="text-[10px] text-muted">Current Stock</p>
              </div>
              <div className="bg-surface rounded-xl p-3 text-center">
                <p className="text-xl font-bold text-foreground">{showStockModal.reorderLevel}</p>
                <p className="text-[10px] text-muted">Reorder Level</p>
              </div>
              <div className="bg-surface rounded-xl p-3 text-center">
                <p className="text-xl font-bold text-foreground">{showStockModal.sold}</p>
                <p className="text-[10px] text-muted">Total Sold</p>
              </div>
            </div>

            {/* Godown distribution */}
            {(() => {
              const gdStocks = godownStocks.filter(gs => gs.productId === showStockModal.id);
              return gdStocks.length > 0 ? (
                <div>
                  <p className="text-xs font-medium text-muted mb-2">Stock by Location</p>
                  <div className="grid grid-cols-2 gap-2">
                    {gdStocks.map(gs => (
                      <div key={gs.id} className="bg-surface rounded-lg p-2 flex items-center justify-between">
                        <span className="text-xs text-foreground flex items-center gap-1"><Warehouse className="w-3 h-3 text-muted" /> {gs.godown?.name}</span>
                        <span className={`text-sm font-bold ${gs.quantity <= 0 ? 'text-red-400' : 'text-foreground'}`}>{gs.quantity}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null;
            })()}

            {/* Target Godown — where to adjust stock (like Odoo's stock.move) */}
            {godowns.length > 0 && (
              <div className="p-3 bg-accent/5 border border-accent/20 rounded-xl">
                <label className="block text-xs font-medium text-foreground mb-1.5 flex items-center gap-1.5">
                  <Warehouse className="w-3.5 h-3.5 text-accent" /> Target Godown / Location *
                </label>
                <select id="stockGodownId" className="w-full px-3 py-2.5 bg-surface border border-border rounded-xl text-sm text-foreground">
                  <option value="">Select godown to adjust</option>
                  {(() => {
                    const gdStocksForProduct = godownStocks.filter(gs => gs.productId === showStockModal.id);
                    return godowns.map(g => {
                      const gdStock = gdStocksForProduct.find(gs => gs.godownId === g.id);
                      return (
                        <option key={g.id} value={g.id}>
                          {g.name} {g.isDefault ? '⭐' : ''} — Current: {gdStock?.quantity || 0} units
                        </option>
                      );
                    });
                  })()}
                </select>
                <p className="text-[10px] text-muted mt-1">Select the physical location where stock will be added/removed</p>
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-muted mb-1.5">Stock Adjustment</label>
              <div className="flex gap-2">
                <select id="stockAdjType" className="px-3 py-2.5 bg-surface border border-border rounded-xl text-sm text-foreground">
                  <option>Add Stock</option>
                  <option>Remove Stock</option>
                  <option>Set Stock</option>
                </select>
                <input id="stockQty" type="number" placeholder="Quantity" min="0" className="flex-1 px-4 py-2.5 bg-surface border border-border rounded-xl text-sm text-foreground placeholder:text-muted focus:outline-none focus:border-accent/50" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-muted mb-1.5">Reason</label>
              <select className="w-full px-4 py-2.5 bg-surface border border-border rounded-xl text-sm text-foreground">
                <option>New shipment received</option>
                <option>Returned by customer</option>
                <option>Damaged / Write-off</option>
                <option>Transferred between warehouses</option>
                <option>Stock count correction</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-muted mb-1.5">Notes</label>
              <textarea rows={2} placeholder="Optional notes..." className="w-full px-4 py-2.5 bg-surface border border-border rounded-xl text-sm text-foreground placeholder:text-muted focus:outline-none focus:border-accent/50 resize-none" />
            </div>

            <button onClick={async () => {
              const adjType = document.querySelector('#stockAdjType')?.value;
              const qty = Number(document.querySelector('#stockQty')?.value || 0);
              const selectedGodownId = document.querySelector('#stockGodownId')?.value;
              if (godowns.length > 0 && !selectedGodownId) { alert('Please select a godown / location'); return; }

              // For godown-aware mode: the stock value is per-godown, not per-product
              const gdStock = selectedGodownId ? godownStocks.find(gs => gs.productId === showStockModal.id && gs.godownId === Number(selectedGodownId)) : null;
              const currentGdQty = gdStock?.quantity || 0;
              let newStock;
              if (adjType === 'Add Stock') newStock = currentGdQty + qty;
              else if (adjType === 'Remove Stock') newStock = Math.max(0, currentGdQty - qty);
              else newStock = qty;

              await updateStock({ id: showStockModal.id, stock: newStock, godownId: selectedGodownId ? Number(selectedGodownId) : undefined });
              setShowStockModal(null);
              refreshProducts();
              if (godownStocks.length > 0) loadLocationData();
            }} className="w-full py-2.5 bg-accent hover:bg-accent-hover text-white rounded-xl text-sm font-semibold transition-all">
              Update Stock
            </button>
          </div>
        )}
      </Modal>
    </div>
  );
}
