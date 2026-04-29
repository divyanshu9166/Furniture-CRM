'use client'

import { useState, useEffect, useMemo } from 'react'
import {
  Search, Plus, Truck, Users, RotateCcw, CheckCircle, XCircle,
  Eye, FileText, ArrowDownCircle, Clock, AlertTriangle
} from 'lucide-react'
import {
  getSuppliers, createSupplier, updateSupplier, getPurchaseOrders, createPurchaseOrder,
  approvePurchaseOrder, receivePurchaseOrder, cancelPurchaseOrder,
  getPurchaseReturns, createPurchaseReturn, getPurchaseStats, recordPurchaseOrderPayment,
  sendPurchaseOrderToSupplier, updatePurchaseOrder
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

const ITC_CATEGORIES = ['INPUTS', 'SERVICES', 'CAPITAL_GOODS', 'INELIGIBLE']

const createEmptyPOForm = () => ({
  supplierId: '',
  expectedDate: '',
  discount: 0,
  isRCM: false,
  itcEligible: true,
  itcCategory: 'INPUTS',
  notes: '',
  items: [{ productId: '', quantity: 1, unitCost: 0, gstRate: 18 }],
})

const createEmptySupplierForm = () => ({
  name: '',
  phone: '',
  email: '',
  gstNumber: '',
  address: '',
  contactPerson: '',
  paymentTerms: 30,
})

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
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [selectedPO, setSelectedPO] = useState(null)
  const [editingSupplierId, setEditingSupplierId] = useState(null)
  const [editingPOId, setEditingPOId] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  // Forms
  const [supplierForm, setSupplierForm] = useState(createEmptySupplierForm())
  const [poForm, setPOForm] = useState(createEmptyPOForm())
  const [returnForm, setReturnForm] = useState({ poId: '', supplierId: '', reason: '', notes: '', items: [{ productId: '', quantity: 1, unitCost: 0 }] })
  const [paymentForm, setPaymentForm] = useState({ poId: '', amount: '', note: '', method: 'Bank Transfer', reference: '', paidAt: new Date().toISOString().slice(0, 10) })

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

  // eslint-disable-next-line react-hooks/set-state-in-effect
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

  const poPreview = useMemo(() => {
    const rows = poForm.items
      .filter(item => item.productId)
      .map(item => {
        const quantity = Math.max(1, Number(item.quantity) || 1)
        const unitCost = Math.max(0, Number(item.unitCost) || 0)
        const gstRate = Math.max(0, Number(item.gstRate) || 18)
        return { amount: quantity * unitCost, gstRate }
      })

    const subtotal = rows.reduce((sum, row) => sum + row.amount, 0)
    const discount = Math.min(subtotal, Math.max(0, Number(poForm.discount) || 0))
    const taxable = Math.max(0, subtotal - discount)
    const grossGst = rows.reduce((sum, row) => sum + Math.round(row.amount * row.gstRate / 100), 0)
    const gst = Math.max(0, Math.round(grossGst * (subtotal > 0 ? taxable / subtotal : 1)))

    return {
      subtotal,
      discount,
      taxable,
      gst,
      total: taxable + gst,
    }
  }, [poForm.items, poForm.discount])

  const resetSupplierForm = () => {
    setEditingSupplierId(null)
    setSupplierForm(createEmptySupplierForm())
  }

  const openCreateSupplierModal = () => {
    resetSupplierForm()
    setShowSupplierModal(true)
  }

  const openEditSupplierModal = (supplier) => {
    setEditingSupplierId(supplier.id)
    setSupplierForm({
      name: supplier.name || '',
      phone: supplier.phone || '',
      email: supplier.email || '',
      gstNumber: supplier.gstNumber || '',
      address: supplier.address || '',
      contactPerson: supplier.contactPerson || '',
      paymentTerms: Number(supplier.paymentTerms || 0),
    })
    setShowSupplierModal(true)
  }

  const handleSaveSupplier = async () => {
    setSubmitting(true)
    const payload = { ...supplierForm, paymentTerms: Number(supplierForm.paymentTerms) }
    const res = editingSupplierId
      ? await updateSupplier(editingSupplierId, payload)
      : await createSupplier(payload)

    if (res.success) {
      setShowSupplierModal(false)
      resetSupplierForm()
      loadData()
    } else alert(res.error)
    setSubmitting(false)
  }

  const resetPOForm = () => {
    setEditingPOId(null)
    setPOForm(createEmptyPOForm())
  }

  const openCreatePOModal = () => {
    resetPOForm()
    setShowPOModal(true)
  }

  const handleEditPO = (po) => {
    if (po.status !== 'DRAFT') {
      alert('Only DRAFT purchase orders can be edited')
      return
    }

    const editableItems = (po.items || []).map(item => ({
      productId: String(item.productId || ''),
      quantity: Number(item.quantity || 1),
      unitCost: Number(item.unitCost || 0),
      gstRate: Number(item.gstRate || 18),
    }))

    setEditingPOId(po.id)
    setPOForm({
      supplierId: String(po.supplierId || ''),
      expectedDate: po.expectedDate ? new Date(po.expectedDate).toISOString().slice(0, 10) : '',
      discount: Number(po.discount || 0),
      isRCM: !!po.isRCM,
      itcEligible: po.itcEligible !== false,
      itcCategory: po.itcCategory || 'INPUTS',
      notes: po.notes || '',
      items: editableItems.length > 0 ? editableItems : createEmptyPOForm().items,
    })
    setShowDetailModal(false)
    setShowPOModal(true)
  }

  const handleCreatePO = async () => {
    setSubmitting(true)
    const isEditMode = Boolean(editingPOId)
    const items = poForm.items.filter(i => i.productId).map(i => {
      const prod = products.find(p => p.id === Number(i.productId))
      return {
        productId: Number(i.productId),
        name: prod?.name || '',
        sku: prod?.sku || '',
        hsnCode: prod?.hsnCode || '',
        quantity: Number(i.quantity),
        unitCost: Number(i.unitCost),
        gstRate: Number(i.gstRate) || 18,
      }
    })
    const payload = {
      supplierId: Number(poForm.supplierId),
      expectedDate: poForm.expectedDate || undefined,
      discount: Math.max(0, Number(poForm.discount) || 0),
      isRCM: !!poForm.isRCM,
      itcEligible: !!poForm.itcEligible,
      itcCategory: poForm.itcCategory,
      notes: poForm.notes,
      items,
    }

    const res = isEditMode
      ? await updatePurchaseOrder(editingPOId, payload)
      : await createPurchaseOrder(payload)

    if (res.success) {
      setShowPOModal(false)
      resetPOForm()
      loadData()
    } else alert(res.error)
    setSubmitting(false)
  }

  const handleApprovePO = async (id) => {
    const res = await approvePurchaseOrder(id)
    if (res.success) {
      if (res.warning) alert(res.warning)
      if (res.message) alert(res.message)
      loadData()
    } else alert(res.error)
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

  const handleSendPOToSupplier = async (id) => {
    const res = await sendPurchaseOrderToSupplier(id)
    if (res.success) {
      alert(res.message || 'Purchase order sent to supplier')
      loadData()
    } else {
      alert(res.error || 'Unable to send purchase order to supplier')
    }
  }

  const openPaymentModal = (po) => {
    setPaymentForm({
      poId: po.id,
      amount: String(po.balanceDue || ''),
      note: '',
      method: 'Bank Transfer',
      reference: '',
      paidAt: new Date().toISOString().slice(0, 10),
    })
    setShowPaymentModal(true)
  }

  const handleRecordPayment = async () => {
    const amount = Number(paymentForm.amount)
    if (!paymentForm.poId || !amount || amount <= 0) {
      alert('Enter a valid payment amount')
      return
    }

    setSubmitting(true)
    const res = await recordPurchaseOrderPayment(
      Number(paymentForm.poId),
      amount,
      paymentForm.note,
      paymentForm.method,
      paymentForm.reference,
      paymentForm.paidAt
    )
    if (res.success) {
      setShowPaymentModal(false)
      setPaymentForm({ poId: '', amount: '', note: '', method: 'Bank Transfer', reference: '', paidAt: new Date().toISOString().slice(0, 10) })
      loadData()
    } else {
      alert(res.error)
    }
    setSubmitting(false)
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

  const addPOItem = () => setPOForm(f => ({ ...f, items: [...f.items, { productId: '', quantity: 1, unitCost: 0, gstRate: 18 }] }))
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
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Purchase Management</h1>
          <p className="text-muted text-sm mt-1">Manage suppliers, purchase orders & returns</p>
        </div>
        <div className="flex gap-2 w-full md:w-auto flex-wrap">
          {tab === 'orders' && <button onClick={openCreatePOModal} className="w-full md:w-auto px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent/90 flex items-center justify-center gap-2"><Plus className="w-4 h-4" /> New PO</button>}
          {tab === 'suppliers' && <button onClick={openCreateSupplierModal} className="w-full md:w-auto px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent/90 flex items-center justify-center gap-2"><Plus className="w-4 h-4" /> Add Supplier</button>}
          {tab === 'returns' && <button onClick={() => setShowReturnModal(true)} className="w-full md:w-auto px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent/90 flex items-center justify-center gap-2"><Plus className="w-4 h-4" /> New Return</button>}
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="flex gap-3 overflow-x-auto hide-scrollbar pb-1 -mx-4 px-4 md:mx-0 md:px-0 md:grid md:grid-cols-3 xl:grid-cols-5 md:gap-4">
          {[
            { label: 'Total POs', value: stats.totalPOs, icon: FileText, color: 'text-blue-400' },
            { label: 'Open Payables', value: `₹${(stats.outstandingPayables || 0).toLocaleString('en-IN')}`, icon: Truck, color: 'text-emerald-400' },
            { label: 'Pending Receipts', value: stats.pendingPOs, icon: Clock, color: 'text-amber-400' },
            { label: 'Overdue POs', value: stats.overduePOs, icon: AlertTriangle, color: 'text-red-400' },
            { label: 'Suppliers', value: stats.totalSuppliers || stats.suppliers, icon: Users, color: 'text-purple-400' },
          ].map((s, i) => (
            <div key={i} className="glass-card p-4 min-w-[160px] flex-shrink-0 md:min-w-0 md:flex-shrink">
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
      <div className="overflow-x-auto hide-scrollbar -mx-4 md:mx-0 px-4 md:px-0">
        <div className="flex gap-1 bg-surface border border-border rounded-lg p-1 w-max">
          {tabs.map(t => (
            <button key={t.id} onClick={() => { setTab(t.id); setSearch(''); setStatusFilter('All') }}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all whitespace-nowrap ${tab === t.id ? 'bg-accent text-white' : 'text-muted hover:text-foreground'}`}>
              <t.icon className="w-4 h-4" /> {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Search */}
      <div className="flex flex-col sm:flex-row items-center gap-3">
        <div className="relative w-full sm:flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search..." className="w-full pl-10 pr-4 py-2 bg-surface border border-border rounded-lg text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent/50" />
        </div>
        {tab === 'orders' && (
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="w-full sm:w-auto px-3 py-2 bg-surface border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/50">
            {['All', 'DRAFT', 'APPROVED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED'].map(s => <option key={s} value={s}>{s === 'All' ? 'All Status' : s.replace(/_/g, ' ')}</option>)}
          </select>
        )}
      </div>

      {/* Purchase Orders Tab */}
      {tab === 'orders' && (
        <div className="glass-card overflow-x-auto">
          <table className="w-full text-sm whitespace-nowrap md:whitespace-normal">
            <thead><tr className="border-b border-border">
              {['PO #', 'Supplier', 'Date', 'Expected', 'Items', 'Total', 'Paid', 'Balance', 'Compliance', 'Status', 'Actions'].map(h => <th key={h} className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">{h}</th>)}
            </tr></thead>
            <tbody>
              {filteredOrders.map(po => (
                <tr key={po.id} className="border-b border-border/50 hover:bg-surface-hover transition-colors">
                  {(() => {
                    const isOverdue = po.expectedDate && ['DRAFT', 'APPROVED', 'PARTIALLY_RECEIVED'].includes(po.status) && new Date(po.expectedDate) < new Date()
                    return (
                      <>
                  <td className="px-4 py-3 font-medium text-foreground">{po.displayId}</td>
                  <td className="px-4 py-3 text-foreground">{po.supplier?.name}</td>
                  <td className="px-4 py-3 text-muted">{new Date(po.date).toLocaleDateString('en-IN')}</td>
                  <td className={`px-4 py-3 text-xs ${isOverdue ? 'text-red-400 font-medium' : 'text-muted'}`}>
                    {po.expectedDate ? new Date(po.expectedDate).toLocaleDateString('en-IN') : '—'}
                  </td>
                  <td className="px-4 py-3 text-muted">{po.items?.length || 0}</td>
                  <td className="px-4 py-3 font-medium text-foreground">₹{po.total?.toLocaleString('en-IN')}</td>
                  <td className="px-4 py-3 text-emerald-400">₹{po.amountPaid?.toLocaleString('en-IN')}</td>
                  <td className="px-4 py-3 text-amber-400">₹{po.balanceDue?.toLocaleString('en-IN')}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-1">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium w-fit ${po.itcEligible ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
                        {po.itcEligible ? `ITC: ${po.itcCategory?.replace(/_/g, ' ') || 'INPUTS'}` : 'ITC: Ineligible'}
                      </span>
                      {po.isRCM && <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-500/10 text-amber-400 w-fit">RCM</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3"><span className={`px-2 py-1 rounded-full text-xs font-medium ${poStatusColors[po.status] || ''}`}>{po.status?.replace(/_/g, ' ')}</span></td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button onClick={() => { setSelectedPO(po); setShowDetailModal(true) }} className="p-1.5 rounded-lg hover:bg-surface-hover text-muted hover:text-foreground" title="View"><Eye className="w-4 h-4" /></button>
                      {po.status === 'DRAFT' && (
                        <button
                          onClick={() => handleEditPO(po)}
                          className="px-2.5 py-1 rounded-lg border border-border text-xs font-medium text-muted hover:text-accent hover:border-accent/40"
                          title="Edit PO"
                        >
                          Edit
                        </button>
                      )}
                      {po.status !== 'CANCELLED' && (
                        <button
                          onClick={() => handleSendPOToSupplier(po.id)}
                          className="px-2.5 py-1 rounded-lg border border-border text-xs font-medium text-muted hover:text-accent hover:border-accent/40"
                          title="Send PO to supplier"
                        >
                          Send PO
                        </button>
                      )}
                      {po.status === 'DRAFT' && <button onClick={() => handleApprovePO(po.id)} className="p-1.5 rounded-lg hover:bg-emerald-500/10 text-muted hover:text-emerald-400" title="Approve"><CheckCircle className="w-4 h-4" /></button>}
                      {(po.status === 'APPROVED' || po.status === 'PARTIALLY_RECEIVED') && <button onClick={() => handleReceivePO(po.id)} className="p-1.5 rounded-lg hover:bg-blue-500/10 text-muted hover:text-blue-400" title="Receive"><ArrowDownCircle className="w-4 h-4" /></button>}
                      {po.status !== 'CANCELLED' && po.balanceDue > 0 && (
                        <button onClick={() => openPaymentModal(po)} className="p-1.5 rounded-lg hover:bg-purple-500/10 text-muted hover:text-purple-400" title="Record Payment">
                          <span className="text-sm font-bold">₹</span>
                        </button>
                      )}
                      {po.status === 'DRAFT' && <button onClick={() => handleCancelPO(po.id)} className="p-1.5 rounded-lg hover:bg-red-500/10 text-muted hover:text-red-400" title="Cancel"><XCircle className="w-4 h-4" /></button>}
                    </div>
                  </td>
                      </>
                    )
                  })()}
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
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => openEditSupplierModal(s)}
                    className="px-2.5 py-1 rounded-lg border border-border text-xs font-medium text-muted hover:text-accent hover:border-accent/40"
                  >
                    Edit
                  </button>
                  <span className="text-xs text-muted bg-surface-hover px-2 py-1 rounded-full">{s._count?.purchaseOrders || 0} POs</span>
                </div>
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
        <div className="glass-card overflow-x-auto">
          <table className="w-full text-sm whitespace-nowrap md:whitespace-normal">
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
          {returns.length === 0 && (
            <div className="text-center py-16 space-y-3">
              <RotateCcw className="w-10 h-10 text-muted mx-auto opacity-40" />
              <p className="text-muted text-sm font-medium">No purchase returns yet</p>
              <p className="text-muted text-xs">Use the <strong className="text-foreground">New Return</strong> button (top right) or click below to create one</p>
              <button onClick={() => setShowReturnModal(true)} className="mt-2 px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent/90 flex items-center gap-2 mx-auto">
                <Plus className="w-4 h-4" /> Create First Return
              </button>
            </div>
          )}
        </div>
      )}

      {/* PO Detail Modal */}
      <Modal isOpen={showDetailModal} onClose={() => setShowDetailModal(false)} title={`Purchase Order: ${selectedPO?.displayId}`} size="lg">
        {selectedPO && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div className="flex gap-2"><span className="text-muted w-20">Supplier:</span> <span className="text-foreground font-medium truncate">{selectedPO.supplier?.name}</span></div>
              <div className="flex gap-2"><span className="text-muted w-20">Date:</span> <span className="text-foreground">{new Date(selectedPO.date).toLocaleDateString('en-IN')}</span></div>
              <div className="flex gap-2"><span className="text-muted w-20">Expected:</span> <span className="text-foreground">{selectedPO.expectedDate ? new Date(selectedPO.expectedDate).toLocaleDateString('en-IN') : '—'}</span></div>
              <div className="flex gap-2"><span className="text-muted w-20">Status:</span> <span className={`px-2 py-0.5 rounded-full text-xs ${poStatusColors[selectedPO.status]}`}>{selectedPO.status}</span></div>
              <div className="flex gap-2"><span className="text-muted w-20">ITC:</span> <span className="text-foreground">{selectedPO.itcEligible ? selectedPO.itcCategory?.replace(/_/g, ' ') : 'Ineligible'}</span></div>
              <div className="flex gap-2"><span className="text-muted w-20">RCM:</span> <span className="text-foreground">{selectedPO.isRCM ? 'Yes' : 'No'}</span></div>
              <div className="flex gap-2"><span className="text-muted w-20">Total:</span> <span className="text-foreground font-medium">₹{selectedPO.total?.toLocaleString('en-IN')}</span></div>
              <div className="flex gap-2"><span className="text-muted w-20">Balance:</span> <span className="text-foreground font-medium">₹{selectedPO.balanceDue?.toLocaleString('en-IN')}</span></div>
            </div>
            <div className="overflow-x-auto border border-border rounded-lg">
              <table className="w-full text-sm whitespace-nowrap">
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
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-4 text-sm pt-2 border-t border-border">
              <div className="flex justify-between sm:justify-start"><span className="text-muted">Subtotal:</span> <span className="font-medium ml-1">₹{selectedPO.subtotal?.toLocaleString('en-IN')}</span></div>
              <div className="flex justify-between sm:justify-start"><span className="text-muted">GST:</span> <span className="font-medium ml-1">₹{selectedPO.gst?.toLocaleString('en-IN')}</span></div>
              <div className="flex justify-between sm:justify-start"><span className="text-muted">Discount:</span> <span className="font-medium ml-1">₹{selectedPO.discount?.toLocaleString('en-IN')}</span></div>
            </div>

            <div className="border-t border-border pt-3 space-y-2">
              <p className="text-xs font-semibold text-muted uppercase tracking-wide">PO Status Actions</p>
              <div className="flex flex-wrap items-center gap-2">
                {selectedPO.status === 'DRAFT' && (
                  <button
                    onClick={() => handleEditPO(selectedPO)}
                    className="px-3 py-1.5 rounded-lg border border-border text-xs font-medium text-muted hover:text-accent hover:border-accent/40"
                  >
                    Edit PO
                  </button>
                )}

                {selectedPO.status !== 'CANCELLED' && (
                  <button
                    onClick={() => handleSendPOToSupplier(selectedPO.id)}
                    className="px-3 py-1.5 rounded-lg border border-border text-xs font-medium text-muted hover:text-accent hover:border-accent/40"
                  >
                    Send PO To Supplier
                  </button>
                )}

                {selectedPO.status === 'DRAFT' && (
                  <button
                    onClick={() => {
                      handleApprovePO(selectedPO.id)
                      setShowDetailModal(false)
                    }}
                    className="px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 text-xs font-medium hover:bg-emerald-500/20"
                  >
                    Approve PO
                  </button>
                )}

                {(selectedPO.status === 'APPROVED' || selectedPO.status === 'PARTIALLY_RECEIVED') && (
                  <button
                    onClick={() => {
                      handleReceivePO(selectedPO.id)
                      setShowDetailModal(false)
                    }}
                    className="px-3 py-1.5 rounded-lg bg-blue-500/10 text-blue-400 text-xs font-medium hover:bg-blue-500/20"
                  >
                    Mark Received
                  </button>
                )}

                {selectedPO.status === 'DRAFT' && (
                  <button
                    onClick={() => {
                      handleCancelPO(selectedPO.id)
                      setShowDetailModal(false)
                    }}
                    className="px-3 py-1.5 rounded-lg bg-red-500/10 text-red-400 text-xs font-medium hover:bg-red-500/20"
                  >
                    Cancel PO
                  </button>
                )}
              </div>
            </div>

            {selectedPO.notes && (
              <div className="border-t border-border pt-3">
                <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-1.5">Notes & Activity</p>
                <pre className="whitespace-pre-wrap text-xs text-foreground bg-surface border border-border rounded-lg p-2.5">{selectedPO.notes}</pre>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Create Supplier Modal */}
      <Modal
        isOpen={showSupplierModal}
        onClose={() => { setShowSupplierModal(false); resetSupplierForm() }}
        title={editingSupplierId ? 'Edit Supplier' : 'Add Supplier'}
      >
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
          <button onClick={handleSaveSupplier} disabled={submitting || !supplierForm.name} className="w-full py-2.5 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent/90 disabled:opacity-50">
            {submitting ? (editingSupplierId ? 'Updating...' : 'Creating...') : (editingSupplierId ? 'Update Supplier' : 'Create Supplier')}
          </button>
        </div>
      </Modal>

      {/* Create PO Modal */}
      <Modal
        isOpen={showPOModal}
        onClose={() => { setShowPOModal(false); resetPOForm() }}
        title={editingPOId ? 'Edit Purchase Order' : 'Create Purchase Order'}
        size="lg"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
            <label className="text-sm text-muted mb-1 block">Supplier *</label>
            <select value={poForm.supplierId} onChange={e => setPOForm(p => ({ ...p, supplierId: e.target.value }))} className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm text-foreground">
              <option value="">Select Supplier</option>
              {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            </div>
            <div>
              <label className="text-sm text-muted mb-1 block">Expected Delivery</label>
              <input
                type="date"
                value={poForm.expectedDate}
                onChange={e => setPOForm(p => ({ ...p, expectedDate: e.target.value }))}
                className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm text-foreground"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <label className="flex items-center gap-2 text-xs text-foreground border border-border rounded-lg px-3 py-2">
              <input
                type="checkbox"
                checked={poForm.itcEligible}
                onChange={e => setPOForm(p => ({ ...p, itcEligible: e.target.checked }))}
              />
              ITC Eligible
            </label>
            <label className="flex items-center gap-2 text-xs text-foreground border border-border rounded-lg px-3 py-2">
              <input
                type="checkbox"
                checked={poForm.isRCM}
                onChange={e => setPOForm(p => ({ ...p, isRCM: e.target.checked }))}
              />
              RCM Purchase
            </label>
            <select
              value={poForm.itcCategory}
              onChange={e => setPOForm(p => ({ ...p, itcCategory: e.target.value }))}
              className="px-3 py-2 bg-surface border border-border rounded-lg text-sm text-foreground"
              disabled={!poForm.itcEligible}
            >
              {ITC_CATEGORIES.map(category => (
                <option key={category} value={category}>{category.replace(/_/g, ' ')}</option>
              ))}
            </select>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm text-muted">Items</label>
              <button onClick={addPOItem} className="text-xs text-accent hover:underline">+ Add Item</button>
            </div>
            {poForm.items.map((item, i) => (
              <div key={i} className="flex flex-col sm:grid sm:grid-cols-12 gap-2 mb-4 sm:mb-2 bg-surface sm:bg-transparent border border-border sm:border-none p-3 sm:p-0 rounded-lg sm:rounded-none relative">
                <button type="button" onClick={() => setPOForm(f => ({ ...f, items: f.items.filter((_, j) => j !== i) }))} className="absolute top-2 right-2 sm:static sm:col-span-1 text-red-400 hover:text-red-300 text-lg flex sm:items-center sm:justify-center">×</button>
                <select value={item.productId} onChange={e => { const v = [...poForm.items]; v[i].productId = e.target.value; const prod = products.find(p => p.id === Number(e.target.value)); if (prod) v[i].unitCost = prod.costPrice || 0; setPOForm(f => ({ ...f, items: v })) }} className="col-span-5 px-3 sm:px-2 py-2 bg-surface border border-border rounded-lg text-sm text-foreground w-full mt-6 sm:mt-0">
                  <option value="">Select Product</option>
                  {products.map(p => <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>)}
                </select>
                <div className="flex gap-2 col-span-6">
                  <input type="number" min="1" value={item.quantity} onChange={e => { const v = [...poForm.items]; v[i].quantity = e.target.value; setPOForm(f => ({ ...f, items: v })) }} placeholder="Qty" className="w-1/3 sm:w-full px-3 sm:px-2 py-2 bg-surface border border-border rounded-lg text-sm text-foreground" />
                  <input type="number" min="0" value={item.unitCost} onChange={e => { const v = [...poForm.items]; v[i].unitCost = e.target.value; setPOForm(f => ({ ...f, items: v })) }} placeholder="Cost" className="w-1/3 sm:w-full px-3 sm:px-2 py-2 bg-surface border border-border rounded-lg text-sm text-foreground" />
                  <input type="number" min="0" max="100" value={item.gstRate || 18} onChange={e => { const v = [...poForm.items]; v[i].gstRate = e.target.value; setPOForm(f => ({ ...f, items: v })) }} placeholder="GST%" className="w-1/3 sm:w-full px-3 sm:px-2 py-2 bg-surface border border-border rounded-lg text-sm text-foreground" />
                </div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-sm text-muted mb-1 block">Order Discount (₹)</label>
              <input
                type="number"
                min="0"
                value={poForm.discount}
                onChange={e => setPOForm(p => ({ ...p, discount: e.target.value }))}
                className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm text-foreground"
              />
            </div>
            <div className="bg-surface border border-border rounded-lg p-2.5 text-xs text-muted">
              <p>Subtotal: <span className="text-foreground font-medium">₹{poPreview.subtotal.toLocaleString('en-IN')}</span></p>
              <p>Discount: <span className="text-foreground font-medium">₹{poPreview.discount.toLocaleString('en-IN')}</span></p>
              <p>GST: <span className="text-foreground font-medium">₹{poPreview.gst.toLocaleString('en-IN')}</span></p>
              <p className="text-sm text-foreground font-semibold mt-1">PO Total: ₹{poPreview.total.toLocaleString('en-IN')}</p>
            </div>
          </div>

          <div>
            <label className="text-sm text-muted mb-1 block">Notes</label>
            <textarea value={poForm.notes} onChange={e => setPOForm(p => ({ ...p, notes: e.target.value }))} rows={2} className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/50" />
          </div>

          <button onClick={handleCreatePO} disabled={submitting || !poForm.supplierId || !poForm.items.some(i => i.productId)} className="w-full py-2.5 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent/90 disabled:opacity-50">
            {submitting ? (editingPOId ? 'Updating...' : 'Creating...') : (editingPOId ? 'Update Purchase Order' : 'Create Purchase Order')}
          </button>
        </div>
      </Modal>

      {/* Record Payment Modal */}
      <Modal isOpen={showPaymentModal} onClose={() => setShowPaymentModal(false)} title="Record PO Payment">
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-sm text-muted mb-1 block">Payment Date *</label>
              <input
                type="date"
                value={paymentForm.paidAt}
                onChange={e => setPaymentForm(f => ({ ...f, paidAt: e.target.value }))}
                className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm text-foreground"
              />
            </div>
            <div>
              <label className="text-sm text-muted mb-1 block">Method *</label>
              <select
                value={paymentForm.method}
                onChange={e => setPaymentForm(f => ({ ...f, method: e.target.value }))}
                className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm text-foreground"
              >
                {['Bank Transfer', 'UPI', 'Cash', 'Cheque', 'Card'].map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="text-sm text-muted mb-1 block">Amount (₹) *</label>
            <input
              type="number"
              min="1"
              value={paymentForm.amount}
              onChange={e => setPaymentForm(f => ({ ...f, amount: e.target.value }))}
              className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm text-foreground"
            />
          </div>
          <div>
            <label className="text-sm text-muted mb-1 block">Reference (optional)</label>
            <input
              type="text"
              value={paymentForm.reference}
              onChange={e => setPaymentForm(f => ({ ...f, reference: e.target.value }))}
              placeholder="UTR / cheque no / txn id"
              className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm text-foreground"
            />
          </div>
          <div>
            <label className="text-sm text-muted mb-1 block">Note (optional)</label>
            <input
              type="text"
              value={paymentForm.note}
              onChange={e => setPaymentForm(f => ({ ...f, note: e.target.value }))}
              placeholder="UTR / cheque / remark"
              className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm text-foreground"
            />
          </div>
          <button
            onClick={handleRecordPayment}
            disabled={submitting || !paymentForm.amount || !paymentForm.method || !paymentForm.paidAt}
            className="w-full py-2.5 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent/90 disabled:opacity-50"
          >
            {submitting ? 'Saving...' : 'Save Payment'}
          </button>
        </div>
      </Modal>

      {/* Create Return Modal */}
      <Modal isOpen={showReturnModal} onClose={() => setShowReturnModal(false)} title="Create Purchase Return" size="lg">
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
              <div key={i} className="flex flex-col sm:grid sm:grid-cols-12 gap-2 mb-4 sm:mb-2 bg-surface sm:bg-transparent border border-border sm:border-none p-3 sm:p-0 rounded-lg sm:rounded-none relative">
                <button type="button" onClick={() => setReturnForm(f => ({ ...f, items: f.items.filter((_, j) => j !== i) }))} className="absolute top-2 right-2 sm:static sm:col-span-1 text-red-400 hover:text-red-300 text-lg flex sm:items-center sm:justify-center">×</button>
                <select value={item.productId} onChange={e => { const v = [...returnForm.items]; v[i].productId = e.target.value; setReturnForm(f => ({ ...f, items: v })) }} className="col-span-6 px-3 sm:px-2 py-2 bg-surface border border-border rounded-lg text-sm text-foreground w-full mt-6 sm:mt-0">
                  <option value="">Select Product</option>
                  {products.map(p => <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>)}
                </select>
                <div className="flex flex-row gap-2 col-span-5 w-full">
                  <input type="number" min="1" value={item.quantity} onChange={e => { const v = [...returnForm.items]; v[i].quantity = e.target.value; setReturnForm(f => ({ ...f, items: v })) }} placeholder="Qty" className="flex-1 px-3 sm:px-2 py-2 bg-surface border border-border rounded-lg text-sm text-foreground" />
                  <input type="number" min="0" value={item.unitCost} onChange={e => { const v = [...returnForm.items]; v[i].unitCost = e.target.value; setReturnForm(f => ({ ...f, items: v })) }} placeholder="Cost" className="flex-1 px-3 sm:px-2 py-2 bg-surface border border-border rounded-lg text-sm text-foreground" />
                </div>
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
