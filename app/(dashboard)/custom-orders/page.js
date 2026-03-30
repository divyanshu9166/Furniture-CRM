'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Search, Plus, Ruler, MapPin, Camera, FileText,
  Clock, CheckCircle2, ArrowRight, Package,
  Phone, User, Calendar, DollarSign, Truck,
  ChevronRight, Hammer, Eye, X, Upload,
  MapPinned, Image, ShoppingBag,
  ClipboardList, ArrowUpDown, ChevronDown, Trash2,
  Bell, MessageSquare, Mail, Send, CheckCheck,
} from 'lucide-react';
import Modal from '@/components/Modal';
import {
  getCustomOrders, createCustomOrder, updateCustomOrderStatus,
  scheduleVisit, updateMeasurements, updateReferenceImages,
  addTimelineEntry, sendProgressNotification,
} from '@/app/actions/custom-orders';
import { moveCustomOrderToDraft } from '@/app/actions/drafts';
import { getStaff } from '@/app/actions/staff';
import { getProducts } from '@/app/actions/products';
import { getChannelConfigs } from '@/app/actions/channels';
import { searchContacts, getCustomerProfile } from '@/app/actions/invoices';
import ReturningCustomerCard from '@/components/ReturningCustomerCard';

const customOrderStatuses = ['All', 'Measurement Scheduled', 'Design Phase', 'In Production', 'Quality Check', 'Installation', 'Delivered'];

const notificationTemplates = {
  'Measurement Scheduled': (o) => `Hi ${o.customer}! Your custom furniture order ${o.id} has been confirmed. Our team will visit you at ${o.address} to take measurements. We'll keep you updated every step of the way! 🛋️`,
  'Design Phase': (o) => `Hi ${o.customer}! Great news — your order ${o.id} (${o.type}) is now in the Design Phase. Our designers are working on your custom piece. We'll share updates soon! 🎨`,
  'In Production': (o) => `Hi ${o.customer}! Your custom ${o.type} (Order ${o.id}) is now In Production. Our craftsmen are bringing your vision to life.${o.estimatedDelivery ? ` Estimated delivery: ${o.estimatedDelivery}.` : ''} Stay tuned! 🔨`,
  'Quality Check': (o) => `Hi ${o.customer}! Almost there! Your order ${o.id} is currently undergoing Quality Check. We ensure every piece meets our highest standards before it reaches you. ✅`,
  'Installation': (o) => `Hi ${o.customer}! Exciting news — your custom ${o.type} (Order ${o.id}) is ready for installation! Our team will contact you shortly to schedule a convenient time. 🚚`,
  'Delivered': (o) => `Hi ${o.customer}! 🎉 Your custom ${o.type} (Order ${o.id}) has been delivered! Thank you for choosing us. We hope you love your new furniture. Please share your feedback anytime!`,
};

