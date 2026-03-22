'use client';

import { useState, useMemo } from 'react';
import {
  Search, Plus, Receipt, DollarSign, CreditCard, Banknote,
  FileText, Printer, Download, Trash2, ShoppingBag,
  Percent, Calculator, CheckCircle2, Clock, AlertCircle,
  X, ChevronDown, Package,
} from 'lucide-react';
import Modal from '@/components/Modal';
import { invoices, paymentMethods } from '@/data/invoices';
import { products } from '@/data/products';

const paymentStatusColors = {
  Paid: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20',
  Partial: 'bg-amber-500/10 text-amber-700 border-amber-500/20',
  Pending: 'bg-red-500/10 text-red-700 border-red-500/20',
};

const paymentMethodIcons = {
  Cash: Banknote,
  UPI: CreditCard,
  Card: CreditCard,
  EMI: Calculator,
  'Bank Transfer': DollarSign,
  Cheque: FileText,
};

export default function BillingPage() {
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState('invoices');
  const [showCreateInvoice, setShowCreateInvoice] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState(null);

  // POS state
  const [posItems, setPosItems] = useState([]);
  const [posCustomer, setPosCustomer] = useState({ name: '', phone: '' });
  const [posDiscount, setPosDiscount] = useState(0);
  const [posDiscountType, setPosDiscountType] = useState('flat');
  const [posPaymentMethod, setPosPaymentMethod] = useState('UPI');
  const [productSearch, setProductSearch] = useState('');

  const filtered = useMemo(() => invoices.filter(inv =>
    inv.customer.toLowerCase().includes(search.toLowerCase()) ||
    inv.id.toLowerCase().includes(search.toLowerCase()) ||
    inv.salesperson.toLowerCase().includes(search.toLowerCase())
  ), [search]);

  const totalBilled = invoices.reduce((s, i) => s + i.total, 0);
  const totalPaid = invoices.filter(i => i.paymentStatus === 'Paid').reduce((s, i) => s + i.total, 0);
  const totalPending = invoices.filter(i => i.paymentStatus !== 'Paid').reduce((s, i) => s + i.total, 0);

  // POS calculations
  const posSubtotal = posItems.reduce((s, item) => s + item.price * item.qty, 0);
  const posDiscountAmount = posDiscountType === 'percent' ? Math.round(posSubtotal * posDiscount / 100) : posDiscount;
  const posAfterDiscount = posSubtotal - posDiscountAmount;
  const posGst = Math.round(posAfterDiscount * 0.18);
  const posTotal = posAfterDiscount + posGst;

  const filteredProducts = products.filter(p =>
    p.name.toLowerCase().includes(productSearch.toLowerCase()) && p.stock > 0
  );

  const addToPOS = (product) => {
    const existing = posItems.find(i => i.id === product.id);
    if (existing) {
      if (existing.qty < product.stock) {
        setPosItems(posItems.map(i => i.id === product.id ? { ...i, qty: i.qty + 1 } : i));
      }
    } else {
      setPosItems([...posItems, { id: product.id, name: product.name, price: product.price, qty: 1, stock: product.stock }]);
    }
    setProductSearch('');
  };

  const updateQty = (id, qty) => {
    if (qty < 1) {
      setPosItems(posItems.filter(i => i.id !== id));
    } else {
      const item = posItems.find(i => i.id === id);
      if (item && qty <= item.stock) {
        setPosItems(posItems.map(i => i.id === id ? { ...i, qty } : i));
      }
    }
  };

  const removeFromPOS = (id) => {
    setPosItems(posItems.filter(i => i.id !== id));
  };

  const clearPOS = () => {
    setPosItems([]);
    setPosCustomer({ name: '', phone: '' });
    setPosDiscount(0);
    setPosDiscountType('flat');
    setPosPaymentMethod('UPI');
  };

  return (
    <div className="space-y-6 animate-[fade-in_0.3s_ease]">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Billing & POS</h1>
          <p className="text-sm text-muted mt-1">Create invoices, manage payments & generate bills</p>
        </div>
        <button onClick={() => setTab('pos')} className="flex items-center gap-2 px-4 py-2.5 bg-accent hover:bg-accent-hover text-white rounded-xl text-sm font-semibold transition-all">
          <Plus className="w-4 h-4" /> New Invoice
        </button>
      </div>

      {/* Tabs */}
      <div className="flex bg-surface rounded-xl border border-border p-0.5 w-fit">
        <button onClick={() => setTab('invoices')} className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium transition-all ${tab === 'invoices' ? 'bg-accent text-white' : 'text-muted hover:text-foreground'}`}>
          <Receipt className="w-3.5 h-3.5" /> Invoices
        </button>
        <button onClick={() => setTab('pos')} className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium transition-all ${tab === 'pos' ? 'bg-accent text-white' : 'text-muted hover:text-foreground'}`}>
          <Calculator className="w-3.5 h-3.5" /> POS
        </button>
      </div>

      {/* ─── INVOICES TAB ─── */}
      {tab === 'invoices' && (
        <>
          {/* Stats */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="glass-card p-4 flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-accent-light"><Receipt className="w-5 h-5 text-accent" /></div>
              <div><p className="text-xs text-muted">Total Invoices</p><p className="text-lg font-bold text-foreground">{invoices.length}</p></div>
            </div>
            <div className="glass-card p-4 flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-success-light"><DollarSign className="w-5 h-5 text-success" /></div>
              <div><p className="text-xs text-muted">Total Billed</p><p className="text-lg font-bold text-success">₹{(totalBilled / 1000).toFixed(0)}K</p></div>
            </div>
            <div className="glass-card p-4 flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-emerald-500/10"><CheckCircle2 className="w-5 h-5 text-emerald-700" /></div>
              <div><p className="text-xs text-muted">Collected</p><p className="text-lg font-bold text-emerald-700">₹{(totalPaid / 1000).toFixed(0)}K</p></div>
            </div>
            <div className="glass-card p-4 flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-warning-light"><Clock className="w-5 h-5 text-warning" /></div>
              <div><p className="text-xs text-muted">Pending</p><p className="text-lg font-bold text-warning">₹{(totalPending / 1000).toFixed(0)}K</p></div>
            </div>
          </div>

          {/* Search */}
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
            <input type="text" placeholder="Search invoices..." value={search} onChange={e => setSearch(e.target.value)} className="w-full pl-10 pr-4 py-2.5 bg-surface rounded-xl border border-border text-sm" />
          </div>

          {/* Invoice Table */}
          <div className="glass-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="crm-table">
                <thead>
                  <tr>
                    <th>Invoice</th>
                    <th>Customer</th>
                    <th>Items</th>
                    <th>Subtotal</th>
                    <th>Discount</th>
                    <th>GST (18%)</th>
                    <th>Total</th>
                    <th>Payment</th>
                    <th>Status</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(inv => {
                    const MethodIcon = paymentMethodIcons[inv.paymentMethod] || CreditCard;
                    return (
                      <tr key={inv.id} className="cursor-pointer" onClick={() => setSelectedInvoice(inv)}>
                        <td className="font-mono text-accent font-medium">{inv.id}</td>
                        <td>
                          <div>
                            <p className="font-medium text-foreground">{inv.customer}</p>
                            <p className="text-xs text-muted">{inv.phone}</p>
                          </div>
                        </td>
                        <td className="text-sm">{inv.items.map(i => `${i.name}${i.qty > 1 ? ` x${i.qty}` : ''}`).join(', ')}</td>
                        <td>₹{inv.subtotal.toLocaleString()}</td>
                        <td className={inv.discount > 0 ? 'text-success' : 'text-muted'}>{inv.discount > 0 ? `-₹${inv.discount.toLocaleString()}` : '-'}</td>
                        <td>₹{inv.gst.toLocaleString()}</td>
                        <td className="font-semibold text-foreground">₹{inv.total.toLocaleString()}</td>
                        <td>
                          <span className="flex items-center gap-1.5 text-xs text-muted">
                            <MethodIcon className="w-3.5 h-3.5" /> {inv.paymentMethod}
                          </span>
                        </td>
                        <td>
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${paymentStatusColors[inv.paymentStatus]}`}>{inv.paymentStatus}</span>
                        </td>
                        <td className="text-muted">{inv.date}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ─── POS TAB ─── */}
      {tab === 'pos' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Product Selection */}
          <div className="lg:col-span-2 space-y-4">
            <div className="glass-card p-4">
              <h3 className="text-sm font-semibold text-foreground mb-3">Add Products</h3>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
                <input type="text" placeholder="Search products to add..." value={productSearch} onChange={e => setProductSearch(e.target.value)} className="w-full pl-10 pr-4 py-2.5 bg-surface rounded-xl border border-border text-sm" />
              </div>
              {productSearch && (
                <div className="mt-2 bg-surface border border-border rounded-xl max-h-[200px] overflow-y-auto">
                  {filteredProducts.slice(0, 8).map(p => (
                    <button key={p.id} onClick={() => addToPOS(p)} className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-surface-hover transition-colors text-left border-b border-border last:border-0">
                      <div className="flex items-center gap-3">
                        <span className="text-xl">{p.image}</span>
                        <div>
                          <p className="text-sm font-medium text-foreground">{p.name}</p>
                          <p className="text-xs text-muted">{p.category} · Stock: {p.stock}</p>
                        </div>
                      </div>
                      <span className="text-sm font-semibold text-accent">₹{p.price.toLocaleString()}</span>
                    </button>
                  ))}
                  {filteredProducts.length === 0 && <p className="text-center text-muted text-xs py-4">No products found</p>}
                </div>
              )}
            </div>

            {/* Cart Items */}
            <div className="glass-card p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <ShoppingBag className="w-4 h-4 text-accent" /> Cart ({posItems.length} items)
                </h3>
                {posItems.length > 0 && (
                  <button onClick={clearPOS} className="text-xs text-red-700 hover:text-red-300 transition-colors">Clear All</button>
                )}
              </div>

              {posItems.length === 0 ? (
                <div className="text-center py-10 text-muted">
                  <Package className="w-10 h-10 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">Search and add products to create an invoice</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {posItems.map(item => (
                    <div key={item.id} className="flex items-center justify-between bg-surface rounded-xl p-3">
                      <div className="flex-1">
                        <p className="text-sm font-medium text-foreground">{item.name}</p>
                        <p className="text-xs text-muted">₹{item.price.toLocaleString()} each</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1">
                          <button onClick={() => updateQty(item.id, item.qty - 1)} className="w-7 h-7 rounded-lg bg-surface-hover border border-border flex items-center justify-center text-sm text-muted hover:text-foreground transition-colors">-</button>
                          <span className="w-8 text-center text-sm font-medium text-foreground">{item.qty}</span>
                          <button onClick={() => updateQty(item.id, item.qty + 1)} className="w-7 h-7 rounded-lg bg-surface-hover border border-border flex items-center justify-center text-sm text-muted hover:text-foreground transition-colors">+</button>
                        </div>
                        <span className="text-sm font-semibold text-foreground w-24 text-right">₹{(item.price * item.qty).toLocaleString()}</span>
                        <button onClick={() => removeFromPOS(item.id)} className="p-1.5 rounded-lg hover:bg-red-500/10 text-muted hover:text-red-700 transition-colors">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Bill Summary */}
          <div className="space-y-4">
            {/* Customer */}
            <div className="glass-card p-4">
              <h3 className="text-sm font-semibold text-foreground mb-3">Customer Details</h3>
              <div className="space-y-3">
                <input type="text" placeholder="Customer name *" value={posCustomer.name} onChange={e => setPosCustomer({ ...posCustomer, name: e.target.value })} className="w-full px-4 py-2.5 bg-surface border border-border rounded-xl text-sm text-foreground placeholder:text-muted focus:outline-none focus:border-accent/50" />
                <input type="text" placeholder="Phone number *" value={posCustomer.phone} onChange={e => setPosCustomer({ ...posCustomer, phone: e.target.value })} className="w-full px-4 py-2.5 bg-surface border border-border rounded-xl text-sm text-foreground placeholder:text-muted focus:outline-none focus:border-accent/50" />
              </div>
            </div>

            {/* Discount */}
            <div className="glass-card p-4">
              <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                <Percent className="w-4 h-4 text-accent" /> Discount
              </h3>
              <div className="flex gap-2 mb-3">
                <button onClick={() => setPosDiscountType('flat')} className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-all border ${posDiscountType === 'flat' ? 'bg-accent/20 text-accent border-accent/30' : 'bg-surface border-border text-muted'}`}>₹ Flat</button>
                <button onClick={() => setPosDiscountType('percent')} className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-all border ${posDiscountType === 'percent' ? 'bg-accent/20 text-accent border-accent/30' : 'bg-surface border-border text-muted'}`}>% Percent</button>
              </div>
              <input type="number" min="0" placeholder="Enter discount" value={posDiscount || ''} onChange={e => setPosDiscount(Number(e.target.value) || 0)} className="w-full px-4 py-2.5 bg-surface border border-border rounded-xl text-sm text-foreground placeholder:text-muted focus:outline-none focus:border-accent/50" />
            </div>

            {/* Payment Method */}
            <div className="glass-card p-4">
              <h3 className="text-sm font-semibold text-foreground mb-3">Payment Method</h3>
              <div className="grid grid-cols-3 gap-2">
                {paymentMethods.map(method => (
                  <button key={method} onClick={() => setPosPaymentMethod(method)} className={`py-2 rounded-lg text-xs font-medium transition-all border ${posPaymentMethod === method ? 'bg-accent/20 text-accent border-accent/30' : 'bg-surface border-border text-muted hover:text-foreground'}`}>
                    {method}
                  </button>
                ))}
              </div>
            </div>

            {/* Bill Total */}
            <div className="glass-card p-4">
              <h3 className="text-sm font-semibold text-foreground mb-3">Bill Summary</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-muted">Subtotal</span><span className="text-foreground">₹{posSubtotal.toLocaleString()}</span></div>
                {posDiscountAmount > 0 && (
                  <div className="flex justify-between"><span className="text-muted">Discount {posDiscountType === 'percent' ? `(${posDiscount}%)` : ''}</span><span className="text-success">-₹{posDiscountAmount.toLocaleString()}</span></div>
                )}
                <div className="flex justify-between"><span className="text-muted">GST (18%)</span><span className="text-foreground">₹{posGst.toLocaleString()}</span></div>
                <div className="flex justify-between text-base font-bold pt-2 border-t border-border">
                  <span className="text-foreground">Total</span>
                  <span className="text-accent">₹{posTotal.toLocaleString()}</span>
                </div>
              </div>
            </div>

            {/* Actions */}
            <button
              disabled={posItems.length === 0 || !posCustomer.name}
              className="w-full py-3 bg-accent hover:bg-accent-hover text-white rounded-xl text-sm font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              <Receipt className="w-4 h-4" /> Generate Invoice
            </button>
            <button
              disabled={posItems.length === 0}
              className="w-full py-2.5 bg-surface border border-border text-foreground rounded-xl text-sm font-medium hover:border-accent/30 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              <Printer className="w-4 h-4" /> Print Bill
            </button>
          </div>
        </div>
      )}

      {/* Invoice Detail Modal */}
      <Modal isOpen={!!selectedInvoice} onClose={() => setSelectedInvoice(null)} title="Invoice Details" size="lg">
        {selectedInvoice && (
          <div className="space-y-4">
            {/* Invoice header */}
            <div className="border border-border rounded-xl p-5 bg-surface">
              <div className="flex items-center justify-between mb-4 pb-4 border-b border-border">
                <div>
                  <h3 className="text-xl font-bold text-accent">FurnitureCRM Store</h3>
                  <p className="text-xs text-muted">Premium Furniture | Smart Store Manager</p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold text-foreground">{selectedInvoice.id}</p>
                  <p className="text-xs text-muted">{selectedInvoice.date} · {selectedInvoice.time}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <p className="text-xs text-muted mb-1">Bill To</p>
                  <p className="text-sm font-medium text-foreground">{selectedInvoice.customer}</p>
                  <p className="text-xs text-muted">{selectedInvoice.phone}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted mb-1">Salesperson</p>
                  <p className="text-sm font-medium text-foreground">{selectedInvoice.salesperson}</p>
                </div>
              </div>

              {/* Items */}
              <table className="w-full text-sm mb-4">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2 text-xs text-muted font-medium">Item</th>
                    <th className="text-center py-2 text-xs text-muted font-medium">SKU</th>
                    <th className="text-center py-2 text-xs text-muted font-medium">Qty</th>
                    <th className="text-right py-2 text-xs text-muted font-medium">Price</th>
                    <th className="text-right py-2 text-xs text-muted font-medium">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedInvoice.items.map((item, idx) => (
                    <tr key={idx} className="border-b border-border/50">
                      <td className="py-2 text-foreground">{item.name}</td>
                      <td className="py-2 text-center text-muted font-mono text-xs">{item.sku}</td>
                      <td className="py-2 text-center text-foreground">{item.qty}</td>
                      <td className="py-2 text-right text-foreground">₹{item.price.toLocaleString()}</td>
                      <td className="py-2 text-right font-medium text-foreground">₹{(item.price * item.qty).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Totals */}
              <div className="space-y-2 text-sm pt-2">
                <div className="flex justify-between"><span className="text-muted">Subtotal</span><span className="text-foreground">₹{selectedInvoice.subtotal.toLocaleString()}</span></div>
                {selectedInvoice.discount > 0 && (
                  <div className="flex justify-between"><span className="text-muted">Discount</span><span className="text-success">-₹{selectedInvoice.discount.toLocaleString()}</span></div>
                )}
                <div className="flex justify-between"><span className="text-muted">GST (18%)</span><span className="text-foreground">₹{selectedInvoice.gst.toLocaleString()}</span></div>
                <div className="flex justify-between text-base font-bold pt-2 border-t border-border">
                  <span className="text-foreground">Total</span>
                  <span className="text-accent">₹{selectedInvoice.total.toLocaleString()}</span>
                </div>
              </div>

              {/* Payment */}
              <div className="flex items-center justify-between mt-4 pt-3 border-t border-border">
                <span className="text-xs text-muted">Payment: {selectedInvoice.paymentMethod}</span>
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${paymentStatusColors[selectedInvoice.paymentStatus]}`}>{selectedInvoice.paymentStatus}</span>
              </div>

              {selectedInvoice.notes && (
                <div className="mt-3 pt-3 border-t border-border">
                  <p className="text-xs text-muted">Notes: {selectedInvoice.notes}</p>
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <button className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-accent/10 text-accent border border-accent/20 rounded-xl text-sm font-medium hover:bg-accent/20 transition-colors">
                <Printer className="w-4 h-4" /> Print
              </button>
              <button className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-surface border border-border rounded-xl text-sm font-medium text-foreground hover:border-accent/30 transition-colors">
                <Download className="w-4 h-4" /> Download PDF
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
