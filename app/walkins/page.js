'use client';

import { useState, useMemo } from 'react';
import {
  Search, Plus, UserPlus, Users, Clock, TrendingUp, CheckCircle2,
  Phone, Mail, DollarSign, Eye, Filter, ShoppingBag, ArrowRight,
  X, UserCheck, UserX, Timer,
} from 'lucide-react';
import Modal from '@/components/Modal';
import { walkins, walkinStatuses } from '@/data/walkins';
import { staff } from '@/data/staff';

const statusConfig = {
  Browsing: { cls: 'bg-blue-500/10 text-blue-700 border-blue-500/20', icon: Eye },
  Interested: { cls: 'bg-amber-500/10 text-amber-700 border-amber-500/20', icon: TrendingUp },
  'Follow-up': { cls: 'bg-purple-500/10 text-purple-700 border-purple-500/20', icon: Clock },
  Converted: { cls: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20', icon: CheckCircle2 },
  Left: { cls: 'bg-red-500/10 text-red-700 border-red-500/20', icon: UserX },
};

export default function WalkinsPage() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [selectedWalkin, setSelectedWalkin] = useState(null);

  const filtered = useMemo(() => walkins.filter(w => {
    const matchesSearch = w.name.toLowerCase().includes(search.toLowerCase()) || w.phone.includes(search) || w.requirement.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === 'All' || w.status === statusFilter;
    return matchesSearch && matchesStatus;
  }), [search, statusFilter]);

  const todayWalkins = walkins.filter(w => w.date === '2026-03-21');
  const todayConverted = todayWalkins.filter(w => w.status === 'Converted').length;
  const todayInterested = todayWalkins.filter(w => w.status === 'Interested' || w.status === 'Follow-up').length;
  const conversionRate = todayWalkins.length > 0 ? Math.round((todayConverted / todayWalkins.length) * 100) : 0;

  const salespeople = staff.filter(s => s.role.includes('Sales') || s.role === 'Design Consultant');

  return (
    <div className="space-y-6 animate-[fade-in_0.3s_ease]">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Walk-in Customers</h1>
          <p className="text-sm text-muted mt-1">Reception desk — Log & track every visitor</p>
        </div>
        <button onClick={() => setShowRegisterModal(true)} className="flex items-center gap-2 px-4 py-2.5 bg-accent hover:bg-accent-hover text-white rounded-xl text-sm font-semibold transition-all">
          <UserPlus className="w-4 h-4" /> Register Walk-in
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="glass-card p-4 flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-accent-light"><Users className="w-5 h-5 text-accent" /></div>
          <div><p className="text-xs text-muted">Today&apos;s Walk-ins</p><p className="text-lg font-bold text-foreground">{todayWalkins.length}</p></div>
        </div>
        <div className="glass-card p-4 flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-success-light"><CheckCircle2 className="w-5 h-5 text-success" /></div>
          <div><p className="text-xs text-muted">Converted</p><p className="text-lg font-bold text-success">{todayConverted}</p></div>
        </div>
        <div className="glass-card p-4 flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-amber-500/10"><TrendingUp className="w-5 h-5 text-amber-700" /></div>
          <div><p className="text-xs text-muted">Interested / Follow-up</p><p className="text-lg font-bold text-amber-700">{todayInterested}</p></div>
        </div>
        <div className="glass-card p-4 flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-info-light"><TrendingUp className="w-5 h-5 text-info" /></div>
          <div><p className="text-xs text-muted">Conversion Rate</p><p className="text-lg font-bold text-foreground">{conversionRate}%</p></div>
        </div>
        <div className="glass-card p-4 flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-purple-light"><Timer className="w-5 h-5 text-purple" /></div>
          <div><p className="text-xs text-muted">Avg Visit Duration</p><p className="text-lg font-bold text-foreground">32 min</p></div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
          <input type="text" placeholder="Search by name, phone, or requirement..." value={search} onChange={e => setSearch(e.target.value)} className="w-full pl-10 pr-4 py-2.5 bg-surface rounded-xl border border-border text-sm" />
        </div>
        <div className="flex gap-1 flex-wrap">
          {walkinStatuses.map(s => (
            <button key={s} onClick={() => setStatusFilter(s)} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${statusFilter === s ? 'bg-accent text-white' : 'text-muted hover:text-foreground hover:bg-surface-hover'}`}>{s}</button>
          ))}
        </div>
      </div>

      {/* Walk-in Table */}
      <div className="glass-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="crm-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Customer</th>
                <th>Phone</th>
                <th>Requirement</th>
                <th>Budget</th>
                <th>Assigned To</th>
                <th>Duration</th>
                <th>Status</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(w => {
                const sc = statusConfig[w.status] || statusConfig.Browsing;
                return (
                  <tr key={w.id} className="cursor-pointer" onClick={() => setSelectedWalkin(w)}>
                    <td className="text-foreground font-medium">{w.time}</td>
                    <td className="font-medium text-foreground">{w.name}</td>
                    <td className="text-muted">{w.phone}</td>
                    <td>{w.requirement}</td>
                    <td className="text-accent font-medium">{w.budget}</td>
                    <td>
                      <span className="px-2 py-0.5 rounded-full text-xs bg-surface border border-border">{w.assignedTo}</span>
                    </td>
                    <td className="text-muted">{w.visitDuration}</td>
                    <td>
                      <span className={`px-2 py-0.5 rounded-full text-xs border ${sc.cls}`}>{w.status}</span>
                    </td>
                    <td className="text-muted">{w.date}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Register Walk-in Modal */}
      <Modal isOpen={showRegisterModal} onClose={() => setShowRegisterModal(false)} title="Register Walk-in Customer" size="lg">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-muted mb-1.5">Customer Name *</label>
              <input type="text" placeholder="Full name" className="w-full px-4 py-2.5 bg-surface border border-border rounded-xl text-sm text-foreground placeholder:text-muted focus:outline-none focus:border-accent/50" />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted mb-1.5">Phone Number *</label>
              <input type="text" placeholder="+91 XXXXX XXXXX" className="w-full px-4 py-2.5 bg-surface border border-border rounded-xl text-sm text-foreground placeholder:text-muted focus:outline-none focus:border-accent/50" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-muted mb-1.5">Email (optional)</label>
              <input type="email" placeholder="email@example.com" className="w-full px-4 py-2.5 bg-surface border border-border rounded-xl text-sm text-foreground placeholder:text-muted focus:outline-none focus:border-accent/50" />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted mb-1.5">Requirement *</label>
              <select className="w-full px-4 py-2.5 bg-surface border border-border rounded-xl text-sm text-foreground focus:outline-none focus:border-accent/50">
                <option value="">What are they looking for?</option>
                <option>Sofa / Sofa Set</option>
                <option>Bed</option>
                <option>Dining Table</option>
                <option>Wardrobe</option>
                <option>Office Chair</option>
                <option>TV Unit</option>
                <option>Bookshelf / Storage</option>
                <option>Kids Furniture</option>
                <option>Modular Kitchen</option>
                <option>Dressing Table</option>
                <option>Center Table</option>
                <option>Other</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-muted mb-1.5">Budget Range</label>
              <select className="w-full px-4 py-2.5 bg-surface border border-border rounded-xl text-sm text-foreground focus:outline-none focus:border-accent/50">
                <option value="">Select budget range</option>
                <option>Under ₹10,000</option>
                <option>₹10,000 - ₹25,000</option>
                <option>₹25,000 - ₹50,000</option>
                <option>₹50,000 - ₹1,00,000</option>
                <option>₹1,00,000 - ₹2,00,000</option>
                <option>₹2,00,000+</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted mb-1.5">Assign Salesperson *</label>
              <select className="w-full px-4 py-2.5 bg-surface border border-border rounded-xl text-sm text-foreground focus:outline-none focus:border-accent/50">
                <option value="">Select staff</option>
                {salespeople.filter(s => s.status === 'Active').map(s => (
                  <option key={s.id} value={s.name}>{s.name} — {s.role}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-muted mb-1.5">Notes</label>
            <textarea rows={3} placeholder="Any specific preferences, color, size, etc." className="w-full px-4 py-2.5 bg-surface border border-border rounded-xl text-sm text-foreground placeholder:text-muted focus:outline-none focus:border-accent/50 resize-none" />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setShowRegisterModal(false)} className="px-4 py-2.5 rounded-xl text-sm text-muted hover:text-foreground hover:bg-surface-hover transition-colors">Cancel</button>
            <button onClick={() => setShowRegisterModal(false)} className="px-6 py-2.5 bg-accent hover:bg-accent-hover text-white rounded-xl text-sm font-semibold transition-all">Register Customer</button>
          </div>
        </div>
      </Modal>

      {/* Walk-in Detail Modal */}
      <Modal isOpen={!!selectedWalkin} onClose={() => setSelectedWalkin(null)} title="Walk-in Details" size="lg">
        {selectedWalkin && (() => {
          const sc = statusConfig[selectedWalkin.status] || statusConfig.Browsing;
          const StatusIcon = sc.icon;
          return (
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-full bg-accent/10 flex items-center justify-center">
                  <UserCheck className="w-7 h-7 text-accent" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-foreground">{selectedWalkin.name}</h3>
                  <div className="flex items-center gap-3 text-sm text-muted">
                    <span className="flex items-center gap-1"><Phone className="w-3.5 h-3.5" />{selectedWalkin.phone}</span>
                    {selectedWalkin.email && <span className="flex items-center gap-1"><Mail className="w-3.5 h-3.5" />{selectedWalkin.email}</span>}
                  </div>
                </div>
                <span className={`px-3 py-1 rounded-full text-xs font-medium border flex items-center gap-1.5 ${sc.cls}`}>
                  <StatusIcon className="w-3.5 h-3.5" />{selectedWalkin.status}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-surface rounded-xl p-3">
                  <p className="text-xs text-muted mb-1">Requirement</p>
                  <p className="text-sm font-medium text-foreground">{selectedWalkin.requirement}</p>
                </div>
                <div className="bg-surface rounded-xl p-3">
                  <p className="text-xs text-muted mb-1">Budget</p>
                  <p className="text-sm font-medium text-accent">{selectedWalkin.budget}</p>
                </div>
                <div className="bg-surface rounded-xl p-3">
                  <p className="text-xs text-muted mb-1">Assigned To</p>
                  <p className="text-sm font-medium text-foreground">{selectedWalkin.assignedTo}</p>
                </div>
                <div className="bg-surface rounded-xl p-3">
                  <p className="text-xs text-muted mb-1">Visit Duration</p>
                  <p className="text-sm font-medium text-foreground">{selectedWalkin.visitDuration}</p>
                </div>
                <div className="bg-surface rounded-xl p-3">
                  <p className="text-xs text-muted mb-1">Date</p>
                  <p className="text-sm font-medium text-foreground">{selectedWalkin.date}</p>
                </div>
                <div className="bg-surface rounded-xl p-3">
                  <p className="text-xs text-muted mb-1">Time</p>
                  <p className="text-sm font-medium text-foreground">{selectedWalkin.time}</p>
                </div>
              </div>

              <div className="bg-surface rounded-xl p-3">
                <p className="text-xs text-muted mb-1">Notes</p>
                <p className="text-sm text-foreground">{selectedWalkin.notes}</p>
              </div>

              <div className="flex gap-2 pt-2">
                <button className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-emerald-500/10 text-emerald-700 border border-emerald-500/20 rounded-xl text-sm font-medium hover:bg-emerald-500/20 transition-colors">
                  <Phone className="w-4 h-4" /> Call
                </button>
                <button className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-accent/10 text-accent border border-accent/20 rounded-xl text-sm font-medium hover:bg-accent/20 transition-colors">
                  <ArrowRight className="w-4 h-4" /> Convert to Lead
                </button>
                <button className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-blue-500/10 text-blue-700 border border-blue-500/20 rounded-xl text-sm font-medium hover:bg-blue-500/20 transition-colors">
                  <ShoppingBag className="w-4 h-4" /> Create Order
                </button>
              </div>
            </div>
          );
        })()}
      </Modal>
    </div>
  );
}
