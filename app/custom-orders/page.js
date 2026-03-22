'use client';

import { useState, useMemo } from 'react';
import {
  Search, Plus, Ruler, MapPin, Camera, FileText,
  Clock, CheckCircle2, AlertCircle, ArrowRight, Package,
  Phone, User, Calendar, DollarSign, Truck,
  ChevronRight, ChevronDown, Hammer, Eye,
} from 'lucide-react';
import Modal from '@/components/Modal';
import { customOrders, customOrderStatuses } from '@/data/customOrders';
import { staff } from '@/data/staff';

const statusConfig = {
  'Measurement Scheduled': { cls: 'bg-blue-500/10 text-blue-700 border-blue-500/20', icon: Ruler },
  'Design Phase': { cls: 'bg-purple-500/10 text-purple-700 border-purple-500/20', icon: FileText },
  'In Production': { cls: 'bg-amber-500/10 text-amber-700 border-amber-500/20', icon: Hammer },
  'Quality Check': { cls: 'bg-teal-500/10 text-teal-700 border-teal-500/20', icon: Eye },
  'Installation': { cls: 'bg-orange-500/10 text-orange-700 border-orange-500/20', icon: Package },
  'Delivered': { cls: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20', icon: CheckCircle2 },
};

export default function CustomOrdersPage() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [showNewOrderModal, setShowNewOrderModal] = useState(false);

  const filtered = useMemo(() => customOrders.filter(o => {
    const matchesSearch = o.customer.toLowerCase().includes(search.toLowerCase()) || o.id.toLowerCase().includes(search.toLowerCase()) || o.type.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === 'All' || o.status === statusFilter;
    return matchesSearch && matchesStatus;
  }), [search, statusFilter]);

  const activeOrders = customOrders.filter(o => o.status !== 'Delivered').length;
  const totalValue = customOrders.reduce((s, o) => s + o.quotedPrice, 0);
  const pendingPayment = customOrders.reduce((s, o) => s + (o.quotedPrice - o.advancePaid), 0);
  const measurementsPending = customOrders.filter(o => o.status === 'Measurement Scheduled').length;

  const designers = staff.filter(s => s.role === 'Design Consultant' || s.role.includes('Sales'));

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
          <div><p className="text-xs text-muted">Total Value</p><p className="text-lg font-bold text-success">₹{(totalValue / 100000).toFixed(1)}L</p></div>
        </div>
        <div className="glass-card p-4 flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-warning-light"><Clock className="w-5 h-5 text-warning" /></div>
          <div><p className="text-xs text-muted">Pending Payment</p><p className="text-lg font-bold text-warning">₹{(pendingPayment / 100000).toFixed(1)}L</p></div>
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
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {filtered.map(order => {
          const sc = statusConfig[order.status] || statusConfig['Design Phase'];
          const StatusIcon = sc.icon;
          const progress = order.timeline.filter(t => t.status === 'done').length;
          const total = order.timeline.length;
          const progressPercent = Math.round((progress / total) * 100);

          return (
            <div key={order.id} className="glass-card p-5 cursor-pointer hover:border-accent/30 transition-all" onClick={() => setSelectedOrder(order)}>
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-mono text-sm text-accent font-medium">{order.id}</span>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium border flex items-center gap-1 ${sc.cls}`}>
                      <StatusIcon className="w-3 h-3" /> {order.status}
                    </span>
                  </div>
                  <h3 className="font-semibold text-foreground">{order.type}</h3>
                  <p className="text-xs text-muted">{order.customer} · {order.phone}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-accent">₹{order.quotedPrice.toLocaleString()}</p>
                  <p className="text-xs text-muted">Advance: ₹{order.advancePaid.toLocaleString()}</p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3 mb-3">
                <div className="bg-surface rounded-lg p-2">
                  <p className="text-[10px] text-muted">Materials</p>
                  <p className="text-xs text-foreground truncate">{order.materials}</p>
                </div>
                <div className="bg-surface rounded-lg p-2">
                  <p className="text-[10px] text-muted">Color</p>
                  <p className="text-xs text-foreground truncate">{order.color}</p>
                </div>
                <div className="bg-surface rounded-lg p-2">
                  <p className="text-[10px] text-muted">Delivery</p>
                  <p className="text-xs text-foreground">{order.estimatedDelivery}</p>
                </div>
              </div>

              {/* Progress */}
              <div className="flex items-center gap-3">
                <div className="flex-1 h-1.5 bg-surface rounded-full overflow-hidden">
                  <div className="h-full bg-accent/50 rounded-full transition-all" style={{ width: `${progressPercent}%` }} />
                </div>
                <span className="text-xs text-muted">{progress}/{total} steps</span>
              </div>

              <p className="text-xs text-muted mt-2 flex items-center gap-1">
                <User className="w-3 h-3" /> {order.assignedStaff}
              </p>
            </div>
          );
        })}
      </div>

      {/* Order Detail Modal */}
      <Modal isOpen={!!selectedOrder} onClose={() => setSelectedOrder(null)} title="Custom Order Details" size="xl">
        {selectedOrder && (() => {
          const sc = statusConfig[selectedOrder.status] || statusConfig['Design Phase'];
          const StatusIcon = sc.icon;
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
                  <p className="text-xl font-bold text-accent">₹{selectedOrder.quotedPrice.toLocaleString()}</p>
                  <p className="text-xs text-muted">Advance: ₹{selectedOrder.advancePaid.toLocaleString()}</p>
                  {selectedOrder.quotedPrice - selectedOrder.advancePaid > 0 && (
                    <p className="text-xs text-warning">Balance: ₹{(selectedOrder.quotedPrice - selectedOrder.advancePaid).toLocaleString()}</p>
                  )}
                </div>
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
                  <p className="text-sm font-medium text-foreground">{selectedOrder.assignedStaff}</p>
                  <p className="text-xs text-muted mt-1">Order date: {selectedOrder.date}</p>
                  <p className="text-xs text-muted mt-1">Est. delivery: {selectedOrder.estimatedDelivery}</p>
                </div>
              </div>

              {/* Measurements */}
              <div className="bg-surface rounded-xl p-4">
                <h4 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                  <Ruler className="w-4 h-4 text-accent" /> Measurements
                </h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div>
                    <p className="text-[10px] text-muted">Length</p>
                    <p className="text-sm font-medium text-foreground">{selectedOrder.measurements.length}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted">Width</p>
                    <p className="text-sm font-medium text-foreground">{selectedOrder.measurements.width}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted">Height</p>
                    <p className="text-sm font-medium text-foreground">{selectedOrder.measurements.height}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted">Countertop</p>
                    <p className="text-sm font-medium text-foreground">{selectedOrder.measurements.countertop}</p>
                  </div>
                </div>
                {selectedOrder.measurements.notes && (
                  <p className="text-xs text-muted mt-3 pt-2 border-t border-border">{selectedOrder.measurements.notes}</p>
                )}
              </div>

              {/* Materials & Photos */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-surface rounded-xl p-3">
                  <p className="text-xs text-muted mb-1">Materials</p>
                  <p className="text-sm font-medium text-foreground">{selectedOrder.materials}</p>
                </div>
                <div className="bg-surface rounded-xl p-3">
                  <p className="text-xs text-muted mb-1">Color / Finish</p>
                  <p className="text-sm font-medium text-foreground">{selectedOrder.color}</p>
                </div>
              </div>

              {selectedOrder.photos.length > 0 && (
                <div className="bg-surface rounded-xl p-3">
                  <p className="text-xs text-muted mb-2 flex items-center gap-1"><Camera className="w-3 h-3" /> Site Photos ({selectedOrder.photos.length})</p>
                  <div className="flex gap-2 flex-wrap">
                    {selectedOrder.photos.map((photo, idx) => (
                      <div key={idx} className="w-20 h-20 rounded-lg bg-surface-hover border border-border flex items-center justify-center text-xs text-muted">
                        <Camera className="w-5 h-5 opacity-30" />
                      </div>
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

              {/* Timeline */}
              <div>
                <h4 className="text-sm font-semibold text-foreground mb-3">Production Timeline</h4>
                <div className="space-y-0">
                  {selectedOrder.timeline.map((step, idx) => (
                    <div key={idx} className="flex items-start gap-3">
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
                        <p className="text-xs text-muted">{step.date}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );
        })()}
      </Modal>

      {/* New Custom Order Modal */}
      <Modal isOpen={showNewOrderModal} onClose={() => setShowNewOrderModal(false)} title="New Custom Order" size="lg">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-muted mb-1.5">Customer Name *</label>
              <input type="text" placeholder="Full name" className="w-full px-4 py-2.5 bg-surface border border-border rounded-xl text-sm text-foreground placeholder:text-muted focus:outline-none focus:border-accent/50" />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted mb-1.5">Phone *</label>
              <input type="text" placeholder="+91 XXXXX XXXXX" className="w-full px-4 py-2.5 bg-surface border border-border rounded-xl text-sm text-foreground placeholder:text-muted focus:outline-none focus:border-accent/50" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-muted mb-1.5">Full Address *</label>
            <textarea rows={2} placeholder="House/Flat No., Street, Area, City, PIN" className="w-full px-4 py-2.5 bg-surface border border-border rounded-xl text-sm text-foreground placeholder:text-muted focus:outline-none focus:border-accent/50 resize-none" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-muted mb-1.5">Furniture Type *</label>
              <select className="w-full px-4 py-2.5 bg-surface border border-border rounded-xl text-sm text-foreground focus:outline-none focus:border-accent/50">
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
            <div>
              <label className="block text-xs font-medium text-muted mb-1.5">Assign Staff *</label>
              <select className="w-full px-4 py-2.5 bg-surface border border-border rounded-xl text-sm text-foreground focus:outline-none focus:border-accent/50">
                <option value="">Select staff</option>
                {designers.filter(s => s.status === 'Active').map(s => (
                  <option key={s.id} value={s.name}>{s.name} — {s.role}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="border-t border-border pt-4">
            <h4 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
              <Ruler className="w-4 h-4 text-accent" /> Measurements (if available)
            </h4>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs text-muted mb-1">Length</label>
                <input type="text" placeholder="e.g., 12 ft" className="w-full px-3 py-2 bg-surface border border-border rounded-xl text-sm text-foreground placeholder:text-muted focus:outline-none focus:border-accent/50" />
              </div>
              <div>
                <label className="block text-xs text-muted mb-1">Width</label>
                <input type="text" placeholder="e.g., 8 ft" className="w-full px-3 py-2 bg-surface border border-border rounded-xl text-sm text-foreground placeholder:text-muted focus:outline-none focus:border-accent/50" />
              </div>
              <div>
                <label className="block text-xs text-muted mb-1">Height</label>
                <input type="text" placeholder="e.g., 9 ft" className="w-full px-3 py-2 bg-surface border border-border rounded-xl text-sm text-foreground placeholder:text-muted focus:outline-none focus:border-accent/50" />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-muted mb-1.5">Materials</label>
              <input type="text" placeholder="e.g., Marine Plywood, Marble" className="w-full px-4 py-2.5 bg-surface border border-border rounded-xl text-sm text-foreground placeholder:text-muted focus:outline-none focus:border-accent/50" />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted mb-1.5">Color / Finish</label>
              <input type="text" placeholder="e.g., White Glossy" className="w-full px-4 py-2.5 bg-surface border border-border rounded-xl text-sm text-foreground placeholder:text-muted focus:outline-none focus:border-accent/50" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-muted mb-1.5">Upload Site Photos</label>
            <div className="border-2 border-dashed border-border rounded-xl p-6 text-center hover:border-accent/30 transition-colors cursor-pointer">
              <Camera className="w-8 h-8 mx-auto mb-2 text-muted opacity-50" />
              <p className="text-sm text-muted">Click to upload photos</p>
              <p className="text-xs text-muted mt-1">JPG, PNG up to 10MB each</p>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-muted mb-1.5">Special Requirements / Notes</label>
            <textarea rows={3} placeholder="Any specific requirements, preferences, constraints..." className="w-full px-4 py-2.5 bg-surface border border-border rounded-xl text-sm text-foreground placeholder:text-muted focus:outline-none focus:border-accent/50 resize-none" />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setShowNewOrderModal(false)} className="px-4 py-2.5 rounded-xl text-sm text-muted hover:text-foreground hover:bg-surface-hover transition-colors">Cancel</button>
            <button onClick={() => setShowNewOrderModal(false)} className="px-6 py-2.5 bg-accent hover:bg-accent-hover text-white rounded-xl text-sm font-semibold transition-all">Create Order</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
