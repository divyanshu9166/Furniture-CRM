'use client';

import { useState } from 'react';
import {
  LogIn, LogOut, Clock, ShoppingBag, Phone, Users, Package,
  MapPin, Camera, Ruler, Target, Star,
  DollarSign, TrendingUp, CheckCircle2, Plus, X, Calendar,
  UserCheck, Activity, Percent, IndianRupee, QrCode,
  Megaphone, AlertTriangle,
  Warehouse, Timer, Home,
  Lock, User,
} from 'lucide-react';
import Modal from '@/components/Modal';
import { staff } from '@/data/staff';

const activityIcons = {
  sale: { icon: ShoppingBag, color: 'bg-emerald-500/10 text-emerald-700', label: 'Sale' },
  call: { icon: Phone, color: 'bg-blue-500/10 text-blue-700', label: 'Call' },
  walkin: { icon: Users, color: 'bg-purple-500/10 text-purple-700', label: 'Walk-in' },
  stock: { icon: Package, color: 'bg-amber-500/10 text-amber-700', label: 'Stock Update' },
  lead: { icon: UserCheck, color: 'bg-teal-500/10 text-teal-700', label: 'Lead' },
  measurement: { icon: Ruler, color: 'bg-indigo-500/10 text-indigo-700', label: 'Measurement' },
  qr_lead: { icon: QrCode, color: 'bg-pink-500/10 text-pink-700', label: 'QR Lead' },
  marketing: { icon: Megaphone, color: 'bg-orange-500/10 text-orange-700', label: 'Marketing' },
};

const attendanceColors = {
  'Present': 'bg-emerald-500/10 text-emerald-700',
  'Absent': 'bg-red-500/10 text-red-700',
  'Half Day': 'bg-amber-500/10 text-amber-700',
  'Off Duty': 'bg-orange-500/10 text-orange-700',
};

const stockActionColors = {
  'Stock Out': 'text-red-700 bg-red-500/10',
  'Received': 'text-emerald-700 bg-emerald-500/10',
  'Dispatched': 'text-blue-700 bg-blue-500/10',
  'Low Stock Alert': 'text-amber-700 bg-amber-500/10',
};

