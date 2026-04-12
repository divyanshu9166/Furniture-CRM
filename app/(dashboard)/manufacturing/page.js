'use client'

import { useState, useEffect } from 'react'
import {
  Plus, Factory, Layers, PlayCircle, CheckCircle, Package,
  Eye, Settings, AlertTriangle
} from 'lucide-react'
import {
  getBOMs, createBOM, toggleBOMStatus, getProductionOrders,
  createProductionOrder, startProduction, completeProduction
} from '@/app/actions/manufacturing'
import { getProducts } from '@/app/actions/products'
import Modal from '@/components/Modal'

const prodStatusColors = {
  PLANNED: 'bg-gray-500/10 text-gray-400',
  IN_PROGRESS: 'bg-blue-500/10 text-blue-400',
  COMPLETED: 'bg-emerald-500/10 text-emerald-400',
  CANCELLED: 'bg-red-500/10 text-red-400',
}

export default function ManufacturingPage() {
  const [tab, setTab] = useState('bom')
  const [loading, setLoading] = useState(true)
  const [boms, setBoms] = useState([])
  const [orders, setOrders] = useState([])
  const [products, setProducts] = useState([])

  const [showBOMModal, setShowBOMModal] = useState(false)
  const [showProdModal, setShowProdModal] = useState(false)
  const [showCompleteModal, setShowCompleteModal] = useState(false)
  const [showDetailModal, setShowDetailModal] = useState(false)
  const [selectedOrder, setSelectedOrder] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  const [bomForm, setBomForm] = useState({ name: '', finishedProductId: '', version: '1.0', notes: '', items: [{ rawMaterialId: '', quantity: 1, unitOfMeasure: 'PCS', wastagePercent: 0, notes: '' }] })
  const [prodForm, setProdForm] = useState({ bomId: '', plannedQty: 1, startDate: '', notes: '' })
  const [completeForm, setCompleteForm] = useState({ productionOrderId: 0, actualQty: 0, totalLabourCost: 0, notes: '', consumptions: [] })

  const loadData = () => {
    setLoading(true)
    Promise.all([getBOMs(), getProductionOrders(), getProducts()]).then(([bomRes, ordRes, prodRes]) => {
      if (bomRes.success) setBoms(bomRes.data)
      if (ordRes.success) setOrders(ordRes.data)
      if (prodRes.success) setProducts(prodRes.data)
      setLoading(false)
    })
  }

  useEffect(() => { loadData() }, [])

  const handleCreateBOM = async () => {
    setSubmitting(true)
    const items = bomForm.items.filter(i => i.rawMaterialId).map(i => ({
      rawMaterialId: Number(i.rawMaterialId), quantity: Number(i.quantity),
      unitOfMeasure: i.unitOfMeasure, wastagePercent: Number(i.wastagePercent), notes: i.notes
    }))
    const res = await createBOM({ name: bomForm.name, finishedProductId: Number(bomForm.finishedProductId), version: bomForm.version, notes: bomForm.notes, items })
    if (res.success) {
      setShowBOMModal(false)
      setBomForm({ name: '', finishedProductId: '', version: '1.0', notes: '', items: [{ rawMaterialId: '', quantity: 1, unitOfMeasure: 'PCS', wastagePercent: 0, notes: '' }] })
      loadData()
    } else alert(res.error)
    setSubmitting(false)
  }

  const handleToggleBOM = async (id) => {
    const res = await toggleBOMStatus(id)
    if (res.success) loadData()
    else alert(res.error)
  }

  const handleCreateProd = async () => {
    setSubmitting(true)
    const res = await createProductionOrder({ bomId: Number(prodForm.bomId), plannedQty: Number(prodForm.plannedQty), startDate: prodForm.startDate || undefined, notes: prodForm.notes })
    if (res.success) {
      setShowProdModal(false)
      setProdForm({ bomId: '', plannedQty: 1, startDate: '', notes: '' })
      loadData()
    } else alert(res.error)
    setSubmitting(false)
  }

  const handleStartProd = async (id) => {
    const res = await startProduction(id)
    if (res.success) loadData()
    else alert(res.error)
  }

  const openCompleteModal = (order) => {
    setCompleteForm({
      productionOrderId: order.id,
      actualQty: order.plannedQty,
      totalLabourCost: 0,
      notes: '',
      consumptions: order.consumptions?.map(c => ({
        rawMaterialId: c.rawMaterialId,
        actualQty: c.plannedQty
      })) || []
    })
    setShowCompleteModal(true)
  }

  const handleCompleteProd = async () => {
    setSubmitting(true)
    const res = await completeProduction({
      ...completeForm,
      actualQty: Number(completeForm.actualQty),
      totalLabourCost: Number(completeForm.totalLabourCost),
      consumptions: completeForm.consumptions.map(c => ({ rawMaterialId: c.rawMaterialId, actualQty: Number(c.actualQty) }))
    })
    if (res.success) {
      setShowCompleteModal(false)
      loadData()
    } else alert(res.error)
    setSubmitting(false)
  }

  const tabs = [
    { id: 'bom', label: 'Bill of Materials', icon: Layers },
    { id: 'production', label: 'Production Orders', icon: Factory },
    { id: 'costing', label: 'Job Costing', icon: Settings },
  ]

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent" /></div>

  const completedOrders = orders.filter(o => o.status === 'COMPLETED')

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Manufacturing</h1>
          <p className="text-muted text-sm mt-1">Bill of Materials, production orders & job costing</p>
        </div>
        <div className="flex gap-2">
          {tab === 'bom' && <button onClick={() => setShowBOMModal(true)} className="px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent/90 flex items-center gap-2"><Plus className="w-4 h-4" /> New BOM</button>}
          {tab === 'production' && <button onClick={() => setShowProdModal(true)} className="px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent/90 flex items-center gap-2"><Plus className="w-4 h-4" /> New Production</button>}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Active BOMs', value: boms.filter(b => b.isActive).length, icon: Layers, color: 'text-blue-400' },
          { label: 'Total Orders', value: orders.length, icon: Factory, color: 'text-purple-400' },
          { label: 'In Progress', value: orders.filter(o => o.status === 'IN_PROGRESS').length, icon: PlayCircle, color: 'text-amber-400' },
          { label: 'Completed', value: completedOrders.length, icon: CheckCircle, color: 'text-emerald-400' },
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
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${tab === t.id ? 'bg-accent text-white' : 'text-muted hover:text-foreground'}`}>
            <t.icon className="w-4 h-4" /> {t.label}
          </button>
        ))}
      </div>

      {/* BOM Tab */}
      {tab === 'bom' && (
        <div className="space-y-4">
          {boms.map(bom => (
            <div key={bom.id} className="glass-card p-5">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="font-semibold text-foreground flex items-center gap-2">
                    {bom.name}
                    <span className={`text-[10px] px-2 py-0.5 rounded-full ${bom.isActive ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
                      {bom.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </h3>
                  <p className="text-xs text-muted mt-0.5">Finished: {bom.finishedProduct?.name} ({bom.finishedProduct?.sku}) — v{bom.version}</p>
                </div>
                <button onClick={() => handleToggleBOM(bom.id)} className={`px-3 py-1 rounded-lg text-xs ${bom.isActive ? 'bg-red-500/10 text-red-400 hover:bg-red-500/20' : 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20'}`}>
                  {bom.isActive ? 'Deactivate' : 'Activate'}
                </button>
              </div>
              <table className="w-full text-sm">
                <thead><tr className="border-b border-border">
                  {['Raw Material', 'SKU', 'Qty', 'UoM', 'Wastage %', 'Stock'].map(h => <th key={h} className="px-3 py-2 text-left text-xs font-medium text-muted">{h}</th>)}
                </tr></thead>
                <tbody>
                  {bom.items?.map((item, i) => (
                    <tr key={i} className="border-b border-border/50">
                      <td className="px-3 py-2 text-foreground">{item.rawMaterial?.name}</td>
                      <td className="px-3 py-2 text-muted">{item.rawMaterial?.sku}</td>
                      <td className="px-3 py-2 text-foreground">{item.quantity}</td>
                      <td className="px-3 py-2 text-muted">{item.unitOfMeasure}</td>
                      <td className="px-3 py-2 text-muted">{item.wastagePercent}%</td>
                      <td className="px-3 py-2">
                        <span className={item.rawMaterial?.stock < item.quantity ? 'text-red-400' : 'text-emerald-400'}>
                          {item.rawMaterial?.stock} {item.rawMaterial?.unitOfMeasure}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {bom.notes && <p className="text-xs text-muted mt-2">Notes: {bom.notes}</p>}
            </div>
          ))}
          {boms.length === 0 && <div className="text-center py-12 text-muted">No Bill of Materials created yet</div>}
        </div>
      )}

      {/* Production Orders Tab */}
      {tab === 'production' && (
        <div className="glass-card overflow-hidden">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-border">
              {['Order #', 'BOM', 'Product', 'Planned', 'Actual', 'Status', 'Start', 'Completed', 'Actions'].map(h => <th key={h} className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">{h}</th>)}
            </tr></thead>
            <tbody>
              {orders.map(o => (
                <tr key={o.id} className="border-b border-border/50 hover:bg-surface-hover transition-colors">
                  <td className="px-4 py-3 font-medium text-foreground">{o.displayId}</td>
                  <td className="px-4 py-3 text-foreground">{o.bom?.name}</td>
                  <td className="px-4 py-3 text-foreground">{o.finishedProduct?.name}</td>
                  <td className="px-4 py-3 text-foreground">{o.plannedQty}</td>
                  <td className="px-4 py-3 text-foreground">{o.actualQty || '—'}</td>
                  <td className="px-4 py-3"><span className={`px-2 py-1 rounded-full text-xs font-medium ${prodStatusColors[o.status] || ''}`}>{o.status?.replace(/_/g, ' ')}</span></td>
                  <td className="px-4 py-3 text-muted">{o.startDate ? new Date(o.startDate).toLocaleDateString('en-IN') : '—'}</td>
                  <td className="px-4 py-3 text-muted">{o.completedDate ? new Date(o.completedDate).toLocaleDateString('en-IN') : '—'}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button onClick={() => { setSelectedOrder(o); setShowDetailModal(true) }} className="p-1.5 rounded-lg hover:bg-surface-hover text-muted hover:text-foreground" title="View"><Eye className="w-4 h-4" /></button>
                      {o.status === 'PLANNED' && <button onClick={() => handleStartProd(o.id)} className="p-1.5 rounded-lg hover:bg-blue-500/10 text-muted hover:text-blue-400" title="Start"><PlayCircle className="w-4 h-4" /></button>}
                      {o.status === 'IN_PROGRESS' && <button onClick={() => openCompleteModal(o)} className="p-1.5 rounded-lg hover:bg-emerald-500/10 text-muted hover:text-emerald-400" title="Complete"><CheckCircle className="w-4 h-4" /></button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {orders.length === 0 && <div className="text-center py-12 text-muted">No production orders yet</div>}
        </div>
      )}

      {/* Job Costing Tab */}
      {tab === 'costing' && (
        <div className="space-y-4">
          {completedOrders.length === 0 && <div className="text-center py-12 text-muted">No completed production orders for costing analysis</div>}
          {completedOrders.map(o => (
            <div key={o.id} className="glass-card p-5">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="font-semibold text-foreground">{o.displayId} — {o.finishedProduct?.name}</h3>
                  <p className="text-xs text-muted mt-0.5">Produced: {o.actualQty} units</p>
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                <div className="bg-surface-hover p-3 rounded-lg">
                  <p className="text-xs text-muted">Material Cost</p>
                  <p className="text-lg font-semibold text-foreground">₹{(o.totalMaterialCost || 0).toLocaleString('en-IN')}</p>
                </div>
                <div className="bg-surface-hover p-3 rounded-lg">
                  <p className="text-xs text-muted">Labour Cost</p>
                  <p className="text-lg font-semibold text-foreground">₹{(o.totalLabourCost || 0).toLocaleString('en-IN')}</p>
                </div>
                <div className="bg-surface-hover p-3 rounded-lg">
                  <p className="text-xs text-muted">Total Cost</p>
                  <p className="text-lg font-semibold text-foreground">₹{((o.totalMaterialCost || 0) + (o.totalLabourCost || 0)).toLocaleString('en-IN')}</p>
                </div>
                <div className="bg-surface-hover p-3 rounded-lg">
                  <p className="text-xs text-muted">Cost/Unit</p>
                  <p className="text-lg font-semibold text-accent">₹{o.actualQty ? Math.round(((o.totalMaterialCost || 0) + (o.totalLabourCost || 0)) / o.actualQty).toLocaleString('en-IN') : '—'}</p>
                </div>
              </div>
              {o.consumptions?.length > 0 && (
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-border">
                    {['Material', 'Planned', 'Actual', 'Unit Cost', 'Total Cost'].map(h => <th key={h} className="px-3 py-2 text-left text-xs font-medium text-muted">{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {o.consumptions.map((c, i) => (
                      <tr key={i} className="border-b border-border/50">
                        <td className="px-3 py-2 text-foreground">{c.rawMaterial?.name}</td>
                        <td className="px-3 py-2 text-muted">{c.plannedQty} {c.rawMaterial?.unitOfMeasure}</td>
                        <td className="px-3 py-2 text-foreground">{c.actualQty} {c.rawMaterial?.unitOfMeasure}</td>
                        <td className="px-3 py-2 text-foreground">₹{c.unitCost?.toLocaleString('en-IN')}</td>
                        <td className="px-3 py-2 text-foreground">₹{c.totalCost?.toLocaleString('en-IN')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Production Order Detail Modal */}
      <Modal isOpen={showDetailModal} onClose={() => setShowDetailModal(false)} title={`Production Order: ${selectedOrder?.displayId}`} size="lg">
        {selectedOrder && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div><span className="text-muted">BOM:</span> <span className="text-foreground font-medium ml-1">{selectedOrder.bom?.name}</span></div>
              <div><span className="text-muted">Product:</span> <span className="text-foreground ml-1">{selectedOrder.finishedProduct?.name}</span></div>
              <div><span className="text-muted">Planned Qty:</span> <span className="text-foreground ml-1">{selectedOrder.plannedQty}</span></div>
              <div><span className="text-muted">Actual Qty:</span> <span className="text-foreground ml-1">{selectedOrder.actualQty || '—'}</span></div>
              <div><span className="text-muted">Status:</span> <span className={`ml-1 px-2 py-0.5 rounded-full text-xs ${prodStatusColors[selectedOrder.status]}`}>{selectedOrder.status}</span></div>
            </div>
            {selectedOrder.consumptions?.length > 0 && (
              <>
                <h4 className="text-sm font-medium text-foreground">Material Consumption</h4>
                <table className="w-full text-sm border border-border rounded-lg overflow-hidden">
                  <thead><tr className="bg-surface-hover">
                    {['Material', 'Planned', 'Actual', 'Unit Cost', 'Total'].map(h => <th key={h} className="px-3 py-2 text-left text-xs font-medium text-muted">{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {selectedOrder.consumptions.map((c, i) => (
                      <tr key={i} className="border-t border-border/50">
                        <td className="px-3 py-2 text-foreground">{c.rawMaterial?.name}</td>
                        <td className="px-3 py-2 text-muted">{c.plannedQty}</td>
                        <td className="px-3 py-2 text-foreground">{c.actualQty || '—'}</td>
                        <td className="px-3 py-2 text-foreground">₹{c.unitCost?.toLocaleString('en-IN')}</td>
                        <td className="px-3 py-2 text-foreground">₹{c.totalCost?.toLocaleString('en-IN')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </div>
        )}
      </Modal>

      {/* Create BOM Modal */}
      <Modal isOpen={showBOMModal} onClose={() => setShowBOMModal(false)} title="Create Bill of Materials" size="lg">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-muted mb-1 block">BOM Name *</label>
              <input value={bomForm.name} onChange={e => setBomForm(p => ({ ...p, name: e.target.value }))} className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/50" />
            </div>
            <div>
              <label className="text-sm text-muted mb-1 block">Finished Product *</label>
              <select value={bomForm.finishedProductId} onChange={e => setBomForm(p => ({ ...p, finishedProductId: e.target.value }))} className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm text-foreground">
                <option value="">Select Product</option>
                {products.map(p => <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-muted mb-1 block">Version</label>
              <input value={bomForm.version} onChange={e => setBomForm(p => ({ ...p, version: e.target.value }))} className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/50" />
            </div>
            <div>
              <label className="text-sm text-muted mb-1 block">Notes</label>
              <input value={bomForm.notes} onChange={e => setBomForm(p => ({ ...p, notes: e.target.value }))} className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/50" />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm text-muted">Raw Materials</label>
              <button onClick={() => setBomForm(f => ({ ...f, items: [...f.items, { rawMaterialId: '', quantity: 1, unitOfMeasure: 'PCS', wastagePercent: 0, notes: '' }] }))} className="text-xs text-accent hover:underline">+ Add Material</button>
            </div>
            {bomForm.items.map((item, i) => (
              <div key={i} className="grid grid-cols-12 gap-2 mb-2">
                <select value={item.rawMaterialId} onChange={e => { const v = [...bomForm.items]; v[i].rawMaterialId = e.target.value; setBomForm(f => ({ ...f, items: v })) }} className="col-span-5 px-2 py-2 bg-surface border border-border rounded-lg text-sm text-foreground">
                  <option value="">Select Material</option>
                  {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <input type="number" min="0.1" step="0.1" value={item.quantity} onChange={e => { const v = [...bomForm.items]; v[i].quantity = e.target.value; setBomForm(f => ({ ...f, items: v })) }} placeholder="Qty" className="col-span-2 px-2 py-2 bg-surface border border-border rounded-lg text-sm text-foreground" />
                <input value={item.unitOfMeasure} onChange={e => { const v = [...bomForm.items]; v[i].unitOfMeasure = e.target.value; setBomForm(f => ({ ...f, items: v })) }} placeholder="UoM" className="col-span-2 px-2 py-2 bg-surface border border-border rounded-lg text-sm text-foreground" />
                <input type="number" min="0" value={item.wastagePercent} onChange={e => { const v = [...bomForm.items]; v[i].wastagePercent = e.target.value; setBomForm(f => ({ ...f, items: v })) }} placeholder="Waste%" className="col-span-2 px-2 py-2 bg-surface border border-border rounded-lg text-sm text-foreground" />
                <button onClick={() => setBomForm(f => ({ ...f, items: f.items.filter((_, j) => j !== i) }))} className="col-span-1 text-red-400 hover:text-red-300 text-lg">×</button>
              </div>
            ))}
          </div>

          <button onClick={handleCreateBOM} disabled={submitting || !bomForm.name || !bomForm.finishedProductId || !bomForm.items.some(i => i.rawMaterialId)} className="w-full py-2.5 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent/90 disabled:opacity-50">
            {submitting ? 'Creating...' : 'Create BOM'}
          </button>
        </div>
      </Modal>

      {/* Create Production Order Modal */}
      <Modal isOpen={showProdModal} onClose={() => setShowProdModal(false)} title="Create Production Order">
        <div className="space-y-4">
          <div>
            <label className="text-sm text-muted mb-1 block">Bill of Materials *</label>
            <select value={prodForm.bomId} onChange={e => setProdForm(p => ({ ...p, bomId: e.target.value }))} className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm text-foreground">
              <option value="">Select BOM</option>
              {boms.filter(b => b.isActive).map(b => <option key={b.id} value={b.id}>{b.name} — {b.finishedProduct?.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-muted mb-1 block">Planned Quantity *</label>
              <input type="number" min="1" value={prodForm.plannedQty} onChange={e => setProdForm(p => ({ ...p, plannedQty: e.target.value }))} className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/50" />
            </div>
            <div>
              <label className="text-sm text-muted mb-1 block">Start Date</label>
              <input type="date" value={prodForm.startDate} onChange={e => setProdForm(p => ({ ...p, startDate: e.target.value }))} className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/50" />
            </div>
          </div>
          <div>
            <label className="text-sm text-muted mb-1 block">Notes</label>
            <textarea value={prodForm.notes} onChange={e => setProdForm(p => ({ ...p, notes: e.target.value }))} rows={2} className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/50" />
          </div>
          <button onClick={handleCreateProd} disabled={submitting || !prodForm.bomId} className="w-full py-2.5 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent/90 disabled:opacity-50">
            {submitting ? 'Creating...' : 'Create Production Order'}
          </button>
        </div>
      </Modal>

      {/* Complete Production Modal */}
      <Modal isOpen={showCompleteModal} onClose={() => setShowCompleteModal(false)} title="Complete Production" size="lg">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-muted mb-1 block">Actual Quantity Produced *</label>
              <input type="number" min="0" value={completeForm.actualQty} onChange={e => setCompleteForm(p => ({ ...p, actualQty: e.target.value }))} className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/50" />
            </div>
            <div>
              <label className="text-sm text-muted mb-1 block">Total Labour Cost</label>
              <input type="number" min="0" value={completeForm.totalLabourCost} onChange={e => setCompleteForm(p => ({ ...p, totalLabourCost: e.target.value }))} className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/50" />
            </div>
          </div>

          <div>
            <label className="text-sm text-muted mb-2 block">Actual Material Consumption</label>
            {completeForm.consumptions.map((c, i) => {
              const prod = products.find(p => p.id === c.rawMaterialId)
              return (
                <div key={i} className="flex items-center gap-3 mb-2">
                  <span className="text-sm text-foreground flex-1">{prod?.name || `Material #${c.rawMaterialId}`}</span>
                  <input type="number" min="0" step="0.1" value={c.actualQty} onChange={e => { const v = [...completeForm.consumptions]; v[i].actualQty = e.target.value; setCompleteForm(f => ({ ...f, consumptions: v })) }} className="w-24 px-2 py-1.5 bg-surface border border-border rounded-lg text-sm text-foreground" />
                </div>
              )
            })}
          </div>

          <div>
            <label className="text-sm text-muted mb-1 block">Notes</label>
            <textarea value={completeForm.notes} onChange={e => setCompleteForm(p => ({ ...p, notes: e.target.value }))} rows={2} className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/50" />
          </div>

          <button onClick={handleCompleteProd} disabled={submitting || !completeForm.actualQty} className="w-full py-2.5 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent/90 disabled:opacity-50">
            {submitting ? 'Completing...' : 'Complete Production'}
          </button>
        </div>
      </Modal>
    </div>
  )
}
