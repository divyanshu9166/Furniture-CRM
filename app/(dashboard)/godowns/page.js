'use client'

import { useState, useEffect, useMemo } from 'react'
import {
  Search, Plus, Warehouse, Building2, ArrowRightLeft, Package,
  MapPin, Phone, Mail, Eye, CheckCircle
} from 'lucide-react'
import {
  getBranches, createBranch, getGodowns, createGodown,
  getGodownStock, getTransfers, createTransfer, completeTransfer
} from '@/app/actions/godowns'
import { getProducts } from '@/app/actions/products'
import Modal from '@/components/Modal'

export default function GodownsPage() {
  const [tab, setTab] = useState('branches')
  const [loading, setLoading] = useState(true)
  const [branches, setBranches] = useState([])
  const [godowns, setGodowns] = useState([])
  const [stocks, setStocks] = useState([])
  const [transfers, setTransfers] = useState([])
  const [products, setProducts] = useState([])
  const [search, setSearch] = useState('')
  const [selectedGodown, setSelectedGodown] = useState('')

  const [showBranchModal, setShowBranchModal] = useState(false)
  const [showGodownModal, setShowGodownModal] = useState(false)
  const [showTransferModal, setShowTransferModal] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const [branchForm, setBranchForm] = useState({ name: '', address: '', phone: '', email: '', managerName: '', isHeadOffice: false })
  const [godownForm, setGodownForm] = useState({ name: '', address: '', branchId: '' })
  const [transferForm, setTransferForm] = useState({ fromGodownId: '', toGodownId: '', notes: '', requestedBy: '', items: [{ productId: '', name: '', sku: '', quantity: 1 }] })

  const loadData = () => {
    setLoading(true)
    Promise.all([getBranches(), getGodowns(), getGodownStock(), getTransfers(), getProducts()])
      .then(([brRes, gdRes, stRes, trRes, prRes]) => {
        if (brRes.success) setBranches(brRes.data)
        if (gdRes.success) setGodowns(gdRes.data)
        if (stRes.success) setStocks(stRes.data)
        if (trRes.success) setTransfers(trRes.data)
        if (prRes.success) setProducts(prRes.data)
        setLoading(false)
      })
  }

  useEffect(() => { loadData() }, [])

  const filteredStocks = useMemo(() => stocks.filter(s =>
    (!selectedGodown || s.godownId === Number(selectedGodown)) &&
    (s.product?.name?.toLowerCase().includes(search.toLowerCase()) || s.product?.sku?.toLowerCase().includes(search.toLowerCase()))
  ), [stocks, search, selectedGodown])

  const handleCreateBranch = async () => {
    setSubmitting(true)
    const res = await createBranch(branchForm)
    if (res.success) {
      setShowBranchModal(false)
      setBranchForm({ name: '', address: '', phone: '', email: '', managerName: '', isHeadOffice: false })
      loadData()
    } else alert(res.error)
    setSubmitting(false)
  }

  const handleCreateGodown = async () => {
    setSubmitting(true)
    const res = await createGodown({ ...godownForm, branchId: godownForm.branchId ? Number(godownForm.branchId) : undefined })
    if (res.success) {
      setShowGodownModal(false)
      setGodownForm({ name: '', address: '', branchId: '' })
      loadData()
    } else alert(res.error)
    setSubmitting(false)
  }

  const handleCreateTransfer = async () => {
    setSubmitting(true)
    const items = transferForm.items.filter(i => i.productId).map(i => {
      const prod = products.find(p => p.id === Number(i.productId))
      return { productId: Number(i.productId), name: prod?.name || '', sku: prod?.sku || '', quantity: Number(i.quantity) }
    })
    const res = await createTransfer({
      fromGodownId: Number(transferForm.fromGodownId),
      toGodownId: Number(transferForm.toGodownId),
      notes: transferForm.notes, requestedBy: transferForm.requestedBy, items
    })
    if (res.success) {
      setShowTransferModal(false)
      setTransferForm({ fromGodownId: '', toGodownId: '', notes: '', requestedBy: '', items: [{ productId: '', name: '', sku: '', quantity: 1 }] })
      loadData()
    } else alert(res.error)
    setSubmitting(false)
  }

  const handleCompleteTransfer = async (id) => {
    const res = await completeTransfer(id)
    if (res.success) loadData()
    else alert(res.error)
  }

  const tabs = [
    { id: 'branches', label: 'Branches', icon: Building2 },
    { id: 'godowns', label: 'Godowns', icon: Warehouse },
    { id: 'stock', label: 'Stock View', icon: Package },
    { id: 'transfers', label: 'Transfers', icon: ArrowRightLeft },
  ]

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent" /></div>

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Multi-Branch / Godown</h1>
          <p className="text-muted text-sm mt-1">Manage branches, godowns, stock & inter-godown transfers</p>
        </div>
        <div className="flex gap-2">
          {tab === 'branches' && <button onClick={() => setShowBranchModal(true)} className="px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent/90 flex items-center gap-2"><Plus className="w-4 h-4" /> Add Branch</button>}
          {tab === 'godowns' && <button onClick={() => setShowGodownModal(true)} className="px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent/90 flex items-center gap-2"><Plus className="w-4 h-4" /> Add Godown</button>}
          {tab === 'transfers' && <button onClick={() => setShowTransferModal(true)} className="px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent/90 flex items-center gap-2"><Plus className="w-4 h-4" /> New Transfer</button>}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Branches', value: branches.length, icon: Building2, color: 'text-blue-400' },
          { label: 'Godowns', value: godowns.length, icon: Warehouse, color: 'text-emerald-400' },
          { label: 'Total Stock Items', value: stocks.length, icon: Package, color: 'text-amber-400' },
          { label: 'Pending Transfers', value: transfers.filter(t => t.status === 'Pending').length, icon: ArrowRightLeft, color: 'text-purple-400' },
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

      {/* Tabs */}
      <div className="flex gap-1 bg-surface border border-border rounded-lg p-1">
        {tabs.map(t => (
          <button key={t.id} onClick={() => { setTab(t.id); setSearch('') }}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${tab === t.id ? 'bg-accent text-white' : 'text-muted hover:text-foreground'}`}>
            <t.icon className="w-4 h-4" /> {t.label}
          </button>
        ))}
      </div>

      {/* Branches */}
      {tab === 'branches' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {branches.map(b => (
            <div key={b.id} className="glass-card p-5">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="font-semibold text-foreground flex items-center gap-2">
                    {b.name} {b.isHeadOffice && <span className="text-[10px] bg-accent/20 text-accent px-2 py-0.5 rounded-full">HQ</span>}
                  </h3>
                  {b.managerName && <p className="text-xs text-muted mt-0.5">Manager: {b.managerName}</p>}
                </div>
                <span className="text-xs text-muted bg-surface-hover px-2 py-1 rounded-full">{b._count?.godowns || 0} godowns</span>
              </div>
              <div className="space-y-1.5 text-sm text-muted">
                {b.address && <p className="flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5" /> {b.address}</p>}
                {b.phone && <p className="flex items-center gap-1.5"><Phone className="w-3.5 h-3.5" /> {b.phone}</p>}
                {b.email && <p className="flex items-center gap-1.5"><Mail className="w-3.5 h-3.5" /> {b.email}</p>}
              </div>
            </div>
          ))}
          {branches.length === 0 && <div className="col-span-full text-center py-12 text-muted">No branches yet. Add your first branch.</div>}
        </div>
      )}

      {/* Godowns */}
      {tab === 'godowns' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {godowns.map(g => (
            <div key={g.id} className="glass-card p-5">
              <h3 className="font-semibold text-foreground">{g.name}</h3>
              <p className="text-xs text-muted mt-0.5">Branch: {g.branch?.name || 'Unassigned'}</p>
              <div className="mt-3 space-y-1.5 text-sm text-muted">
                {g.address && <p className="flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5" /> {g.address}</p>}
                <p className="flex items-center gap-1.5"><Package className="w-3.5 h-3.5" /> {g._count?.stocks || 0} stock items</p>
              </div>
            </div>
          ))}
          {godowns.length === 0 && <div className="col-span-full text-center py-12 text-muted">No godowns yet. Add your first godown.</div>}
        </div>
      )}

      {/* Stock View */}
      {tab === 'stock' && (
        <div>
          <div className="flex items-center gap-3 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search products..." className="w-full pl-10 pr-4 py-2 bg-surface border border-border rounded-lg text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent/50" />
            </div>
            <select value={selectedGodown} onChange={e => setSelectedGodown(e.target.value)} className="px-3 py-2 bg-surface border border-border rounded-lg text-sm text-foreground">
              <option value="">All Godowns</option>
              {godowns.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </div>
          <div className="glass-card overflow-hidden">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-border">
                {['Product', 'SKU', 'Category', 'Godown', 'Quantity'].map(h => <th key={h} className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">{h}</th>)}
              </tr></thead>
              <tbody>
                {filteredStocks.map(s => (
                  <tr key={s.id} className="border-b border-border/50 hover:bg-surface-hover transition-colors">
                    <td className="px-4 py-3 text-foreground font-medium">{s.product?.name}</td>
                    <td className="px-4 py-3 text-muted">{s.product?.sku}</td>
                    <td className="px-4 py-3 text-muted">{s.product?.category?.name || '—'}</td>
                    <td className="px-4 py-3 text-foreground">{s.godown?.name}</td>
                    <td className="px-4 py-3">
                      <span className={`font-medium ${s.quantity <= 0 ? 'text-red-400' : s.quantity < 5 ? 'text-amber-400' : 'text-emerald-400'}`}>{s.quantity}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredStocks.length === 0 && <div className="text-center py-12 text-muted">No stock records found</div>}
          </div>
        </div>
      )}

      {/* Transfers */}
      {tab === 'transfers' && (
        <div className="glass-card overflow-hidden">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-border">
              {['Transfer #', 'From', 'To', 'Items', 'Date', 'Requested By', 'Status', 'Actions'].map(h => <th key={h} className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">{h}</th>)}
            </tr></thead>
            <tbody>
              {transfers.map(t => (
                <tr key={t.id} className="border-b border-border/50 hover:bg-surface-hover transition-colors">
                  <td className="px-4 py-3 font-medium text-foreground">{t.displayId}</td>
                  <td className="px-4 py-3 text-foreground">{t.fromGodown?.name}</td>
                  <td className="px-4 py-3 text-foreground">{t.toGodown?.name}</td>
                  <td className="px-4 py-3 text-muted">{t.items?.length || 0}</td>
                  <td className="px-4 py-3 text-muted">{new Date(t.date).toLocaleDateString('en-IN')}</td>
                  <td className="px-4 py-3 text-muted">{t.requestedBy || '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${t.status === 'Completed' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'}`}>{t.status}</span>
                  </td>
                  <td className="px-4 py-3">
                    {t.status === 'Pending' && (
                      <button onClick={() => handleCompleteTransfer(t.id)} className="p-1.5 rounded-lg hover:bg-emerald-500/10 text-muted hover:text-emerald-400" title="Complete">
                        <CheckCircle className="w-4 h-4" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {transfers.length === 0 && <div className="text-center py-12 text-muted">No transfers found</div>}
        </div>
      )}

      {/* Create Branch Modal */}
      <Modal isOpen={showBranchModal} onClose={() => setShowBranchModal(false)} title="Add Branch">
        <div className="space-y-4">
          {[
            { key: 'name', label: 'Branch Name *', type: 'text' },
            { key: 'address', label: 'Address', type: 'text' },
            { key: 'phone', label: 'Phone', type: 'text' },
            { key: 'email', label: 'Email', type: 'email' },
            { key: 'managerName', label: 'Manager Name', type: 'text' },
          ].map(f => (
            <div key={f.key}>
              <label className="text-sm text-muted mb-1 block">{f.label}</label>
              <input type={f.type} value={branchForm[f.key]} onChange={e => setBranchForm(p => ({ ...p, [f.key]: e.target.value }))} className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/50" />
            </div>
          ))}
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input type="checkbox" checked={branchForm.isHeadOffice} onChange={e => setBranchForm(p => ({ ...p, isHeadOffice: e.target.checked }))} className="rounded" />
            Head Office
          </label>
          <button onClick={handleCreateBranch} disabled={submitting || !branchForm.name} className="w-full py-2.5 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent/90 disabled:opacity-50">
            {submitting ? 'Creating...' : 'Create Branch'}
          </button>
        </div>
      </Modal>

      {/* Create Godown Modal */}
      <Modal isOpen={showGodownModal} onClose={() => setShowGodownModal(false)} title="Add Godown">
        <div className="space-y-4">
          <div>
            <label className="text-sm text-muted mb-1 block">Godown Name *</label>
            <input value={godownForm.name} onChange={e => setGodownForm(p => ({ ...p, name: e.target.value }))} className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/50" />
          </div>
          <div>
            <label className="text-sm text-muted mb-1 block">Branch</label>
            <select value={godownForm.branchId} onChange={e => setGodownForm(p => ({ ...p, branchId: e.target.value }))} className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm text-foreground">
              <option value="">Select Branch</option>
              {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-sm text-muted mb-1 block">Address</label>
            <textarea value={godownForm.address} onChange={e => setGodownForm(p => ({ ...p, address: e.target.value }))} rows={2} className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/50" />
          </div>
          <button onClick={handleCreateGodown} disabled={submitting || !godownForm.name} className="w-full py-2.5 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent/90 disabled:opacity-50">
            {submitting ? 'Creating...' : 'Create Godown'}
          </button>
        </div>
      </Modal>

      {/* Create Transfer Modal */}
      <Modal isOpen={showTransferModal} onClose={() => setShowTransferModal(false)} title="New Inter-Godown Transfer" size="lg">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-muted mb-1 block">From Godown *</label>
              <select value={transferForm.fromGodownId} onChange={e => setTransferForm(p => ({ ...p, fromGodownId: e.target.value }))} className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm text-foreground">
                <option value="">Select Source</option>
                {godowns.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-sm text-muted mb-1 block">To Godown *</label>
              <select value={transferForm.toGodownId} onChange={e => setTransferForm(p => ({ ...p, toGodownId: e.target.value }))} className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm text-foreground">
                <option value="">Select Destination</option>
                {godowns.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="text-sm text-muted mb-1 block">Requested By</label>
            <input value={transferForm.requestedBy} onChange={e => setTransferForm(p => ({ ...p, requestedBy: e.target.value }))} className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/50" />
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm text-muted">Items</label>
              <button onClick={() => setTransferForm(f => ({ ...f, items: [...f.items, { productId: '', name: '', sku: '', quantity: 1 }] }))} className="text-xs text-accent hover:underline">+ Add Item</button>
            </div>
            {transferForm.items.map((item, i) => (
              <div key={i} className="grid grid-cols-12 gap-2 mb-2">
                <select value={item.productId} onChange={e => { const v = [...transferForm.items]; v[i].productId = e.target.value; setTransferForm(f => ({ ...f, items: v })) }} className="col-span-8 px-2 py-2 bg-surface border border-border rounded-lg text-sm text-foreground">
                  <option value="">Select Product</option>
                  {products.map(p => <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>)}
                </select>
                <input type="number" min="1" value={item.quantity} onChange={e => { const v = [...transferForm.items]; v[i].quantity = e.target.value; setTransferForm(f => ({ ...f, items: v })) }} placeholder="Qty" className="col-span-3 px-2 py-2 bg-surface border border-border rounded-lg text-sm text-foreground" />
                <button onClick={() => setTransferForm(f => ({ ...f, items: f.items.filter((_, j) => j !== i) }))} className="col-span-1 text-red-400 hover:text-red-300 text-lg">×</button>
              </div>
            ))}
          </div>
          <div>
            <label className="text-sm text-muted mb-1 block">Notes</label>
            <textarea value={transferForm.notes} onChange={e => setTransferForm(p => ({ ...p, notes: e.target.value }))} rows={2} className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/50" />
          </div>
          <button onClick={handleCreateTransfer} disabled={submitting || !transferForm.fromGodownId || !transferForm.toGodownId || !transferForm.items.some(i => i.productId)} className="w-full py-2.5 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent/90 disabled:opacity-50">
            {submitting ? 'Creating...' : 'Create Transfer'}
          </button>
        </div>
      </Modal>
    </div>
  )
}
