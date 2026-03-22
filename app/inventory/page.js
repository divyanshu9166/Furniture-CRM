'use client';

import { useState, useMemo } from 'react';
import {
  Search, Plus, Package, AlertTriangle, TrendingUp, Grid3x3, List,
  Warehouse, QrCode, RefreshCw, ArrowDown, ArrowUp, Bell,
  CheckCircle2, XCircle, Clock,
} from 'lucide-react';
import { products, categories, warehouses } from '@/data/products';
import Modal from '@/components/Modal';

const stockBadge = (stock, reorderLevel) => {
  if (stock === 0) return { text: 'Out of Stock', cls: 'bg-danger-light text-danger' };
  if (stock <= reorderLevel) return { text: 'Low Stock', cls: 'bg-warning-light text-warning' };
  return { text: 'In Stock', cls: 'bg-success-light text-success' };
};

export default function InventoryPage() {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [warehouseFilter, setWarehouseFilter] = useState('All');
  const [view, setView] = useState('grid');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showStockModal, setShowStockModal] = useState(null);
  const [tab, setTab] = useState('products');

  const filtered = useMemo(() => products.filter(p =>
    (category === 'All' || p.category === category) &&
    (warehouseFilter === 'All' || p.warehouse === warehouseFilter) &&
    (p.name.toLowerCase().includes(search.toLowerCase()) || p.category.toLowerCase().includes(search.toLowerCase()) || p.sku.toLowerCase().includes(search.toLowerCase()))
  ), [category, warehouseFilter, search]);

  const totalStock = products.reduce((sum, p) => sum + p.stock, 0);
  const lowStockItems = products.filter(p => p.stock > 0 && p.stock <= p.reorderLevel);
  const outOfStockItems = products.filter(p => p.stock === 0);
  const totalValue = products.reduce((sum, p) => sum + (p.price * p.stock), 0);
  const needsReorder = [...lowStockItems, ...outOfStockItems].sort((a, b) => a.stock - b.stock);

  return (
    <div className="space-y-6 animate-[fade-in_0.5s_ease-out]">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-foreground">Inventory & Warehouse</h1>
          <p className="text-xs md:text-sm text-muted mt-1">{products.length} products · {totalStock} total units across locations</p>
        </div>
        <button onClick={() => setShowAddModal(true)} className="flex items-center gap-2 px-4 py-2.5 bg-accent hover:bg-accent-hover text-white rounded-xl text-sm font-semibold transition-all">
          <Plus className="w-4 h-4" /> Add Product
        </button>
      </div>

      {/* Tabs */}
      <div className="flex bg-surface rounded-xl border border-border p-0.5 w-fit">
        <button onClick={() => setTab('products')} className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium transition-all ${tab === 'products' ? 'bg-accent text-white' : 'text-muted hover:text-foreground'}`}>
          <Package className="w-3.5 h-3.5" /> Products
        </button>
        <button onClick={() => setTab('alerts')} className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium transition-all ${tab === 'alerts' ? 'bg-accent text-white' : 'text-muted hover:text-foreground'}`}>
          <Bell className="w-3.5 h-3.5" /> Stock Alerts
          {needsReorder.length > 0 && (
            <span className="w-5 h-5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">{needsReorder.length}</span>
          )}
        </button>
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
              <div><p className="text-xs text-muted">Locations</p><p className="text-lg font-bold text-foreground">{warehouses.length - 1}</p></div>
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
            <div className="flex gap-1 overflow-x-auto hide-scrollbar">
              {warehouses.map(w => (
                <button key={w} onClick={() => setWarehouseFilter(w)} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1 flex-shrink-0 ${warehouseFilter === w ? 'bg-accent text-white' : 'text-muted hover:text-foreground hover:bg-surface-hover'}`}>
                  {w !== 'All' && <Warehouse className="w-3 h-3" />}{w}
                </button>
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
                return (
                  <div key={product.id} className="glass-card overflow-hidden group hover:scale-[1.02] transition-transform cursor-pointer" onClick={() => setShowStockModal(product)}>
                    <div className="h-32 bg-surface flex items-center justify-center text-5xl relative">
                      {product.image}
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
                      <p className="text-[10px] text-muted mb-3 flex items-center gap-1"><Warehouse className="w-3 h-3" /> {product.warehouse}</p>
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
                      <th>Reorder At</th>
                      <th>Sold</th>
                      <th>Warehouse</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(product => {
                      const badge = stockBadge(product.stock, product.reorderLevel);
                      return (
                        <tr key={product.id} className="cursor-pointer" onClick={() => setShowStockModal(product)}>
                          <td>
                            <div className="flex items-center gap-3">
                              <span className="text-2xl">{product.image}</span>
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
                          <td className="text-muted">{product.reorderLevel}</td>
                          <td>{product.sold}</td>
                          <td>
                            <span className="text-xs text-muted flex items-center gap-1"><Warehouse className="w-3 h-3" /> {product.warehouse}</span>
                          </td>
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
                              <span className="text-xl">{product.image}</span>
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
                            <button className="px-3 py-1.5 rounded-lg bg-accent/10 text-accent text-xs font-medium hover:bg-accent/20 transition-colors border border-accent/20">
                              Reorder
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

      {/* Add Product Modal */}
      <Modal isOpen={showAddModal} onClose={() => setShowAddModal(false)} title="Add New Product">
        <form className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-muted mb-1.5">Product Name</label>
              <input type="text" placeholder="e.g., Royal L-Shaped Sofa" className="w-full" />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted mb-1.5">SKU Code</label>
              <input type="text" placeholder="e.g., SOF-005" className="w-full" />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-muted mb-1.5">Category</label>
              <select className="w-full">
                {categories.filter(c => c !== 'All').map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted mb-1.5">Price (₹)</label>
              <input type="number" placeholder="0" className="w-full" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-muted mb-1.5">Material</label>
              <input type="text" placeholder="e.g., Sheesham Wood" className="w-full" />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted mb-1.5">Color</label>
              <input type="text" placeholder="e.g., Walnut" className="w-full" />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-muted mb-1.5">Stock Quantity</label>
              <input type="number" placeholder="0" className="w-full" />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted mb-1.5">Reorder Level</label>
              <input type="number" placeholder="5" className="w-full" />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted mb-1.5">Warehouse</label>
              <select className="w-full">
                {warehouses.filter(w => w !== 'All').map(w => <option key={w}>{w}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-muted mb-1.5">Description</label>
            <textarea rows={3} placeholder="Product description..." className="w-full" />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setShowAddModal(false)} className="px-4 py-2.5 rounded-xl text-sm text-muted hover:text-foreground hover:bg-surface-hover transition-colors">Cancel</button>
            <button type="submit" className="px-6 py-2.5 bg-accent hover:bg-accent-hover text-white rounded-xl text-sm font-semibold transition-all">Add Product</button>
          </div>
        </form>
      </Modal>

      {/* Stock Update Modal */}
      <Modal isOpen={!!showStockModal} onClose={() => setShowStockModal(null)} title="Update Stock" size="md">
        {showStockModal && (
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <span className="text-4xl">{showStockModal.image}</span>
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

            <div>
              <label className="block text-xs font-medium text-muted mb-1.5">Stock Adjustment</label>
              <div className="flex gap-2">
                <select className="px-3 py-2.5 bg-surface border border-border rounded-xl text-sm text-foreground">
                  <option>Add Stock</option>
                  <option>Remove Stock</option>
                  <option>Set Stock</option>
                </select>
                <input type="number" placeholder="Quantity" min="0" className="flex-1 px-4 py-2.5 bg-surface border border-border rounded-xl text-sm text-foreground placeholder:text-muted focus:outline-none focus:border-accent/50" />
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

            <button onClick={() => setShowStockModal(null)} className="w-full py-2.5 bg-accent hover:bg-accent-hover text-white rounded-xl text-sm font-semibold transition-all">
              Update Stock
            </button>
          </div>
        )}
      </Modal>
    </div>
  );
}