const statusConfig = {
  'Measurement Scheduled': { cls: 'bg-blue-500/10 text-blue-700 border-blue-500/20', icon: Ruler, step: 0 },
  'Design Phase': { cls: 'bg-purple-500/10 text-purple-700 border-purple-500/20', icon: FileText, step: 1 },
  'In Production': { cls: 'bg-amber-500/10 text-amber-700 border-amber-500/20', icon: Hammer, step: 2 },
  'Quality Check': { cls: 'bg-teal-500/10 text-teal-700 border-teal-500/20', icon: Eye, step: 3 },
  'Installation': { cls: 'bg-orange-500/10 text-orange-700 border-orange-500/20', icon: Package, step: 4 },
  'Delivered': { cls: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20', icon: CheckCircle2, step: 5 },
};

const statusSteps = ['Measurement Scheduled', 'Design Phase', 'In Production', 'Quality Check', 'Installation', 'Delivered'];

export default function CustomOrdersPage() {
  const [customOrders, setCustomOrders] = useState([]);
  const [staff, setStaff] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [showNewOrderModal, setShowNewOrderModal] = useState(false);
  const [saving, setSaving] = useState(false);

  // Schedule visit modal
  const [showScheduleVisit, setShowScheduleVisit] = useState(false);
  const [scheduleOrderId, setScheduleOrderId] = useState(null);

  // Assign staff modal

  // Measurements modal
  const [showMeasurements, setShowMeasurements] = useState(false);
  const [measurementOrderId, setMeasurementOrderId] = useState(null);

  // Reference image upload
  const [uploadingRef, setUploadingRef] = useState(false);

  // Notify customer modal
  const [showNotify, setShowNotify] = useState(false);
  const [notifyOrderId, setNotifyOrderId] = useState(null);
  const [notifyMessage, setNotifyMessage] = useState('');
  const [notifyChannels, setNotifyChannels] = useState({ whatsapp: true, email: false });
  const [notifySending, setNotifySending] = useState(false);
  const [notifyResult, setNotifyResult] = useState(null); // { success, errors }
  const [waConfig, setWaConfig] = useState(null); // { configured, hasTemplate, templateName }

  const reload = useCallback(async () => {
    const res = await getCustomOrders();
    if (res.success) setCustomOrders(res.data);
  }, []);

  useEffect(() => {
    Promise.all([getCustomOrders(), getStaff(), getProducts()]).then(([ordersRes, staffRes, productsRes]) => {
      if (ordersRes.success) setCustomOrders(ordersRes.data);
      if (staffRes.success) setStaff(staffRes.data);
      if (productsRes.success) setProducts(productsRes.data);
      setLoading(false);
    });
  }, []);

  const filtered = useMemo(() => customOrders.filter(o => {
    const matchesSearch = o.customer.toLowerCase().includes(search.toLowerCase()) || o.id.toLowerCase().includes(search.toLowerCase()) || o.type.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === 'All' || o.status === statusFilter;
    return matchesSearch && matchesStatus;
  }), [search, statusFilter, customOrders]);

  const activeOrders = customOrders.filter(o => o.status !== 'Delivered').length;
  const totalValue = customOrders.reduce((s, o) => s + (o.quotedPrice || 0), 0);
  const pendingPayment = customOrders.reduce((s, o) => s + ((o.quotedPrice || 0) - o.advancePaid), 0);
  const measurementsPending = customOrders.filter(o => o.status === 'Measurement Scheduled').length;

  const activeStaff = staff.filter(s => s.status === 'Active');

  // ─── STATUS UPDATE HANDLER ─────────────────────────────

  const handleStatusUpdate = async (order, newStatus) => {
    setSaving(true);
    const res = await updateCustomOrderStatus(order.dbId, newStatus);
    if (res.success) {
      await reload();
      // Update selected order if open
      if (selectedOrder?.dbId === order.dbId) {
        const updated = (await getCustomOrders()).data?.find(o => o.dbId === order.dbId);
        if (updated) setSelectedOrder(updated);
      }
    }
    setSaving(false);
  };

  // ─── SCHEDULE VISIT HANDLER ────────────────────────────

  const handleScheduleVisit = async (e) => {
    e.preventDefault();
    const form = new FormData(e.target);
    setSaving(true);
    const res = await scheduleVisit({
      customOrderId: scheduleOrderId,
      staffId: parseInt(form.get('staffId')),
      date: form.get('date'),
      time: form.get('time'),
      notes: form.get('notes') || undefined,
    });
    if (res.success) {
      await reload();
      if (selectedOrder?.dbId === scheduleOrderId) {
        const updated = (await getCustomOrders()).data?.find(o => o.dbId === scheduleOrderId);
        if (updated) setSelectedOrder(updated);
      }
      setShowScheduleVisit(false);
    }
    setSaving(false);
  };

  // ─── ASSIGN STAFF HANDLER ─────────────────────────────

  // ─── MEASUREMENTS UPDATE HANDLER ──────────────────────

  const handleMeasurementsUpdate = async (e) => {
    e.preventDefault();
    const form = new FormData(e.target);
    setSaving(true);
    const res = await updateMeasurements({
      customOrderId: measurementOrderId,
      measurements: {
        length: form.get('length') || undefined,
        width: form.get('width') || undefined,
        height: form.get('height') || undefined,
        depth: form.get('depth') || undefined,
        countertop: form.get('countertop') || undefined,
        notes: form.get('notes') || undefined,
      },
    });
    if (res.success) {
      await reload();
      if (selectedOrder?.dbId === measurementOrderId) {
        const updated = (await getCustomOrders()).data?.find(o => o.dbId === measurementOrderId);
        if (updated) setSelectedOrder(updated);
      }
      setShowMeasurements(false);
    }
    setSaving(false);
  };

  // ─── REFERENCE IMAGE UPLOAD ───────────────────────────

  const handleRefImageUpload = async (orderId, e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setUploadingRef(true);
    const formData = new FormData();
    formData.set('folder', 'custom-orders');
    files.forEach(f => formData.append('files', f));
    try {
      const res = await fetch('/api/upload', { method: 'POST', body: formData });
      const data = await res.json();
      if (data.success && data.urls?.length > 0) {
        await updateReferenceImages(orderId, data.urls);
        await reload();
        if (selectedOrder?.dbId === orderId) {
          const updated = (await getCustomOrders()).data?.find(o => o.dbId === orderId);
          if (updated) setSelectedOrder(updated);
        }
      } else {
        alert(data.error || 'Upload failed. Please try again.');
      }
    } catch (err) {
      console.error('Upload error:', err);
      alert('Upload failed. Please check your connection and try again.');
    } finally {
      setUploadingRef(false);
    }
  };

  // ─── MOVE TO DRAFT HANDLER ──────────────────────────────

  const handleMoveToDraft = async (orderId) => {
    if (!confirm('Move this order to drafts? It will be permanently deleted after 30 days.')) return;
    setSaving(true);
    const res = await moveCustomOrderToDraft(orderId);
    if (res.success) {
      setSelectedOrder(null);
      await reload();
    }
    setSaving(false);
  };

  // ─── NOTIFY CUSTOMER HANDLER ──────────────────────────

  const openNotifyModal = async (order) => {
    const template = notificationTemplates[order.status];
    setNotifyMessage(template ? template(order) : `Hi ${order.customer}! Your order ${order.id} status: ${order.status}.`);
    setNotifyOrderId(order.dbId);
    setNotifyResult(null);
    setWaConfig(null);
    setShowNotify(true);
    // Check WhatsApp config
    const configRes = await getChannelConfigs();
    if (configRes.success) {
      const wa = configRes.data.find(c => c.channel === 'WhatsApp');
      setWaConfig({
        configured: !!(wa?.enabled && wa?.config?.phoneNumberId && wa?.config?.apiToken),
        hasTemplate: !!wa?.config?.templateName,
        templateName: wa?.config?.templateName || null,
      });
    }
  };

  const handleSendNotification = async () => {
    const channels = Object.entries(notifyChannels).filter(([, v]) => v).map(([k]) => k);
    if (channels.length === 0) return;
    setNotifySending(true);
    setNotifyResult(null);
    const res = await sendProgressNotification({ orderId: notifyOrderId, message: notifyMessage, channels });
    setNotifyResult(res);
    setNotifySending(false);
    if (res.success) {
      await reload();
      if (selectedOrder?.dbId === notifyOrderId) {
        const updated = (await getCustomOrders()).data?.find(o => o.dbId === notifyOrderId);
        if (updated) setSelectedOrder(updated);
      }
    }
  };

  // ─── CREATE ORDER HANDLER ─────────────────────────────

  const handleCreateOrder = async (e) => {
    e.preventDefault();
    const form = new FormData(e.target);
    setSaving(true);

    const orderData = {
      customer: form.get('customer'),
      phone: form.get('phone'),
      address: form.get('address'),
      type: form.get('type'),
      estimatedDelivery: form.get('estimatedDelivery') || undefined,
      measurements: {
        length: form.get('length') || undefined,
        width: form.get('width') || undefined,
        height: form.get('height') || undefined,
        depth: form.get('depth') || undefined,
        countertop: form.get('countertop') || undefined,
        notes: form.get('measurementNotes') || undefined,
      },
      referenceProductId: form.get('referenceProductId') ? parseInt(form.get('referenceProductId')) : undefined,
      referenceImages: (() => { try { const v = form.get('referenceImagesJson'); return v ? JSON.parse(v) : undefined; } catch { return undefined; } })(),
      materials: form.get('materials') || undefined,
      color: form.get('color') || undefined,
      quotedPrice: form.get('quotedPrice') ? parseInt(form.get('quotedPrice')) : undefined,
      advancePaid: form.get('advancePaid') ? parseInt(form.get('advancePaid')) : 0,
      productionNotes: form.get('productionNotes') || undefined,
      scheduleVisit: form.get('scheduleVisit') === 'on',
      visitDate: form.get('visitDate') || undefined,
      visitTime: form.get('visitTime') || undefined,
      visitStaffId: form.get('visitStaffId') ? parseInt(form.get('visitStaffId')) : undefined,
    };

    const res = await createCustomOrder(orderData);
    if (res.success) {
      await reload();
      setShowNewOrderModal(false);
    }
    setSaving(false);
  };

  // ─── LOADING STATE ────────────────────────────────────

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 w-48 bg-surface rounded-lg" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">{[1,2,3,4].map(i => <div key={i} className="h-20 bg-surface rounded-2xl" />)}</div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">{[1,2,3,4].map(i => <div key={i} className="h-48 bg-surface rounded-2xl" />)}</div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-[fade-in_0.3s_ease]">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Custom Orders</h1>
          <p className="text-sm text-muted mt-1">On-site measurements, custom furniture & production tracking</p>
        </div>
        <button onClick={() => setShowNewOrderModal(true)} className="flex items-center gap-2 px-4 py-2.5 bg-accent hover:bg-accent-hover text-white rounded-xl text-sm font-semibold transition-all">
          <Plus className="w-4 h-4" /> New Custom Order
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="glass-card p-4 flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-accent-light"><Hammer className="w-5 h-5 text-accent" /></div>
          <div><p className="text-xs text-muted">Active Orders</p><p className="text-lg font-bold text-foreground">{activeOrders}</p></div>
        </div>
        <div className="glass-card p-4 flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-success-light"><DollarSign className="w-5 h-5 text-success" /></div>
          <div><p className="text-xs text-muted">Total Value</p><p className="text-lg font-bold text-success">₹{totalValue > 100000 ? (totalValue / 100000).toFixed(1) + 'L' : totalValue.toLocaleString()}</p></div>
        </div>
        <div className="glass-card p-4 flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-warning-light"><Clock className="w-5 h-5 text-warning" /></div>
          <div><p className="text-xs text-muted">Pending Payment</p><p className="text-lg font-bold text-warning">₹{pendingPayment > 100000 ? (pendingPayment / 100000).toFixed(1) + 'L' : pendingPayment.toLocaleString()}</p></div>
        </div>
        <div className="glass-card p-4 flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-blue-500/10"><Ruler className="w-5 h-5 text-blue-700" /></div>
          <div><p className="text-xs text-muted">Measurements Pending</p><p className="text-lg font-bold text-blue-700">{measurementsPending}</p></div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
          <input type="text" placeholder="Search orders..." value={search} onChange={e => setSearch(e.target.value)} className="w-full pl-10 pr-4 py-2.5 bg-surface rounded-xl border border-border text-sm" />
        </div>
        <div className="flex gap-1 flex-wrap">
          {customOrderStatuses.map(s => (
            <button key={s} onClick={() => setStatusFilter(s)} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${statusFilter === s ? 'bg-accent text-white' : 'text-muted hover:text-foreground hover:bg-surface-hover'}`}>{s}</button>
          ))}
        </div>
      </div>

      {/* Order Cards */}
      {filtered.length === 0 ? (
        <div className="glass-card p-12 text-center">
          <ClipboardList className="w-12 h-12 mx-auto mb-3 text-muted opacity-30" />
          <p className="text-sm text-muted">No custom orders found</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filtered.map(order => {
            const sc = statusConfig[order.status] || statusConfig['Design Phase'];
            const StatusIcon = sc.icon;
            const currentStep = sc.step;
            const pendingVisits = order.fieldVisits.filter(v => v.status === 'Scheduled').length;

            return (
              <div key={order.id} className="glass-card p-5 cursor-pointer hover:border-accent/30 transition-all" onClick={() => setSelectedOrder(order)}>
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono text-sm text-accent font-medium">{order.id}</span>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium border flex items-center gap-1 ${sc.cls}`}>
                        <StatusIcon className="w-3 h-3" /> {order.status}
                      </span>
                      {pendingVisits > 0 && (
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-500/10 text-blue-700 border border-blue-500/20">
                          {pendingVisits} visit{pendingVisits > 1 ? 's' : ''} pending
                        </span>
                      )}
                    </div>
                    <h3 className="font-semibold text-foreground">{order.type}</h3>
                    <p className="text-xs text-muted">{order.customer} · {order.phone}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-accent">₹{(order.quotedPrice || 0).toLocaleString()}</p>
                    <p className="text-xs text-muted">Advance: ₹{order.advancePaid.toLocaleString()}</p>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3 mb-3">
                  <div className="bg-surface rounded-lg p-2">
                    <p className="text-[10px] text-muted">Materials</p>
                    <p className="text-xs text-foreground truncate">{order.materials || '—'}</p>
                  </div>
                  <div className="bg-surface rounded-lg p-2">
                    <p className="text-[10px] text-muted">Color</p>
                    <p className="text-xs text-foreground truncate">{order.color || '—'}</p>
                  </div>
                  <div className="bg-surface rounded-lg p-2">
                    <p className="text-[10px] text-muted">Delivery</p>
                    <p className="text-xs text-foreground">{order.estimatedDelivery || '—'}</p>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="flex items-center gap-1 mb-2">
                  {statusSteps.map((step, idx) => (
                    <div key={step} className={`flex-1 h-1.5 rounded-full ${idx <= currentStep ? 'bg-accent' : 'bg-border'}`} />
                  ))}
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted flex items-center gap-1">
                    <User className="w-3 h-3" /> {order.assignedStaff || 'Unassigned'}
                  </p>
                  <p className="text-xs text-muted">{currentStep + 1}/6 stages</p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════
          ORDER DETAIL MODAL
          ═══════════════════════════════════════════════════ */}
      <Modal isOpen={!!selectedOrder} onClose={() => setSelectedOrder(null)} title="Custom Order Details" size="xl">
        {selectedOrder && (() => {
          const sc = statusConfig[selectedOrder.status] || statusConfig['Design Phase'];
          const StatusIcon = sc.icon;
          const currentStep = sc.step;
          const meas = selectedOrder.measurements || {};

          return (
            <div className="space-y-5">
              {/* Header */}
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-mono text-accent font-medium">{selectedOrder.id}</span>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium border flex items-center gap-1 ${sc.cls}`}>
                      <StatusIcon className="w-3 h-3" /> {selectedOrder.status}
                    </span>
                  </div>
                  <h3 className="text-lg font-semibold text-foreground">{selectedOrder.type}</h3>
                </div>
                <div className="text-right">
                  <p className="text-xl font-bold text-accent">₹{(selectedOrder.quotedPrice || 0).toLocaleString()}</p>
                  <p className="text-xs text-muted">Advance: ₹{selectedOrder.advancePaid.toLocaleString()}</p>
                  {(selectedOrder.quotedPrice || 0) - selectedOrder.advancePaid > 0 && (
                    <p className="text-xs text-warning">Balance: ₹{((selectedOrder.quotedPrice || 0) - selectedOrder.advancePaid).toLocaleString()}</p>
                  )}
                </div>
              </div>

              {/* Status Progress */}
              <div className="bg-surface rounded-xl p-4">
                <h4 className="text-xs font-semibold text-muted mb-3 uppercase tracking-wide">Order Progress</h4>
                <div className="flex items-center gap-1">
                  {statusSteps.map((step, idx) => {
                    const isActive = idx <= currentStep;
                    const isCurrent = idx === currentStep;
                    return (
                      <div key={step} className="flex-1 flex flex-col items-center">
                        <div className={`w-full h-2 rounded-full mb-1.5 ${isActive ? 'bg-accent' : 'bg-border'}`} />
                        <p className={`text-[10px] text-center leading-tight ${isCurrent ? 'text-accent font-semibold' : isActive ? 'text-foreground' : 'text-muted'}`}>{step}</p>
                      </div>
                    );
                  })}
                </div>

                {/* Status Update Buttons */}
                <div className="mt-4 space-y-2">
                  {/* Forward: next stages */}
                  {currentStep < statusSteps.length - 1 && (
                    <div className="flex gap-2 flex-wrap">
                      {statusSteps.map((step, idx) => {
                        if (idx <= currentStep) return null;
                        return (
                          <button
                            key={step}
                            disabled={saving}
                            onClick={(e) => { e.stopPropagation(); handleStatusUpdate(selectedOrder, step); }}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${idx === currentStep + 1 ? 'bg-accent text-white hover:bg-accent-hover' : 'bg-surface-hover text-muted hover:text-foreground'}`}
                          >
                            <ArrowRight className="w-3 h-3 inline mr-1" />{step}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  {/* Backward: correct a mistake */}
                  {currentStep > 0 && (
                    <div className="flex gap-2 flex-wrap items-center">
                      <span className="text-[10px] text-muted">Correct to:</span>
                      {statusSteps.map((step, idx) => {
                        if (idx >= currentStep) return null;
                        return (
                          <button
                            key={step}
                            disabled={saving}
                            onClick={(e) => { e.stopPropagation(); handleStatusUpdate(selectedOrder, step); }}
                            className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all bg-surface-hover text-muted hover:text-foreground border border-border hover:border-warning/50"
                          >
                            ← {step}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* Quick Actions */}
              <div className="flex gap-2 flex-wrap">
                <button onClick={() => { setScheduleOrderId(selectedOrder.dbId); setShowScheduleVisit(true); }} className="flex items-center gap-1.5 px-3 py-2 bg-surface hover:bg-surface-hover rounded-lg text-xs font-medium text-foreground border border-border transition-all">
                  <MapPinned className="w-3.5 h-3.5 text-blue-700" /> Schedule Visit
                </button>
                <button onClick={() => { setMeasurementOrderId(selectedOrder.dbId); setShowMeasurements(true); }} className="flex items-center gap-1.5 px-3 py-2 bg-surface hover:bg-surface-hover rounded-lg text-xs font-medium text-foreground border border-border transition-all">
                  <Ruler className="w-3.5 h-3.5 text-purple-700" /> Update Measurements
                </button>
                <button onClick={() => openNotifyModal(selectedOrder)} className="flex items-center gap-1.5 px-3 py-2 bg-emerald-500/10 hover:bg-emerald-500/15 rounded-lg text-xs font-medium text-emerald-700 border border-emerald-500/20 transition-all">
                  <Bell className="w-3.5 h-3.5" /> Notify Customer
                </button>
                <label className="flex items-center gap-1.5 px-3 py-2 bg-surface hover:bg-surface-hover rounded-lg text-xs font-medium text-foreground border border-border transition-all cursor-pointer">
                  <Upload className="w-3.5 h-3.5 text-teal-700" /> {uploadingRef ? 'Uploading...' : 'Add Reference Image'}
                  <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => handleRefImageUpload(selectedOrder.dbId, e)} disabled={uploadingRef} />
                </label>
                <button onClick={() => handleMoveToDraft(selectedOrder.dbId)} disabled={saving} className="flex items-center gap-1.5 px-3 py-2 bg-red-500/5 hover:bg-red-500/10 rounded-lg text-xs font-medium text-red-700 border border-red-500/20 transition-all disabled:opacity-50">
                  <Trash2 className="w-3.5 h-3.5" /> Move to Draft
                </button>
              </div>

              {/* Customer & Staff */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-surface rounded-xl p-3">
                  <p className="text-xs text-muted mb-1">Customer</p>
                  <p className="text-sm font-medium text-foreground">{selectedOrder.customer}</p>
                  <p className="text-xs text-muted flex items-center gap-1 mt-1"><Phone className="w-3 h-3" /> {selectedOrder.phone}</p>
                  <p className="text-xs text-muted flex items-center gap-1 mt-1"><MapPin className="w-3 h-3" /> {selectedOrder.address}</p>
                </div>
                <div className="bg-surface rounded-xl p-3">
                  <p className="text-xs text-muted mb-1">Assigned To</p>
                  <p className="text-sm font-medium text-foreground">{selectedOrder.assignedStaff || 'Not assigned'}</p>
                  <p className="text-xs text-muted mt-1">Order date: {selectedOrder.date}</p>
                  <p className="text-xs text-muted mt-1">Est. delivery: {selectedOrder.estimatedDelivery || '—'}</p>
                </div>
              </div>

              {/* Measurements */}
              <div className="bg-surface rounded-xl p-4">
                <h4 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                  <Ruler className="w-4 h-4 text-accent" /> Measurements
                </h4>
                {Object.values(meas).some(v => v) ? (
                  <>
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                      {[['Length', meas.length], ['Width', meas.width], ['Height', meas.height], ['Depth', meas.depth], ['Countertop', meas.countertop]].map(([label, val]) => (
                        <div key={label}>
                          <p className="text-[10px] text-muted">{label}</p>
                          <p className="text-sm font-medium text-foreground">{val || '—'}</p>
                        </div>
                      ))}
                    </div>
                    {meas.notes && <p className="text-xs text-muted mt-3 pt-2 border-t border-border">{meas.notes}</p>}
                  </>
                ) : (
                  <p className="text-xs text-muted">No measurements recorded yet</p>
                )}
              </div>

              {/* Materials & Reference */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-surface rounded-xl p-3">
                  <p className="text-xs text-muted mb-1">Materials</p>
                  <p className="text-sm font-medium text-foreground">{selectedOrder.materials || '—'}</p>
                </div>
                <div className="bg-surface rounded-xl p-3">
                  <p className="text-xs text-muted mb-1">Color / Finish</p>
                  <p className="text-sm font-medium text-foreground">{selectedOrder.color || '—'}</p>
                </div>
              </div>

              {/* Reference Product */}
              {selectedOrder.referenceProduct && (
                <div className="bg-surface rounded-xl p-3">
                  <p className="text-xs text-muted mb-2 flex items-center gap-1"><ShoppingBag className="w-3 h-3" /> Reference Product</p>
                  <div className="flex items-center gap-3">
                    {selectedOrder.referenceProduct.image && (
                      <img src={selectedOrder.referenceProduct.image} alt="" className="w-14 h-14 rounded-lg object-cover border border-border" />
                    )}
                    <div>
                      <p className="text-sm font-medium text-foreground">{selectedOrder.referenceProduct.name}</p>
                      <p className="text-xs text-muted">SKU: {selectedOrder.referenceProduct.sku} · ₹{selectedOrder.referenceProduct.price?.toLocaleString()}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Reference Images */}
              {selectedOrder.referenceImages?.length > 0 && (
                <div className="bg-surface rounded-xl p-3">
                  <p className="text-xs text-muted mb-2 flex items-center gap-1"><Image className="w-3 h-3" /> Reference Images ({selectedOrder.referenceImages.length})</p>
                  <div className="flex gap-2 flex-wrap">
                    {selectedOrder.referenceImages.map((url, idx) => (
                      <img key={idx} src={url} alt="" className="w-20 h-20 rounded-lg object-cover border border-border" />
                    ))}
                  </div>
                </div>
              )}

              {/* Production Notes */}
              {selectedOrder.productionNotes && (
                <div className="bg-surface rounded-xl p-3">
                  <p className="text-xs text-muted mb-1">Production Notes</p>
                  <p className="text-sm text-foreground">{selectedOrder.productionNotes}</p>
                </div>
              )}

              {/* Field Visits */}
              {selectedOrder.fieldVisits?.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                    <MapPinned className="w-4 h-4 text-blue-700" /> Field Visits ({selectedOrder.fieldVisits.length})
                  </h4>
                  <div className="space-y-2">
                    {selectedOrder.fieldVisits.map(visit => (
                      <div key={visit.id} className="bg-surface rounded-xl p-3">
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs text-accent">{visit.displayId}</span>
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
                              visit.status === 'Completed' ? 'bg-emerald-500/10 text-emerald-700' :
                              visit.status === 'Cancelled' ? 'bg-red-500/10 text-red-700' :
                              visit.status === 'In Progress' ? 'bg-amber-500/10 text-amber-700' :
                              'bg-blue-500/10 text-blue-700'
                            }`}>{visit.status}</span>
                          </div>
                          <span className="text-xs text-muted">{visit.staffName} ({visit.staffRole})</span>
                        </div>
                        <p className="text-xs text-muted">
                          {visit.scheduledDate ? `Scheduled: ${visit.scheduledDate}` : visit.date} {visit.scheduledTime && `at ${visit.scheduledTime}`}
                          {visit.completedAt && ` · Completed: ${visit.completedAt}`}
                        </p>
                        {visit.staffNotes && <p className="text-xs text-foreground mt-1 bg-surface-hover rounded-lg p-2">Staff notes: {visit.staffNotes}</p>}
                        {visit.measurements && (
                          <div className="mt-2 grid grid-cols-4 gap-2">
                            {Object.entries(visit.measurements).filter(([, v]) => v).map(([k, v]) => (
                              <div key={k}><p className="text-[10px] text-muted capitalize">{k}</p><p className="text-xs font-medium text-foreground">{v}</p></div>
                            ))}
                          </div>
                        )}
                        {visit.photoUrls?.length > 0 && (
                          <div className="flex gap-1.5 mt-2">
                            {visit.photoUrls.map((url, i) => (
                              <img key={i} src={url} alt="" className="w-12 h-12 rounded-lg object-cover border border-border" />
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Timeline */}
              <div>
                <h4 className="text-sm font-semibold text-foreground mb-3">Order Timeline</h4>
                <div className="space-y-0">
                  {selectedOrder.timeline.map((step, idx) => (
                    <div key={step.id || idx} className="flex items-start gap-3">
                      <div className="flex flex-col items-center">
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${step.status === 'done' ? 'bg-emerald-500/20' : 'bg-surface border border-border'}`}>
                          {step.status === 'done' ? (
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
                          ) : (
                            <div className="w-2 h-2 rounded-full bg-muted" />
                          )}
                        </div>
                        {idx < selectedOrder.timeline.length - 1 && (
                          <div className={`w-0.5 h-8 ${step.status === 'done' ? 'bg-emerald-500/30' : 'bg-border'}`} />
                        )}
                      </div>
                      <div className="pb-4">
                        <p className={`text-sm font-medium ${step.status === 'done' ? 'text-foreground' : 'text-muted'}`}>{step.event}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <p className="text-xs text-muted">{step.date}</p>
                          {step.updatedBy && <span className="text-[10px] text-muted bg-surface-hover rounded px-1.5 py-0.5">{step.updatedBy}</span>}
                        </div>
                        {step.notes && <p className="text-xs text-muted mt-0.5">{step.notes}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );
        })()}
      </Modal>

      {/* ═══════════════════════════════════════════════════
          NEW CUSTOM ORDER MODAL
          ═══════════════════════════════════════════════════ */}
      <Modal isOpen={showNewOrderModal} onClose={() => setShowNewOrderModal(false)} title="New Custom Order" size="lg">
        <NewOrderForm
          staff={activeStaff}
          products={products}
          saving={saving}
          onSubmit={handleCreateOrder}
          onCancel={() => setShowNewOrderModal(false)}
        />
      </Modal>

      {/* ═══════════════════════════════════════════════════
          SCHEDULE VISIT MODAL
          ═══════════════════════════════════════════════════ */}
      <Modal isOpen={showScheduleVisit} onClose={() => setShowScheduleVisit(false)} title="Schedule Field Visit" size="md">
        <form onSubmit={handleScheduleVisit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-muted mb-1.5">Assign to Staff *</label>
            <select name="staffId" required className="w-full px-4 py-2.5 rounded-xl text-sm">
              <option value="">Select staff member</option>
              {activeStaff.map(s => (
                <option key={s.id} value={s.id}>{s.name} — {s.role}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-muted mb-1.5">Visit Date *</label>
              <input type="date" name="date" required className="w-full px-4 py-2.5 rounded-xl text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted mb-1.5">Time Slot *</label>
              <select name="time" required className="w-full px-4 py-2.5 rounded-xl text-sm">
                <option value="">Select time</option>
                <option>09:00 AM - 11:00 AM</option>
                <option>11:00 AM - 01:00 PM</option>
                <option>02:00 PM - 04:00 PM</option>
                <option>04:00 PM - 06:00 PM</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-muted mb-1.5">Notes</label>
            <textarea name="notes" rows={2} placeholder="Any special instructions..." className="w-full px-4 py-2.5 rounded-xl text-sm resize-none" />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setShowScheduleVisit(false)} className="px-4 py-2.5 rounded-xl text-sm text-muted hover:text-foreground hover:bg-surface-hover transition-colors">Cancel</button>
            <button type="submit" disabled={saving} className="px-6 py-2.5 bg-accent hover:bg-accent-hover text-white rounded-xl text-sm font-semibold transition-all disabled:opacity-50">
              {saving ? 'Scheduling...' : 'Schedule Visit'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ═══════════════════════════════════════════════════
          ASSIGN STAFF MODAL
          ═══════════════════════════════════════════════════ */}

      {/* ═══════════════════════════════════════════════════
          UPDATE MEASUREMENTS MODAL
          ═══════════════════════════════════════════════════ */}
      <Modal isOpen={showMeasurements} onClose={() => setShowMeasurements(false)} title="Update Measurements" size="md">
        {(() => {
          const order = customOrders.find(o => o.dbId === measurementOrderId);
          const meas = order?.measurements || {};
          return (
            <form onSubmit={handleMeasurementsUpdate} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-muted mb-1">Length</label>
                  <input type="text" name="length" defaultValue={meas.length || ''} placeholder="e.g., 12 ft" className="w-full px-3 py-2.5 rounded-xl text-sm" />
                </div>
                <div>
                  <label className="block text-xs text-muted mb-1">Width</label>
                  <input type="text" name="width" defaultValue={meas.width || ''} placeholder="e.g., 8 ft" className="w-full px-3 py-2.5 rounded-xl text-sm" />
                </div>
                <div>
                  <label className="block text-xs text-muted mb-1">Height</label>
                  <input type="text" name="height" defaultValue={meas.height || ''} placeholder="e.g., 9 ft" className="w-full px-3 py-2.5 rounded-xl text-sm" />
                </div>
                <div>
                  <label className="block text-xs text-muted mb-1">Depth</label>
                  <input type="text" name="depth" defaultValue={meas.depth || ''} placeholder="e.g., 2 ft" className="w-full px-3 py-2.5 rounded-xl text-sm" />
                </div>
              </div>
              <div>
                <label className="block text-xs text-muted mb-1">Countertop</label>
                <input type="text" name="countertop" defaultValue={meas.countertop || ''} placeholder="e.g., Granite 4x2 ft" className="w-full px-3 py-2.5 rounded-xl text-sm" />
              </div>
              <div>
                <label className="block text-xs text-muted mb-1">Measurement Notes</label>
                <textarea name="notes" rows={2} defaultValue={meas.notes || ''} placeholder="Additional details..." className="w-full px-3 py-2.5 rounded-xl text-sm resize-none" />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowMeasurements(false)} className="px-4 py-2.5 rounded-xl text-sm text-muted hover:text-foreground hover:bg-surface-hover transition-colors">Cancel</button>
                <button type="submit" disabled={saving} className="px-6 py-2.5 bg-accent hover:bg-accent-hover text-white rounded-xl text-sm font-semibold transition-all disabled:opacity-50">
                  {saving ? 'Saving...' : 'Save Measurements'}
                </button>
              </div>
            </form>
          );
        })()}
      </Modal>

      {/* ═══════════════════════════════════════════════════
          NOTIFY CUSTOMER MODAL
          ═══════════════════════════════════════════════════ */}
      <Modal isOpen={showNotify} onClose={() => { setShowNotify(false); setNotifyResult(null); }} title="Notify Customer" size="md">
        {(() => {
          const order = customOrders.find(o => o.dbId === notifyOrderId);
          if (!order) return null;
          const selectedCount = Object.values(notifyChannels).filter(Boolean).length;
          return (
            <div className="space-y-5">
              {/* Order context */}
              <div className="flex items-center gap-3 bg-surface rounded-xl p-3">
                <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center flex-shrink-0">
                  <Bell className="w-4 h-4 text-accent" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">{order.customer}</p>
                  <p className="text-xs text-muted">{order.id} · {order.status}</p>
                </div>
                <div className="ml-auto text-right flex-shrink-0">
                  <p className="text-xs text-muted flex items-center gap-1"><Phone className="w-3 h-3" /> {order.phone}</p>
                </div>
              </div>

              {/* Channel selection */}
              <div>
                <p className="text-xs font-medium text-muted mb-2 uppercase tracking-wide">Send via</p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setNotifyChannels(p => ({ ...p, whatsapp: !p.whatsapp }))}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium border transition-all flex-1 justify-center ${notifyChannels.whatsapp ? 'bg-emerald-500/10 text-emerald-700 border-emerald-500/30' : 'bg-surface text-muted border-border hover:border-foreground/20'}`}
                  >
                    <MessageSquare className="w-4 h-4" />
                    WhatsApp
                    {notifyChannels.whatsapp && <CheckCheck className="w-3.5 h-3.5" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => setNotifyChannels(p => ({ ...p, email: !p.email }))}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium border transition-all flex-1 justify-center ${notifyChannels.email ? 'bg-blue-500/10 text-blue-700 border-blue-500/30' : 'bg-surface text-muted border-border hover:border-foreground/20'}`}
                  >
                    <Mail className="w-4 h-4" />
                    Email
                    {notifyChannels.email && <CheckCheck className="w-3.5 h-3.5" />}
                  </button>
                </div>

                {/* WhatsApp config status */}
                {notifyChannels.whatsapp && (
                  <div className="mt-2">
                    {waConfig === null ? (
                      <p className="text-xs text-muted">Checking WhatsApp config…</p>
                    ) : !waConfig.configured ? (
                      <div className="flex items-start gap-1.5 text-xs text-amber-700 bg-amber-500/10 rounded-lg px-3 py-2 mt-1">
                        <span className="mt-0.5">⚠️</span>
                        <span>WhatsApp not configured. Go to <strong>Settings → Channels → WhatsApp</strong> and add your Phone Number ID and API Token.</span>
                      </div>
                    ) : waConfig.hasTemplate ? (
                      <div className="flex items-center gap-1.5 text-xs text-emerald-700 bg-emerald-500/10 rounded-lg px-3 py-2 mt-1">
                        <CheckCheck className="w-3.5 h-3.5 flex-shrink-0" />
                        <span>Using approved template: <strong>{waConfig.templateName}</strong></span>
                      </div>
                    ) : (
                      <div className="flex items-start gap-1.5 text-xs text-amber-700 bg-amber-500/10 rounded-lg px-3 py-2 mt-1">
                        <span className="mt-0.5">⚠️</span>
                        <span>No template set. Message will send as free text — only works if the customer messaged you in the last 24h. Add an approved template in <strong>Settings → Channels → WhatsApp</strong> for reliable outbound delivery.</span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Template variable preview — shown when template is configured */}
              {notifyChannels.whatsapp && waConfig?.hasTemplate && (
                <div className="bg-surface rounded-xl p-3 space-y-1.5">
                  <p className="text-xs font-medium text-muted uppercase tracking-wide mb-2">Template variables being sent</p>
                  {[
                    { var: '{{1}}', label: 'Customer Name', value: order.contact?.name || order.customer },
                    { var: '{{2}}', label: 'Order ID', value: order.id },
                    { var: '{{3}}', label: 'Status', value: order.status },
                    { var: '{{4}}', label: 'Custom Message', value: notifyMessage.length > 60 ? notifyMessage.slice(0, 60) + '…' : notifyMessage },
                  ].map(row => (
                    <div key={row.var} className="flex items-center gap-3 text-xs">
                      <span className="font-mono text-accent w-8 flex-shrink-0">{row.var}</span>
                      <span className="text-muted w-24 flex-shrink-0">{row.label}</span>
                      <span className="text-foreground truncate">{row.value}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Quick template buttons */}
              <div>
                <p className="text-xs font-medium text-muted mb-2 uppercase tracking-wide">Quick Templates</p>
                <div className="flex flex-wrap gap-1.5">
                  {Object.keys(notificationTemplates).map(status => (
                    <button
                      key={status}
                      type="button"
                      onClick={() => setNotifyMessage(notificationTemplates[status](order))}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all border ${order.status === status ? 'bg-accent text-white border-accent' : 'bg-surface text-muted border-border hover:text-foreground hover:border-foreground/20'}`}
                    >
                      {status}
                    </button>
                  ))}
                </div>
              </div>

              {/* Message editor */}
              <div>
                <label className="block text-xs font-medium text-muted mb-1.5 uppercase tracking-wide">Message</label>
                <textarea
                  rows={5}
                  value={notifyMessage}
                  onChange={e => setNotifyMessage(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl text-sm resize-none border border-border bg-surface focus:outline-none focus:border-accent transition-colors"
                  placeholder="Type your message to the customer..."
                />
                <p className="text-[10px] text-muted mt-1 text-right">{notifyMessage.length} characters</p>
              </div>

              {/* Result feedback */}
              {notifyResult && (
                <div className={`rounded-xl px-4 py-3 text-sm ${notifyResult.success ? 'bg-emerald-500/10 text-emerald-700 border border-emerald-500/20' : 'bg-red-500/10 text-red-700 border border-red-500/20'}`}>
                  {notifyResult.success ? (
                    <p className="font-medium flex items-center gap-2"><CheckCheck className="w-4 h-4" /> Notification sent successfully!</p>
                  ) : (
                    <p className="font-medium">Failed: {notifyResult.error}</p>
                  )}
                  {notifyResult.errors?.length > 0 && (
                    <ul className="mt-1 text-xs list-disc list-inside opacity-80">
                      {notifyResult.errors.map((e, i) => <li key={i}>{e}</li>)}
                    </ul>
                  )}
                </div>
              )}

              {/* Actions */}
              <div className="flex justify-end gap-3 pt-1">
                <button type="button" onClick={() => { setShowNotify(false); setNotifyResult(null); }} className="px-4 py-2.5 rounded-xl text-sm text-muted hover:text-foreground hover:bg-surface-hover transition-colors">
                  {notifyResult?.success ? 'Close' : 'Cancel'}
                </button>
                {!notifyResult?.success && (
                  <button
                    type="button"
                    onClick={handleSendNotification}
                    disabled={notifySending || selectedCount === 0 || !notifyMessage.trim()}
                    className="flex items-center gap-2 px-6 py-2.5 bg-accent hover:bg-accent-hover text-white rounded-xl text-sm font-semibold transition-all disabled:opacity-50"
                  >
                    <Send className="w-4 h-4" />
                    {notifySending ? 'Sending...' : `Send${selectedCount > 0 ? ` via ${Object.entries(notifyChannels).filter(([,v])=>v).map(([k])=>k.charAt(0).toUpperCase()+k.slice(1)).join(' & ')}` : ''}`}
                  </button>
                )}
              </div>
            </div>
          );
        })()}
      </Modal>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// NEW ORDER FORM COMPONENT
// ═══════════════════════════════════════════════════════

function NewOrderForm({ staff, products, saving, onSubmit, onCancel }) {
  const [scheduleVisitChecked, setScheduleVisitChecked] = useState(false);
  const [productSearch, setProductSearch] = useState('');
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [showProductDropdown, setShowProductDropdown] = useState(false);
  const [refImages, setRefImages] = useState([]); // [{ file, preview }]
  const [uploadingImages, setUploadingImages] = useState(false);
  const refFileInputRef = useRef(null);
  // Customer lookup
  const [newOrderCustomer, setNewOrderCustomer] = useState({ name: '', phone: '' });
  const [newOrderSuggestions, setNewOrderSuggestions] = useState([]);
  const [showNewOrderDropdown, setShowNewOrderDropdown] = useState(false);
  const [newOrderProfile, setNewOrderProfile] = useState(null);
  const [newOrderProfileLoading, setNewOrderProfileLoading] = useState(false);

  const handleRefImageAdd = (e) => {
    const files = Array.from(e.target.files || []);
    const newImages = files.map(file => ({ file, preview: URL.createObjectURL(file) }));
    setRefImages(prev => [...prev, ...newImages].slice(0, 6)); // max 6
    e.target.value = '';
  };

  const removeRefImage = (idx) => {
    setRefImages(prev => {
      URL.revokeObjectURL(prev[idx].preview);
      return prev.filter((_, i) => i !== idx);
    });
  };

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    if (refImages.length > 0) {
      setUploadingImages(true);
      try {
        const fd = new FormData();
        refImages.forEach(img => fd.append('files', img.file));
        fd.append('folder', 'custom-orders');
        const res = await fetch('/api/upload', { method: 'POST', body: fd });
        const data = await res.json();
        if (data.success && data.urls) {
          // inject uploaded URLs into form before submission
          const hiddenInput = e.target.querySelector('input[name="referenceImagesJson"]');
          if (hiddenInput) hiddenInput.value = JSON.stringify(data.urls);
        }
      } catch (err) {
        console.error('Image upload failed:', err);
        alert('Failed to upload reference images. Order will be created without images.');
      }
      setUploadingImages(false);
    }
    onSubmit(e);
  };

  const filteredProducts = useMemo(() => {
    if (!productSearch) return products.slice(0, 10);
    return products.filter(p =>
      p.name.toLowerCase().includes(productSearch.toLowerCase()) ||
      p.sku.toLowerCase().includes(productSearch.toLowerCase())
    ).slice(0, 10);
  }, [productSearch, products]);

  const handleNewOrderCustomerSearch = async (value, field) => {
    setNewOrderCustomer(prev => ({ ...prev, [field]: value }));
    setNewOrderProfile(null);
    setNewOrderProfileLoading(false);
    if (value.length >= 2) {
      const res = await searchContacts(value);
      if (res.success && res.data.length > 0) {
        setNewOrderSuggestions(res.data);
        setShowNewOrderDropdown(true);
      } else {
        setNewOrderSuggestions([]);
        setShowNewOrderDropdown(false);
        if (field === 'phone' && value.replace(/\D/g, '').length === 10) {
          setNewOrderProfileLoading(true);
          const profileRes = await getCustomerProfile(value);
          setNewOrderProfileLoading(false);
          if (profileRes.success && profileRes.data) setNewOrderProfile(profileRes.data);
        }
      }
    } else {
      setShowNewOrderDropdown(false);
    }
  };

  const selectNewOrderCustomer = async (contact) => {
    setNewOrderCustomer({ name: contact.name, phone: contact.phone });
    setShowNewOrderDropdown(false);
    setNewOrderSuggestions([]);
    setNewOrderProfileLoading(true);
    const profileRes = await getCustomerProfile(contact.phone, contact.id);
    setNewOrderProfileLoading(false);
    if (profileRes.success) setNewOrderProfile(profileRes.data);
  };

  return (
    <form onSubmit={handleFormSubmit} className="space-y-4">
      <input type="hidden" name="referenceImagesJson" defaultValue="" />
      {/* Customer Info */}
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-muted mb-1.5">Customer Name *</label>
            <input type="text" name="customer" required placeholder="Full name"
              value={newOrderCustomer.name}
              onChange={e => handleNewOrderCustomerSearch(e.target.value, 'name')}
              className="w-full px-4 py-2.5 rounded-xl text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted mb-1.5">Phone *</label>
            <input type="text" name="phone" required placeholder="+91 XXXXX XXXXX"
              value={newOrderCustomer.phone}
              onChange={e => handleNewOrderCustomerSearch(e.target.value, 'phone')}
              className="w-full px-4 py-2.5 rounded-xl text-sm" />
          </div>
        </div>
        {showNewOrderDropdown && newOrderSuggestions.length > 0 && (
          <div className="bg-surface border border-border rounded-xl shadow-lg max-h-[150px] overflow-y-auto">
            {newOrderSuggestions.map(c => (
              <button key={c.id} type="button" onClick={() => selectNewOrderCustomer(c)}
                className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-surface-hover transition-colors text-left border-b border-border/50 last:border-0">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{c.name}</p>
                  <p className="text-xs text-muted">{c.phone}</p>
                </div>
              </button>
            ))}
          </div>
        )}
        <ReturningCustomerCard profile={newOrderProfile} loading={newOrderProfileLoading} />
      </div>
      <div>
        <label className="block text-xs font-medium text-muted mb-1.5">Full Address *</label>
        <textarea name="address" required rows={2} placeholder="House/Flat No., Street, Area, City, PIN" className="w-full px-4 py-2.5 rounded-xl text-sm resize-none" />
      </div>

      {/* Furniture Type */}
      <div>
        <label className="block text-xs font-medium text-muted mb-1.5">Furniture Type *</label>
        <select name="type" required className="w-full px-4 py-2.5 rounded-xl text-sm">
          <option value="">Select type</option>
          <option>Modular Kitchen</option>
          <option>Custom Wardrobe</option>
          <option>Custom Dining Table</option>
          <option>Custom Sofa</option>
          <option>Custom Bed</option>
          <option>TV Unit / Wall Panel</option>
          <option>Bookshelf / Storage</option>
          <option>Office Furniture</option>
          <option>Other</option>
        </select>
      </div>

      {/* Reference Product */}
      <div>
        <label className="block text-xs font-medium text-muted mb-1.5">Reference Product (optional)</label>
        <div className="relative">
          {selectedProduct ? (
            <div className="flex items-center gap-3 px-4 py-2.5 bg-surface border border-border rounded-xl">
              <div className="flex-1">
                <p className="text-sm font-medium text-foreground">{selectedProduct.name}</p>
                <p className="text-xs text-muted">SKU: {selectedProduct.sku} · ₹{selectedProduct.price.toLocaleString()}</p>
              </div>
              <button type="button" onClick={() => { setSelectedProduct(null); setProductSearch(''); }} className="text-muted hover:text-foreground">
                <X className="w-4 h-4" />
              </button>
              <input type="hidden" name="referenceProductId" value={selectedProduct.id} />
            </div>
          ) : (
            <>
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
              <input
                type="text"
                placeholder="Search existing products..."
                value={productSearch}
                onChange={e => { setProductSearch(e.target.value); setShowProductDropdown(true); }}
                onFocus={() => setShowProductDropdown(true)}
                onBlur={() => setTimeout(() => setShowProductDropdown(false), 200)}
                className="w-full pl-10 pr-4 py-2.5 rounded-xl text-sm"
              />
              {showProductDropdown && filteredProducts.length > 0 && (
                <div className="absolute z-10 w-full mt-1 bg-surface border border-border rounded-xl shadow-lg max-h-48 overflow-y-auto">
                  {filteredProducts.map(p => (
                    <button key={p.id} type="button" onClick={() => { setSelectedProduct(p); setShowProductDropdown(false); setProductSearch(''); }}
                      className="w-full text-left px-4 py-2.5 hover:bg-surface-hover text-sm transition-colors border-b border-border last:border-0">
                      <span className="font-medium text-foreground">{p.name}</span>
                      <span className="text-xs text-muted ml-2">SKU: {p.sku} · ₹{p.price.toLocaleString()}</span>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Reference Images */}
      <div>
        <label className="block text-xs font-medium text-muted mb-1.5">Reference Images (optional, max 6)</label>
        <div className="flex flex-wrap gap-2">
          {refImages.map((img, idx) => (
            <div key={idx} className="relative w-16 h-16 rounded-lg overflow-hidden border border-border group">
              <img src={img.preview} alt="" className="w-full h-full object-cover" />
              <button type="button" onClick={() => removeRefImage(idx)}
                className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                <X className="w-4 h-4 text-white" />
              </button>
            </div>
          ))}
          {refImages.length < 6 && (
            <button type="button" onClick={() => refFileInputRef.current?.click()}
              className="w-16 h-16 rounded-lg border-2 border-dashed border-border hover:border-accent/50 flex flex-col items-center justify-center gap-1 text-muted hover:text-accent transition-colors">
              <Image className="w-5 h-5" />
              <span className="text-[9px]">Add</span>
            </button>
          )}
        </div>
        <input ref={refFileInputRef} type="file" accept="image/*" multiple onChange={handleRefImageAdd} className="hidden" />
      </div>

      {/* Measurements */}
      <div className="border-t border-border pt-4">
        <h4 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
          <Ruler className="w-4 h-4 text-accent" /> Measurements (if available)
        </h4>
        <div className="grid grid-cols-4 gap-3">
          <div><label className="block text-xs text-muted mb-1">Length</label><input type="text" name="length" placeholder="e.g., 12 ft" className="w-full px-3 py-2 rounded-xl text-sm" /></div>
          <div><label className="block text-xs text-muted mb-1">Width</label><input type="text" name="width" placeholder="e.g., 8 ft" className="w-full px-3 py-2 rounded-xl text-sm" /></div>
          <div><label className="block text-xs text-muted mb-1">Height</label><input type="text" name="height" placeholder="e.g., 9 ft" className="w-full px-3 py-2 rounded-xl text-sm" /></div>
          <div><label className="block text-xs text-muted mb-1">Depth</label><input type="text" name="depth" placeholder="e.g., 2 ft" className="w-full px-3 py-2 rounded-xl text-sm" /></div>
        </div>
        <div className="mt-3">
          <label className="block text-xs text-muted mb-1">Countertop / Notes</label>
          <input type="text" name="countertop" placeholder="e.g., Granite 4x2 ft" className="w-full px-3 py-2 rounded-xl text-sm" />
        </div>
      </div>

      {/* Materials, Color, Price */}
      <div className="grid grid-cols-2 gap-4">
        <div><label className="block text-xs font-medium text-muted mb-1.5">Materials</label><input type="text" name="materials" placeholder="e.g., Marine Plywood, Marble" className="w-full px-4 py-2.5 rounded-xl text-sm" /></div>
        <div><label className="block text-xs font-medium text-muted mb-1.5">Color / Finish</label><input type="text" name="color" placeholder="e.g., White Glossy" className="w-full px-4 py-2.5 rounded-xl text-sm" /></div>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div><label className="block text-xs font-medium text-muted mb-1.5">Quoted Price (₹)</label><input type="number" name="quotedPrice" placeholder="0" className="w-full px-4 py-2.5 rounded-xl text-sm" /></div>
        <div><label className="block text-xs font-medium text-muted mb-1.5">Advance Paid (₹)</label><input type="number" name="advancePaid" placeholder="0" className="w-full px-4 py-2.5 rounded-xl text-sm" /></div>
        <div><label className="block text-xs font-medium text-muted mb-1.5">Est. Delivery</label><input type="date" name="estimatedDelivery" className="w-full px-4 py-2.5 rounded-xl text-sm" /></div>
      </div>

      {/* Production Notes */}
      <div>
        <label className="block text-xs font-medium text-muted mb-1.5">Special Requirements / Notes</label>
        <textarea name="productionNotes" rows={2} placeholder="Any specific requirements, preferences, constraints..." className="w-full px-4 py-2.5 rounded-xl text-sm resize-none" />
      </div>

      {/* Schedule Visit Toggle */}
      <div className="border-t border-border pt-4">
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" name="scheduleVisit" checked={scheduleVisitChecked} onChange={e => setScheduleVisitChecked(e.target.checked)} className="w-4 h-4 rounded border-border text-accent focus:ring-accent" />
          <span className="text-sm font-medium text-foreground">Schedule a field visit</span>
        </label>
        {scheduleVisitChecked && (
          <div className="mt-3 grid grid-cols-3 gap-3 p-3 bg-surface rounded-xl">
            <div>
              <label className="block text-xs text-muted mb-1">Visit Date *</label>
              <input type="date" name="visitDate" required={scheduleVisitChecked} className="w-full px-3 py-2 rounded-xl text-sm" />
            </div>
            <div>
              <label className="block text-xs text-muted mb-1">Time Slot *</label>
              <select name="visitTime" required={scheduleVisitChecked} className="w-full px-3 py-2 rounded-xl text-sm">
                <option value="">Select</option>
                <option>09:00 AM - 11:00 AM</option>
                <option>11:00 AM - 01:00 PM</option>
                <option>02:00 PM - 04:00 PM</option>
                <option>04:00 PM - 06:00 PM</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-muted mb-1">Visit Staff</label>
              <select name="visitStaffId" className="w-full px-3 py-2 rounded-xl text-sm">
                <option value="">Same as assigned</option>
                {staff.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          </div>
        )}
      </div>

      <div className="flex justify-end gap-3 pt-2">
        <button type="button" onClick={onCancel} className="px-4 py-2.5 rounded-xl text-sm text-muted hover:text-foreground hover:bg-surface-hover transition-colors">Cancel</button>
        <button type="submit" disabled={saving || uploadingImages} className="px-6 py-2.5 bg-accent hover:bg-accent-hover text-white rounded-xl text-sm font-semibold transition-all disabled:opacity-50">
          {uploadingImages ? 'Uploading...' : saving ? 'Creating...' : 'Create Order'}
        </button>
      </div>
    </form>
  );
}
