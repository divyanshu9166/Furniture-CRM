'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  Plus, Factory, Layers, PlayCircle, CheckCircle, Package,
  Eye, AlertTriangle, Pause, XCircle, Wrench,
  TrendingUp, BarChart3, Search, Trash2,
  ChevronDown, ChevronUp, RefreshCw,
  ShieldCheck, FlameKindling, Star, Cpu, Activity,
  Download, Edit2, Save, X, FileText, BookTemplate,
  Clock, DollarSign, Zap, Copy,
} from 'lucide-react'
import {
  getBOMs, createBOM, toggleBOMStatus, deleteBOM,
  addBOMItem, updateBOMItem, removeBOMItem,
  addBOMStep, updateBOMStep, removeBOMStep,
  exportBOM,
  getBomTemplates, createBomTemplate, deleteBomTemplate,
  getWorkCenters, createWorkCenter, updateWorkCenterStatus, deleteWorkCenter,
  getProductionOrders, getAssignableStaff, createProductionOrder, startProduction,
  holdProduction, cancelProductionOrder, deleteProductionOrder,
  completeProduction, recordQualityCheck,
  getMRPAnalysis, getManufacturingStats, updateProductionStep,
} from '@/app/actions/manufacturing'
import { getProducts, createProduct, deleteProduct, updateProduct } from '@/app/actions/products'
import Modal from '@/components/Modal'

// ─── Constants ────────────────────────────────────────
const PRIORITY_COLORS = {
  LOW: 'bg-gray-500/10 text-gray-400 border border-gray-500/20',
  MEDIUM: 'bg-blue-500/10 text-blue-400 border border-blue-500/20',
  HIGH: 'bg-amber-500/10 text-amber-400 border border-amber-500/20',
  URGENT: 'bg-red-500/10 text-red-400 border border-red-500/20',
}

const STATUS_COLORS = {
  PLANNED: 'bg-gray-500/10 text-gray-400',
  IN_PROGRESS: 'bg-blue-500/10 text-blue-400',
  COMPLETED: 'bg-emerald-500/10 text-emerald-400',
  CANCELLED: 'bg-red-500/10 text-red-400',
  ON_HOLD: 'bg-amber-500/10 text-amber-400',
}

const QUALITY_COLORS = {
  PENDING: 'bg-gray-500/10 text-gray-400',
  PASSED: 'bg-emerald-500/10 text-emerald-400',
  FAILED: 'bg-red-500/10 text-red-400',
  PARTIAL: 'bg-amber-500/10 text-amber-400',
}

const WC_TYPES = ['Carpentry', 'Polishing', 'Upholstery', 'Finishing', 'Assembly', 'QC', 'Packaging', 'General']
const INP = 'w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/50'
const SEL = 'w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm text-foreground focus:outline-none'

