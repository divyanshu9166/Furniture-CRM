'use client'

import { useState, useEffect, useMemo } from 'react'
import {
  Search, Plus, Truck, Users, RotateCcw, CheckCircle, XCircle,
  Package, Eye, FileText, ArrowDownCircle, Clock, AlertTriangle
} from 'lucide-react'
import {
  getSuppliers, createSupplier, getPurchaseOrders, createPurchaseOrder,
  approvePurchaseOrder, receivePurchaseOrder, cancelPurchaseOrder,
  getPurchaseReturns, createPurchaseReturn, getPurchaseStats
} from '@/app/actions/purchases'
import { getProducts } from '@/app/actions/products'
import Modal from '@/components/Modal'

const poStatusColors = {
  DRAFT: 'bg-gray-500/10 text-gray-400',
  APPROVED: 'bg-blue-500/10 text-blue-400',
  PARTIALLY_RECEIVED: 'bg-amber-500/10 text-amber-400',
  RECEIVED: 'bg-emerald-500/10 text-emerald-400',
  CANCELLED: 'bg-red-500/10 text-red-400',
}

export default function PurchasesPage() {
  const [tab, setTab] = useState('orders')
  const [loading, setLoading] = useState(true)
  const [orders, setOrders] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [returns, setReturns] = useState([])
  const [products, setProducts] = useState([])
  const [stats, setStats] = useState(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('All')

  // Modals
  const [showSupplierModal, setShowSupplierModal] = useState(false)
  const [showPOModal, setShowPOModal] = useState(false)
  const [showReturnModal, setShowReturnModal] = useState(false)
  const [showDetailModal, setShowDetailModal] = useState(false)
  const [selectedPO, setSelectedPO] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  // Forms
  const [supplierForm, setSupplierForm] = useState({ name: '', phone: '', email: '', gstNumber: '', address: '', contactPerson: '', paymentTerms: 30 })
  const [poForm, setPOForm] = useState({ supplierId: '', notes: '', items: [{ productId: '', quantity: 1, unitCost: 0 }] })
  const [returnForm, setReturnForm] = useState({ poId: '', supplierId: '', reason: '', notes: '', items: [{ productId: '', quantity: 1, unitCost: 0 }] })

  const loadData = () => {
    setLoading(true)
    Promise.all([getPurchaseOrders(), getSuppliers(), getPurchaseReturns(), getProducts(), getPurchaseStats()])
      .then(([poRes, supRes, retRes, prodRes, statsRes]) => {
        if (poRes.success) setOrders(poRes.data)
        if (supRes.success) setSuppliers(supRes.data)
        if (retRes.success) setReturns(retRes.data)
        if (prodRes.success) setProducts(prodRes.data)
        if (statsRes.success) setStats(statsRes.data)
        setLoading(false)
      })
  }

  useEffect(() => { loadData() }, [])

  const filteredOrders = useMemo(() => orders.filter(o =>
    (statusFilter === 'All' || o.status === statusFilter) &&
    (o.displayId?.toLowerCase().includes(search.toLowerCase()) ||
     o.supplier?.name?.toLowerCase().includes(search.toLowerCase()))
  ), [orders, search, statusFilter])

  const filteredSuppliers = useMemo(() => suppliers.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.phone?.toLowerCase().includes(search.toLowerCase()) ||
    s.gstNumber?.toLowerCase().includes(search.toLowerCase())
  ), [suppliers, search])

  const handleCreateSupplier = async () => {
    setSubmitting(true)
    const res = await createSupplier({ ...supplierForm, paymentTerms: Number(supplierForm.paymentTerms) })
    if (res.success) {
      setShowSupplierModal(false)
      setSupplierForm({ name: '', phone: '', email: '', gstNumber: '', address: '', contactPerson: '', paymentTerms: 30 })
      loadData()
    } else alert(res.error)
    setSubmitting(false)
  }

  const handleCreatePO = async () => {
    setSubmitting(true)
    const items = poForm.items.filter(i => i.productId).map(i => {
      const prod = products.find(p => p.id === Number(i.productId))
      return { productId: Number(i.productId), name: prod?.name || '', sku: prod?.sku || '', hsnCode: prod?.hsnCode || '', quantity: Number(i.quantity), unitCost: Number(i.unitCost), gstRate: 18 }
    })
    const res = await createPurchaseOrder({ supplierId: Number(poForm.supplierId), notes: poForm.notes, items })
    if (res.success) {
      setShowPOModal(false)
      setPOForm({ supplierId: '', notes: '', items: [{ productId: '', quantity: 1, unitCost: 0 }] })
      loadData()
    } else alert(res.error)
    setSubmitting(false)
  }

  const handleApprovePO = async (id) => {
    const res = await approvePurchaseOrder(id)
    if (res.success) loadData()
    else alert(res.error)
  }

  const handleReceivePO = async (id) => {
    const res = await receivePurchaseOrder(id)
    if (res.success) loadData()
    else alert(res.error)
  }

  const handleCancelPO = async (id) => {
    if (!confirm('Cancel this purchase order?')) return
    const res = await cancelPurchaseOrder(id)
    if (res.success) loadData()
    else alert(res.error)
  }

  const handleCreateReturn = async () => {
    setSubmitting(true)
    const items = returnForm.items.filter(i => i.productId).map(i => {
      const prod = products.find(p => p.id === Number(i.productId))
      return { productId: Number(i.productId), name: prod?.name || '', sku: prod?.sku || '', quantity: Number(i.quantity), unitCost: Number(i.unitCost) }
    })
    const total = items.reduce((s, i) => s + i.quantity * i.unitCost, 0)
    const res = await createPurchaseReturn({
      poId: returnForm.poId ? Number(returnForm.poId) : undefined,
      supplierId: Number(returnForm.supplierId),
      reason: returnForm.reason, notes: returnForm.notes,
      totalAmount: total, items
    })
    if (res.success) {
      setShowReturnModal(false)
      setReturnForm({ poId: '', supplierId: '', reason: '', notes: '', items: [{ productId: '', quantity: 1, unitCost: 0 }] })
      loadData()
    } else alert(res.error)
    setSubmitting(false)
  }

  const addPOItem = () => setPOForm(f => ({ ...f, items: [...f.items, { productId: '', quantity: 1, unitCost: 0 }] }))
  const addReturnItem = () => setReturnForm(f => ({ ...f, items: [...f.items, { productId: '', quantity: 1, unitCost: 0 }] }))

  const tabs = [
    { id: 'orders', label: 'Purchase Orders', icon: FileText },
    { id: 'suppliers', label: 'Suppliers', icon: Users },
    { id: 'returns', label: 'Returns', icon: RotateCcw },
  ]

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent" /></div>

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Purchase Management</h1>
          <p className="text-muted text-sm mt-1">Manage suppliers, purchase orders & returns</p>
        </div>
        <div className="flex gap-2">
          {tab === 'orders' && <button onClick={() => setShowPOModal(true)} className="px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent/90 flex items-center gap-2"><Plus className="w-4 h-4" /> New PO</button>}
          {tab === 'suppliers' && <button onClick={() => setShowSupplierModal(true)} className="px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent/90 flex items-center gap-2"><Plus className="w-4 h-4" /> Add Supplier</button>}
          {tab === 'returns' && <button onClick={() => setShowReturnModal(true)} className="px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent/90 flex items-center gap-2"><Plus className="w-4 h-4" /> New Return</button>}
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Total POs', value: stats.totalPOs, icon: FileText, color: 'text-blue-400' },
            { label: 'Total Spent', value: `₹${(stats.totalSpent || 0).toLocaleString('en-IN')}`, icon: Truck, color: 'text-emerald-400' },
            { label: 'Pending', value: stats.pendingPOs, icon: Clock, color: 'text-amber-400' },
            { label: 'Suppliers', value: stats.totalSuppliers, icon: Users, color: 'text-purple-400' },
          ].map((s, i) => (
            <div key={i} className="glass-card p-4">
              <div className="flex items-center gap-3">
                <s.icon className={`w-5 h-5 ${s.color}`} />
                <div>
                  <p className="text-xs text-muted">{s.label}</p>
                  <p className="text-lg font-semibold text-foreground">{s.value}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-surface border border-border rounded-lg p-1">
        {tabs.map(t => (
          <button key={t.id} onClick={() => { setTab(t.id); setSearch(''); setStatusFilter('All') }}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${tab === t.id ? 'bg-accent text-white' : 'text-muted hover:text-foreground'}`}>
            <t.icon className="w-4 h-4" /> {t.label}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search..." className="w-full pl-10 pr-4 py-2 bg-surface border border-border rounded-lg text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent/50" />
        </div>
        {tab === 'orders' && (
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="px-3 py-2 bg-surface border border-border rounded-lg text-sm text-foreground">
            {['All', 'DRAFT', 'APPROVED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED'].map(s => <option key={s} value={s}>{s === 'All' ? 'All Status' : s.replace(/_/g, ' ')}</option>)}
          </select>
        )}
      </div>

      {/* Purchase Orders Tab */}
      {tab === 'orders' && (
        <div className="glass-card overflow-hidden">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-border">
              {['PO #', 'Supplier', 'Date', 'Items', 'Total', 'Paid', 'Balance', 'Status', 'Actions'].map(h => <th key={h} className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">{h}</th>)}
            </tr></thead>
            <tbody>
              {filteredOrders.map(po => (
                <tr key={po.id} className="border-b border-border/50 hover:bg-surface-hover transition-colors">
                  <td className="px-4 py-3 font-medium text-foreground">{po.displayId}</td>
                  <td className="px-4 py-3 text-foreground">{po.supplier?.name}</td>
                  <td className="px-4 py-3 text-muted">{new Date(po.date).toLocaleDateString('en-IN')}</td>
                  <td className="px-4 py-3 text-muted">{po.items?.length || 0}</td>
                  <td className="px-4 py-3 font-medium text-foreground">₹{po.total?.toLocaleString('en-IN')}</td>
                  <td className="px-4 py-3 text-emerald-400">₹{po.amountPaid?.toLocaleString('en-IN')}</td>
                  <td className="px-4 py-3 text-amber-400">₹{po.balanceDue?.toLocaleString('en-IN')}</td>
                  <td className="px-4 py-3"><span className={`px-2 py-1 rounded-full text-xs font-medium ${poStatusColors[po.status] || ''}`}>{po.status?.replace(/_/g, ' ')}</span></td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button onClick={() => { setSelectedPO(po); setShowDetailModal(true) }} className="p-1.5 rounded-lg hover:bg-surface-hover text-muted hover:text-foreground" title="View"><Eye className="w-4 h-4" /></button>
                      {po.status === 'DRAFT' && <button onClick={() => handleApprovePO(po.id)} className="p-1.5 rounded-lg hover:bg-emerald-500/10 text-muted hover:text-emerald-400" title="Approve"><CheckCircle className="w-4 h-4" /></button>}
                      {(po.status === 'APPROVED' || po.status === 'PARTIALLY_RECEIVED') && <button onClick={() => handleReceivePO(po.id)} className="p-1.5 rounded-lg hover:bg-blue-500/10 text-muted hover:text-blue-400" title="Receive"><ArrowDownCircle className="w-4 h-4" /></button>}
                      {po.status === 'DRAFT' && <button onClick={() => handleCancelPO(po.id)} className="p-1.5 rounded-lg hover:bg-red-500/10 text-muted hover:text-red-400" title="Cancel"><XCircle className="w-4 h-4" /></button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredOrders.length === 0 && <div className="text-center py-12 text-muted">No purchase orders found</div>}
        </div>
      )}

      {/* Suppliers Tab */}
      {tab === 'suppliers' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredSuppliers.map(s => (
            <div key={s.id} className="glass-card p-5">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="font-semibold text-foreground">{s.name}</h3>
                  {s.contactPerson && <p className="text-xs text-muted mt-0.5">{s.contactPerson}</p>}
                </div>
                <span className="text-xs text-muted bg-surface-hover px-2 py-1 rounded-full">{s._count?.purchaseOrders || 0} POs</span>
              </div>
              <div className="space-y-1.5 text-sm text-muted">
                {s.phone && <p>Phone: {s.phone}</p>}
                {s.email && <p>Email: {s.email}</p>}
                {s.gstNumber && <p>GST: {s.gstNumber}</p>}
                {s.address && <p className="truncate">Address: {s.address}</p>}
                <p>Payment Terms: {s.paymentTerms} days</p>
              </div>
            </div>
          ))}
          {filteredSuppliers.length === 0 && <div className="col-span-full text-center py-12 text-muted">No suppliers found</div>}
        </div>
      )}

      {/* Returns Tab */}
      {tab === 'returns' && (
        <div className="glass-card overflow-hidden">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-border">
              {['Return #', 'PO Ref', 'Supplier', 'Reason', 'Amount', 'Date', 'Status'].map(h => <th key={h} className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">{h}</th>)}
            </tr></thead>
            <tbody>
              {returns.map(r => (
                <tr key={r.id} className="border-b border-border/50 hover:bg-surface-hover transition-colors">
                  <td className="px-4 py-3 font-medium text-foreground">{r.displayId}</td>
                  <td className="px-4 py-3 text-muted">{r.po?.displayId || '—'}</td>
                  <td className="px-4 py-3 text-foreground">{r.supplier?.name}</td>
                  <td className="px-4 py-3 text-muted truncate max-w-[200px]">{r.reason}</td>
                  <td className="px-4 py-3 font-medium text-foreground">₹{r.totalAmount?.toLocaleString('en-IN')}</td>
                  <td className="px-4 py-3 text-muted">{new Date(r.date).toLocaleDateString('en-IN')}</td>
                  <td className="px-4 py-3"><span className={`px-2 py-1 rounded-full text-xs font-medium ${r.status === 'Completed' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'}`}>{r.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
          {returns.length === 0 && <div className="text-center py-12 text-muted">No purchase returns found</div>}
        </div>
      )}

      {/* PO Detail Modal */}
      <Modal isOpen={showDetailModal} onClose={() => setShowDetailModal(false)} title={`Purchase Order: ${selectedPO?.displayId}`} size="lg">
        {selectedPO && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div><span className="text-muted">Supplier:</span> <span className="text-foreground font-medium ml-1">{selectedPO.supplier?.name}</span></div>
              <div><span className="text-muted">Date:</span> <span className="text-foreground ml-1">{new Date(selectedPO.date).toLocaleDateString('en-IN')}</span></div>
              <div><span className="text-muted">Status:</span> <span className={`ml-1 px-2 py-0.5 rounded-full text-xs ${poStatusColors[selectedPO.status]}`}>{selectedPO.status}</span></div>
              <div><span className="text-muted">Total:</span> <span className="text-foreground font-medium ml-1">₹{selectedPO.total?.toLocaleString('en-IN')}</span></div>
            </div>
            <table className="w-full text-sm border border-border rounded-lg overflow-hidden">
              <thead><tr className="bg-surface-hover">
                {['Product', 'SKU', 'Qty', 'Received', 'Unit Cost', 'Amount'].map(h => <th key={h} className="px-3 py-2 text-left text-xs font-medium text-muted">{h}</th>)}
              </tr></thead>
              <tbody>
                {selectedPO.items?.map((item, i) => (
                  <tr key={i} className="border-t border-border/50">
                    <td className="px-3 py-2 text-foreground">{item.name}</td>
                    <td className="px-3 py-2 text-muted">{item.sku}</td>
                    <td className="px-3 py-2 text-foreground">{item.quantity}</td>
                    <td className="px-3 py-2 text-foreground">{item.receivedQty}</td>
                    <td className="px-3 py-2 text-foreground">₹{item.unitCost?.toLocaleString('en-IN')}</td>
                    <td className="px-3 py-2 text-foreground">₹{item.amount?.toLocaleString('en-IN')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="grid grid-cols-3 gap-4 text-sm pt-2 border-t border-border">
              <div><span className="text-muted">Subtotal:</span> <span className="font-medium ml-1">₹{selectedPO.subtotal?.toLocaleString('en-IN')}</span></div>
              <div><span className="text-muted">GST:</span> <span className="font-medium ml-1">₹{selectedPO.gst?.toLocaleString('en-IN')}</span></div>
              <div><span className="text-muted">Discount:</span> <span className="font-medium ml-1">₹{selectedPO.discount?.toLocaleString('en-IN')}</span></div>
            </div>
          </div>
        )}
      </Modal>

      {/* Create Supplier Modal */}
      <Modal isOpen={showSupplierModal} onClose={() => setShowSupplierModal(false)} title="Add Supplier">
        <div className="space-y-4">
          {[
            { key: 'name', label: 'Name *', type: 'text' },
            { key: 'phone', label: 'Phone', type: 'text' },
            { key: 'email', label: 'Email', type: 'email' },
            { key: 'gstNumber', label: 'GST Number', type: 'text' },
            { key: 'contactPerson', label: 'Contact Person', type: 'text' },
            { key: 'paymentTerms', label: 'Payment Terms (days)', type: 'number' },
          ].map(f => (
            <div key={f.key}>
              <label className="text-sm text-muted mb-1 block">{f.label}</label>
              <input type={f.type} value={supplierForm[f.key]} onChange={e => setSupplierForm(p => ({ ...p, [f.key]: e.target.value }))} className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/50" />
            </div>
          ))}
          <div>
            <label className="text-sm text-muted mb-1 block">Address</label>
            <textarea value={supplierForm.address} onChange={e => setSupplierForm(p => ({ ...p, address: e.target.value }))} rows={2} className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/50" />
          </div>
          <button onClick={handleCreateSupplier} disabled={submitting || !supplierForm.name} className="w-full py-2.5 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent/90 disabled:opacity-50">
            {submitting ? 'Creating...' : 'Create Supplier'}
          </button>
        </div>
      </Modal>

      {/* Create PO Modal */}
      <Modal isOpen={showPOModal} onClose={() => setShowPOModal(false)} title="Create Purchase Order" size="lg">
        <div className="space-y-4">
          <div>
            <label className="text-sm text-muted mb-1 block">Supplier *</label>
            <select value={poForm.supplierId} onChange={e => setPOForm(p => ({ ...p, supplierId: e.target.value }))} className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm text-foreground">
              <option value="">Select Supplier</option>
              {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm text-muted">Items</label>
              <button onClick={addPOItem} className="text-xs text-accent hover:underline">+ Add Item</button>
            </div>
            {poForm.items.map((item, i) => (
              <div key={i} className="grid grid-cols-12 gap-2 mb-2">
                <select value={item.productId} onChange={e => { const v = [...poForm.items]; v[i].productId = e.target.value; const prod = products.find(p => p.id === Number(e.target.value)); if (prod) v[i].unitCost = prod.costPrice || 0; setPOForm(f => ({ ...f, items: v })) }} className="col-span-6 px-2 py-2 bg-surface border border-border rounded-lg text-sm text-foreground">
                  <option value="">Select Product</option>
                  {products.map(p => <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>)}
                </select>
                <input type="number" min="1" value={item.quantity} onChange={e => { const v = [...poForm.items]; v[i].quantity = e.target.value; setPOForm(f => ({ ...f, items: v })) }} placeholder="Qty" className="col-span-2 px-2 py-2 bg-surface border border-border rounded-lg text-sm text-foreground" />
                <input type="number" min="0" value={item.unitCost} onChange={e => { const v = [...poForm.items]; v[i].unitCost = e.target.value; setPOForm(f => ({ ...f, items: v })) }} placeholder="Cost" className="col-span-3 px-2 py-2 bg-surface border border-border rounded-lg text-sm text-foreground" />
                <button onClick={() => setPOForm(f => ({ ...f, items: f.items.filter((_, j) => j !== i) }))} className="col-span-1 text-red-400 hover:text-red-300 text-lg">×</button>
              </div>
            ))}
          </div>

          <div>
            <label className="text-sm text-muted mb-1 block">Notes</label>
            <textarea value={poForm.notes} onChange={e => setPOForm(p => ({ ...p, notes: e.target.value }))} rows={2} className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/50" />
          </div>

          <button onClick={handleCreatePO} disabled={submitting || !poForm.supplierId || !poForm.items.some(i => i.productId)} className="w-full py-2.5 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent/90 disabled:opacity-50">
            {submitting ? 'Creating...' : 'Create Purchase Order'}
          </button>
        </div>
      </Modal>

      {/* Create Return Modal */}
      <Modal isOpen={showReturnModal} onClose={() => setShowReturnModal(false)} title="Create Purchase Return" size="lg">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-muted mb-1 block">Supplier *</label>
              <select value={returnForm.supplierId} onChange={e => setReturnForm(p => ({ ...p, supplierId: e.target.value }))} className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm text-foreground">
                <option value="">Select Supplier</option>
                {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-sm text-muted mb-1 block">PO Reference</label>
              <select value={returnForm.poId} onChange={e => setReturnForm(p => ({ ...p, poId: e.target.value }))} className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm text-foreground">
                <option value="">Optional</option>
                {orders.filter(o => o.status === 'RECEIVED').map(o => <option key={o.id} value={o.id}>{o.displayId}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="text-sm text-muted mb-1 block">Reason *</label>
            <input value={returnForm.reason} onChange={e => setReturnForm(p => ({ ...p, reason: e.target.value }))} className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/50" />
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm text-muted">Items</label>
              <button onClick={addReturnItem} className="text-xs text-accent hover:underline">+ Add Item</button>
            </div>
            {returnForm.items.map((item, i) => (
              <div key={i} className="grid grid-cols-12 gap-2 mb-2">
                <select value={item.productId} onChange={e => { const v = [...returnForm.items]; v[i].productId = e.target.value; setReturnForm(f => ({ ...f, items: v })) }} className="col-span-6 px-2 py-2 bg-surface border border-border rounded-lg text-sm text-foreground">
                  <option value="">Select Product</option>
                  {products.map(p => <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>)}
                </select>
                <input type="number" min="1" value={item.quantity} onChange={e => { const v = [...returnForm.items]; v[i].quantity = e.target.value; setReturnForm(f => ({ ...f, items: v })) }} placeholder="Qty" className="col-span-2 px-2 py-2 bg-surface border border-border rounded-lg text-sm text-foreground" />
                <input type="number" min="0" value={item.unitCost} onChange={e => { const v = [...returnForm.items]; v[i].unitCost = e.target.value; setReturnForm(f => ({ ...f, items: v })) }} placeholder="Cost" className="col-span-3 px-2 py-2 bg-surface border border-border rounded-lg text-sm text-foreground" />
                <button onClick={() => setReturnForm(f => ({ ...f, items: f.items.filter((_, j) => j !== i) }))} className="col-span-1 text-red-400 hover:text-red-300 text-lg">×</button>
              </div>
            ))}
          </div>
          <button onClick={handleCreateReturn} disabled={submitting || !returnForm.supplierId || !returnForm.reason} className="w-full py-2.5 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent/90 disabled:opacity-50">
            {submitting ? 'Creating...' : 'Create Purchase Return'}
          </button>
        </div>
      </Modal>
    </div>
  )
}