export default function StaffPortalPage() {
  const [loggedInStaff, setLoggedInStaff] = useState(null);
  const [selectedStaffId, setSelectedStaffId] = useState('');
  const [pin, setPin] = useState('');
  const [loginError, setLoginError] = useState('');
  const [tab, setTab] = useState('dashboard');
  const [isClockedIn, setIsClockedIn] = useState(true);
  const [clockInTime, setClockInTime] = useState(null);

  // Modals
  const [showLogActivity, setShowLogActivity] = useState(false);
  const [showLogStock, setShowLogStock] = useState(false);
  const [showLogVisit, setShowLogVisit] = useState(false);

  // Activity form
  const [activityType, setActivityType] = useState('sale');
  const [activityText, setActivityText] = useState('');

  // Stock form
  const [stockProduct, setStockProduct] = useState('');
  const [stockWarehouse, setStockWarehouse] = useState('Showroom A');
  const [stockAction, setStockAction] = useState('Received');
  const [stockQty, setStockQty] = useState('');

  // Visit form
  const [visitCustomer, setVisitCustomer] = useState('');
  const [visitAddress, setVisitAddress] = useState('');
  const [visitType, setVisitType] = useState('Measurement');
  const [visitNotes, setVisitNotes] = useState('');
  const [visitMeasurements, setVisitMeasurements] = useState('');

  const handleLogin = (e) => {
    e.preventDefault();
    const found = staff.find(s => s.id === parseInt(selectedStaffId));
    if (!found) {
      setLoginError('Please select a staff member');
      return;
    }
    // Simple PIN: last 4 digits of phone
    const expectedPin = found.phone.replace(/\s/g, '').slice(-4);
    if (pin !== expectedPin) {
      setLoginError('Invalid PIN. Use last 4 digits of your phone number.');
      return;
    }
    setLoggedInStaff(found);
    setLoginError('');
    const today = found.attendance[0];
    if (today?.clockIn) {
      setIsClockedIn(true);
      setClockInTime(today.clockIn);
    } else {
      setIsClockedIn(false);
    }
  };

  const handleClockIn = () => {
    const now = new Date();
    const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    setIsClockedIn(true);
    setClockInTime(time);
  };

  const handleClockOut = () => {
    setIsClockedIn(false);
    setClockInTime(null);
  };

  const handleLogout = () => {
    setLoggedInStaff(null);
    setSelectedStaffId('');
    setPin('');
    setTab('dashboard');
  };

  const handleLogActivity = (e) => {
    e.preventDefault();
    if (!activityText.trim()) return;
    const now = new Date();
    const time = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
    loggedInStaff.activities.unshift({
      type: activityType,
      text: activityText,
      time,
      date: '2026-03-21',
    });
    setActivityText('');
    setShowLogActivity(false);
  };

  const handleLogStock = (e) => {
    e.preventDefault();
    if (!stockProduct.trim() || !stockQty) return;
    const now = new Date();
    const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')} ${now.getHours() >= 12 ? 'PM' : 'AM'}`;
    loggedInStaff.stockUpdates.unshift({
      product: stockProduct,
      warehouse: stockWarehouse,
      action: stockAction,
      qty: parseInt(stockQty),
      date: '2026-03-21',
      time,
    });
    setStockProduct('');
    setStockQty('');
    setShowLogStock(false);
  };

  const handleLogVisit = (e) => {
    e.preventDefault();
    if (!visitCustomer.trim() || !visitAddress.trim()) return;
    const visitId = `FV${String(Date.now()).slice(-3)}`;
    loggedInStaff.fieldVisits.unshift({
      id: visitId,
      customer: visitCustomer,
      address: visitAddress,
      date: '2026-03-21',
      time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }),
      status: 'Scheduled',
      type: visitType,
      notes: visitNotes,
      measurements: visitMeasurements ? Object.fromEntries(visitMeasurements.split(',').map(m => { const [k, v] = m.trim().split(':'); return [k?.trim(), v?.trim()]; })) : undefined,
    });
    setVisitCustomer('');
    setVisitAddress('');
    setVisitNotes('');
    setVisitMeasurements('');
    setShowLogVisit(false);
  };

  // ========== LOGIN SCREEN ==========
  if (!loggedInStaff) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center animate-[fade-in_0.5s_ease-out]">
        <div className="w-full max-w-md">
          <div className="glass-card p-8">
            {/* Header */}
            <div className="text-center mb-8">
              <div className="w-16 h-16 rounded-2xl bg-accent/10 flex items-center justify-center mx-auto mb-4">
                <User className="w-8 h-8 text-accent" />
              </div>
              <h1 className="text-2xl font-bold text-foreground">Staff Portal</h1>
              <p className="text-sm text-muted mt-1">Login to access your dashboard</p>
            </div>

            <form onSubmit={handleLogin} className="space-y-4">
              {/* Staff Selection */}
              <div>
                <label className="block text-xs font-medium text-muted mb-1.5">Select Your Name</label>
                <select
                  value={selectedStaffId}
                  onChange={e => { setSelectedStaffId(e.target.value); setLoginError(''); }}
                  className="w-full px-4 py-3 bg-surface rounded-xl border border-border text-sm text-foreground"
                >
                  <option value="">Choose staff member...</option>
                  {staff.map(s => (
                    <option key={s.id} value={s.id}>{s.name} — {s.role}</option>
                  ))}
                </select>
              </div>

              {/* PIN */}
              <div>
                <label className="block text-xs font-medium text-muted mb-1.5">Enter PIN</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
                  <input
                    type="password"
                    maxLength={4}
                    placeholder="4-digit PIN"
                    value={pin}
                    onChange={e => { setPin(e.target.value); setLoginError(''); }}
                    className="w-full pl-10 pr-4 py-3 bg-surface rounded-xl border border-border text-sm tracking-[0.5em] text-center"
                  />
                </div>
              </div>

              {loginError && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-500/10 text-red-700 text-xs">
                  <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" /> {loginError}
                </div>
              )}

              <button type="submit" className="w-full py-3 bg-accent hover:bg-accent-hover text-white rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2">
                <LogIn className="w-4 h-4" /> Login
              </button>
            </form>

            <p className="text-[10px] text-muted text-center mt-6">PIN = Last 4 digits of your registered phone number</p>
          </div>
        </div>
      </div>
    );
  }

  // ========== STAFF DASHBOARD ==========
  const me = loggedInStaff;
  const targetPct = me.target.monthly > 0 ? Math.round((me.target.achieved / me.target.monthly) * 100) : 0;
  const todayActivities = me.activities.filter(a => a.date === '2026-03-21');
  const upcomingVisits = me.fieldVisits.filter(v => v.status === 'Scheduled' || v.status === 'In Progress');

  const portalTabs = [
    { key: 'dashboard', label: 'My Dashboard', icon: Home },
    { key: 'activity', label: 'Activity Log', icon: Activity },
    { key: 'stock', label: 'Stock Updates', icon: Warehouse },
    { key: 'field', label: 'Field Visits', icon: MapPin },
    { key: 'attendance', label: 'My Attendance', icon: Calendar },
    { key: 'sales', label: 'My Sales', icon: ShoppingBag },
  ];

  return (
    <div className="space-y-6 animate-[fade-in_0.3s_ease]">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-accent/10 flex items-center justify-center text-lg font-bold text-accent">{me.avatar}</div>
          <div>
            <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
              Welcome, {me.name.split(' ')[0]}
              <span className="text-xs font-normal text-muted bg-surface px-2 py-0.5 rounded-full">{me.role}</span>
            </h1>
            <p className="text-sm text-muted mt-0.5">Staff Portal — Personal Dashboard</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {/* Clock In/Out */}
          {!isClockedIn ? (
            <button onClick={handleClockIn} className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-semibold transition-all">
              <LogIn className="w-4 h-4" /> Clock In
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs font-medium text-emerald-700">
                <div className="w-2 h-2 rounded-full bg-emerald-600 animate-pulse" />
                Clocked in at {clockInTime}
              </span>
              <button onClick={handleClockOut} className="flex items-center gap-2 px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-sm font-semibold transition-all">
                <LogOut className="w-4 h-4" /> Clock Out
              </button>
            </div>
          )}
          <button onClick={handleLogout} className="px-3 py-2.5 border border-border rounded-xl text-sm text-muted hover:text-foreground hover:bg-surface-hover transition-all">
            Logout
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto pb-1">
        {portalTabs.map(t => {
          const Icon = t.icon;
          return (
            <button key={t.key} onClick={() => setTab(t.key)} className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-medium transition-all whitespace-nowrap ${tab === t.key ? 'bg-accent text-white' : 'text-muted hover:text-foreground hover:bg-surface-hover border border-transparent hover:border-border'}`}>
              <Icon className="w-3.5 h-3.5" /> {t.label}
            </button>
          );
        })}
      </div>

      {/* ===== MY DASHBOARD ===== */}
      {tab === 'dashboard' && (
        <div className="space-y-6">
          {/* Quick Stats */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="glass-card p-4 flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-success-light"><DollarSign className="w-5 h-5 text-success" /></div>
              <div><p className="text-xs text-muted">Total Revenue</p><p className="text-lg font-bold text-success">₹{(me.stats.revenue / 100000).toFixed(1)}L</p></div>
            </div>
            <div className="glass-card p-4 flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-purple-light"><ShoppingBag className="w-5 h-5 text-purple" /></div>
              <div><p className="text-xs text-muted">Today&apos;s Revenue</p><p className="text-lg font-bold text-foreground">₹{me.stats.todayRevenue.toLocaleString()}</p></div>
            </div>
            <div className="glass-card p-4 flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-info-light"><Target className="w-5 h-5 text-info" /></div>
              <div><p className="text-xs text-muted">Conversion Rate</p><p className="text-lg font-bold text-foreground">{me.stats.conversionRate}%</p></div>
            </div>
            <div className="glass-card p-4 flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-amber-500/10"><Star className="w-5 h-5 text-amber-700" /></div>
              <div><p className="text-xs text-muted">My Rating</p><p className="text-lg font-bold text-amber-700">{me.stats.rating} / 5</p></div>
            </div>
          </div>

          {/* Target + Commission */}
          {me.target.monthly > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {/* Target Card */}
              <div className="glass-card p-5">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-foreground flex items-center gap-2"><Target className="w-4 h-4 text-accent" /> Monthly Target</h3>
                  <span className={`text-sm font-bold ${targetPct >= 80 ? 'text-emerald-700' : targetPct >= 50 ? 'text-amber-700' : 'text-red-700'}`}>{targetPct}%</span>
                </div>
                <div className="h-3 bg-surface rounded-full overflow-hidden mb-3">
                  <div className={`h-full rounded-full transition-all ${targetPct >= 80 ? 'bg-emerald-600' : targetPct >= 50 ? 'bg-amber-600' : 'bg-red-600'}`} style={{ width: `${Math.min(100, targetPct)}%` }} />
                </div>
                <div className="flex justify-between text-xs text-muted">
                  <span>Achieved: <span className="font-semibold text-foreground">₹{(me.target.achieved / 1000).toFixed(0)}K</span></span>
                  <span>Target: <span className="font-semibold text-foreground">₹{(me.target.monthly / 1000).toFixed(0)}K</span></span>
                </div>
                <div className="mt-2 p-2 rounded-lg bg-surface text-xs text-muted text-center">
                  {me.target.monthly - me.target.achieved > 0
                    ? `₹${((me.target.monthly - me.target.achieved) / 1000).toFixed(0)}K more to hit target`
                    : 'Target achieved! Great work!'}
                </div>
              </div>

              {/* Commission Card */}
              <div className="glass-card p-5">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-4"><IndianRupee className="w-4 h-4 text-accent" /> My Commission</h3>
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-surface rounded-xl p-3 text-center">
                    <p className="text-lg font-bold text-foreground">{me.commission.rate}%</p>
                    <p className="text-[10px] text-muted">Rate</p>
                  </div>
                  <div className="bg-surface rounded-xl p-3 text-center">
                    <p className="text-lg font-bold text-emerald-700">₹{me.commission.earned.toLocaleString()}</p>
                    <p className="text-[10px] text-muted">Earned</p>
                  </div>
                  <div className="bg-surface rounded-xl p-3 text-center">
                    <p className="text-lg font-bold text-amber-700">₹{me.commission.pending.toLocaleString()}</p>
                    <p className="text-[10px] text-muted">Pending</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Quick Actions */}
          <div className="glass-card p-5">
            <h3 className="text-sm font-semibold text-foreground mb-4">Quick Actions</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <button onClick={() => { setActivityType('sale'); setShowLogActivity(true); }} className="flex flex-col items-center gap-2 p-4 rounded-xl bg-surface border border-border hover:border-accent/30 hover:bg-surface-hover transition-all">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center"><ShoppingBag className="w-5 h-5 text-emerald-700" /></div>
                <span className="text-xs font-medium text-foreground">Log Sale</span>
              </button>
              <button onClick={() => { setActivityType('call'); setShowLogActivity(true); }} className="flex flex-col items-center gap-2 p-4 rounded-xl bg-surface border border-border hover:border-accent/30 hover:bg-surface-hover transition-all">
                <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center"><Phone className="w-5 h-5 text-blue-700" /></div>
                <span className="text-xs font-medium text-foreground">Log Call</span>
              </button>
              <button onClick={() => setShowLogStock(true)} className="flex flex-col items-center gap-2 p-4 rounded-xl bg-surface border border-border hover:border-accent/30 hover:bg-surface-hover transition-all">
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center"><Package className="w-5 h-5 text-amber-700" /></div>
                <span className="text-xs font-medium text-foreground">Update Stock</span>
              </button>
              <button onClick={() => setShowLogVisit(true)} className="flex flex-col items-center gap-2 p-4 rounded-xl bg-surface border border-border hover:border-accent/30 hover:bg-surface-hover transition-all">
                <div className="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center"><MapPin className="w-5 h-5 text-indigo-700" /></div>
                <span className="text-xs font-medium text-foreground">Log Visit</span>
              </button>
            </div>
          </div>

          {/* Today's Activity + Upcoming */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Today's Activity */}
            <div className="glass-card p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-foreground">Today&apos;s Activity</h3>
                <span className="text-xs text-muted">{todayActivities.length} actions</span>
              </div>
              <div className="space-y-2 max-h-[300px] overflow-y-auto">
                {todayActivities.map((act, i) => {
                  const config = activityIcons[act.type] || activityIcons.walkin;
                  const Icon = config.icon;
                  return (
                    <div key={i} className="flex items-start gap-3 p-2.5 rounded-lg bg-surface">
                      <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${config.color}`}><Icon className="w-3.5 h-3.5" /></div>
                      <div>
                        <p className="text-xs text-foreground">{act.text}</p>
                        <p className="text-[10px] text-muted">{act.time}</p>
                      </div>
                    </div>
                  );
                })}
                {todayActivities.length === 0 && <p className="text-xs text-muted text-center py-4">No activities today yet</p>}
              </div>
            </div>

            {/* Upcoming Visits */}
            <div className="glass-card p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-foreground">Upcoming Field Visits</h3>
                <button onClick={() => setShowLogVisit(true)} className="text-xs text-accent font-medium hover:underline">+ Add Visit</button>
              </div>
              <div className="space-y-3 max-h-[300px] overflow-y-auto">
                {upcomingVisits.map(visit => (
                  <div key={visit.id} className="bg-surface rounded-xl p-3 border border-border">
                    <div className="flex items-start justify-between mb-1">
                      <p className="text-sm font-semibold text-foreground">{visit.customer}</p>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${visit.status === 'In Progress' ? 'bg-blue-500/10 text-blue-700' : 'bg-amber-500/10 text-amber-700'}`}>{visit.status}</span>
                    </div>
                    <p className="text-xs text-muted flex items-center gap-1"><MapPin className="w-3 h-3" /> {visit.address}</p>
                    <p className="text-xs text-muted mt-1">{visit.date} · {visit.time} · {visit.type}</p>
                  </div>
                ))}
                {upcomingVisits.length === 0 && <p className="text-xs text-muted text-center py-4">No upcoming visits</p>}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===== ACTIVITY LOG TAB ===== */}
      {tab === 'activity' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-foreground">My Activity Log</h3>
            <button onClick={() => setShowLogActivity(true)} className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-hover text-white rounded-xl text-sm font-medium transition-all">
              <Plus className="w-4 h-4" /> Log Activity
            </button>
          </div>
          <div className="glass-card p-5">
            <div className="space-y-2">
              {me.activities.map((act, i) => {
                const config = activityIcons[act.type] || activityIcons.walkin;
                const Icon = config.icon;
                return (
                  <div key={i} className="flex items-start gap-3 p-3 rounded-xl bg-surface hover:bg-surface-hover transition-colors">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${config.color}`}><Icon className="w-4 h-4" /></div>
                    <div className="flex-1">
                      <p className="text-sm text-foreground">{act.text}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] text-muted">{act.date} · {act.time}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded ${config.color}`}>{config.label}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ===== STOCK UPDATES TAB ===== */}
      {tab === 'stock' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-foreground">My Stock Updates</h3>
            <button onClick={() => setShowLogStock(true)} className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-hover text-white rounded-xl text-sm font-medium transition-all">
              <Plus className="w-4 h-4" /> Update Stock
            </button>
          </div>
          <div className="glass-card overflow-hidden">
            <table className="crm-table">
              <thead>
                <tr><th>Product</th><th>Warehouse</th><th>Action</th><th>Qty</th><th>Date & Time</th></tr>
              </thead>
              <tbody>
                {me.stockUpdates.map((u, i) => (
                  <tr key={i}>
                    <td className="font-medium text-foreground">{u.product}</td>
                    <td className="text-muted text-xs">{u.warehouse}</td>
                    <td><span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${stockActionColors[u.action]}`}>{u.action}</span></td>
                    <td className="font-semibold">{u.qty}</td>
                    <td className="text-xs text-muted">{u.date} · {u.time}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {me.stockUpdates.length === 0 && <p className="text-sm text-muted text-center py-8">No stock updates yet</p>}
          </div>
        </div>
      )}

      {/* ===== FIELD VISITS TAB ===== */}
      {tab === 'field' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-foreground">My Field Visits</h3>
            <button onClick={() => setShowLogVisit(true)} className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-hover text-white rounded-xl text-sm font-medium transition-all">
              <Plus className="w-4 h-4" /> Schedule Visit
            </button>
          </div>
          <div className="space-y-3">
            {me.fieldVisits.map(visit => (
              <div key={visit.id} className="glass-card p-5">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="text-sm font-semibold text-foreground">{visit.customer}</p>
                    <p className="text-xs text-muted flex items-center gap-1 mt-0.5"><MapPin className="w-3 h-3" /> {visit.address}</p>
                  </div>
                  <span className={`px-2.5 py-1 rounded-full text-[10px] font-medium ${visit.status === 'Completed' ? 'bg-emerald-500/10 text-emerald-700' : visit.status === 'In Progress' ? 'bg-blue-500/10 text-blue-700' : 'bg-amber-500/10 text-amber-700'}`}>{visit.status}</span>
                </div>
                <div className="flex items-center gap-4 text-xs text-muted mb-2">
                  <span>{visit.date} · {visit.time}</span>
                  <span className="px-2 py-0.5 rounded bg-surface-hover text-foreground">{visit.type}</span>
                </div>
                {visit.notes && <p className="text-xs text-muted mb-2">{visit.notes}</p>}
                <div className="flex items-center gap-4">
                  {visit.measurements && (
                    <div className="flex items-center gap-1 text-xs text-indigo-700">
                      <Ruler className="w-3 h-3" />
                      {Object.entries(visit.measurements).map(([k, v]) => `${k}: ${v}`).join(' · ')}
                    </div>
                  )}
                  {visit.photos && <span className="flex items-center gap-1 text-xs text-purple-700"><Camera className="w-3 h-3" /> {visit.photos} photos</span>}
                </div>
                {visit.status === 'Scheduled' && (
                  <div className="flex gap-2 mt-3 pt-3 border-t border-border">
                    <button onClick={() => { visit.status = 'In Progress'; setLoggedInStaff({...me}); }} className="px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-500/10 text-blue-700 border border-blue-500/20 hover:bg-blue-500/20 transition-colors">Start Visit</button>
                    <button onClick={() => { visit.status = 'Completed'; setLoggedInStaff({...me}); }} className="px-3 py-1.5 text-xs font-medium rounded-lg bg-emerald-500/10 text-emerald-700 border border-emerald-500/20 hover:bg-emerald-500/20 transition-colors">Mark Complete</button>
                  </div>
                )}
                {visit.status === 'In Progress' && (
                  <div className="flex gap-2 mt-3 pt-3 border-t border-border">
                    <button onClick={() => { visit.status = 'Completed'; setLoggedInStaff({...me}); }} className="px-3 py-1.5 text-xs font-medium rounded-lg bg-emerald-500/10 text-emerald-700 border border-emerald-500/20 hover:bg-emerald-500/20 transition-colors">Mark Complete</button>
                  </div>
                )}
              </div>
            ))}
            {me.fieldVisits.length === 0 && <div className="glass-card p-8 text-center text-muted text-sm">No field visits scheduled</div>}
          </div>
        </div>
      )}

      {/* ===== MY ATTENDANCE TAB ===== */}
      {tab === 'attendance' && (
        <div className="space-y-4">
          <h3 className="text-base font-semibold text-foreground">My Attendance — Last 7 Days</h3>

          {/* Summary */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div className="glass-card p-4 flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-emerald-500/10"><CheckCircle2 className="w-5 h-5 text-emerald-700" /></div>
              <div><p className="text-xs text-muted">Present</p><p className="text-lg font-bold text-emerald-700">{me.attendance.filter(a => a.status === 'Present').length}</p></div>
            </div>
            <div className="glass-card p-4 flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-red-500/10"><X className="w-5 h-5 text-red-700" /></div>
              <div><p className="text-xs text-muted">Absent</p><p className="text-lg font-bold text-red-700">{me.attendance.filter(a => a.status === 'Absent').length}</p></div>
            </div>
            <div className="glass-card p-4 flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-amber-500/10"><Clock className="w-5 h-5 text-amber-700" /></div>
              <div><p className="text-xs text-muted">Half Days</p><p className="text-lg font-bold text-amber-700">{me.attendance.filter(a => a.status === 'Half Day').length}</p></div>
            </div>
            <div className="glass-card p-4 flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-info-light"><Timer className="w-5 h-5 text-info" /></div>
              <div><p className="text-xs text-muted">Avg Hours</p><p className="text-lg font-bold text-foreground">{(me.attendance.filter(a => a.hours > 0).reduce((s, a) => s + a.hours, 0) / Math.max(1, me.attendance.filter(a => a.hours > 0).length)).toFixed(1)}h</p></div>
            </div>
          </div>

          {/* Daily Log */}
          <div className="glass-card p-5">
            <div className="space-y-2">
              {me.attendance.map((a, i) => (
                <div key={i} className="flex items-center justify-between bg-surface rounded-xl p-4">
                  <div className="flex items-center gap-3">
                    <span className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold ${attendanceColors[a.status]}`}>
                      {new Date(a.date).getDate()}
                    </span>
                    <div>
                      <p className="text-sm font-medium text-foreground">{new Date(a.date).toLocaleDateString('en-IN', { weekday: 'long', month: 'short', day: 'numeric' })}</p>
                      <span className={`text-[10px] font-medium px-2 py-0.5 rounded ${attendanceColors[a.status]}`}>{a.status}</span>
                    </div>
                  </div>
                  <div className="text-right text-xs">
                    {a.clockIn ? (
                      <div className="space-y-0.5">
                        <p className="text-emerald-700 flex items-center gap-1 justify-end"><LogIn className="w-3 h-3" /> {a.clockIn}</p>
                        {a.clockOut && <p className="text-red-700 flex items-center gap-1 justify-end"><LogOut className="w-3 h-3" /> {a.clockOut}</p>}
                        {a.hours && <p className="text-muted font-medium">{a.hours} hours</p>}
                      </div>
                    ) : <p className="text-muted">—</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ===== MY SALES TAB ===== */}
      {tab === 'sales' && (
        <div className="space-y-4">
          <h3 className="text-base font-semibold text-foreground">My Sales History</h3>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="glass-card p-4 flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-success-light"><DollarSign className="w-5 h-5 text-success" /></div>
              <div><p className="text-xs text-muted">Total Revenue</p><p className="text-lg font-bold text-success">₹{(me.stats.revenue / 100000).toFixed(1)}L</p></div>
            </div>
            <div className="glass-card p-4 flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-accent-light"><TrendingUp className="w-5 h-5 text-accent" /></div>
              <div><p className="text-xs text-muted">Conversions</p><p className="text-lg font-bold text-foreground">{me.stats.conversions} / {me.stats.leadsAssigned}</p></div>
            </div>
            <div className="glass-card p-4 flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-purple-light"><ShoppingBag className="w-5 h-5 text-purple" /></div>
              <div><p className="text-xs text-muted">Today</p><p className="text-lg font-bold text-foreground">{me.stats.todaySales} sales — ₹{me.stats.todayRevenue.toLocaleString()}</p></div>
            </div>
          </div>

          <div className="glass-card overflow-hidden">
            <div className="p-4 border-b border-border">
              <h3 className="text-sm font-semibold text-foreground">Recent Sales</h3>
            </div>
            <table className="crm-table">
              <thead>
                <tr><th>Product</th><th>Customer</th><th>Date</th><th>Amount</th></tr>
              </thead>
              <tbody>
                {me.recentSales.map((sale, i) => (
                  <tr key={i}>
                    <td className="font-medium text-foreground">{sale.product}</td>
                    <td className="text-muted">{sale.customer}</td>
                    <td className="text-muted text-xs">{sale.date}</td>
                    <td className="font-semibold text-success">₹{sale.amount.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {me.recentSales.length === 0 && <p className="text-sm text-muted text-center py-8">No sales recorded</p>}
          </div>
        </div>
      )}

      {/* ===== LOG ACTIVITY MODAL ===== */}
      <Modal isOpen={showLogActivity} onClose={() => setShowLogActivity(false)} title="Log Activity" size="md">
        <form onSubmit={handleLogActivity} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-muted mb-1.5">Activity Type</label>
            <div className="grid grid-cols-4 gap-2">
              {Object.entries(activityIcons).map(([key, config]) => {
                const Icon = config.icon;
                return (
                  <button key={key} type="button" onClick={() => setActivityType(key)} className={`flex flex-col items-center gap-1 p-2.5 rounded-xl border transition-all text-xs ${activityType === key ? 'border-accent bg-accent/5' : 'border-border hover:border-accent/30'}`}>
                    <Icon className={`w-4 h-4 ${activityType === key ? 'text-accent' : 'text-muted'}`} />
                    <span className={activityType === key ? 'text-accent font-medium' : 'text-muted'}>{config.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-muted mb-1.5">Description</label>
            <textarea value={activityText} onChange={e => setActivityText(e.target.value)} placeholder="Describe the activity..." rows={3} className="w-full px-4 py-2.5 bg-surface rounded-xl border border-border text-sm resize-none" required />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setShowLogActivity(false)} className="px-4 py-2 text-sm text-muted hover:text-foreground transition-colors">Cancel</button>
            <button type="submit" className="px-5 py-2.5 bg-accent hover:bg-accent-hover text-white rounded-xl text-sm font-semibold transition-all">Log Activity</button>
          </div>
        </form>
      </Modal>

      {/* ===== LOG STOCK MODAL ===== */}
      <Modal isOpen={showLogStock} onClose={() => setShowLogStock(false)} title="Update Stock" size="md">
        <form onSubmit={handleLogStock} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-muted mb-1.5">Product Name</label>
            <input type="text" value={stockProduct} onChange={e => setStockProduct(e.target.value)} placeholder="e.g. Royal L-Shaped Sofa" className="w-full px-4 py-2.5 bg-surface rounded-xl border border-border text-sm" required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-muted mb-1.5">Warehouse</label>
              <select value={stockWarehouse} onChange={e => setStockWarehouse(e.target.value)} className="w-full px-4 py-2.5 bg-surface rounded-xl border border-border text-sm">
                <option>Showroom A</option>
                <option>Showroom B</option>
                <option>Main Warehouse</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted mb-1.5">Action</label>
              <select value={stockAction} onChange={e => setStockAction(e.target.value)} className="w-full px-4 py-2.5 bg-surface rounded-xl border border-border text-sm">
                <option>Received</option>
                <option>Stock Out</option>
                <option>Dispatched</option>
                <option>Low Stock Alert</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-muted mb-1.5">Quantity</label>
            <input type="number" min="1" value={stockQty} onChange={e => setStockQty(e.target.value)} placeholder="Enter quantity" className="w-full px-4 py-2.5 bg-surface rounded-xl border border-border text-sm" required />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setShowLogStock(false)} className="px-4 py-2 text-sm text-muted hover:text-foreground transition-colors">Cancel</button>
            <button type="submit" className="px-5 py-2.5 bg-accent hover:bg-accent-hover text-white rounded-xl text-sm font-semibold transition-all">Update Stock</button>
          </div>
        </form>
      </Modal>

      {/* ===== LOG FIELD VISIT MODAL ===== */}
      <Modal isOpen={showLogVisit} onClose={() => setShowLogVisit(false)} title="Schedule Field Visit" size="md">
        <form onSubmit={handleLogVisit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-muted mb-1.5">Customer Name</label>
            <input type="text" value={visitCustomer} onChange={e => setVisitCustomer(e.target.value)} placeholder="Customer name" className="w-full px-4 py-2.5 bg-surface rounded-xl border border-border text-sm" required />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted mb-1.5">Address</label>
            <input type="text" value={visitAddress} onChange={e => setVisitAddress(e.target.value)} placeholder="Full address" className="w-full px-4 py-2.5 bg-surface rounded-xl border border-border text-sm" required />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted mb-1.5">Visit Type</label>
            <select value={visitType} onChange={e => setVisitType(e.target.value)} className="w-full px-4 py-2.5 bg-surface rounded-xl border border-border text-sm">
              <option>Measurement</option>
              <option>Design Consultation</option>
              <option>Delivery Check</option>
              <option>Installation</option>
              <option>Follow-up</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-muted mb-1.5">Notes</label>
            <textarea value={visitNotes} onChange={e => setVisitNotes(e.target.value)} placeholder="Visit details, what to measure..." rows={2} className="w-full px-4 py-2.5 bg-surface rounded-xl border border-border text-sm resize-none" />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted mb-1.5">Measurements (optional)</label>
            <input type="text" value={visitMeasurements} onChange={e => setVisitMeasurements(e.target.value)} placeholder="length: 8 ft, width: 4 ft, height: 3 ft" className="w-full px-4 py-2.5 bg-surface rounded-xl border border-border text-sm" />
            <p className="text-[10px] text-muted mt-1">Format: key: value, key: value</p>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setShowLogVisit(false)} className="px-4 py-2 text-sm text-muted hover:text-foreground transition-colors">Cancel</button>
            <button type="submit" className="px-5 py-2.5 bg-accent hover:bg-accent-hover text-white rounded-xl text-sm font-semibold transition-all">Schedule Visit</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