// ─── CSV Export Helper ────────────────────────────────
function downloadBOMCSV(bom) {
  const rows = []
  rows.push(['BOM Name', bom.name])
  rows.push(['Product', bom.finishedProduct?.name ?? ''])
  rows.push(['SKU', bom.finishedProduct?.sku ?? ''])
  rows.push(['Version', bom.version])
  rows.push(['Estimated Days', bom.estimatedDays ?? ''])
  rows.push([])
  rows.push(['=== RAW MATERIALS ==='])
  rows.push(['Material', 'SKU', 'Quantity', 'UoM', 'Wastage%', 'Unit Cost (₹)', 'Total Cost (₹)'])
  bom.items?.forEach(i => {
    const uc = i.unitCost > 0 ? i.unitCost : (i.rawMaterial?.costPrice ?? 0)
    rows.push([
      i.rawMaterial?.name ?? '',
      i.rawMaterial?.sku ?? '',
      i.quantity,
      i.unitOfMeasure,
      i.wastagePercent + '%',
      uc,
      Math.round(i.quantity * uc),
    ])
  })
  const matTotal = bom.items?.reduce((s, i) => {
    const uc = i.unitCost > 0 ? i.unitCost : (i.rawMaterial?.costPrice ?? 0)
    return s + Math.round(i.quantity * uc)
  }, 0) ?? 0
  rows.push(['', '', '', '', '', 'Total Material Cost', matTotal])
  rows.push([])
  rows.push(['=== MANUFACTURING STEPS (JOB COSTING) ==='])
  rows.push(['Step', 'Operation', 'Work Center', 'Duration (min)', 'Labour Rate ₹/hr', 'Labour Cost/unit ₹', 'Machine Cost/unit ₹', 'Total/unit ₹'])
  let totalStepCost = 0
  bom.steps?.forEach(s => {
    const lc = Math.round((s.durationMins / 60) * s.labourRatePerHour * 100) / 100
    const mc = s.machineCostPerUnit ?? 0
    const total = lc + mc
    totalStepCost += total
    rows.push([s.stepNumber, s.operationName, s.workCenter?.name ?? '', s.durationMins, s.labourRatePerHour, lc.toFixed(2), mc, total.toFixed(2)])
  })
  rows.push(['', '', '', '', '', '', 'Total Step Cost/unit', totalStepCost.toFixed(2)])
  rows.push([])
  rows.push(['=== COST SUMMARY (per unit) ==='])
  rows.push(['Material Cost', matTotal])
  rows.push(['Labour + Machine Cost', totalStepCost.toFixed(2)])
  rows.push(['Estimated Total Cost', (matTotal + totalStepCost).toFixed(2)])
  rows.push(['Selling Price', bom.finishedProduct?.price ?? 0])
  rows.push(['Est. Margin', bom.finishedProduct?.price ? (((bom.finishedProduct.price - matTotal - totalStepCost) / bom.finishedProduct.price) * 100).toFixed(1) + '%' : 'N/A'])

  const csv = rows.map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `BOM_${bom.name.replace(/\s+/g, '_')}_v${bom.version}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// ─── Main Page ────────────────────────────────────────
export default function ManufacturingPage() {
  const [tab, setTab] = useState('production')
  const [loading, setLoading] = useState(true)

  // Data
  const [boms, setBoms] = useState([])
  const [orders, setOrders] = useState([])
  const [products, setProducts] = useState([])
  const [workCenters, setWorkCenters] = useState([])
  const [staffOptions, setStaffOptions] = useState([])
  const [stats, setStats] = useState(null)
  const [templates, setTemplates] = useState([])

  // Modals
  const [showBOMModal, setShowBOMModal] = useState(false)
  const [showProdModal, setShowProdModal] = useState(false)
  const [showCompleteModal, setShowCompleteModal] = useState(false)
  const [showDetailModal, setShowDetailModal] = useState(false)
  const [showWCModal, setShowWCModal] = useState(false)
  const [showCancelModal, setShowCancelModal] = useState(false)
  const [showQCModal, setShowQCModal] = useState(false)
  const [showDeleteProdModal, setShowDeleteProdModal] = useState(false)
  const [showTemplateModal, setShowTemplateModal] = useState(false)

  // Selected items
  const [selectedOrder, setSelectedOrder] = useState(null)
  const [cancelTarget, setCancelTarget] = useState(null)
  const [cancelReason, setCancelReason] = useState('')
  const [qcTarget, setQcTarget] = useState(null)
  const [deleteProdTarget, setDeleteProdTarget] = useState(null)

  // MRP
  const [mrpBomId, setMrpBomId] = useState('')
  const [mrpQty, setMrpQty] = useState(1)
  const [mrpResult, setMrpResult] = useState(null)
  const [mrpLoading, setMrpLoading] = useState(false)

  // Search/filter
  const [orderSearch, setOrderSearch] = useState('')
  const [orderStatusFilter, setOrderStatusFilter] = useState('ALL')
  const [orderPriorityFilter, setOrderPriorityFilter] = useState('ALL')

  const [submitting, setSubmitting] = useState(false)

  // Raw material form
  const [rmForm, setRmForm] = useState({ name: '', costPrice: 0, stock: 0, unitOfMeasure: 'PCS', reorderLevel: 5, description: '' })
  const [rmSearch, setRmSearch] = useState('')
  const [editingRmId, setEditingRmId] = useState(null)
  const [rmEditForm, setRmEditForm] = useState({})

  // BOM form
  const [bomForm, setBomForm] = useState({
    name: '', finishedProductId: '', version: '1.0', estimatedDays: '', notes: '',
    items: [{ rawMaterialId: '', quantity: 1, unitOfMeasure: 'PCS', wastagePercent: 0, unitCost: 0, notes: '' }],
    steps: [],
    templateId: '',
  })

  // Production form
  const [prodForm, setProdForm] = useState({
    bomId: '', plannedQty: 1, priority: 'MEDIUM', dueDate: '', startDate: '',
    workCenterId: '', assignedStaffId: '', notes: '',
  })

  // Complete form
  const [completeForm, setCompleteForm] = useState({
    productionOrderId: 0, actualQty: 0, totalLabourCost: 0, overheadCost: 0, machineCost: 0,
    scrapQty: 0, scrapReason: '', qualityStatus: 'PASSED', qualityNotes: '', notes: '',
    consumptions: [],
  })

  // Work center form
  const [wcForm, setWcForm] = useState({ name: '', type: 'General', description: '', capacity: 1, notes: '' })

  // QC form
  const [qcForm, setQcForm] = useState({ qualityStatus: 'PASSED', qualityNotes: '', scrapQty: 0, scrapReason: '' })

  // Template form
  const [templateForm, setTemplateForm] = useState({ name: '', description: '', steps: [] })

  const loadData = useCallback(async () => {
    setLoading(true)
    const [bomRes, ordRes, prodRes, wcRes, statsRes, tmplRes, staffRes] = await Promise.all([
      getBOMs(), getProductionOrders(), getProducts(),
      getWorkCenters(), getManufacturingStats(), getBomTemplates(), getAssignableStaff(),
    ])
    if (bomRes.success) setBoms(bomRes.data)
    if (ordRes.success) setOrders(ordRes.data)
    if (prodRes.success) setProducts(prodRes.data)
    if (wcRes.success) setWorkCenters(wcRes.data)
    if (statsRes.success) setStats(statsRes.data)
    if (tmplRes.success) setTemplates(tmplRes.data)
    if (staffRes.success) setStaffOptions(staffRes.data)
    setLoading(false)
  }, [])

  useEffect(() => { loadData() }, [loadData])

  // Auto-refresh production data every 30s so admin sees staff progress updates
  useEffect(() => {
    const interval = setInterval(async () => {
      const ordRes = await getProductionOrders()
      if (ordRes.success) setOrders(ordRes.data)
      const statsRes = await getManufacturingStats()
      if (statsRes.success) setStats(statsRes.data)
    }, 30000)
    return () => clearInterval(interval)
  }, [])

  // Filtered orders
  const filteredOrders = useMemo(() => {
    return orders.filter(o => {
      const matchSearch = !orderSearch ||
        o.displayId.toLowerCase().includes(orderSearch.toLowerCase()) ||
        o.finishedProduct?.name.toLowerCase().includes(orderSearch.toLowerCase()) ||
        o.bom?.name.toLowerCase().includes(orderSearch.toLowerCase())
      const matchStatus = orderStatusFilter === 'ALL' || o.status === orderStatusFilter
      const matchPriority = orderPriorityFilter === 'ALL' || o.priority === orderPriorityFilter
      return matchSearch && matchStatus && matchPriority
    })
  }, [orders, orderSearch, orderStatusFilter, orderPriorityFilter])

  // ─── Apply template to BOM steps ─────────────────────
  const applyTemplate = (templateId) => {
    const t = templates.find(t => t.id === Number(templateId))
    if (!t) return
    const steps = (t.steps || []).map((s, idx) => ({
      operationName: s.operationName || '',
      workCenterId: s.workCenterId || '',
      durationMins: s.durationMins || 60,
      labourRatePerHour: s.labourRatePerHour || 0,
      machineCostPerUnit: s.machineCostPerUnit || 0,
      notes: s.notes || '',
    }))
    setBomForm(f => ({ ...f, steps, templateId }))
  }

  // ─── Handlers ─────────────────────────────────────
  const handleCreateBOM = async () => {
    setSubmitting(true)
    const items = bomForm.items.filter(i => i.rawMaterialId).map(i => ({
      rawMaterialId: Number(i.rawMaterialId), quantity: Number(i.quantity),
      unitOfMeasure: i.unitOfMeasure, wastagePercent: Number(i.wastagePercent),
      unitCost: Number(i.unitCost) || 0,
      notes: i.notes || undefined,
    }))
    const steps = bomForm.steps.filter(s => s.operationName).map((s, idx) => ({
      stepNumber: idx + 1, operationName: s.operationName,
      workCenterId: s.workCenterId ? Number(s.workCenterId) : undefined,
      durationMins: Number(s.durationMins) || 60,
      labourRatePerHour: Number(s.labourRatePerHour) || 0,
      machineCostPerUnit: Number(s.machineCostPerUnit) || 0,
      notes: s.notes || undefined,
    }))
    const res = await createBOM({
      name: bomForm.name, finishedProductId: Number(bomForm.finishedProductId),
      version: bomForm.version, estimatedDays: bomForm.estimatedDays ? Number(bomForm.estimatedDays) : undefined,
      notes: bomForm.notes || undefined, items,
      steps: steps.length > 0 ? steps : undefined,
    })
    if (res.success) {
      setShowBOMModal(false)
      setBomForm({ name: '', finishedProductId: '', version: '1.0', estimatedDays: '', notes: '', items: [{ rawMaterialId: '', quantity: 1, unitOfMeasure: 'PCS', wastagePercent: 0, unitCost: 0, notes: '' }], steps: [], templateId: '' })
      loadData()
    } else alert(res.error)
    setSubmitting(false)
  }

  const handleCreateProd = async () => {
    setSubmitting(true)
    const res = await createProductionOrder({
      bomId: Number(prodForm.bomId), plannedQty: Number(prodForm.plannedQty),
      priority: prodForm.priority, dueDate: prodForm.dueDate || undefined,
      startDate: prodForm.startDate || undefined,
      workCenterId: prodForm.workCenterId ? Number(prodForm.workCenterId) : undefined,
      assignedStaffId: prodForm.assignedStaffId ? Number(prodForm.assignedStaffId) : undefined,
      notes: prodForm.notes || undefined,
    })
    if (res.success) {
      setShowProdModal(false)
      setProdForm({ bomId: '', plannedQty: 1, priority: 'MEDIUM', dueDate: '', startDate: '', workCenterId: '', assignedStaffId: '', notes: '' })
      loadData()
    } else alert(res.error)
    setSubmitting(false)
  }

  const handleStartProd = async (id) => {
    const res = await startProduction(id)
    if (res.success) loadData()
    else alert(res.error)
  }

  const handleHoldProd = async (id) => {
    const res = await holdProduction(id)
    if (res.success) loadData()
    else alert(res.error)
  }

  const handleCancelProd = async () => {
    if (!cancelTarget || !cancelReason.trim()) return
    setSubmitting(true)
    const res = await cancelProductionOrder(cancelTarget.id, cancelReason)
    if (res.success) {
      setShowCancelModal(false)
      setCancelReason('')
      setCancelTarget(null)
      loadData()
    } else alert(res.error)
    setSubmitting(false)
  }

  const handleDeleteProd = async () => {
    if (!deleteProdTarget) return
    setSubmitting(true)
    const res = await deleteProductionOrder(deleteProdTarget.id)
    if (res.success) {
      setShowDeleteProdModal(false)
      setDeleteProdTarget(null)
      loadData()
    } else alert(res.error)
    setSubmitting(false)
  }

  const openCompleteModal = (order) => {
    setCompleteForm({
      productionOrderId: order.id,
      actualQty: order.plannedQty,
      totalLabourCost: 0,
      overheadCost: 0,
      machineCost: 0,
      scrapQty: 0, scrapReason: '',
      qualityStatus: 'PASSED', qualityNotes: '', notes: '',
      consumptions: order.consumptions?.map(c => ({ rawMaterialId: c.rawMaterialId, plannedQty: c.plannedQty, actualQty: c.plannedQty })) || [],
    })
    setSelectedOrder(order)
    setShowCompleteModal(true)
  }

  const handleCompleteProd = async () => {
    setSubmitting(true)
    const res = await completeProduction({
      ...completeForm,
      actualQty: Number(completeForm.actualQty),
      totalLabourCost: Number(completeForm.totalLabourCost),
      overheadCost: Number(completeForm.overheadCost),
      machineCost: Number(completeForm.machineCost),
      scrapQty: Number(completeForm.scrapQty),
      consumptions: completeForm.consumptions.map(c => ({ rawMaterialId: c.rawMaterialId, actualQty: Number(c.actualQty) })),
    })
    if (res.success) { setShowCompleteModal(false); loadData() }
    else alert(res.error)
    setSubmitting(false)
  }

  const handleCreateWC = async () => {
    setSubmitting(true)
    const res = await createWorkCenter({ ...wcForm, capacity: Number(wcForm.capacity) })
    if (res.success) {
      setShowWCModal(false)
      setWcForm({ name: '', type: 'General', description: '', capacity: 1, notes: '' })
      loadData()
    } else alert(res.error)
    setSubmitting(false)
  }

  const handleRunMRP = async () => {
    if (!mrpBomId) return
    setMrpLoading(true)
    const res = await getMRPAnalysis(Number(mrpBomId), Number(mrpQty))
    if (res.success) setMrpResult(res.data)
    else alert(res.error)
    setMrpLoading(false)
  }

  const handleQCSubmit = async () => {
    if (!qcTarget) return
    setSubmitting(true)
    const res = await recordQualityCheck({ productionOrderId: qcTarget.id, ...qcForm, scrapQty: Number(qcForm.scrapQty) })
    if (res.success) { setShowQCModal(false); setQcTarget(null); loadData() }
    else alert(res.error)
    setSubmitting(false)
  }

  const handleCreateTemplate = async () => {
    setSubmitting(true)
    const steps = templateForm.steps.filter(s => s.operationName).map((s, idx) => ({
      stepNumber: idx + 1,
      operationName: s.operationName,
      workCenterId: s.workCenterId ? Number(s.workCenterId) : undefined,
      durationMins: Number(s.durationMins) || 60,
      labourRatePerHour: Number(s.labourRatePerHour) || 0,
      machineCostPerUnit: Number(s.machineCostPerUnit) || 0,
      notes: s.notes || undefined,
    }))
    const res = await createBomTemplate({ name: templateForm.name, description: templateForm.description || undefined, steps })
    if (res.success) {
      setShowTemplateModal(false)
      setTemplateForm({ name: '', description: '', steps: [] })
      loadData()
    } else alert(res.error)
    setSubmitting(false)
  }

  // ─── Raw Material Handlers ──────────────────
  const generateRMSku = () => {
    const existing = products.filter(p => p.category === 'Raw Material')
    const nextNum = existing.length + 1
    return `RM-${String(nextNum).padStart(3, '0')}`
  }

  const handleCreateRawMaterial = async () => {
    if (!rmForm.name) return alert('Name is required')
    setSubmitting(true)
    // Auto-generate a unique SKU
    let sku = generateRMSku()
    // If it already exists, keep incrementing
    const existingSkus = new Set(products.map(p => p.sku))
    let counter = products.filter(p => p.category === 'Raw Material').length + 1
    while (existingSkus.has(sku)) {
      counter++
      sku = `RM-${String(counter).padStart(3, '0')}`
    }
    const res = await createProduct({
      name: rmForm.name,
      sku,
      category: 'Raw Material',
      price: 0,
      costPrice: Number(rmForm.costPrice) || 0,
      stock: Number(rmForm.stock) || 0,
      unitOfMeasure: rmForm.unitOfMeasure || 'PCS',
      reorderLevel: Number(rmForm.reorderLevel) || 5,
      description: rmForm.description || undefined,
    })
    if (res.success) {
      setRmForm({ name: '', costPrice: 0, stock: 0, unitOfMeasure: 'PCS', reorderLevel: 5, description: '' })
      loadData()
    } else {
      alert(res.error)
    }
    setSubmitting(false)
  }

  const handleDeleteRawMaterial = async (id, name) => {
    if (!confirm(`Delete raw material "${name}"? This cannot be undone.`)) return
    setSubmitting(true)
    const res = await deleteProduct(id)
    if (res.success) loadData()
    else alert(res.error)
    setSubmitting(false)
  }

  const handleUpdateRawMaterial = async (id) => {
    setSubmitting(true)
    const res = await updateProduct(id, {
      name: rmEditForm.name,
      stock: Number(rmEditForm.stock) || 0,
      reorderLevel: Number(rmEditForm.reorderLevel) || 5,
      description: rmEditForm.description || undefined,
    })
    if (res.success) { setEditingRmId(null); loadData() }
    else alert(res.error)
    setSubmitting(false)
  }

  // Filter raw materials (products with category "Raw Material")
  const rawMaterials = useMemo(() => {
    return products.filter(p =>
      p.category === 'Raw Material' &&
      (!rmSearch || p.name.toLowerCase().includes(rmSearch.toLowerCase()) || p.sku.toLowerCase().includes(rmSearch.toLowerCase()))
    )
  }, [products, rmSearch])

  const TABS = [
    { id: 'production', label: 'Production Orders', icon: Factory },
    { id: 'bom', label: 'Bill of Materials', icon: Layers },
    { id: 'materials', label: 'Raw Materials', icon: Package },
    { id: 'workcenters', label: 'Work Centers', icon: Wrench },
    { id: 'mrp', label: 'MRP Planner', icon: Cpu },
    { id: 'quality', label: 'Quality & Scrap', icon: ShieldCheck },
    { id: 'analytics', label: 'Analytics', icon: BarChart3 },
    { id: 'costing', label: 'Job Costing', icon: Activity },
  ]

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent" />
    </div>
  )

  const completedOrders = orders.filter(o => o.status === 'COMPLETED')
  const overdueOrders = orders.filter(o => o.dueDate && new Date(o.dueDate) < new Date() && !['COMPLETED','CANCELLED'].includes(o.status))

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Manufacturing</h1>
          <p className="text-muted text-sm mt-0.5">BOM · Production Orders · Work Centers · MRP · Quality · Costing</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {tab === 'bom' && (
            <>
              <button onClick={() => setShowTemplateModal(true)} className="px-4 py-2 bg-surface border border-border text-foreground rounded-lg text-sm font-medium hover:bg-surface-hover flex items-center gap-2">
                <FileText className="w-4 h-4" /> Templates
              </button>
              <button onClick={() => setShowBOMModal(true)} className="px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent/90 flex items-center gap-2">
                <Plus className="w-4 h-4" /> New BOM
              </button>
            </>
          )}
          {tab === 'production' && (
            <button onClick={() => setShowProdModal(true)} className="px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent/90 flex items-center gap-2">
              <Plus className="w-4 h-4" /> New Production Order
            </button>
          )}
          {tab === 'workcenters' && (
            <button onClick={() => setShowWCModal(true)} className="px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent/90 flex items-center gap-2">
              <Plus className="w-4 h-4" /> New Work Center
            </button>
          )}
          <button onClick={loadData} className="px-3 py-2 bg-surface border border-border rounded-lg text-sm text-muted hover:text-foreground flex items-center gap-1.5">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* KPI Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        {[
          { label: 'Total Orders', value: orders.length, icon: Factory, color: 'text-purple-400' },
          { label: 'In Progress', value: orders.filter(o => o.status === 'IN_PROGRESS').length, icon: PlayCircle, color: 'text-blue-400' },
          { label: 'Completed', value: completedOrders.length, icon: CheckCircle, color: 'text-emerald-400' },
          { label: 'Overdue', value: overdueOrders.length, icon: AlertTriangle, color: overdueOrders.length > 0 ? 'text-red-400' : 'text-muted' },
          { label: 'Active BOMs', value: boms.filter(b => b.isActive).length, icon: Layers, color: 'text-cyan-400' },
          { label: 'Work Centers', value: workCenters.filter(w => w.status === 'Active').length, icon: Wrench, color: 'text-amber-400' },
        ].map((s, i) => (
          <div key={i} className="glass-card p-3.5">
            <div className="flex items-center gap-2.5">
              <s.icon className={`w-4 h-4 ${s.color} flex-shrink-0`} />
              <div>
                <p className="text-[10px] text-muted uppercase tracking-wide">{s.label}</p>
                <p className="text-xl font-bold text-foreground">{s.value}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-surface border border-border rounded-lg p-1 flex-wrap">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-md text-xs font-medium transition-all whitespace-nowrap ${tab === t.id ? 'bg-accent text-white' : 'text-muted hover:text-foreground'}`}>
            <t.icon className="w-3.5 h-3.5" /> {t.label}
          </button>
        ))}
      </div>

      {/* ── TAB: Production Orders ── */}
      {tab === 'production' && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="flex flex-wrap gap-3 items-center">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
              <input value={orderSearch} onChange={e => setOrderSearch(e.target.value)} placeholder="Search orders..." className="w-full pl-9 pr-3 py-2 bg-surface border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/50" />
            </div>
            <select value={orderStatusFilter} onChange={e => setOrderStatusFilter(e.target.value)} className="px-3 py-2 bg-surface border border-border rounded-lg text-sm text-foreground">
              <option value="ALL">All Status</option>
              {['PLANNED','IN_PROGRESS','ON_HOLD','COMPLETED','CANCELLED'].map(s => <option key={s} value={s}>{s.replace(/_/g,' ')}</option>)}
            </select>
            <select value={orderPriorityFilter} onChange={e => setOrderPriorityFilter(e.target.value)} className="px-3 py-2 bg-surface border border-border rounded-lg text-sm text-foreground">
              <option value="ALL">All Priority</option>
              {['LOW','MEDIUM','HIGH','URGENT'].map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>

          <div className="glass-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[980px]">
                <thead>
                  <tr className="border-b border-border bg-surface-hover">
                    {['Order #','BOM / Product','Priority','Qty','Status','Quality','Due Date','Assigned To','Actions'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-medium text-muted uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredOrders.map(o => {
                    const isOverdue = o.dueDate && new Date(o.dueDate) < new Date() && !['COMPLETED','CANCELLED'].includes(o.status)
                    return (
                      <tr key={o.id} className={`border-b border-border/50 hover:bg-surface-hover transition-colors ${isOverdue ? 'bg-red-500/5' : ''}`}>
                        <td className="px-4 py-3">
                          <span className="font-mono text-xs font-semibold text-foreground">{o.displayId}</span>
                          {isOverdue && <span className="ml-1.5 text-[9px] px-1.5 py-0.5 bg-red-500/15 text-red-400 rounded-full">OVERDUE</span>}
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-foreground font-medium text-xs">{o.finishedProduct?.name}</p>
                          <p className="text-muted text-[10px]">{o.bom?.name} v{o.bom?.version}</p>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${PRIORITY_COLORS[o.priority] || ''}`}>{o.priority}</span>
                        </td>
                        <td className="px-4 py-3 text-foreground">
                          <div className="flex items-center gap-1.5">
                            <span>{o.actualQty}</span>
                            <span className="text-muted text-[10px]">/ {o.plannedQty}</span>
                          </div>
                          {o.status === 'IN_PROGRESS' && o.plannedQty > 0 && (
                            <div className="h-1.5 bg-surface rounded-full overflow-hidden mt-1 w-20">
                              <div className={`h-full rounded-full ${o.actualQty >= o.plannedQty ? 'bg-emerald-500' : 'bg-accent'}`}
                                style={{ width: `${Math.min(100, Math.round((o.actualQty / o.plannedQty) * 100))}%` }} />
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-[10px] px-2 py-0.5 rounded-full ${STATUS_COLORS[o.status] || ''}`}>{o.status?.replace(/_/g,' ')}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-[10px] px-2 py-0.5 rounded-full ${QUALITY_COLORS[o.qualityStatus] || ''}`}>{o.qualityStatus}</span>
                        </td>
                        <td className="px-4 py-3 text-muted text-xs">
                          {o.dueDate ? new Date(o.dueDate).toLocaleDateString('en-IN') : '—'}
                        </td>
                        <td className="px-4 py-3 text-muted text-xs">{o.assignedStaff?.name || o.assignedTo || '—'}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            <button onClick={() => { setSelectedOrder(o); setShowDetailModal(true) }} className="p-1.5 rounded hover:bg-surface-hover text-muted hover:text-foreground" title="View Details"><Eye className="w-3.5 h-3.5" /></button>
                            {o.status === 'PLANNED' && (
                              <button onClick={() => handleStartProd(o.id)} className="p-1.5 rounded hover:bg-blue-500/10 text-muted hover:text-blue-400" title="Start Production"><PlayCircle className="w-3.5 h-3.5" /></button>
                            )}
                            {o.status === 'IN_PROGRESS' && (
                              <>
                                <button onClick={() => openCompleteModal(o)} className="p-1.5 rounded hover:bg-emerald-500/10 text-muted hover:text-emerald-400" title="Complete"><CheckCircle className="w-3.5 h-3.5" /></button>
                                <button onClick={() => handleHoldProd(o.id)} className="p-1.5 rounded hover:bg-amber-500/10 text-muted hover:text-amber-400" title="Hold"><Pause className="w-3.5 h-3.5" /></button>
                              </>
                            )}
                            {o.status === 'ON_HOLD' && (
                              <>
                                <button onClick={() => handleStartProd(o.id)} className="p-1.5 rounded hover:bg-blue-500/10 text-muted hover:text-blue-400" title="Resume"><PlayCircle className="w-3.5 h-3.5" /></button>
                                <button onClick={() => openCompleteModal(o)} className="p-1.5 rounded hover:bg-emerald-500/10 text-muted hover:text-emerald-400" title="Complete"><CheckCircle className="w-3.5 h-3.5" /></button>
                              </>
                            )}
                            {(o.status === 'IN_PROGRESS' || o.status === 'ON_HOLD') && (
                              <button onClick={() => { setQcTarget(o); setQcForm({ qualityStatus: 'PASSED', qualityNotes: '', scrapQty: 0, scrapReason: '' }); setShowQCModal(true) }} className="p-1.5 rounded hover:bg-purple-500/10 text-muted hover:text-purple-400" title="Quality Check"><ShieldCheck className="w-3.5 h-3.5" /></button>
                            )}
                            {!['COMPLETED','CANCELLED'].includes(o.status) && (
                              <button onClick={() => { setCancelTarget(o); setShowCancelModal(true) }} className="p-1.5 rounded hover:bg-red-500/10 text-muted hover:text-red-400" title="Cancel"><XCircle className="w-3.5 h-3.5" /></button>
                            )}
                            {['PLANNED','CANCELLED'].includes(o.status) && (
                              <button onClick={() => { setDeleteProdTarget(o); setShowDeleteProdModal(true) }} className="p-1.5 rounded hover:bg-red-500/10 text-muted hover:text-red-400" title="Delete Order"><Trash2 className="w-3.5 h-3.5" /></button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {filteredOrders.length === 0 && (
              <div className="text-center py-12 text-muted">
                {orders.length === 0 ? 'No production orders yet' : 'No orders match your filters'}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── TAB: Bill of Materials ── */}
      {tab === 'bom' && (
        <div className="space-y-4">
          {boms.map(bom => (
            <BOMCard
              key={bom.id} bom={bom} products={products} workCenters={workCenters}
              onToggle={async () => { const r = await toggleBOMStatus(bom.id); if (r.success) loadData(); else alert(r.error) }}
              onDelete={async () => { if (!confirm('Delete this BOM?')) return; const r = await deleteBOM(bom.id); if (r.success) loadData(); else alert(r.error) }}
              onExport={() => downloadBOMCSV(bom)}
              onSaveAsTemplate={async (steps) => {
                const name = prompt('Template name:')
                if (!name) return
                const res = await createBomTemplate({ name, steps: steps.map((s, idx) => ({ stepNumber: idx + 1, operationName: s.operationName, workCenterId: s.workCenterId || undefined, durationMins: s.durationMins, labourRatePerHour: s.labourRatePerHour, machineCostPerUnit: s.machineCostPerUnit, notes: s.notes })) })
                if (res.success) { loadData(); alert('Template saved!') }
                else alert(res.error)
              }}
              onRefresh={loadData}
            />
          ))}
          {boms.length === 0 && <div className="text-center py-16 text-muted">No Bill of Materials yet. Create one to start manufacturing.</div>}
        </div>
      )}

      {/* ── TAB: Work Centers ── */}
      {tab === 'workcenters' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {workCenters.map(wc => (
            <div key={wc.id} className="glass-card p-5">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="font-semibold text-foreground">{wc.name}</h3>
                  <p className="text-xs text-muted mt-0.5">{wc.type}</p>
                </div>
                <span className={`text-[10px] px-2 py-0.5 rounded-full ${wc.status === 'Active' ? 'bg-emerald-500/10 text-emerald-400' : wc.status === 'Maintenance' ? 'bg-amber-500/10 text-amber-400' : 'bg-gray-500/10 text-gray-400'}`}>
                  {wc.status}
                </span>
              </div>
              {wc.description && <p className="text-xs text-muted mb-3">{wc.description}</p>}
              <div className="flex items-center justify-between text-xs text-muted mb-4">
                <span>Capacity: <span className="text-foreground font-medium">{wc.capacity} units/day</span></span>
                <span>Orders: <span className="text-foreground font-medium">{wc._count?.productionOrders || 0}</span></span>
              </div>
              <div className="flex gap-2">
                {wc.status !== 'Active' && (
                  <button onClick={async () => { await updateWorkCenterStatus(wc.id, 'Active'); loadData() }} className="flex-1 py-1.5 text-xs bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 rounded-lg">Set Active</button>
                )}
                {wc.status !== 'Maintenance' && (
                  <button onClick={async () => { await updateWorkCenterStatus(wc.id, 'Maintenance'); loadData() }} className="flex-1 py-1.5 text-xs bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 rounded-lg">Maintenance</button>
                )}
                {wc.status !== 'Inactive' && (
                  <button onClick={async () => { await updateWorkCenterStatus(wc.id, 'Inactive'); loadData() }} className="flex-1 py-1.5 text-xs bg-gray-500/10 text-gray-400 hover:bg-gray-500/20 rounded-lg">Inactive</button>
                )}
                <button onClick={async () => { if (!confirm('Delete work center?')) return; const r = await deleteWorkCenter(wc.id); if (!r.success) alert(r.error); else loadData() }} className="p-1.5 text-red-400/50 hover:text-red-400 hover:bg-red-500/10 rounded-lg"><Trash2 className="w-4 h-4" /></button>
              </div>
            </div>
          ))}
          {workCenters.length === 0 && (
            <div className="col-span-3 text-center py-16 text-muted">No work centers yet. Add machines and stations used in your factory.</div>
          )}
        </div>
      )}

      {/* ── TAB: MRP Planner ── */}
      {tab === 'mrp' && (
        <div className="space-y-5">
          <div className="glass-card p-5">
            <h3 className="font-semibold text-foreground mb-4 flex items-center gap-2"><Cpu className="w-4 h-4 text-accent" /> Material Requirements Planning</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <div>
                <label className="text-xs text-muted mb-1 block">Select BOM</label>
                <select value={mrpBomId} onChange={e => { setMrpBomId(e.target.value); setMrpResult(null) }} className={SEL}>
                  <option value="">Choose a Bill of Materials</option>
                  {boms.filter(b => b.isActive).map(b => <option key={b.id} value={b.id}>{b.name} — {b.finishedProduct?.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-muted mb-1 block">Production Quantity</label>
                <input type="number" min="1" value={mrpQty} onChange={e => { setMrpQty(e.target.value); setMrpResult(null) }} className={INP} />
              </div>
              <div className="flex items-end">
                <button onClick={handleRunMRP} disabled={!mrpBomId || mrpLoading} className="w-full py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent/90 disabled:opacity-50 flex items-center justify-center gap-2">
                  {mrpLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Cpu className="w-4 h-4" />}
                  {mrpLoading ? 'Calculating...' : 'Run MRP Analysis'}
                </button>
              </div>
            </div>

            {mrpResult && (
              <div className="space-y-5 mt-4 border-t border-border pt-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <h4 className="text-sm font-medium text-foreground">Results: {mrpResult.bomName} × {mrpResult.qty} units</h4>
                  <span className={`px-3 py-1 rounded-full text-xs font-semibold ${mrpResult.canProduceAll ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'}`}>
                    {mrpResult.canProduceAll ? '✓ Can Produce' : `✗ ${mrpResult.shortages.length} Shortage(s)`}
                  </span>
                </div>

                {/* Full Cost Breakdown */}
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  {[
                    { label: 'Material Cost', value: `₹${mrpResult.totalMaterialCost.toLocaleString('en-IN')}`, color: 'text-foreground', icon: Package },
                    { label: 'Labour Cost', value: `₹${mrpResult.totalLabourCost.toLocaleString('en-IN')}`, color: 'text-blue-400', icon: Clock },
                    { label: 'Machine Cost', value: `₹${mrpResult.totalMachineCost.toLocaleString('en-IN')}`, color: 'text-amber-400', icon: Zap },
                    { label: 'Total Mfg Cost', value: `₹${mrpResult.totalManufacturingCost.toLocaleString('en-IN')}`, color: 'text-purple-400', icon: DollarSign },
                    { label: 'Selling Price', value: `₹${mrpResult.sellingPrice.toLocaleString('en-IN')}`, color: 'text-foreground', icon: TrendingUp },
                  ].map((m, i) => (
                    <div key={i} className="bg-surface-hover p-3 rounded-lg">
                      <div className="flex items-center gap-1.5 mb-1">
                        <m.icon className={`w-3.5 h-3.5 ${m.color}`} />
                        <p className="text-[10px] text-muted uppercase">{m.label}</p>
                      </div>
                      <p className={`text-lg font-bold ${m.color}`}>{m.value}</p>
                    </div>
                  ))}
                </div>

                {/* Profit & Margin */}
                <div className="grid grid-cols-2 gap-3">
                  <div className={`p-4 rounded-xl border ${mrpResult.estimatedProfit >= 0 ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-red-500/5 border-red-500/20'}`}>
                    <p className="text-xs text-muted mb-1">Estimated Profit</p>
                    <p className={`text-2xl font-bold ${mrpResult.estimatedProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {mrpResult.estimatedProfit >= 0 ? '+' : ''}₹{mrpResult.estimatedProfit.toLocaleString('en-IN')}
                    </p>
                    <p className="text-xs text-muted mt-1">Selling Price − Total Mfg Cost</p>
                  </div>
                  <div className={`p-4 rounded-xl border ${mrpResult.estimatedMargin >= 20 ? 'bg-emerald-500/5 border-emerald-500/20' : mrpResult.estimatedMargin >= 0 ? 'bg-amber-500/5 border-amber-500/20' : 'bg-red-500/5 border-red-500/20'}`}>
                    <p className="text-xs text-muted mb-1">Profit Margin</p>
                    <p className={`text-2xl font-bold ${mrpResult.estimatedMargin >= 20 ? 'text-emerald-400' : mrpResult.estimatedMargin >= 0 ? 'text-amber-400' : 'text-red-400'}`}>
                      {mrpResult.estimatedMargin}%
                    </p>
                    <p className="text-xs text-muted mt-1">{mrpResult.estimatedMargin >= 20 ? '✓ Healthy margin' : mrpResult.estimatedMargin >= 0 ? '⚠ Low margin' : '✗ Loss-making'}</p>
                  </div>
                </div>

                {/* Material requirements table */}
                <div>
                  <h5 className="text-xs font-medium text-muted uppercase tracking-wide mb-2 flex items-center gap-1.5"><Package className="w-3.5 h-3.5" /> Material Requirements</h5>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        {['Material','SKU','Required','Available','Shortage','Unit Cost','Est. Cost','Status'].map(h => (
                          <th key={h} className="px-3 py-2 text-left text-xs font-medium text-muted">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {mrpResult.requirements.map((r, i) => (
                        <tr key={i} className={`border-b border-border/50 ${!r.canProduce ? 'bg-red-500/5' : ''}`}>
                          <td className="px-3 py-2 text-foreground font-medium">{r.materialName}</td>
                          <td className="px-3 py-2 text-muted font-mono text-xs">{r.sku}</td>
                          <td className="px-3 py-2 text-foreground">{r.required} {r.unitOfMeasure}</td>
                          <td className="px-3 py-2 text-foreground">{r.available} {r.unitOfMeasure}</td>
                          <td className="px-3 py-2">
                            {r.shortage > 0 ? <span className="text-red-400 font-semibold">{r.shortage} {r.unitOfMeasure}</span> : <span className="text-emerald-400">—</span>}
                          </td>
                          <td className="px-3 py-2 text-muted text-xs">₹{r.unitCost}/unit</td>
                          <td className="px-3 py-2 text-foreground">₹{r.estimatedCost.toLocaleString('en-IN')}</td>
                          <td className="px-3 py-2">
                            <span className={`text-xs px-2 py-0.5 rounded-full ${r.canProduce ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
                              {r.canProduce ? 'OK' : 'Short'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Step-wise labour/machine cost */}
                {mrpResult.stepCostings?.length > 0 && (
                  <div>
                    <h5 className="text-xs font-medium text-muted uppercase tracking-wide mb-2 flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" /> Job Costing by Operation</h5>
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border">
                          {['Step','Operation','Work Center','Duration','Labour Rate','Labour Cost','Machine Cost','Total'].map(h => (
                            <th key={h} className="px-3 py-2 text-left text-xs font-medium text-muted">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {mrpResult.stepCostings.map((s, i) => (
                          <tr key={i} className="border-b border-border/50">
                            <td className="px-3 py-2 text-muted text-xs">{s.stepNumber}</td>
                            <td className="px-3 py-2 text-foreground font-medium">{s.operationName}</td>
                            <td className="px-3 py-2 text-muted text-xs">{s.workCenter}</td>
                            <td className="px-3 py-2 text-muted text-xs">{s.durationMins}min</td>
                            <td className="px-3 py-2 text-muted text-xs">₹{s.labourRatePerHour}/hr</td>
                            <td className="px-3 py-2 text-blue-400">₹{s.totalLabourCost.toLocaleString('en-IN')}</td>
                            <td className="px-3 py-2 text-amber-400">₹{s.totalMachineCost.toLocaleString('en-IN')}</td>
                            <td className="px-3 py-2 text-foreground font-medium">₹{(s.totalLabourCost + s.totalMachineCost).toLocaleString('en-IN')}</td>
                          </tr>
                        ))}
                        <tr className="bg-surface-hover">
                          <td colSpan={5} className="px-3 py-2 text-xs font-semibold text-muted text-right">TOTAL</td>
                          <td className="px-3 py-2 text-blue-400 font-bold">₹{mrpResult.totalLabourCost.toLocaleString('en-IN')}</td>
                          <td className="px-3 py-2 text-amber-400 font-bold">₹{mrpResult.totalMachineCost.toLocaleString('en-IN')}</td>
                          <td className="px-3 py-2 text-foreground font-bold">₹{(mrpResult.totalLabourCost + mrpResult.totalMachineCost).toLocaleString('en-IN')}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── TAB: Quality & Scrap ── */}
      {tab === 'quality' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Quality Pass Rate', value: `${stats?.totals?.qualityRate ?? 0}%`, icon: ShieldCheck, color: 'text-emerald-400' },
              { label: 'Avg Yield Rate', value: `${stats?.totals?.avgYield ?? 0}%`, icon: TrendingUp, color: 'text-blue-400' },
              { label: 'Total Scrap', value: `${stats?.totals?.totalScrap ?? 0} pcs`, icon: FlameKindling, color: 'text-red-400' },
              { label: 'Completed Orders', value: completedOrders.length, icon: CheckCircle, color: 'text-purple-400' },
            ].map((s, i) => (
              <div key={i} className="glass-card p-4 flex items-center gap-3">
                <s.icon className={`w-5 h-5 ${s.color}`} />
                <div>
                  <p className="text-xs text-muted">{s.label}</p>
                  <p className="text-lg font-bold text-foreground">{s.value}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="glass-card overflow-hidden">
            <div className="px-4 py-3 border-b border-border">
              <h3 className="text-sm font-medium text-foreground">Quality Records — All Production Orders</h3>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-surface-hover">
                  {['Order #','Product','Planned','Actual','Scrap','Yield','Quality','Notes'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {completedOrders.map(o => (
                  <tr key={o.id} className="border-b border-border/50 hover:bg-surface-hover">
                    <td className="px-4 py-3 font-mono text-xs font-semibold text-foreground">{o.displayId}</td>
                    <td className="px-4 py-3 text-foreground">{o.finishedProduct?.name}</td>
                    <td className="px-4 py-3 text-muted">{o.plannedQty}</td>
                    <td className="px-4 py-3 text-foreground">{o.actualQty}</td>
                    <td className="px-4 py-3 text-red-400">{o.scrapQty || 0}</td>
                    <td className="px-4 py-3">
                      <span className={`font-semibold ${(o.yieldRate || 0) >= 90 ? 'text-emerald-400' : (o.yieldRate || 0) >= 75 ? 'text-amber-400' : 'text-red-400'}`}>
                        {o.yieldRate?.toFixed(1) || 0}%
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${QUALITY_COLORS[o.qualityStatus] || ''}`}>{o.qualityStatus}</span>
                    </td>
                    <td className="px-4 py-3 text-muted text-xs">{o.qualityNotes || o.scrapReason || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {completedOrders.length === 0 && <div className="text-center py-10 text-muted">No completed orders yet</div>}
          </div>

          {orders.filter(o => o.status === 'IN_PROGRESS').length > 0 && (
            <div className="glass-card overflow-hidden">
              <div className="px-4 py-3 border-b border-border">
                <h3 className="text-sm font-medium text-foreground">Pending Quality Checks</h3>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-surface-hover">
                    {['Order #','Product','Planned Qty','Work Center','Action'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {orders.filter(o => o.status === 'IN_PROGRESS').map(o => (
                    <tr key={o.id} className="border-b border-border/50">
                      <td className="px-4 py-3 font-mono text-xs font-semibold text-foreground">{o.displayId}</td>
                      <td className="px-4 py-3 text-foreground">{o.finishedProduct?.name}</td>
                      <td className="px-4 py-3 text-muted">{o.plannedQty}</td>
                      <td className="px-4 py-3 text-muted">{o.workCenter?.name || '—'}</td>
                      <td className="px-4 py-3">
                        <button onClick={() => { setQcTarget(o); setQcForm({ qualityStatus: 'PASSED', qualityNotes: '', scrapQty: 0, scrapReason: '' }); setShowQCModal(true) }} className="px-3 py-1.5 bg-purple-500/10 text-purple-400 hover:bg-purple-500/20 rounded-lg text-xs font-medium flex items-center gap-1.5">
                          <ShieldCheck className="w-3.5 h-3.5" /> Record QC
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── TAB: Analytics ── */}
      {tab === 'analytics' && !stats && (
        <div className="text-center py-16 text-muted">Loading analytics data...</div>
      )}
      {tab === 'analytics' && stats && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Total Produced', value: stats.totals.totalProduced.toLocaleString('en-IN'), sub: 'units', icon: Package, color: 'text-blue-400' },
              { label: 'Total Cost', value: `₹${(stats.totals.totalCost / 100000).toFixed(1)}L`, sub: 'incl. overhead', icon: Activity, color: 'text-amber-400' },
              { label: 'Quality Pass Rate', value: `${stats.totals.qualityRate}%`, sub: 'of completed', icon: ShieldCheck, color: 'text-emerald-400' },
              { label: 'Avg Yield Rate', value: `${stats.totals.avgYield}%`, sub: 'actual/planned', icon: TrendingUp, color: 'text-purple-400' },
            ].map((s, i) => (
              <div key={i} className="glass-card p-4">
                <div className="flex items-center gap-2 mb-2">
                  <s.icon className={`w-4 h-4 ${s.color}`} />
                  <p className="text-xs text-muted">{s.label}</p>
                </div>
                <p className="text-2xl font-bold text-foreground">{s.value}</p>
                <p className="text-[10px] text-muted mt-0.5">{s.sub}</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="glass-card p-5">
              <h3 className="text-sm font-medium text-foreground mb-4 flex items-center gap-2"><Star className="w-4 h-4 text-amber-400" /> Top Produced Products</h3>
              {stats.topProducts.length === 0 ? (
                <p className="text-muted text-sm">No data yet</p>
              ) : stats.topProducts.map((p, i) => {
                const maxQty = stats.topProducts[0].qty
                return (
                  <div key={i} className="mb-3">
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-foreground">{p.name}</span>
                      <span className="text-muted">{p.qty} units · {p.orders} orders</span>
                    </div>
                    <div className="h-2 bg-surface-hover rounded-full overflow-hidden">
                      <div className="h-full bg-accent rounded-full" style={{ width: `${(p.qty / maxQty) * 100}%` }} />
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="glass-card p-5">
              <h3 className="text-sm font-medium text-foreground mb-4 flex items-center gap-2"><Wrench className="w-4 h-4 text-cyan-400" /> Work Center Utilization</h3>
              {stats.workCenterUtilization.length === 0 ? (
                <p className="text-muted text-sm">No work centers defined</p>
              ) : stats.workCenterUtilization.map((wc, i) => (
                <div key={i} className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
                  <div>
                    <p className="text-sm text-foreground">{wc.name}</p>
                    <p className="text-[10px] text-muted">{wc.type}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted">{wc.ordersCount} orders</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full ${wc.status === 'Active' ? 'bg-emerald-500/10 text-emerald-400' : wc.status === 'Maintenance' ? 'bg-amber-500/10 text-amber-400' : 'bg-gray-500/10 text-gray-400'}`}>{wc.status}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {stats.monthlyTrend.length > 0 && (
            <div className="glass-card p-5">
              <h3 className="text-sm font-medium text-foreground mb-4 flex items-center gap-2"><BarChart3 className="w-4 h-4 text-purple-400" /> Monthly Production Trend (Last 6 Months)</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      {['Month','Orders','Units Produced','Total Cost'].map(h => (
                        <th key={h} className="px-4 py-2 text-left text-xs font-medium text-muted">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {stats.monthlyTrend.map((m, i) => (
                      <tr key={i} className="border-b border-border/50">
                        <td className="px-4 py-3 text-foreground font-medium">{m.month}</td>
                        <td className="px-4 py-3 text-muted">{m.orders}</td>
                        <td className="px-4 py-3 text-foreground">{m.qty.toLocaleString('en-IN')}</td>
                        <td className="px-4 py-3 text-foreground">₹{m.cost.toLocaleString('en-IN')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {stats.overdueOrders.length > 0 && (
            <div className="glass-card p-5 border border-red-500/20">
              <h3 className="text-sm font-medium text-red-400 mb-3 flex items-center gap-2"><AlertTriangle className="w-4 h-4" /> Overdue Orders ({stats.overdueOrders.length})</h3>
              <div className="space-y-2">
                {stats.overdueOrders.map((o, i) => (
                  <div key={i} className="flex items-center justify-between p-3 bg-red-500/5 rounded-lg text-sm">
                    <span className="font-mono font-semibold text-foreground">{o.displayId}</span>
                    <span className="text-foreground">{o.product}</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full ${PRIORITY_COLORS[o.priority] || ''}`}>{o.priority}</span>
                    <span className="text-red-400 text-xs">Due: {o.dueDate}</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full ${STATUS_COLORS[o.status] || ''}`}>{o.status?.replace(/_/g,' ')}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── TAB: Job Costing ── */}
      {tab === 'costing' && (
        <div className="space-y-4">
          {completedOrders.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: 'Total Material Cost', value: completedOrders.reduce((s,o) => s+(o.totalMaterialCost||0),0) },
                { label: 'Total Labour Cost', value: completedOrders.reduce((s,o) => s+(o.totalLabourCost||0),0) },
                { label: 'Total Overhead', value: completedOrders.reduce((s,o) => s+(o.overheadCost||0),0) },
                { label: 'Total Manufacturing Cost', value: completedOrders.reduce((s,o) => s+(o.totalCost||0),0) },
              ].map((s, i) => (
                <div key={i} className="glass-card p-4">
                  <p className="text-xs text-muted mb-1">{s.label}</p>
                  <p className="text-xl font-bold text-foreground">₹{s.value.toLocaleString('en-IN')}</p>
                </div>
              ))}
            </div>
          )}

          {completedOrders.length === 0 && <div className="text-center py-16 text-muted">No completed production orders for costing analysis</div>}
          {completedOrders.map(o => (
            <div key={o.id} className="glass-card p-5">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="font-semibold text-foreground">{o.displayId} — {o.finishedProduct?.name}</h3>
                  <p className="text-xs text-muted mt-0.5">Planned: {o.plannedQty} · Produced: {o.actualQty} · Scrap: {o.scrapQty || 0}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${QUALITY_COLORS[o.qualityStatus]}`}>{o.qualityStatus}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${(o.yieldRate||0) >= 90 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'}`}>
                    Yield: {o.yieldRate?.toFixed(1) || 0}%
                  </span>
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
                {[
                  { label: 'Material Cost', value: o.totalMaterialCost || 0 },
                  { label: 'Labour Cost', value: o.totalLabourCost || 0 },
                  { label: 'Overhead', value: o.overheadCost || 0 },
                  { label: 'Total Cost', value: o.totalCost || 0 },
                  { label: 'Cost/Unit', value: o.costPerUnit || 0 },
                ].map((c, i) => (
                  <div key={i} className="bg-surface-hover p-3 rounded-lg">
                    <p className="text-[10px] text-muted">{c.label}</p>
                    <p className={`text-base font-bold ${i === 4 ? 'text-accent' : 'text-foreground'}`}>₹{c.value.toLocaleString('en-IN')}</p>
                  </div>
                ))}
              </div>
              {o.consumptions?.length > 0 && (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      {['Material','Planned Qty','Actual Qty','Unit Cost','Total Cost','Variance'].map(h => (
                        <th key={h} className="px-3 py-2 text-left text-xs font-medium text-muted">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {o.consumptions.map((c, i) => {
                      const variance = ((c.actualQty - c.plannedQty) / c.plannedQty * 100).toFixed(1)
                      return (
                        <tr key={i} className="border-b border-border/50">
                          <td className="px-3 py-2 text-foreground">{c.rawMaterial?.name}</td>
                          <td className="px-3 py-2 text-muted">{c.plannedQty?.toFixed(2)} {c.rawMaterial?.unitOfMeasure}</td>
                          <td className="px-3 py-2 text-foreground">{c.actualQty?.toFixed(2)}</td>
                          <td className="px-3 py-2 text-foreground">₹{c.unitCost?.toLocaleString('en-IN')}</td>
                          <td className="px-3 py-2 text-foreground">₹{c.totalCost?.toLocaleString('en-IN')}</td>
                          <td className="px-3 py-2">
                            <span className={Number(variance) > 10 ? 'text-red-400' : Number(variance) > 0 ? 'text-amber-400' : 'text-emerald-400'}>
                              {Number(variance) > 0 ? '+' : ''}{variance}%
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── TAB: Raw Materials ── */}
      {tab === 'materials' && (
        <div className="space-y-4">
          {/* Add Raw Material Form */}
          <div className="glass-card p-5">
            <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
              <Plus className="w-4 h-4 text-accent" /> Add New Raw Material
            </h3>
            <p className="text-xs text-muted mb-4">SKU code will be auto-generated (e.g. RM-001, RM-002…)</p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-3">
              <div>
                <label className="text-[10px] text-muted block mb-1 uppercase tracking-wide">Material Name *</label>
                <input
                  value={rmForm.name}
                  onChange={e => setRmForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Teak Wood Plank"
                  className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/50" />
              </div>
              <div>
                <label className="text-[10px] text-muted block mb-1 uppercase tracking-wide">Cost Price per Unit (₹)</label>
                <input
                  type="number" min="0"
                  value={rmForm.costPrice}
                  onChange={e => setRmForm(f => ({ ...f, costPrice: e.target.value }))}
                  placeholder="Purchase price per unit"
                  className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/50" />
              </div>
              <div>
                <label className="text-[10px] text-muted block mb-1 uppercase tracking-wide">Current Stock</label>
                <input
                  type="number" min="0"
                  value={rmForm.stock}
                  onChange={e => setRmForm(f => ({ ...f, stock: e.target.value }))}
                  placeholder="Quantity in hand"
                  className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/50" />
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
              <div>
                <label className="text-[10px] text-muted block mb-1 uppercase tracking-wide">Unit of Measure</label>
                <select
                  value={rmForm.unitOfMeasure}
                  onChange={e => setRmForm(f => ({ ...f, unitOfMeasure: e.target.value }))}
                  className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/50">
                  <option value="PCS">PCS (Pieces)</option>
                  <option value="KG">KG (Kilograms)</option>
                  <option value="MTR">MTR (Meters)</option>
                  <option value="SFT">SFT (Sq. Feet)</option>
                  <option value="LTR">LTR (Litres)</option>
                  <option value="SET">SET</option>
                  <option value="BOX">BOX</option>
                  <option value="NOS">NOS (Numbers)</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] text-muted block mb-1 uppercase tracking-wide">Min. Stock Alert</label>
                <input
                  type="number" min="0"
                  value={rmForm.reorderLevel}
                  onChange={e => setRmForm(f => ({ ...f, reorderLevel: e.target.value }))}
                  className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/50" />
                <p className="text-[9px] text-muted mt-0.5">You'll get a "Low Stock" warning when stock falls to this level</p>
              </div>
              <div>
                <label className="text-[10px] text-muted block mb-1 uppercase tracking-wide">Description</label>
                <input
                  value={rmForm.description}
                  onChange={e => setRmForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="Optional notes"
                  className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/50" />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={handleCreateRawMaterial}
                disabled={submitting || !rmForm.name}
                className="px-5 py-2.5 bg-accent text-white rounded-lg text-sm font-semibold hover:bg-accent/90 disabled:opacity-50 flex items-center gap-2 transition-colors">
                <Plus className="w-4 h-4" />
                {submitting ? 'Adding...' : 'Add Raw Material'}
              </button>
              <button
                onClick={() => setRmForm({ name: '', costPrice: 0, stock: 0, unitOfMeasure: 'PCS', reorderLevel: 5, description: '' })}
                className="px-4 py-2.5 text-sm text-muted hover:text-foreground transition-colors">
                Clear Form
              </button>
            </div>
          </div>

          {/* Raw Materials Search */}
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
              <input
                value={rmSearch}
                onChange={e => setRmSearch(e.target.value)}
                placeholder="Search raw materials by name or SKU..."
                className="w-full pl-9 pr-3 py-2 bg-surface border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/50" />
            </div>
            <span className="text-xs text-muted">{rawMaterials.length} material{rawMaterials.length !== 1 ? 's' : ''}</span>
          </div>

          {/* Raw Materials Table */}
          <div className="glass-card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-surface-hover">
                  {['SKU Code', 'Material Name', 'Cost Price (₹)', 'Stock', 'UoM', 'Min. Alert', 'Status', 'Actions'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs text-muted font-semibold uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rawMaterials.length === 0 && (
                  <tr>
                    <td colSpan={8} className="text-center py-12 text-muted">
                      {rmSearch ? 'No materials match your search' : 'No raw materials yet. Add one above to get started.'}
                    </td>
                  </tr>
                )}
                {rawMaterials.map(rm => (
                  <tr key={rm.id} className="border-b border-border/50 hover:bg-surface-hover/50">
                    {editingRmId === rm.id ? (
                      <>
                        <td className="px-4 py-3 text-muted font-mono text-xs">{rm.sku}</td>
                        <td className="px-4 py-3">
                          <input value={rmEditForm.name} onChange={e => setRmEditForm(f => ({ ...f, name: e.target.value }))}
                            className="w-full px-2 py-1.5 bg-surface border border-accent rounded text-xs text-foreground" />
                        </td>
                        <td className="px-4 py-3 text-muted text-xs">₹{rm.costPrice}</td>
                        <td className="px-4 py-3">
                          <input type="number" min="0" value={rmEditForm.stock} onChange={e => setRmEditForm(f => ({ ...f, stock: e.target.value }))}
                            className="w-20 px-2 py-1.5 bg-surface border border-accent rounded text-xs text-foreground" />
                        </td>
                        <td className="px-4 py-3 text-muted text-xs">{rm.unitOfMeasure}</td>
                        <td className="px-4 py-3">
                          <input type="number" min="0" value={rmEditForm.reorderLevel} onChange={e => setRmEditForm(f => ({ ...f, reorderLevel: e.target.value }))}
                            className="w-16 px-2 py-1.5 bg-surface border border-accent rounded text-xs text-foreground" />
                        </td>
                        <td className="px-4 py-3"></td>
                        <td className="px-4 py-3">
                          <div className="flex gap-1.5">
                            <button onClick={() => handleUpdateRawMaterial(rm.id)} disabled={submitting}
                              className="px-2.5 py-1 rounded-md bg-emerald-600 text-white text-xs font-medium disabled:opacity-50 flex items-center gap-1">
                              <Save className="w-3 h-3" /> Save
                            </button>
                            <button onClick={() => setEditingRmId(null)}
                              className="px-2.5 py-1 rounded-md bg-surface border border-border text-xs text-muted">
                              Cancel
                            </button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-4 py-3 text-accent font-mono text-xs font-semibold">{rm.sku}</td>
                        <td className="px-4 py-3 text-foreground font-medium">{rm.name}</td>
                        <td className="px-4 py-3 text-foreground">₹{rm.costPrice?.toLocaleString('en-IN') || 0}</td>
                        <td className="px-4 py-3">
                          <span className={rm.stock <= rm.reorderLevel ? 'text-red-400 font-semibold' : 'text-emerald-400 font-semibold'}>
                            {rm.stock}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-muted">{rm.unitOfMeasure}</td>
                        <td className="px-4 py-3 text-muted">{rm.reorderLevel}</td>
                        <td className="px-4 py-3">
                          <span className={`text-[10px] px-2 py-0.5 rounded-full ${rm.stock <= rm.reorderLevel ? 'bg-red-500/10 text-red-400' : 'bg-emerald-500/10 text-emerald-400'}`}>
                            {rm.stock <= rm.reorderLevel ? '⚠ Low Stock' : '✓ In Stock'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-1.5">
                            <button
                              onClick={() => { setEditingRmId(rm.id); setRmEditForm({ name: rm.name, stock: rm.stock, reorderLevel: rm.reorderLevel, description: rm.description || '' }) }}
                              className="px-2.5 py-1 rounded-md bg-surface border border-border text-xs text-muted hover:text-accent hover:border-accent/50 transition-colors flex items-center gap-1">
                              <Edit2 className="w-3 h-3" /> Edit
                            </button>
                            <button
                              onClick={() => handleDeleteRawMaterial(rm.id, rm.name)}
                              disabled={submitting}
                              className="px-2.5 py-1 rounded-md bg-red-500/10 border border-red-500/20 text-xs text-red-400 hover:bg-red-500/20 transition-colors flex items-center gap-1 disabled:opacity-50">
                              <Trash2 className="w-3 h-3" /> Delete
                            </button>
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ─── MODALS ─────────────────────────────────── */}

      {/* Production Order Detail */}
      <Modal isOpen={showDetailModal} onClose={() => setShowDetailModal(false)} title={`${selectedOrder?.displayId} — Details`} size="lg">
        {selectedOrder && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              {[
                ['BOM', `${selectedOrder.bom?.name} v${selectedOrder.bom?.version}`],
                ['Product', selectedOrder.finishedProduct?.name],
                ['Priority', selectedOrder.priority],
                ['Status', selectedOrder.status?.replace(/_/g,' ')],
                ['Planned Qty', selectedOrder.plannedQty],
                ['Actual Qty', selectedOrder.actualQty ?? 0],
                ['Yield Rate', selectedOrder.yieldRate ? `${selectedOrder.yieldRate.toFixed(1)}%` : '0%'],
                ['Quality', selectedOrder.qualityStatus],
                ['Scrap Qty', selectedOrder.scrapQty || 0],
                ['Assigned To', selectedOrder.assignedStaff?.name || selectedOrder.assignedTo || '—'],
                ['Work Center', selectedOrder.workCenter?.name || '—'],
                ['Due Date', selectedOrder.dueDate ? new Date(selectedOrder.dueDate).toLocaleDateString('en-IN') : '—'],
              ].map(([l,v]) => (
                <div key={l} className="bg-surface-hover p-2.5 rounded-lg">
                  <p className="text-[10px] text-muted uppercase">{l}</p>
                  <p className="text-sm text-foreground font-medium mt-0.5">{v}</p>
                </div>
              ))}
            </div>

            {selectedOrder.productionSteps?.length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-foreground mb-2">Routing Steps</h4>
                <div className="space-y-2">
                  {selectedOrder.productionSteps.map((s, i) => (
                    <div key={i} className="flex items-center gap-3 p-3 bg-surface-hover rounded-lg text-sm flex-wrap">
                      <span className="w-6 h-6 rounded-full bg-accent/20 text-accent flex items-center justify-center text-xs font-bold flex-shrink-0">{s.stepNumber}</span>
                      <span className="flex-1 text-foreground min-w-[100px]">{s.operationName}</span>
                      <span className="text-muted text-xs">{s.workCenter?.name || '—'}</span>
                      <span className="text-muted text-xs">{s.plannedMins}min</span>
                      {['PLANNED','IN_PROGRESS','COMPLETED'].includes(selectedOrder.status) && s.status !== 'DONE' && (
                        <div className="flex gap-1">
                          {s.status === 'PENDING' && (
                            <button onClick={async () => { await updateProductionStep(s.id, 'IN_PROGRESS'); loadData(); setSelectedOrder(prev => ({ ...prev, productionSteps: prev.productionSteps.map(x => x.id === s.id ? { ...x, status: 'IN_PROGRESS' } : x) })) }} className="px-2 py-0.5 text-[10px] bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 rounded">Start</button>
                          )}
                          {s.status === 'IN_PROGRESS' && (
                            <button onClick={async () => { await updateProductionStep(s.id, 'DONE'); loadData(); setSelectedOrder(prev => ({ ...prev, productionSteps: prev.productionSteps.map(x => x.id === s.id ? { ...x, status: 'DONE' } : x) })) }} className="px-2 py-0.5 text-[10px] bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 rounded">Done</button>
                          )}
                        </div>
                      )}
                      <span className={`text-[10px] px-2 py-0.5 rounded-full ${s.status === 'DONE' ? 'bg-emerald-500/10 text-emerald-400' : s.status === 'IN_PROGRESS' ? 'bg-blue-500/10 text-blue-400' : 'bg-gray-500/10 text-gray-400'}`}>{s.status}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {selectedOrder.status === 'COMPLETED' && (
              <div className="grid grid-cols-4 gap-2">
                {[
                  ['Material', selectedOrder.totalMaterialCost],
                  ['Labour', selectedOrder.totalLabourCost],
                  ['Overhead', selectedOrder.overheadCost],
                  ['Total', selectedOrder.totalCost],
                ].map(([l,v]) => (
                  <div key={l} className="bg-surface-hover p-2.5 rounded-lg">
                    <p className="text-[10px] text-muted">{l}</p>
                    <p className="text-sm font-bold text-foreground">₹{(v||0).toLocaleString('en-IN')}</p>
                  </div>
                ))}
              </div>
            )}

            {selectedOrder.cancelReason && (
              <div className="p-3 bg-red-500/10 rounded-lg text-sm text-red-400">
                Cancel reason: {selectedOrder.cancelReason}
              </div>
            )}
            {selectedOrder.notes && <p className="text-xs text-muted">Notes: {selectedOrder.notes}</p>}
          </div>
        )}
      </Modal>

      {/* Delete Production Order */}
      <Modal isOpen={showDeleteProdModal} onClose={() => { setShowDeleteProdModal(false); setDeleteProdTarget(null) }} title="Delete Production Order">
        <div className="space-y-4">
          <div className="p-4 bg-red-500/10 rounded-lg border border-red-500/20">
            <p className="text-sm text-red-400 font-medium">⚠ This action cannot be undone</p>
            <p className="text-xs text-muted mt-1">Permanently delete order <span className="font-semibold text-foreground">{deleteProdTarget?.displayId}</span>?</p>
          </div>
          <div className="flex gap-3">
            <button onClick={() => { setShowDeleteProdModal(false); setDeleteProdTarget(null) }} className="flex-1 py-2 border border-border text-muted rounded-lg text-sm hover:text-foreground">Cancel</button>
            <button onClick={handleDeleteProd} disabled={submitting} className="flex-1 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-600/90 disabled:opacity-50">
              {submitting ? 'Deleting...' : 'Delete Order'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Create BOM Modal */}
      <Modal isOpen={showBOMModal} onClose={() => setShowBOMModal(false)} title="Create Bill of Materials" size="lg">
        <div className="space-y-4">
          {/* Template Loader */}
          {templates.length > 0 && (
            <div className="p-3 bg-accent/5 border border-accent/20 rounded-lg">
              <label className="text-xs font-medium text-accent mb-1.5 block flex items-center gap-1"><FileText className="w-3.5 h-3.5" /> Load Steps from Template</label>
              <select value={bomForm.templateId} onChange={e => { setBomForm(f => ({ ...f, templateId: e.target.value })); applyTemplate(e.target.value) }} className={SEL}>
                <option value="">— Select a template to auto-fill steps —</option>
                {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-muted mb-1 block">BOM Name *</label>
              <input value={bomForm.name} onChange={e => setBomForm(p => ({ ...p, name: e.target.value }))} className={INP} placeholder="e.g. Sofa Set BOM" />
            </div>
            <div>
              <label className="text-xs text-muted mb-1 block">Finished Product *</label>
              <select value={bomForm.finishedProductId} onChange={e => setBomForm(p => ({ ...p, finishedProductId: e.target.value }))} className={SEL}>
                <option value="">Select Product</option>
                {products.map(p => <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted mb-1 block">Version</label>
              <input value={bomForm.version} onChange={e => setBomForm(p => ({ ...p, version: e.target.value }))} className={INP} />
            </div>
            <div>
              <label className="text-xs text-muted mb-1 block">Estimated Days</label>
              <input type="number" min="1" value={bomForm.estimatedDays} onChange={e => setBomForm(p => ({ ...p, estimatedDays: e.target.value }))} className={INP} placeholder="e.g. 5" />
            </div>
            <div className="col-span-2">
              <label className="text-xs text-muted mb-1 block">Notes</label>
              <input value={bomForm.notes} onChange={e => setBomForm(p => ({ ...p, notes: e.target.value }))} className={INP} />
            </div>
          </div>

          {/* Raw Materials */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-muted uppercase tracking-wide">Raw Materials *</label>
              <button onClick={() => setBomForm(f => ({ ...f, items: [...f.items, { rawMaterialId: '', quantity: 1, unitOfMeasure: 'PCS', wastagePercent: 0, unitCost: 0, notes: '' }] }))} className="text-xs text-accent hover:underline">+ Add</button>
            </div>
            <div className="space-y-3">
              {bomForm.items.map((item, i) => (
                <div key={i} className="p-3 bg-surface-hover rounded-lg border border-border/60">
                  {/* Row 1: Material + delete */}
                  <div className="flex items-center gap-2 mb-2">
                    <div className="flex-1">
                      <label className="text-[10px] text-muted block mb-0.5">Material</label>
                      <select value={item.rawMaterialId}
                        onChange={e => { const v = [...bomForm.items]; v[i].rawMaterialId = e.target.value; setBomForm(f => ({ ...f, items: v })) }}
                        className="w-full px-2 py-2 bg-surface border border-border rounded-lg text-xs text-foreground">
                        <option value="">— Select raw material —</option>
                        {products.filter(p => p.category === 'Raw Material').map(p => <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>)}
                      </select>
                    </div>
                    <button onClick={() => setBomForm(f => ({ ...f, items: f.items.filter((_, j) => j !== i) }))}
                      className="mt-4 p-1.5 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded">×</button>
                  </div>
                  {/* Row 2: Qty + UoM + Wastage */}
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="text-[10px] text-muted block mb-0.5">Quantity</label>
                      <input type="number" min="0.001" step="0.001" value={item.quantity}
                        onChange={e => { const v = [...bomForm.items]; v[i].quantity = e.target.value; setBomForm(f => ({ ...f, items: v })) }}
                        className="w-full px-2 py-2 bg-surface border border-border rounded-lg text-xs text-foreground" />
                    </div>
                    <div>
                      <label className="text-[10px] text-muted block mb-0.5">Unit of Measure</label>
                      <select value={item.unitOfMeasure}
                        onChange={e => { const v = [...bomForm.items]; v[i].unitOfMeasure = e.target.value; setBomForm(f => ({ ...f, items: v })) }}
                        className="w-full px-2 py-2 bg-surface border border-border rounded-lg text-xs text-foreground">
                        <option value="PCS">PCS – Pieces</option>
                        <option value="KG">KG – Kilograms</option>
                        <option value="MTR">MTR – Meters</option>
                        <option value="SFT">SFT – Sq. Feet</option>
                        <option value="LTR">LTR – Litres</option>
                        <option value="SET">SET</option>
                        <option value="BOX">BOX</option>
                        <option value="NOS">NOS – Numbers</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] text-muted block mb-0.5">Wastage %</label>
                      <input type="number" min="0" max="100" value={item.wastagePercent}
                        onChange={e => { const v = [...bomForm.items]; v[i].wastagePercent = e.target.value; setBomForm(f => ({ ...f, items: v })) }}
                        className="w-full px-2 py-2 bg-surface border border-border rounded-lg text-xs text-foreground" />
                      <p className="text-[9px] text-muted mt-0.5">Extra material lost during production</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Routing Steps with Job Costing */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-muted uppercase tracking-wide">Manufacturing Steps & Job Costing</label>
              <button onClick={() => setBomForm(f => ({ ...f, steps: [...f.steps, { operationName: '', workCenterId: '', durationMins: 60, labourRatePerHour: 0, machineCostPerUnit: 0, notes: '' }] }))} className="text-xs text-accent hover:underline">+ Add Step</button>
            </div>
            {bomForm.steps.length === 0 && <p className="text-xs text-muted">Optional: define step-by-step operations with job costing (Cut → Polish → QC)</p>}
            <div className="space-y-2">
              {bomForm.steps.map((step, i) => (
                <div key={i} className="p-3 bg-surface-hover rounded-lg border border-border/50">
                  <div className="grid grid-cols-12 gap-2 items-center mb-2">
                    <span className="col-span-1 text-xs text-muted text-center font-bold">{i + 1}</span>
                    <input value={step.operationName} onChange={e => { const v = [...bomForm.steps]; v[i].operationName = e.target.value; setBomForm(f => ({ ...f, steps: v })) }} placeholder="Operation name" className="col-span-5 px-2 py-1.5 bg-surface border border-border rounded-lg text-xs text-foreground" />
                    <select value={step.workCenterId} onChange={e => { const v = [...bomForm.steps]; v[i].workCenterId = e.target.value; setBomForm(f => ({ ...f, steps: v })) }} className="col-span-4 px-2 py-1.5 bg-surface border border-border rounded-lg text-xs text-foreground">
                      <option value="">Work Center</option>
                      {workCenters.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                    </select>
                    <button onClick={() => setBomForm(f => ({ ...f, steps: f.steps.filter((_, j) => j !== i) }))} className="col-span-1 text-red-400 hover:text-red-300 text-base text-center">×</button>
                    <div className="col-span-1" />
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="text-[10px] text-muted block mb-0.5">Duration (min)</label>
                      <input type="number" min="0" value={step.durationMins} onChange={e => { const v = [...bomForm.steps]; v[i].durationMins = e.target.value; setBomForm(f => ({ ...f, steps: v })) }} className="w-full px-2 py-1.5 bg-surface border border-border rounded-lg text-xs text-foreground" />
                    </div>
                    <div>
                      <label className="text-[10px] text-muted block mb-0.5 flex items-center gap-1"><Clock className="w-3 h-3" /> Labour ₹/hr</label>
                      <input type="number" min="0" value={step.labourRatePerHour} onChange={e => { const v = [...bomForm.steps]; v[i].labourRatePerHour = e.target.value; setBomForm(f => ({ ...f, steps: v })) }} className="w-full px-2 py-1.5 bg-surface border border-border rounded-lg text-xs text-foreground" />
                      <p className="text-[9px] text-muted mt-0.5">= ₹{((Number(step.durationMins)/60) * Number(step.labourRatePerHour)).toFixed(2)}/unit</p>
                    </div>
                    <div>
                      <label className="text-[10px] text-muted block mb-0.5 flex items-center gap-1"><Zap className="w-3 h-3" /> Machine ₹/unit</label>
                      <input type="number" min="0" value={step.machineCostPerUnit} onChange={e => { const v = [...bomForm.steps]; v[i].machineCostPerUnit = e.target.value; setBomForm(f => ({ ...f, steps: v })) }} className="w-full px-2 py-1.5 bg-surface border border-border rounded-lg text-xs text-foreground" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {/* Step cost summary */}
            {bomForm.steps.some(s => s.operationName) && (
              <div className="mt-2 p-2 bg-accent/5 border border-accent/20 rounded-lg text-xs">
                <span className="text-muted">Estimated step cost/unit: </span>
                <span className="text-accent font-semibold">
                  ₹{bomForm.steps.reduce((sum, s) => sum + ((Number(s.durationMins)/60) * Number(s.labourRatePerHour)) + Number(s.machineCostPerUnit), 0).toFixed(2)}
                </span>
                <span className="text-muted ml-2">(Labour: ₹{bomForm.steps.reduce((sum, s) => sum + (Number(s.durationMins)/60) * Number(s.labourRatePerHour), 0).toFixed(2)} + Machine: ₹{bomForm.steps.reduce((sum, s) => sum + Number(s.machineCostPerUnit), 0).toFixed(2)})</span>
              </div>
            )}
          </div>

          <button onClick={handleCreateBOM} disabled={submitting || !bomForm.name || !bomForm.finishedProductId || !bomForm.items.some(i => i.rawMaterialId)} className="w-full py-2.5 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent/90 disabled:opacity-50">
            {submitting ? 'Creating...' : 'Create Bill of Materials'}
          </button>
        </div>
      </Modal>

      {/* Create Production Order Modal */}
      <Modal isOpen={showProdModal} onClose={() => setShowProdModal(false)} title="Create Production Order" size="lg">
        <div className="space-y-4">
          <div>
            <label className="text-xs text-muted mb-1 block">Bill of Materials *</label>
            <select value={prodForm.bomId} onChange={e => setProdForm(p => ({ ...p, bomId: e.target.value }))} className={SEL}>
              <option value="">Select BOM</option>
              {boms.filter(b => b.isActive).map(b => <option key={b.id} value={b.id}>{b.name} — {b.finishedProduct?.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-muted mb-1 block">Planned Quantity *</label>
              <input type="number" min="1" value={prodForm.plannedQty} onChange={e => setProdForm(p => ({ ...p, plannedQty: e.target.value }))} className={INP} />
            </div>
            <div>
              <label className="text-xs text-muted mb-1 block">Priority</label>
              <select value={prodForm.priority} onChange={e => setProdForm(p => ({ ...p, priority: e.target.value }))} className={SEL}>
                {['LOW','MEDIUM','HIGH','URGENT'].map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted mb-1 block">Start Date</label>
              <input type="date" value={prodForm.startDate} onChange={e => setProdForm(p => ({ ...p, startDate: e.target.value }))} className={INP} />
            </div>
            <div>
              <label className="text-xs text-muted mb-1 block">Due Date</label>
              <input type="date" value={prodForm.dueDate} onChange={e => setProdForm(p => ({ ...p, dueDate: e.target.value }))} className={INP} />
            </div>
            <div>
              <label className="text-xs text-muted mb-1 block">Work Center</label>
              <select value={prodForm.workCenterId} onChange={e => setProdForm(p => ({ ...p, workCenterId: e.target.value }))} className={SEL}>
                <option value="">Select Work Center</option>
                {workCenters.filter(w => w.status === 'Active').map(w => <option key={w.id} value={w.id}>{w.name} ({w.type})</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted mb-1 block">Assign Staff</label>
              <select value={prodForm.assignedStaffId} onChange={e => setProdForm(p => ({ ...p, assignedStaffId: e.target.value }))} className={SEL}>
                <option value="">Unassigned</option>
                {staffOptions.map(s => <option key={s.id} value={s.id}>{s.name} ({s.role})</option>)}
              </select>
              {staffOptions.length === 0 && <p className="text-[10px] text-muted mt-1">No active staff available to assign.</p>}
            </div>
          </div>
          <div>
            <label className="text-xs text-muted mb-1 block">Notes</label>
            <textarea value={prodForm.notes} onChange={e => setProdForm(p => ({ ...p, notes: e.target.value }))} rows={2} className={INP} />
          </div>
          <button onClick={handleCreateProd} disabled={submitting || !prodForm.bomId || !prodForm.plannedQty} className="w-full py-2.5 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent/90 disabled:opacity-50">
            {submitting ? 'Creating...' : 'Create Production Order'}
          </button>
        </div>
      </Modal>

      {/* Complete Production Modal */}
      <Modal isOpen={showCompleteModal} onClose={() => setShowCompleteModal(false)} title="Complete Production Order" size="lg">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-muted mb-1 block">Actual Quantity Produced *</label>
              <input type="number" min="0" value={completeForm.actualQty} onChange={e => setCompleteForm(p => ({ ...p, actualQty: e.target.value }))} className={INP} />
            </div>
            <div>
              <label className="text-xs text-muted mb-1 block">Scrap Quantity</label>
              <input type="number" min="0" value={completeForm.scrapQty} onChange={e => setCompleteForm(p => ({ ...p, scrapQty: e.target.value }))} className={INP} />
            </div>
            <div>
              <label className="text-xs text-muted mb-1 block flex items-center gap-1"><Clock className="w-3 h-3" /> Labour Cost (₹)</label>
              <input type="number" min="0" value={completeForm.totalLabourCost} onChange={e => setCompleteForm(p => ({ ...p, totalLabourCost: e.target.value }))} className={INP} placeholder="Total labour cost" />
            </div>
            <div>
              <label className="text-xs text-muted mb-1 block flex items-center gap-1"><Zap className="w-3 h-3" /> Machine Cost (₹)</label>
              <input type="number" min="0" value={completeForm.machineCost} onChange={e => setCompleteForm(p => ({ ...p, machineCost: e.target.value }))} className={INP} placeholder="CNC, lathe, power tools..." />
            </div>
            <div>
              <label className="text-xs text-muted mb-1 block">Overhead Cost (₹)</label>
              <input type="number" min="0" value={completeForm.overheadCost} onChange={e => setCompleteForm(p => ({ ...p, overheadCost: e.target.value }))} placeholder="Electricity, tool wear..." className={INP} />
            </div>
            <div>
              <label className="text-xs text-muted mb-1 block">Quality Status</label>
              <select value={completeForm.qualityStatus} onChange={e => setCompleteForm(p => ({ ...p, qualityStatus: e.target.value }))} className={SEL}>
                <option value="PASSED">PASSED</option>
                <option value="PARTIAL">PARTIAL</option>
                <option value="FAILED">FAILED</option>
              </select>
            </div>
            <div className="col-span-2">
              <label className="text-xs text-muted mb-1 block">Scrap Reason</label>
              <input value={completeForm.scrapReason} onChange={e => setCompleteForm(p => ({ ...p, scrapReason: e.target.value }))} placeholder="Why scrapped?" className={INP} />
            </div>
          </div>

          {/* Cost summary */}
          <div className="p-3 bg-surface-hover rounded-lg">
            <p className="text-xs text-muted mb-2 font-medium">Cost Preview</p>
            <div className="grid grid-cols-4 gap-2 text-center">
              {[
                { label: 'Labour', value: Number(completeForm.totalLabourCost) || 0 },
                { label: 'Machine', value: Number(completeForm.machineCost) || 0 },
                { label: 'Overhead', value: Number(completeForm.overheadCost) || 0 },
                { label: 'Total', value: (Number(completeForm.totalLabourCost)||0) + (Number(completeForm.machineCost)||0) + (Number(completeForm.overheadCost)||0) },
              ].map((c, i) => (
                <div key={i} className={i === 3 ? 'bg-accent/10 p-2 rounded' : 'p-2'}>
                  <p className="text-[10px] text-muted">{c.label}</p>
                  <p className={`text-sm font-bold ${i === 3 ? 'text-accent' : 'text-foreground'}`}>₹{c.value.toLocaleString('en-IN')}</p>
                </div>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs text-muted mb-1 block">Quality Notes</label>
            <input value={completeForm.qualityNotes} onChange={e => setCompleteForm(p => ({ ...p, qualityNotes: e.target.value }))} className={INP} />
          </div>

          {completeForm.consumptions.length > 0 && (
            <div>
              <label className="text-xs font-medium text-muted uppercase tracking-wide mb-2 block">Actual Material Consumption</label>
              <div className="space-y-2">
                {completeForm.consumptions.map((c, i) => {
                  const prod = products.find(p => p.id === c.rawMaterialId)
                  return (
                    <div key={i} className="flex items-center gap-3">
                      <span className="text-sm text-foreground flex-1">{prod?.name || `Material #${c.rawMaterialId}`}</span>
                      <span className="text-xs text-muted">Planned: {Number(c.plannedQty).toFixed(2)}</span>
                      <input type="number" min="0" step="0.01" value={c.actualQty} onChange={e => { const v = [...completeForm.consumptions]; v[i].actualQty = e.target.value; setCompleteForm(f => ({ ...f, consumptions: v })) }} className="w-28 px-2 py-1.5 bg-surface border border-border rounded-lg text-sm text-foreground" />
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          <div>
            <label className="text-xs text-muted mb-1 block">Notes</label>
            <textarea value={completeForm.notes} onChange={e => setCompleteForm(p => ({ ...p, notes: e.target.value }))} rows={2} className={INP} />
          </div>
          <button onClick={handleCompleteProd} disabled={submitting || !completeForm.actualQty} className="w-full py-2.5 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-600/90 disabled:opacity-50">
            {submitting ? 'Completing...' : 'Complete Production & Update Stock'}
          </button>
        </div>
      </Modal>

      {/* Work Center Modal */}
      <Modal isOpen={showWCModal} onClose={() => setShowWCModal(false)} title="Add Work Center">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-muted mb-1 block">Name *</label>
              <input value={wcForm.name} onChange={e => setWcForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Carpentry Station 1" className={INP} />
            </div>
            <div>
              <label className="text-xs text-muted mb-1 block">Type</label>
              <select value={wcForm.type} onChange={e => setWcForm(p => ({ ...p, type: e.target.value }))} className={SEL}>
                {WC_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted mb-1 block">Daily Capacity (units/day)</label>
              <input type="number" min="1" value={wcForm.capacity} onChange={e => setWcForm(p => ({ ...p, capacity: e.target.value }))} className={INP} />
            </div>
            <div>
              <label className="text-xs text-muted mb-1 block">Description</label>
              <input value={wcForm.description} onChange={e => setWcForm(p => ({ ...p, description: e.target.value }))} className={INP} />
            </div>
            <div className="col-span-2">
              <label className="text-xs text-muted mb-1 block">Notes</label>
              <input value={wcForm.notes} onChange={e => setWcForm(p => ({ ...p, notes: e.target.value }))} className={INP} />
            </div>
          </div>
          <button onClick={handleCreateWC} disabled={submitting || !wcForm.name} className="w-full py-2.5 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent/90 disabled:opacity-50">
            {submitting ? 'Creating...' : 'Add Work Center'}
          </button>
        </div>
      </Modal>

      {/* Cancel Modal */}
      <Modal isOpen={showCancelModal} onClose={() => { setShowCancelModal(false); setCancelReason('') }} title="Cancel Production Order">
        <div className="space-y-4">
          <p className="text-sm text-muted">Cancel order <span className="font-semibold text-foreground">{cancelTarget?.displayId}</span>?</p>
          <div>
            <label className="text-xs text-muted mb-1 block">Reason for cancellation *</label>
            <textarea value={cancelReason} onChange={e => setCancelReason(e.target.value)} rows={3} placeholder="Explain why this order is being cancelled..." className={INP} />
          </div>
          <div className="flex gap-3">
            <button onClick={() => { setShowCancelModal(false); setCancelReason('') }} className="flex-1 py-2 border border-border text-muted rounded-lg text-sm hover:text-foreground">Go Back</button>
            <button onClick={handleCancelProd} disabled={submitting || !cancelReason.trim()} className="flex-1 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-600/90 disabled:opacity-50">
              {submitting ? 'Cancelling...' : 'Confirm Cancel'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Quality Check Modal */}
      <Modal isOpen={showQCModal} onClose={() => { setShowQCModal(false); setQcTarget(null) }} title="Record Quality Check">
        <div className="space-y-4">
          <p className="text-sm text-muted">Order: <span className="font-semibold text-foreground">{qcTarget?.displayId} — {qcTarget?.finishedProduct?.name}</span></p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-muted mb-1 block">Quality Status *</label>
              <select value={qcForm.qualityStatus} onChange={e => setQcForm(p => ({ ...p, qualityStatus: e.target.value }))} className={SEL}>
                <option value="PASSED">PASSED</option>
                <option value="PARTIAL">PARTIAL</option>
                <option value="FAILED">FAILED</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-muted mb-1 block">Scrap Quantity</label>
              <input type="number" min="0" value={qcForm.scrapQty} onChange={e => setQcForm(p => ({ ...p, scrapQty: e.target.value }))} className={INP} />
            </div>
          </div>
          <div>
            <label className="text-xs text-muted mb-1 block">Scrap Reason</label>
            <input value={qcForm.scrapReason} onChange={e => setQcForm(p => ({ ...p, scrapReason: e.target.value }))} placeholder="Defect, damage, etc." className={INP} />
          </div>
          <div>
            <label className="text-xs text-muted mb-1 block">Quality Notes</label>
            <textarea value={qcForm.qualityNotes} onChange={e => setQcForm(p => ({ ...p, qualityNotes: e.target.value }))} rows={2} placeholder="Inspection observations..." className={INP} />
          </div>
          <button onClick={handleQCSubmit} disabled={submitting} className="w-full py-2.5 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-600/90 disabled:opacity-50">
            {submitting ? 'Saving...' : 'Record Quality Check'}
          </button>
        </div>
      </Modal>

      {/* BOM Templates Manager Modal */}
      <Modal isOpen={showTemplateModal} onClose={() => setShowTemplateModal(false)} title="BOM Process Templates" size="lg">
        <div className="space-y-5">
          {/* Existing templates */}
          {templates.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-medium text-muted uppercase tracking-wide">Saved Templates</h4>
              {templates.map(t => (
                <div key={t.id} className="p-3 bg-surface-hover rounded-lg border border-border/50 flex items-start justify-between">
                  <div>
                    <p className="text-sm font-medium text-foreground">{t.name}</p>
                    {t.description && <p className="text-xs text-muted mt-0.5">{t.description}</p>}
                    <p className="text-[10px] text-muted mt-1">{Array.isArray(t.steps) ? t.steps.length : 0} steps</p>
                  </div>
                  <button onClick={async () => { if (!confirm('Delete this template?')) return; const r = await deleteBomTemplate(t.id); if (r.success) loadData(); else alert(r.error) }} className="p-1.5 text-red-400/50 hover:text-red-400 hover:bg-red-500/10 rounded">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Create new template */}
          <div className="border-t border-border pt-4">
            <h4 className="text-xs font-medium text-muted uppercase tracking-wide mb-3">Create New Template</h4>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted mb-1 block">Template Name *</label>
                  <input value={templateForm.name} onChange={e => setTemplateForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Standard Sofa Process" className={INP} />
                </div>
                <div>
                  <label className="text-xs text-muted mb-1 block">Description</label>
                  <input value={templateForm.description} onChange={e => setTemplateForm(f => ({ ...f, description: e.target.value }))} placeholder="Optional" className={INP} />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-medium text-muted uppercase tracking-wide">Steps</label>
                  <button onClick={() => setTemplateForm(f => ({ ...f, steps: [...f.steps, { operationName: '', workCenterId: '', durationMins: 60, labourRatePerHour: 0, machineCostPerUnit: 0 }] }))} className="text-xs text-accent hover:underline">+ Add Step</button>
                </div>
                <div className="space-y-2">
                  {templateForm.steps.map((step, i) => (
                    <div key={i} className="p-3 bg-surface-hover rounded-lg border border-border/50">
                      <div className="grid grid-cols-12 gap-2 items-center mb-2">
                        <span className="col-span-1 text-xs text-muted text-center font-bold">{i + 1}</span>
                        <input value={step.operationName} onChange={e => { const v = [...templateForm.steps]; v[i].operationName = e.target.value; setTemplateForm(f => ({ ...f, steps: v })) }} placeholder="Operation name" className="col-span-5 px-2 py-1.5 bg-surface border border-border rounded-lg text-xs text-foreground" />
                        <select value={step.workCenterId} onChange={e => { const v = [...templateForm.steps]; v[i].workCenterId = e.target.value; setTemplateForm(f => ({ ...f, steps: v })) }} className="col-span-4 px-2 py-1.5 bg-surface border border-border rounded-lg text-xs text-foreground">
                          <option value="">Work Center</option>
                          {workCenters.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                        </select>
                        <button onClick={() => setTemplateForm(f => ({ ...f, steps: f.steps.filter((_, j) => j !== i) }))} className="col-span-1 text-red-400 hover:text-red-300 text-base text-center">×</button>
                        <div className="col-span-1" />
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <label className="text-[10px] text-muted block mb-0.5">Duration (min)</label>
                          <input type="number" min="0" value={step.durationMins} onChange={e => { const v = [...templateForm.steps]; v[i].durationMins = e.target.value; setTemplateForm(f => ({ ...f, steps: v })) }} className="w-full px-2 py-1.5 bg-surface border border-border rounded-lg text-xs text-foreground" />
                        </div>
                        <div>
                          <label className="text-[10px] text-muted block mb-0.5">Labour ₹/hr</label>
                          <input type="number" min="0" value={step.labourRatePerHour} onChange={e => { const v = [...templateForm.steps]; v[i].labourRatePerHour = e.target.value; setTemplateForm(f => ({ ...f, steps: v })) }} className="w-full px-2 py-1.5 bg-surface border border-border rounded-lg text-xs text-foreground" />
                        </div>
                        <div>
                          <label className="text-[10px] text-muted block mb-0.5">Machine ₹/unit</label>
                          <input type="number" min="0" value={step.machineCostPerUnit} onChange={e => { const v = [...templateForm.steps]; v[i].machineCostPerUnit = e.target.value; setTemplateForm(f => ({ ...f, steps: v })) }} className="w-full px-2 py-1.5 bg-surface border border-border rounded-lg text-xs text-foreground" />
                        </div>
                      </div>
                    </div>
                  ))}
                  {templateForm.steps.length === 0 && <p className="text-xs text-muted text-center py-4">Add steps to define this process template</p>}
                </div>
              </div>

              <button onClick={handleCreateTemplate} disabled={submitting || !templateForm.name || templateForm.steps.filter(s => s.operationName).length === 0} className="w-full py-2.5 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent/90 disabled:opacity-50">
                {submitting ? 'Saving...' : 'Save Template'}
              </button>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  )
}

// ─── BOM Card Component ────────────────────────────────
function BOMCard({ bom, products, workCenters, onToggle, onDelete, onExport, onSaveAsTemplate, onRefresh }) {
  const [expanded, setExpanded] = useState(false)
  const [editingItemId, setEditingItemId] = useState(null)
  const [editingStepId, setEditingStepId] = useState(null)
  const [itemEdit, setItemEdit] = useState({})
  const [stepEdit, setStepEdit] = useState({})
  const [addItemMode, setAddItemMode] = useState(false)
  const [addStepMode, setAddStepMode] = useState(false)
  const [newItem, setNewItem] = useState({ rawMaterialId: '', quantity: 1, unitOfMeasure: 'PCS', wastagePercent: 0, unitCost: 0 })
  const [newStep, setNewStep] = useState({ operationName: '', workCenterId: '', durationMins: 60, labourRatePerHour: 0, machineCostPerUnit: 0 })
  const [saving, setSaving] = useState(false)

  const saveItemEdit = async (id) => {
    setSaving(true)
    const r = await updateBOMItem({
      id,
      quantity: Number(itemEdit.quantity),
      unitOfMeasure: itemEdit.unitOfMeasure,
      wastagePercent: Number(itemEdit.wastagePercent),
      unitCost: Number(itemEdit.unitCost),
    })
    if (r.success) { setEditingItemId(null); onRefresh() }
    else alert(r.error)
    setSaving(false)
  }

  const saveStepEdit = async (id) => {
    setSaving(true)
    const r = await updateBOMStep({
      id,
      operationName: stepEdit.operationName,
      workCenterId: stepEdit.workCenterId ? Number(stepEdit.workCenterId) : null,
      durationMins: Number(stepEdit.durationMins),
      labourRatePerHour: Number(stepEdit.labourRatePerHour),
      machineCostPerUnit: Number(stepEdit.machineCostPerUnit),
    })
    if (r.success) { setEditingStepId(null); onRefresh() }
    else alert(r.error)
    setSaving(false)
  }

  const handleAddItem = async () => {
    if (!newItem.rawMaterialId) return
    setSaving(true)
    const r = await addBOMItem({ bomId: bom.id, rawMaterialId: Number(newItem.rawMaterialId), quantity: Number(newItem.quantity), unitOfMeasure: newItem.unitOfMeasure, wastagePercent: Number(newItem.wastagePercent), unitCost: Number(newItem.unitCost) })
    if (r.success) { setAddItemMode(false); setNewItem({ rawMaterialId: '', quantity: 1, unitOfMeasure: 'PCS', wastagePercent: 0, unitCost: 0 }); onRefresh() }
    else alert(r.error)
    setSaving(false)
  }

  const handleAddStep = async () => {
    if (!newStep.operationName) return
    setSaving(true)
    const r = await addBOMStep({ bomId: bom.id, operationName: newStep.operationName, workCenterId: newStep.workCenterId ? Number(newStep.workCenterId) : undefined, durationMins: Number(newStep.durationMins), labourRatePerHour: Number(newStep.labourRatePerHour), machineCostPerUnit: Number(newStep.machineCostPerUnit) })
    if (r.success) { setAddStepMode(false); setNewStep({ operationName: '', workCenterId: '', durationMins: 60, labourRatePerHour: 0, machineCostPerUnit: 0 }); onRefresh() }
    else alert(r.error)
    setSaving(false)
  }

  return (
    <div className="glass-card p-5">
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-foreground">{bom.name}</h3>
            <span className={`text-[10px] px-2 py-0.5 rounded-full ${bom.isActive ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
              {bom.isActive ? 'Active' : 'Inactive'}
            </span>
            <span className="text-[10px] text-muted">v{bom.version}</span>
            {bom.estimatedDays && <span className="text-[10px] text-muted">{bom.estimatedDays} days</span>}
            <span className="text-[10px] text-muted">{bom._count?.productionOrders || 0} orders</span>
          </div>
          <p className="text-xs text-muted mt-1">
            Finished Product: <span className="text-foreground">{bom.finishedProduct?.name}</span>
            {bom.finishedProduct?.sku && <span className="ml-1">({bom.finishedProduct.sku})</span>}
            {bom.finishedProduct?.price && <span className="ml-2 text-emerald-400">₹{bom.finishedProduct.price.toLocaleString('en-IN')}</span>}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button onClick={onExport} className="p-1.5 rounded hover:bg-surface-hover text-muted hover:text-emerald-400" title="Export BOM as CSV"><Download className="w-4 h-4" /></button>
          <button onClick={() => setExpanded(!expanded)} className="p-1.5 rounded hover:bg-surface-hover text-muted hover:text-foreground">
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          <button onClick={onToggle} className={`px-2.5 py-1 rounded-lg text-xs ${bom.isActive ? 'bg-red-500/10 text-red-400 hover:bg-red-500/20' : 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20'}`}>
            {bom.isActive ? 'Deactivate' : 'Activate'}
          </button>
          <button onClick={onDelete} className="p-1.5 text-red-400/40 hover:text-red-400 hover:bg-red-500/10 rounded-lg"><Trash2 className="w-4 h-4" /></button>
        </div>
      </div>

      {expanded && (
        <div className="space-y-5 mt-4 pt-4 border-t border-border">

          {/* ── RAW MATERIALS MANAGEMENT BLOCK ── */}
          <div className="rounded-xl border border-border overflow-hidden">
            {/* Section header */}
            <div className="flex items-center justify-between px-4 py-3 bg-surface-hover border-b border-border">
              <div className="flex items-center gap-2">
                <Package className="w-4 h-4 text-accent" />
                <span className="text-sm font-semibold text-foreground">Raw Materials</span>
                <span className="text-[10px] px-2 py-0.5 bg-accent/10 text-accent rounded-full">{bom.items?.length || 0} items</span>
              </div>
            </div>

            {/* Material rows */}
            <div className="divide-y divide-border">
              {bom.items?.length === 0 && (
                <p className="text-center text-xs text-muted py-6">No raw materials added yet</p>
              )}
              {bom.items?.map((item) => (
                <div key={item.id}>
                  {editingItemId === item.id ? (
                    /* ── Edit row ── */
                    <div className="p-3 bg-accent/5">
                      <p className="text-xs font-medium text-accent mb-2">Editing: {item.rawMaterial?.name}</p>
                      <div className="grid grid-cols-3 gap-2 mb-2">
                        <div>
                          <label className="text-[10px] text-muted block mb-0.5">Quantity</label>
                          <input type="number" min="0.001" step="0.001" value={itemEdit.quantity}
                            onChange={e => setItemEdit(p => ({ ...p, quantity: e.target.value }))}
                            className="w-full px-2 py-1.5 bg-surface border border-accent rounded text-xs text-foreground" />
                        </div>
                        <div>
                          <label className="text-[10px] text-muted block mb-0.5">Unit of Measure</label>
                          <input value={itemEdit.unitOfMeasure}
                            onChange={e => setItemEdit(p => ({ ...p, unitOfMeasure: e.target.value }))}
                            className="w-full px-2 py-1.5 bg-surface border border-accent rounded text-xs text-foreground" />
                        </div>
                        <div>
                          <label className="text-[10px] text-muted block mb-0.5">Wastage %</label>
                          <input type="number" min="0" max="100" value={itemEdit.wastagePercent}
                            onChange={e => setItemEdit(p => ({ ...p, wastagePercent: e.target.value }))}
                            className="w-full px-2 py-1.5 bg-surface border border-accent rounded text-xs text-foreground" />
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => saveItemEdit(item.id)} disabled={saving}
                          className="px-3 py-1.5 bg-emerald-600 text-white rounded text-xs font-medium disabled:opacity-50 flex items-center gap-1">
                          <Save className="w-3 h-3" /> {saving ? 'Saving...' : 'Save'}
                        </button>
                        <button onClick={() => setEditingItemId(null)}
                          className="px-3 py-1.5 bg-surface border border-border text-muted rounded text-xs">Cancel</button>
                      </div>
                    </div>
                  ) : (
                    /* ── Display row ── */
                    <div className="flex items-center gap-3 px-4 py-3 hover:bg-surface-hover/50 group">
                      {/* Name & SKU */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{item.rawMaterial?.name}</p>
                        <p className="text-[10px] text-muted font-mono">{item.rawMaterial?.sku}</p>
                      </div>
                      {/* Qty */}
                      <div className="text-center w-20">
                        <p className="text-sm text-foreground font-semibold">{item.quantity}</p>
                        <p className="text-[10px] text-muted">{item.unitOfMeasure}</p>
                      </div>
                      {/* Wastage */}
                      <div className="text-center w-16">
                        <p className="text-sm text-foreground">{item.wastagePercent}%</p>
                        <p className="text-[10px] text-muted">Waste</p>
                      </div>
                      {/* Unit cost — auto from Raw Materials */}
                      <div className="text-center w-24">
                        <p className="text-sm text-foreground font-semibold">₹{item.rawMaterial?.costPrice || 0}</p>
                        <p className="text-[10px] text-muted">cost/unit</p>
                      </div>
                      {/* Stock */}
                      <div className="text-center w-20">
                        <p className={`text-sm font-semibold ${item.rawMaterial?.stock < item.quantity ? 'text-red-400' : 'text-emerald-400'}`}>
                          {item.rawMaterial?.stock}
                        </p>
                        <p className="text-[10px] text-muted">in stock</p>
                      </div>
                      {/* Status badge */}
                      <span className={`hidden sm:inline text-[10px] px-2 py-0.5 rounded-full flex-shrink-0 ${item.rawMaterial?.stock < item.quantity ? 'bg-red-500/10 text-red-400' : 'bg-emerald-500/10 text-emerald-400'}`}>
                        {item.rawMaterial?.stock < item.quantity ? '⚠ Short' : '✓ OK'}
                      </span>
                      {/* Action buttons — always visible */}
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <button
                          onClick={() => { setEditingItemId(item.id); setItemEdit({ quantity: item.quantity, unitOfMeasure: item.unitOfMeasure, wastagePercent: item.wastagePercent, unitCost: item.unitCost }) }}
                          className="px-2.5 py-1 rounded-md bg-surface border border-border text-xs text-muted hover:text-accent hover:border-accent/50 transition-colors flex items-center gap-1">
                          <Edit2 className="w-3 h-3" /> Edit
                        </button>
                        <button
                          onClick={async () => { if (!confirm(`Remove "${item.rawMaterial?.name}" from this BOM?`)) return; setSaving(true); const r = await removeBOMItem(item.id); if (r.success) onRefresh(); else alert(r.error); setSaving(false) }}
                          disabled={saving}
                          className="px-2.5 py-1 rounded-md bg-red-500/10 border border-red-500/20 text-xs text-red-400 hover:bg-red-500/20 transition-colors flex items-center gap-1 disabled:opacity-50">
                          <Trash2 className="w-3 h-3" /> Delete
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* ── Add New Material Form — always shown at bottom ── */}
            <div className="border-t border-dashed border-border/70 bg-surface-hover/30 p-4">
              <p className="text-xs font-semibold text-foreground mb-3 flex items-center gap-1.5">
                <Plus className="w-3.5 h-3.5 text-accent" /> Add Raw Material
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
                <div className="col-span-2 sm:col-span-1">
                  <label className="text-[10px] text-muted block mb-0.5">Material *</label>
                  <select
                    value={newItem.rawMaterialId}
                    onChange={e => setNewItem(p => ({ ...p, rawMaterialId: e.target.value }))}
                    className="w-full px-2 py-2 bg-surface border border-border rounded-lg text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-accent/50">
                    <option value="">— Select material —</option>
                    {products.filter(p => p.category === 'Raw Material').map(p => <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] text-muted block mb-0.5">Quantity *</label>
                  <input type="number" min="0.001" step="0.001" value={newItem.quantity}
                    onChange={e => setNewItem(p => ({ ...p, quantity: e.target.value }))}
                    className="w-full px-2 py-2 bg-surface border border-border rounded-lg text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-accent/50" />
                </div>
                <div>
                  <label className="text-[10px] text-muted block mb-0.5">Unit of Measure</label>
                  <select value={newItem.unitOfMeasure}
                    onChange={e => setNewItem(p => ({ ...p, unitOfMeasure: e.target.value }))}
                    className="w-full px-2 py-2 bg-surface border border-border rounded-lg text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-accent/50">
                    <option value="PCS">PCS – Pieces</option>
                    <option value="KG">KG – Kilograms</option>
                    <option value="MTR">MTR – Meters</option>
                    <option value="SFT">SFT – Sq. Feet</option>
                    <option value="LTR">LTR – Litres</option>
                    <option value="SET">SET</option>
                    <option value="BOX">BOX</option>
                    <option value="NOS">NOS – Numbers</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] text-muted block mb-0.5">Wastage %</label>
                  <input type="number" min="0" max="100" value={newItem.wastagePercent}
                    onChange={e => setNewItem(p => ({ ...p, wastagePercent: e.target.value }))}
                    className="w-full px-2 py-2 bg-surface border border-border rounded-lg text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-accent/50" />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleAddItem}
                  disabled={saving || !newItem.rawMaterialId}
                  className="px-4 py-2 bg-accent text-white rounded-lg text-xs font-semibold hover:bg-accent/90 disabled:opacity-50 flex items-center gap-1.5 transition-colors">
                  <Plus className="w-3.5 h-3.5" />
                  {saving ? 'Adding...' : 'Add Material'}
                </button>
                <button
                  onClick={() => setNewItem({ rawMaterialId: '', quantity: 1, unitOfMeasure: 'PCS', wastagePercent: 0, unitCost: 0 })}
                  className="px-3 py-2 text-xs text-muted hover:text-foreground transition-colors">
                  Clear
                </button>
                <p className="text-[10px] text-muted ml-auto">Cost is auto-picked from Raw Materials tab</p>
              </div>
            </div>
          </div>

          {/* Steps Section */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-medium text-muted uppercase tracking-wide">Manufacturing Routing & Job Costing</p>
              <div className="flex gap-2">
                {bom.steps?.length > 0 && (
                  <button onClick={() => onSaveAsTemplate(bom.steps)} className="text-xs text-muted hover:text-accent flex items-center gap-1"><Copy className="w-3 h-3" /> Save as Template</button>
                )}
                <button onClick={() => setAddStepMode(!addStepMode)} className="text-xs text-accent hover:underline flex items-center gap-1"><Plus className="w-3 h-3" /> Add Step</button>
              </div>
            </div>

            {bom.steps?.length > 0 ? (
              <div className="space-y-2">
                {bom.steps.map((s) => (
                  <div key={s.id} className="group">
                    {editingStepId === s.id ? (
                      <div className="p-3 bg-accent/5 border border-accent/20 rounded-lg">
                        <div className="grid grid-cols-12 gap-2 items-center mb-2">
                          <span className="col-span-1 text-xs text-muted text-center font-bold">{s.stepNumber}</span>
                          <input value={stepEdit.operationName} onChange={e => setStepEdit(p => ({ ...p, operationName: e.target.value }))} className="col-span-5 px-2 py-1.5 bg-surface border border-accent rounded text-xs text-foreground" />
                          <select value={stepEdit.workCenterId || ''} onChange={e => setStepEdit(p => ({ ...p, workCenterId: e.target.value }))} className="col-span-4 px-2 py-1.5 bg-surface border border-accent rounded text-xs text-foreground">
                            <option value="">Work Center</option>
                            {workCenters.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                          </select>
                          <div className="col-span-2 flex gap-1 justify-end">
                            <button onClick={() => saveStepEdit(s.id)} disabled={saving} className="p-1 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 rounded"><Save className="w-3.5 h-3.5" /></button>
                            <button onClick={() => setEditingStepId(null)} className="p-1 bg-gray-500/10 text-gray-400 rounded"><X className="w-3.5 h-3.5" /></button>
                          </div>
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                          <div>
                            <label className="text-[10px] text-muted block mb-0.5">Duration (min)</label>
                            <input type="number" min="0" value={stepEdit.durationMins} onChange={e => setStepEdit(p => ({ ...p, durationMins: e.target.value }))} className="w-full px-2 py-1.5 bg-surface border border-accent rounded text-xs text-foreground" />
                          </div>
                          <div>
                            <label className="text-[10px] text-muted block mb-0.5 flex items-center gap-1"><Clock className="w-3 h-3" /> Labour ₹/hr</label>
                            <input type="number" min="0" value={stepEdit.labourRatePerHour} onChange={e => setStepEdit(p => ({ ...p, labourRatePerHour: e.target.value }))} className="w-full px-2 py-1.5 bg-surface border border-accent rounded text-xs text-foreground" />
                            <p className="text-[9px] text-muted mt-0.5">= ₹{((Number(stepEdit.durationMins)/60) * Number(stepEdit.labourRatePerHour)).toFixed(2)}/unit</p>
                          </div>
                          <div>
                            <label className="text-[10px] text-muted block mb-0.5 flex items-center gap-1"><Zap className="w-3 h-3" /> Machine ₹/unit</label>
                            <input type="number" min="0" value={stepEdit.machineCostPerUnit} onChange={e => setStepEdit(p => ({ ...p, machineCostPerUnit: e.target.value }))} className="w-full px-2 py-1.5 bg-surface border border-accent rounded text-xs text-foreground" />
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-3 p-3 bg-surface-hover rounded-lg text-sm flex-wrap">
                        <span className="w-6 h-6 rounded-full bg-accent/20 text-accent flex items-center justify-center text-[10px] font-bold flex-shrink-0">{s.stepNumber}</span>
                        <span className="flex-1 text-foreground font-medium min-w-[100px]">{s.operationName}</span>
                        {s.workCenter && <span className="text-muted text-xs">@ {s.workCenter.name}</span>}
                        <span className="text-muted text-xs flex items-center gap-1"><Clock className="w-3 h-3" />{s.durationMins}min</span>
                        {s.labourRatePerHour > 0 && (
                          <span className="text-blue-400 text-xs">Labour: ₹{((s.durationMins/60) * s.labourRatePerHour).toFixed(2)}/unit</span>
                        )}
                        {s.machineCostPerUnit > 0 && (
                          <span className="text-amber-400 text-xs">Machine: ₹{s.machineCostPerUnit}/unit</span>
                        )}
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 ml-auto">
                          <button onClick={() => { setEditingStepId(s.id); setStepEdit({ operationName: s.operationName, workCenterId: s.workCenterId || '', durationMins: s.durationMins, labourRatePerHour: s.labourRatePerHour, machineCostPerUnit: s.machineCostPerUnit }) }} className="p-1 text-muted hover:text-accent"><Edit2 className="w-3 h-3" /></button>
                          <button onClick={async () => { if (!confirm('Remove this step?')) return; setSaving(true); const r = await removeBOMStep(s.id); if (r.success) onRefresh(); else alert(r.error); setSaving(false) }} className="p-1 text-muted hover:text-red-400"><Trash2 className="w-3 h-3" /></button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}

                {/* Step cost summary */}
                {bom.steps.some(s => s.labourRatePerHour > 0 || s.machineCostPerUnit > 0) && (
                  <div className="p-2.5 bg-surface-hover rounded-lg border border-border/50 flex items-center justify-between text-xs">
                    <span className="text-muted">Total job cost per unit:</span>
                    <div className="flex gap-4">
                      <span className="text-blue-400">Labour: ₹{bom.steps.reduce((s, step) => s + (step.durationMins/60) * step.labourRatePerHour, 0).toFixed(2)}</span>
                      <span className="text-amber-400">Machine: ₹{bom.steps.reduce((s, step) => s + step.machineCostPerUnit, 0).toFixed(2)}</span>
                      <span className="text-foreground font-semibold">Total: ₹{bom.steps.reduce((s, step) => s + (step.durationMins/60) * step.labourRatePerHour + step.machineCostPerUnit, 0).toFixed(2)}</span>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-xs text-muted">No routing steps defined. Add steps to enable job costing.</p>
            )}

            {addStepMode && (
              <div className="mt-2 p-3 bg-accent/5 border border-accent/20 rounded-lg">
                <p className="text-xs font-medium text-accent mb-2">Add Manufacturing Step</p>
                <div className="grid grid-cols-12 gap-2 items-center mb-2">
                  <input value={newStep.operationName} onChange={e => setNewStep(p => ({ ...p, operationName: e.target.value }))} placeholder="Operation name" className="col-span-6 px-2 py-1.5 bg-surface border border-border rounded text-xs text-foreground" />
                  <select value={newStep.workCenterId} onChange={e => setNewStep(p => ({ ...p, workCenterId: e.target.value }))} className="col-span-5 px-2 py-1.5 bg-surface border border-border rounded text-xs text-foreground">
                    <option value="">Work Center (optional)</option>
                    {workCenters.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                  </select>
                  <div className="col-span-1" />
                </div>
                <div className="grid grid-cols-3 gap-2 mb-2">
                  <div>
                    <label className="text-[10px] text-muted block mb-0.5">Duration (min)</label>
                    <input type="number" min="0" value={newStep.durationMins} onChange={e => setNewStep(p => ({ ...p, durationMins: e.target.value }))} className="w-full px-2 py-1.5 bg-surface border border-border rounded text-xs text-foreground" />
                  </div>
                  <div>
                    <label className="text-[10px] text-muted block mb-0.5 flex items-center gap-1"><Clock className="w-3 h-3" /> Labour ₹/hr</label>
                    <input type="number" min="0" value={newStep.labourRatePerHour} onChange={e => setNewStep(p => ({ ...p, labourRatePerHour: e.target.value }))} className="w-full px-2 py-1.5 bg-surface border border-border rounded text-xs text-foreground" />
                    <p className="text-[9px] text-muted mt-0.5">= ₹{((Number(newStep.durationMins)/60) * Number(newStep.labourRatePerHour)).toFixed(2)}/unit</p>
                  </div>
                  <div>
                    <label className="text-[10px] text-muted block mb-0.5 flex items-center gap-1"><Zap className="w-3 h-3" /> Machine ₹/unit</label>
                    <input type="number" min="0" value={newStep.machineCostPerUnit} onChange={e => setNewStep(p => ({ ...p, machineCostPerUnit: e.target.value }))} className="w-full px-2 py-1.5 bg-surface border border-border rounded text-xs text-foreground" />
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={handleAddStep} disabled={saving || !newStep.operationName} className="px-3 py-1.5 bg-accent text-white rounded text-xs disabled:opacity-50">{saving ? '...' : 'Add Step'}</button>
                  <button onClick={() => setAddStepMode(false)} className="px-3 py-1.5 bg-surface border border-border text-muted rounded text-xs">Cancel</button>
                </div>
              </div>
            )}
          </div>

          {bom.notes && <p className="text-xs text-muted">Notes: {bom.notes}</p>}
        </div>
      )}
    </div>
  )
}
