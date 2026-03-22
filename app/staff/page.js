'use client';

import { useState, useMemo } from 'react';
import {
  Search, Users, TrendingUp, DollarSign, Award, Clock,
  Phone, Mail, Star, ChevronRight, BarChart3, Target,
  UserCheck, UserX, ShoppingBag, ArrowUpRight, Crown,
  CalendarCheck, LogIn, LogOut, Timer, Activity,
  MapPin, Camera, Ruler, Package, Truck, QrCode,
  Megaphone, ScanLine, MessageSquare, CheckCircle2,
  AlertTriangle, Eye, FileText, Percent, IndianRupee,
  ClipboardList, Warehouse, ArrowDown, ArrowUp, X,
} from 'lucide-react';
import Modal from '@/components/Modal';
import { staff, staffRoles, storeCampaigns } from '@/data/staff';

const statusBadge = (status) => {
  if (status === 'Active') return 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20';
  if (status === 'Off Duty') return 'bg-orange-500/10 text-orange-700 border-orange-500/20';
  return 'bg-zinc-500/10 text-zinc-600 border-zinc-500/20';
};

const attendanceColors = {
  'Present': 'bg-emerald-500/10 text-emerald-700',
  'Absent': 'bg-red-500/10 text-red-700',
  'Half Day': 'bg-amber-500/10 text-amber-700',
  'Off Duty': 'bg-orange-500/10 text-orange-700',
};

const activityIcons = {
  sale: { icon: ShoppingBag, color: 'bg-emerald-500/10 text-emerald-700' },
  call: { icon: Phone, color: 'bg-blue-500/10 text-blue-700' },
  walkin: { icon: Users, color: 'bg-purple-500/10 text-purple-700' },
  stock: { icon: Package, color: 'bg-amber-500/10 text-amber-700' },
  lead: { icon: UserCheck, color: 'bg-teal-500/10 text-teal-700' },
  measurement: { icon: Ruler, color: 'bg-indigo-500/10 text-indigo-700' },
  qr_lead: { icon: QrCode, color: 'bg-pink-500/10 text-pink-700' },
  marketing: { icon: Megaphone, color: 'bg-orange-500/10 text-orange-700' },
};

const stockActionColors = {
  'Stock Out': 'text-red-700 bg-red-500/10',
  'Received': 'text-emerald-700 bg-emerald-500/10',
  'Dispatched': 'text-blue-700 bg-blue-500/10',
  'Low Stock Alert': 'text-amber-700 bg-amber-500/10',
};

export default function StaffPage() {
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('All');
  const [selectedStaff, setSelectedStaff] = useState(null);
  const [tab, setTab] = useState('overview');
  const [staffDetailTab, setStaffDetailTab] = useState('overview');

  const filtered = useMemo(() => staff.filter(s => {
    const matchesSearch = s.name.toLowerCase().includes(search.toLowerCase()) || s.email.toLowerCase().includes(search.toLowerCase());
    const matchesRole = roleFilter === 'All' || s.role === roleFilter;
    return matchesSearch && matchesRole;
  }), [search, roleFilter]);

  const salesStaff = staff.filter(s => s.stats.leadsAssigned > 0);
  const totalRevenue = salesStaff.reduce((sum, s) => sum + s.stats.revenue, 0);
  const totalConversions = salesStaff.reduce((sum, s) => sum + s.stats.conversions, 0);
  const totalLeads = salesStaff.reduce((sum, s) => sum + s.stats.leadsAssigned, 0);
  const avgConversionRate = totalLeads > 0 ? Math.round((totalConversions / totalLeads) * 100) : 0;
  const topPerformer = [...salesStaff].sort((a, b) => b.stats.revenue - a.stats.revenue)[0];
  const todayRevenue = staff.reduce((sum, s) => sum + s.stats.todayRevenue, 0);
  const totalTargetAchieved = staff.reduce((sum, s) => sum + s.target.achieved, 0);
  const totalTarget = staff.reduce((sum, s) => sum + s.target.monthly, 0);
  const totalCommissionEarned = staff.reduce((sum, s) => sum + s.commission.earned, 0);
  const presentToday = staff.filter(s => s.attendance[0]?.status === 'Present').length;

  const tabs = [
    { key: 'overview', label: 'Overview', icon: BarChart3 },
    { key: 'leaderboard', label: 'Leaderboard', icon: Crown },
    { key: 'targets', label: 'Targets & Commission', icon: Target },
    { key: 'attendance', label: 'Attendance', icon: CalendarCheck },
    { key: 'activity', label: 'Activity Log', icon: Activity },
    { key: 'field', label: 'Field Operations', icon: MapPin },
    { key: 'inventory', label: 'Stock Updates', icon: Warehouse },
    { key: 'marketing', label: 'Store Marketing', icon: QrCode },
  ];

  return (
    <div className="space-y-6 animate-[fade-in_0.3s_ease]">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Staff Dashboard</h1>
          <p className="text-sm text-muted mt-1">Performance, attendance, field ops, inventory & marketing</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
            <div className="w-2 h-2 rounded-full bg-emerald-600 animate-pulse" />
            <span className="text-xs font-medium text-emerald-700">{presentToday}/{staff.length} Present Today</span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-hide">
        {tabs.map(t => {
          const Icon = t.icon;
          return (
            <button key={t.key} onClick={() => setTab(t.key)} className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-medium transition-all whitespace-nowrap ${tab === t.key ? 'bg-accent text-white' : 'text-muted hover:text-foreground hover:bg-surface-hover border border-transparent hover:border-border'}`}>
              <Icon className="w-3.5 h-3.5" /> {t.label}
            </button>
          );
        })}
      </div>

      {/* ===== OVERVIEW TAB ===== */}
      {tab === 'overview' && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="glass-card p-4 flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-accent-light"><Users className="w-5 h-5 text-accent" /></div>
              <div><p className="text-xs text-muted">Total Staff</p><p className="text-lg font-bold text-foreground">{staff.length}</p></div>
            </div>
            <div className="glass-card p-4 flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-success-light"><DollarSign className="w-5 h-5 text-success" /></div>
              <div><p className="text-xs text-muted">Total Revenue</p><p className="text-lg font-bold text-success">₹{(totalRevenue / 100000).toFixed(1)}L</p></div>
            </div>
            <div className="glass-card p-4 flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-info-light"><Target className="w-5 h-5 text-info" /></div>
              <div><p className="text-xs text-muted">Avg Conversion</p><p className="text-lg font-bold text-foreground">{avgConversionRate}%</p></div>
            </div>
            <div className="glass-card p-4 flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-purple-light"><ShoppingBag className="w-5 h-5 text-purple" /></div>
              <div><p className="text-xs text-muted">Today&apos;s Revenue</p><p className="text-lg font-bold text-foreground">₹{todayRevenue.toLocaleString()}</p></div>
            </div>
            <div className="glass-card p-4 flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-amber-500/10"><Award className="w-5 h-5 text-amber-700" /></div>
              <div><p className="text-xs text-muted">Top Performer</p><p className="text-lg font-bold text-amber-700">{topPerformer?.name.split(' ')[0] || '-'}</p></div>
            </div>
          </div>

          {/* Filters */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
              <input type="text" placeholder="Search staff..." value={search} onChange={e => setSearch(e.target.value)} className="w-full pl-10 pr-4 py-2.5 bg-surface rounded-xl border border-border text-sm" />
            </div>
            <div className="flex gap-1 flex-wrap">
              {staffRoles.map(r => (
                <button key={r} onClick={() => setRoleFilter(r)} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${roleFilter === r ? 'bg-accent text-white' : 'text-muted hover:text-foreground hover:bg-surface-hover'}`}>{r}</button>
              ))}
            </div>
          </div>

          {/* Staff Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map(member => (
              <div key={member.id} className="glass-card p-5 cursor-pointer hover:border-accent/30 transition-all" onClick={() => { setSelectedStaff(member); setStaffDetailTab('overview'); }}>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-full bg-accent/10 flex items-center justify-center text-sm font-bold text-accent">
                      {member.avatar}
                    </div>
                    <div>
                      <h3 className="font-semibold text-foreground flex items-center gap-2">
                        {member.name}
                        {member.id === topPerformer?.id && <Crown className="w-3.5 h-3.5 text-amber-700" />}
                      </h3>
                      <p className="text-xs text-muted">{member.role}</p>
                    </div>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${statusBadge(member.status)}`}>
                    <span className={`inline-block w-1.5 h-1.5 rounded-full mr-1.5 ${member.status === 'Active' ? 'bg-emerald-600' : member.status === 'Off Duty' ? 'bg-orange-600' : 'bg-zinc-500'}`} />
                    {member.status}
                  </span>
                </div>

                {member.stats.leadsAssigned > 0 ? (
                  <>
                    <div className="grid grid-cols-3 gap-3 mb-3">
                      <div className="bg-surface rounded-lg p-2 text-center">
                        <p className="text-sm font-bold text-foreground">{member.stats.conversions}/{member.stats.leadsAssigned}</p>
                        <p className="text-[10px] text-muted">Converted</p>
                      </div>
                      <div className="bg-surface rounded-lg p-2 text-center">
                        <p className="text-sm font-bold text-foreground">{member.stats.conversionRate}%</p>
                        <p className="text-[10px] text-muted">Rate</p>
                      </div>
                      <div className="bg-surface rounded-lg p-2 text-center">
                        <p className="text-sm font-bold text-success">₹{(member.stats.revenue / 100000).toFixed(1)}L</p>
                        <p className="text-[10px] text-muted">Revenue</p>
                      </div>
                    </div>
                    {/* Target Progress */}
                    <div className="mb-3">
                      <div className="flex items-center justify-between text-[10px] text-muted mb-1">
                        <span>Monthly Target</span>
                        <span>{Math.round((member.target.achieved / member.target.monthly) * 100)}%</span>
                      </div>
                      <div className="h-1.5 bg-surface rounded-full overflow-hidden">
                        <div className="h-full bg-accent rounded-full transition-all" style={{ width: `${Math.min(100, (member.target.achieved / member.target.monthly) * 100)}%` }} />
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-xs text-muted pt-3 border-t border-border">
                      <span className="flex items-center gap-1"><Star className="w-3 h-3 text-amber-700" /> {member.stats.rating}</span>
                      <span>{member.attendance[0]?.clockIn ? `In: ${member.attendance[0].clockIn}` : 'Not clocked in'}</span>
                      <span>Today: ₹{member.stats.todayRevenue.toLocaleString()}</span>
                    </div>
                  </>
                ) : (
                  <div className="bg-surface rounded-lg p-3 text-center text-xs text-muted">
                    <p className="flex items-center justify-center gap-1"><Star className="w-3 h-3 text-amber-700" /> {member.stats.rating} rating</p>
                    <p className="mt-1">{member.role} — {member.activities.length} activities today</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {/* ===== LEADERBOARD TAB ===== */}
      {tab === 'leaderboard' && (
        <div className="space-y-6">
          <div className="glass-card overflow-hidden">
            <div className="p-4 border-b border-border">
              <h3 className="text-base font-semibold text-foreground">Sales Leaderboard — All Time</h3>
            </div>
            <table className="crm-table">
              <thead>
                <tr>
                  <th>Rank</th><th>Staff</th><th>Role</th><th>Leads</th><th>Conversions</th><th>Rate</th><th>Revenue</th><th>Rating</th><th>Today</th>
                </tr>
              </thead>
              <tbody>
                {[...salesStaff].sort((a, b) => b.stats.revenue - a.stats.revenue).map((member, idx) => (
                  <tr key={member.id} className="cursor-pointer" onClick={() => { setSelectedStaff(member); setStaffDetailTab('overview'); }}>
                    <td>
                      <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${idx === 0 ? 'bg-amber-500/20 text-amber-700' : idx === 1 ? 'bg-zinc-500/20 text-zinc-500' : idx === 2 ? 'bg-orange-700/20 text-orange-700' : 'bg-surface text-muted'}`}>{idx + 1}</span>
                    </td>
                    <td><div className="flex items-center gap-2"><div className="w-8 h-8 rounded-full bg-accent/10 flex items-center justify-center text-xs font-bold text-accent">{member.avatar}</div><span className="font-medium text-foreground">{member.name}</span></div></td>
                    <td className="text-muted text-xs">{member.role}</td>
                    <td>{member.stats.leadsAssigned}</td>
                    <td className="text-success font-medium">{member.stats.conversions}</td>
                    <td>
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-1.5 bg-surface rounded-full overflow-hidden"><div className="h-full bg-accent/50 rounded-full" style={{ width: `${member.stats.conversionRate}%` }} /></div>
                        <span className="text-xs text-foreground">{member.stats.conversionRate}%</span>
                      </div>
                    </td>
                    <td className="font-semibold text-success">₹{(member.stats.revenue / 100000).toFixed(1)}L</td>
                    <td><span className="flex items-center gap-1 text-sm"><Star className="w-3.5 h-3.5 text-amber-700" /> {member.stats.rating}</span></td>
                    <td className="font-medium text-foreground">₹{member.stats.todayRevenue.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ===== TARGETS & COMMISSION TAB ===== */}
      {tab === 'targets' && (
        <div className="space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div className="glass-card p-4 flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-accent-light"><Target className="w-5 h-5 text-accent" /></div>
              <div><p className="text-xs text-muted">Total Target</p><p className="text-lg font-bold text-foreground">₹{(totalTarget / 100000).toFixed(1)}L</p></div>
            </div>
            <div className="glass-card p-4 flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-success-light"><TrendingUp className="w-5 h-5 text-success" /></div>
              <div><p className="text-xs text-muted">Achieved</p><p className="text-lg font-bold text-success">₹{(totalTargetAchieved / 100000).toFixed(1)}L</p></div>
            </div>
            <div className="glass-card p-4 flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-purple-light"><Percent className="w-5 h-5 text-purple" /></div>
              <div><p className="text-xs text-muted">Overall Progress</p><p className="text-lg font-bold text-foreground">{totalTarget > 0 ? Math.round((totalTargetAchieved / totalTarget) * 100) : 0}%</p></div>
            </div>
            <div className="glass-card p-4 flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-amber-500/10"><IndianRupee className="w-5 h-5 text-amber-700" /></div>
              <div><p className="text-xs text-muted">Commission Paid</p><p className="text-lg font-bold text-amber-700">₹{(totalCommissionEarned / 1000).toFixed(0)}K</p></div>
            </div>
          </div>

          {/* Per-Staff Targets */}
          <div className="glass-card overflow-hidden">
            <div className="p-4 border-b border-border">
              <h3 className="text-base font-semibold text-foreground">Monthly Targets — March 2026</h3>
            </div>
            <div className="divide-y divide-border">
              {staff.filter(s => s.target.monthly > 0).map(member => {
                const pct = Math.round((member.target.achieved / member.target.monthly) * 100);
                const remaining = member.target.monthly - member.target.achieved;
                return (
                  <div key={member.id} className="p-5">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center text-sm font-bold text-accent">{member.avatar}</div>
                        <div>
                          <h4 className="text-sm font-semibold text-foreground">{member.name}</h4>
                          <p className="text-xs text-muted">{member.role}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold text-foreground">₹{(member.target.achieved / 1000).toFixed(0)}K <span className="text-muted font-normal">/ ₹{(member.target.monthly / 1000).toFixed(0)}K</span></p>
                        <p className={`text-xs font-medium ${pct >= 80 ? 'text-emerald-700' : pct >= 50 ? 'text-amber-700' : 'text-red-700'}`}>
                          {pct >= 100 ? 'Target Achieved!' : `₹${(remaining / 1000).toFixed(0)}K remaining`}
                        </p>
                      </div>
                    </div>
                    <div className="h-2.5 bg-surface rounded-full overflow-hidden mb-3">
                      <div className={`h-full rounded-full transition-all ${pct >= 80 ? 'bg-emerald-600' : pct >= 50 ? 'bg-amber-600' : 'bg-red-600'}`} style={{ width: `${Math.min(100, pct)}%` }} />
                    </div>
                    <div className="flex items-center justify-between text-xs text-muted">
                      <span>Commission Rate: {member.commission.rate}%</span>
                      <span>Earned: <span className="font-semibold text-emerald-700">₹{member.commission.earned.toLocaleString()}</span></span>
                      <span>Pending: <span className="font-semibold text-amber-700">₹{member.commission.pending.toLocaleString()}</span></span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ===== ATTENDANCE TAB ===== */}
      {tab === 'attendance' && (
        <div className="space-y-6">
          {/* Today's Status */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div className="glass-card p-4 flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-emerald-500/10"><UserCheck className="w-5 h-5 text-emerald-700" /></div>
              <div><p className="text-xs text-muted">Present</p><p className="text-lg font-bold text-emerald-700">{staff.filter(s => s.attendance[0]?.status === 'Present').length}</p></div>
            </div>
            <div className="glass-card p-4 flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-red-500/10"><UserX className="w-5 h-5 text-red-700" /></div>
              <div><p className="text-xs text-muted">Absent</p><p className="text-lg font-bold text-red-700">{staff.filter(s => s.attendance[0]?.status === 'Absent').length}</p></div>
            </div>
            <div className="glass-card p-4 flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-amber-500/10"><Clock className="w-5 h-5 text-amber-700" /></div>
              <div><p className="text-xs text-muted">Half Day</p><p className="text-lg font-bold text-amber-700">{staff.filter(s => s.attendance[0]?.status === 'Half Day').length}</p></div>
            </div>
            <div className="glass-card p-4 flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-orange-500/10"><Timer className="w-5 h-5 text-orange-700" /></div>
              <div><p className="text-xs text-muted">Off Duty</p><p className="text-lg font-bold text-orange-700">{staff.filter(s => s.attendance[0]?.status === 'Off Duty').length}</p></div>
            </div>
          </div>

          {/* Attendance Table */}
          <div className="glass-card overflow-hidden">
            <div className="p-4 border-b border-border">
              <h3 className="text-base font-semibold text-foreground">Attendance Log — Last 7 Days</h3>
            </div>
            <table className="crm-table">
              <thead>
                <tr>
                  <th>Staff</th>
                  {staff[0].attendance.map(a => (
                    <th key={a.date} className="text-center">{new Date(a.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</th>
                  ))}
                  <th className="text-center">Avg Hours</th>
                </tr>
              </thead>
              <tbody>
                {staff.map(member => {
                  const totalHours = member.attendance.reduce((s, a) => s + (a.hours || 0), 0);
                  const workDays = member.attendance.filter(a => a.hours > 0).length;
                  const avgHours = workDays > 0 ? (totalHours / workDays).toFixed(1) : '0';
                  return (
                    <tr key={member.id}>
                      <td>
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-accent/10 flex items-center justify-center text-xs font-bold text-accent">{member.avatar}</div>
                          <div>
                            <p className="font-medium text-foreground text-sm">{member.name}</p>
                            <p className="text-[10px] text-muted">{member.role}</p>
                          </div>
                        </div>
                      </td>
                      {member.attendance.map(a => (
                        <td key={a.date} className="text-center">
                          <div className="flex flex-col items-center gap-0.5">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${attendanceColors[a.status]}`}>
                              {a.status === 'Present' ? (a.clockOut ? `${a.hours}h` : 'In') : a.status === 'Half Day' ? `${a.hours}h` : a.status.charAt(0)}
                            </span>
                            {a.clockIn && <span className="text-[9px] text-muted">{a.clockIn}</span>}
                          </div>
                        </td>
                      ))}
                      <td className="text-center font-semibold text-foreground">{avgHours}h</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Today Clock Status */}
          <div className="glass-card p-5">
            <h3 className="text-base font-semibold text-foreground mb-4">Today&apos;s Clock In/Out</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {staff.map(member => {
                const today = member.attendance[0];
                return (
                  <div key={member.id} className="bg-surface rounded-xl p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold ${today?.status === 'Present' ? 'bg-emerald-500/10 text-emerald-700' : 'bg-zinc-500/10 text-zinc-500'}`}>{member.avatar}</div>
                      <div>
                        <p className="text-sm font-medium text-foreground">{member.name}</p>
                        <span className={`text-[10px] font-medium ${attendanceColors[today?.status] || ''} px-1.5 py-0.5 rounded`}>{today?.status}</span>
                      </div>
                    </div>
                    <div className="text-right text-xs">
                      {today?.clockIn ? (
                        <>
                          <p className="text-emerald-700 flex items-center gap-1 justify-end"><LogIn className="w-3 h-3" /> {today.clockIn}</p>
                          {today.clockOut ? <p className="text-red-700 flex items-center gap-1 justify-end mt-0.5"><LogOut className="w-3 h-3" /> {today.clockOut}</p> : <p className="text-muted">Still working</p>}
                        </>
                      ) : <p className="text-muted">—</p>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ===== ACTIVITY LOG TAB ===== */}
      {tab === 'activity' && (
        <div className="space-y-6">
          <div className="glass-card p-5">
            <h3 className="text-base font-semibold text-foreground mb-4">All Staff Activity — Today</h3>
            <div className="space-y-2">
              {staff.flatMap(s => s.activities.filter(a => a.date === '2026-03-21').map(a => ({ ...a, staffName: s.name, staffAvatar: s.avatar, staffRole: s.role }))).sort((a, b) => {
                const tA = new Date(`2026-03-21 ${a.time}`);
                const tB = new Date(`2026-03-21 ${b.time}`);
                return tB - tA;
              }).map((act, i) => {
                const config = activityIcons[act.type] || activityIcons.walkin;
                const Icon = config.icon;
                return (
                  <div key={i} className="flex items-start gap-3 p-3 rounded-xl bg-surface hover:bg-surface-hover transition-colors">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${config.color}`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-foreground">{act.text}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] text-muted">{act.time}</span>
                        <span className="text-[10px] text-accent font-medium">{act.staffName}</span>
                        <span className="text-[10px] text-muted">· {act.staffRole}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Tasks Summary */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: 'Sales Made', count: staff.flatMap(s => s.activities.filter(a => a.date === '2026-03-21' && a.type === 'sale')).length, icon: ShoppingBag, color: 'bg-emerald-500/10 text-emerald-700' },
              { label: 'Calls Made', count: staff.flatMap(s => s.activities.filter(a => a.date === '2026-03-21' && a.type === 'call')).length, icon: Phone, color: 'bg-blue-500/10 text-blue-700' },
              { label: 'Walk-ins Handled', count: staff.flatMap(s => s.activities.filter(a => a.date === '2026-03-21' && a.type === 'walkin')).length, icon: Users, color: 'bg-purple-500/10 text-purple-700' },
              { label: 'Stock Updates', count: staff.flatMap(s => s.activities.filter(a => a.date === '2026-03-21' && a.type === 'stock')).length, icon: Package, color: 'bg-amber-500/10 text-amber-700' },
            ].map((item, i) => {
              const Icon = item.icon;
              return (
                <div key={i} className="glass-card p-4 flex items-center gap-3">
                  <div className={`p-2.5 rounded-xl ${item.color}`}><Icon className="w-5 h-5" /></div>
                  <div><p className="text-xs text-muted">{item.label}</p><p className="text-lg font-bold text-foreground">{item.count}</p></div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ===== FIELD OPERATIONS TAB ===== */}
      {tab === 'field' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="glass-card p-4 flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-indigo-500/10"><MapPin className="w-5 h-5 text-indigo-700" /></div>
              <div><p className="text-xs text-muted">Scheduled Visits</p><p className="text-lg font-bold text-foreground">{staff.flatMap(s => s.fieldVisits.filter(v => v.status === 'Scheduled')).length}</p></div>
            </div>
            <div className="glass-card p-4 flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-emerald-500/10"><CheckCircle2 className="w-5 h-5 text-emerald-700" /></div>
              <div><p className="text-xs text-muted">Completed</p><p className="text-lg font-bold text-emerald-700">{staff.flatMap(s => s.fieldVisits.filter(v => v.status === 'Completed')).length}</p></div>
            </div>
            <div className="glass-card p-4 flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-blue-500/10"><Ruler className="w-5 h-5 text-blue-700" /></div>
              <div><p className="text-xs text-muted">Measurements Taken</p><p className="text-lg font-bold text-foreground">{staff.flatMap(s => s.fieldVisits.filter(v => v.measurements)).length}</p></div>
            </div>
          </div>

          {/* All Field Visits */}
          <div className="space-y-4">
            {staff.filter(s => s.fieldVisits.length > 0).map(member => (
              <div key={member.id} className="glass-card p-5">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center text-sm font-bold text-accent">{member.avatar}</div>
                  <div>
                    <h4 className="text-sm font-semibold text-foreground">{member.name}</h4>
                    <p className="text-xs text-muted">{member.role} — {member.fieldVisits.length} visit(s)</p>
                  </div>
                </div>
                <div className="space-y-3">
                  {member.fieldVisits.map(visit => (
                    <div key={visit.id} className="bg-surface rounded-xl p-4 border border-border">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <p className="text-sm font-semibold text-foreground">{visit.customer}</p>
                          <p className="text-xs text-muted flex items-center gap-1 mt-0.5"><MapPin className="w-3 h-3" /> {visit.address}</p>
                        </div>
                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-medium ${visit.status === 'Completed' ? 'bg-emerald-500/10 text-emerald-700' : visit.status === 'In Progress' ? 'bg-blue-500/10 text-blue-700' : 'bg-amber-500/10 text-amber-700'}`}>
                          {visit.status}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 text-xs text-muted mb-2">
                        <span>{visit.date} · {visit.time}</span>
                        <span className="px-2 py-0.5 rounded bg-surface-hover text-foreground">{visit.type}</span>
                      </div>
                      <p className="text-xs text-muted mb-2">{visit.notes}</p>
                      <div className="flex items-center gap-4">
                        {visit.measurements && (
                          <div className="flex items-center gap-1 text-xs text-indigo-700">
                            <Ruler className="w-3 h-3" />
                            {Object.entries(visit.measurements).map(([k, v]) => `${k}: ${v}`).join(' · ')}
                          </div>
                        )}
                        {visit.photos && (
                          <span className="flex items-center gap-1 text-xs text-purple-700"><Camera className="w-3 h-3" /> {visit.photos} photos</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ===== STOCK UPDATES TAB ===== */}
      {tab === 'inventory' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            {[
              { label: 'Items Received', count: staff.flatMap(s => s.stockUpdates.filter(u => u.action === 'Received')).reduce((s, u) => s + u.qty, 0), icon: ArrowDown, color: 'bg-emerald-500/10 text-emerald-700' },
              { label: 'Items Sold Out', count: staff.flatMap(s => s.stockUpdates.filter(u => u.action === 'Stock Out')).reduce((s, u) => s + u.qty, 0), icon: ArrowUp, color: 'bg-red-500/10 text-red-700' },
              { label: 'Dispatched', count: staff.flatMap(s => s.stockUpdates.filter(u => u.action === 'Dispatched')).reduce((s, u) => s + u.qty, 0), icon: Truck, color: 'bg-blue-500/10 text-blue-700' },
              { label: 'Low Stock Alerts', count: staff.flatMap(s => s.stockUpdates.filter(u => u.action === 'Low Stock Alert')).length, icon: AlertTriangle, color: 'bg-amber-500/10 text-amber-700' },
            ].map((item, i) => {
              const Icon = item.icon;
              return (
                <div key={i} className="glass-card p-4 flex items-center gap-3">
                  <div className={`p-2.5 rounded-xl ${item.color}`}><Icon className="w-5 h-5" /></div>
                  <div><p className="text-xs text-muted">{item.label}</p><p className="text-lg font-bold text-foreground">{item.count}</p></div>
                </div>
              );
            })}
          </div>

          {/* Stock Updates Timeline */}
          <div className="glass-card overflow-hidden">
            <div className="p-4 border-b border-border">
              <h3 className="text-base font-semibold text-foreground">Stock Updates by Staff</h3>
            </div>
            <table className="crm-table">
              <thead>
                <tr><th>Staff</th><th>Product</th><th>Warehouse</th><th>Action</th><th>Qty</th><th>Date & Time</th></tr>
              </thead>
              <tbody>
                {staff.flatMap(s => s.stockUpdates.map(u => ({ ...u, staffName: s.name, staffAvatar: s.avatar }))).sort((a, b) => new Date(`${b.date} ${b.time}`) - new Date(`${a.date} ${a.time}`)).map((u, i) => (
                  <tr key={i}>
                    <td><div className="flex items-center gap-2"><div className="w-7 h-7 rounded-full bg-accent/10 flex items-center justify-center text-[10px] font-bold text-accent">{u.staffAvatar}</div><span className="text-sm">{u.staffName}</span></div></td>
                    <td className="font-medium text-foreground">{u.product}</td>
                    <td className="text-muted text-xs">{u.warehouse}</td>
                    <td><span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${stockActionColors[u.action]}`}>{u.action}</span></td>
                    <td className="font-semibold">{u.qty}</td>
                    <td className="text-xs text-muted">{u.date} · {u.time}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ===== STORE MARKETING TAB ===== */}
      {tab === 'marketing' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div className="glass-card p-4 flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-accent-light"><QrCode className="w-5 h-5 text-accent" /></div>
              <div><p className="text-xs text-muted">Active QR Codes</p><p className="text-lg font-bold text-foreground">{storeCampaigns.filter(c => c.status === 'Active').length}</p></div>
            </div>
            <div className="glass-card p-4 flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-blue-500/10"><ScanLine className="w-5 h-5 text-blue-700" /></div>
              <div><p className="text-xs text-muted">Total Scans</p><p className="text-lg font-bold text-blue-700">{storeCampaigns.reduce((s, c) => s + c.scans, 0)}</p></div>
            </div>
            <div className="glass-card p-4 flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-emerald-500/10"><UserCheck className="w-5 h-5 text-emerald-700" /></div>
              <div><p className="text-xs text-muted">Leads Captured</p><p className="text-lg font-bold text-emerald-700">{storeCampaigns.reduce((s, c) => s + c.leads, 0)}</p></div>
            </div>
            <div className="glass-card p-4 flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-purple-500/10"><Percent className="w-5 h-5 text-purple-700" /></div>
              <div><p className="text-xs text-muted">Conversion Rate</p><p className="text-lg font-bold text-foreground">{Math.round((storeCampaigns.reduce((s, c) => s + c.leads, 0) / storeCampaigns.reduce((s, c) => s + c.scans, 0)) * 100)}%</p></div>
            </div>
          </div>

          {/* QR Campaigns */}
          <div className="glass-card p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-foreground">In-Store QR Campaigns</h3>
              <button className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-hover text-white rounded-xl text-sm font-medium transition-all">
                <QrCode className="w-4 h-4" /> Generate QR
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {storeCampaigns.map(campaign => (
                <div key={campaign.id} className="bg-surface rounded-xl p-4 border border-border">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h4 className="text-sm font-semibold text-foreground">{campaign.name}</h4>
                      <p className="text-xs text-muted flex items-center gap-1 mt-0.5"><MapPin className="w-3 h-3" /> {campaign.location}</p>
                    </div>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${campaign.status === 'Active' ? 'bg-emerald-500/10 text-emerald-700' : 'bg-zinc-500/10 text-zinc-600'}`}>
                      {campaign.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 mb-3">
                    <span className="px-2 py-0.5 rounded bg-surface-hover text-xs text-foreground">{campaign.type}</span>
                    {campaign.purpose && <span className="px-2 py-0.5 rounded bg-accent/10 text-xs text-accent">{campaign.purpose}</span>}
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="bg-surface-hover rounded-lg p-2 text-center">
                      <p className="text-sm font-bold text-foreground">{campaign.scans}</p>
                      <p className="text-[10px] text-muted">Scans</p>
                    </div>
                    <div className="bg-surface-hover rounded-lg p-2 text-center">
                      <p className="text-sm font-bold text-emerald-700">{campaign.leads}</p>
                      <p className="text-[10px] text-muted">Leads</p>
                    </div>
                    <div className="bg-surface-hover rounded-lg p-2 text-center">
                      <p className="text-sm font-bold text-foreground">{campaign.scans > 0 ? Math.round((campaign.leads / campaign.scans) * 100) : 0}%</p>
                      <p className="text-[10px] text-muted">Conv.</p>
                    </div>
                  </div>
                  <p className="text-[10px] text-muted mt-2">Created: {campaign.created}</p>
                </div>
              ))}
            </div>
          </div>

          {/* QR Use Cases */}
          <div className="glass-card p-5">
            <h3 className="text-base font-semibold text-foreground mb-4">QR Code Use Cases</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {[
                { title: 'Walk-in Lead Capture', desc: 'Customer scans QR → Opens WhatsApp → Auto-captures contact', icon: UserCheck, color: 'bg-emerald-500/10 text-emerald-700' },
                { title: 'In-Store Offers', desc: 'Scan to view current discounts and seasonal deals', icon: Megaphone, color: 'bg-amber-500/10 text-amber-700' },
                { title: 'Feedback Collection', desc: 'Post-purchase feedback via QR at billing counter', icon: MessageSquare, color: 'bg-blue-500/10 text-blue-700' },
                { title: 'Custom Order Inquiry', desc: 'Scan at design corner to start custom furniture request', icon: Ruler, color: 'bg-purple-500/10 text-purple-700' },
              ].map((uc, i) => {
                const Icon = uc.icon;
                return (
                  <div key={i} className="bg-surface rounded-xl p-4 border border-border">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${uc.color}`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <h4 className="text-sm font-semibold text-foreground mb-1">{uc.title}</h4>
                    <p className="text-xs text-muted">{uc.desc}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ===== STAFF DETAIL MODAL ===== */}
      <Modal isOpen={!!selectedStaff} onClose={() => setSelectedStaff(null)} title="Staff Profile" size="xl">
        {selectedStaff && (
          <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-full bg-accent/10 flex items-center justify-center text-xl font-bold text-accent">{selectedStaff.avatar}</div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
                  {selectedStaff.name}
                  {selectedStaff.id === topPerformer?.id && <Crown className="w-4 h-4 text-amber-700" />}
                </h3>
                <p className="text-sm text-muted">{selectedStaff.role}</p>
                <div className="flex items-center gap-3 text-xs text-muted mt-1">
                  <span className="flex items-center gap-1"><Phone className="w-3 h-3" /> {selectedStaff.phone}</span>
                  <span className="flex items-center gap-1"><Mail className="w-3 h-3" /> {selectedStaff.email}</span>
                </div>
              </div>
              <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${statusBadge(selectedStaff.status)}`}>{selectedStaff.status}</span>
            </div>

            {/* Detail Tabs */}
            <div className="flex gap-1 border-b border-border pb-0">
              {[
                { key: 'overview', label: 'Overview' },
                { key: 'activity', label: 'Activity' },
                { key: 'field', label: 'Field Visits' },
                { key: 'stock', label: 'Stock' },
                { key: 'attendance', label: 'Attendance' },
              ].map(t => (
                <button key={t.key} onClick={() => setStaffDetailTab(t.key)} className={`px-3 py-2 text-xs font-medium transition-all border-b-2 ${staffDetailTab === t.key ? 'border-accent text-accent' : 'border-transparent text-muted hover:text-foreground'}`}>{t.label}</button>
              ))}
            </div>

            {/* Detail: Overview */}
            {staffDetailTab === 'overview' && (
              <div className="space-y-4">
                {selectedStaff.stats.leadsAssigned > 0 && (
                  <>
                    <div className="grid grid-cols-4 gap-3">
                      <div className="bg-surface rounded-xl p-3 text-center">
                        <p className="text-xl font-bold text-foreground">{selectedStaff.stats.leadsAssigned}</p>
                        <p className="text-[10px] text-muted">Leads</p>
                      </div>
                      <div className="bg-surface rounded-xl p-3 text-center">
                        <p className="text-xl font-bold text-success">{selectedStaff.stats.conversions}</p>
                        <p className="text-[10px] text-muted">Converted</p>
                      </div>
                      <div className="bg-surface rounded-xl p-3 text-center">
                        <p className="text-xl font-bold text-foreground">{selectedStaff.stats.conversionRate}%</p>
                        <p className="text-[10px] text-muted">Rate</p>
                      </div>
                      <div className="bg-surface rounded-xl p-3 text-center">
                        <p className="text-xl font-bold text-success">₹{(selectedStaff.stats.revenue / 100000).toFixed(1)}L</p>
                        <p className="text-[10px] text-muted">Revenue</p>
                      </div>
                    </div>

                    {/* Target */}
                    <div className="bg-surface rounded-xl p-4">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs font-semibold text-muted">Monthly Target Progress</p>
                        <p className="text-sm font-bold text-foreground">{Math.round((selectedStaff.target.achieved / selectedStaff.target.monthly) * 100)}%</p>
                      </div>
                      <div className="h-2.5 bg-surface-hover rounded-full overflow-hidden mb-2">
                        <div className="h-full bg-accent rounded-full" style={{ width: `${Math.min(100, (selectedStaff.target.achieved / selectedStaff.target.monthly) * 100)}%` }} />
                      </div>
                      <div className="flex justify-between text-xs text-muted">
                        <span>₹{(selectedStaff.target.achieved / 1000).toFixed(0)}K achieved</span>
                        <span>Target: ₹{(selectedStaff.target.monthly / 1000).toFixed(0)}K</span>
                      </div>
                    </div>

                    {/* Commission */}
                    <div className="grid grid-cols-3 gap-3">
                      <div className="bg-surface rounded-xl p-3">
                        <p className="text-xs text-muted mb-1">Commission Rate</p>
                        <p className="text-sm font-bold text-foreground">{selectedStaff.commission.rate}%</p>
                      </div>
                      <div className="bg-surface rounded-xl p-3">
                        <p className="text-xs text-muted mb-1">Earned</p>
                        <p className="text-sm font-bold text-emerald-700">₹{selectedStaff.commission.earned.toLocaleString()}</p>
                      </div>
                      <div className="bg-surface rounded-xl p-3">
                        <p className="text-xs text-muted mb-1">Pending</p>
                        <p className="text-sm font-bold text-amber-700">₹{selectedStaff.commission.pending.toLocaleString()}</p>
                      </div>
                    </div>
                  </>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-surface rounded-xl p-3">
                    <p className="text-xs text-muted mb-1">Rating</p>
                    <p className="text-sm font-medium text-foreground flex items-center gap-1"><Star className="w-3.5 h-3.5 text-amber-700" /> {selectedStaff.stats.rating} / 5</p>
                  </div>
                  <div className="bg-surface rounded-xl p-3">
                    <p className="text-xs text-muted mb-1">Joined</p>
                    <p className="text-sm font-medium text-foreground">{selectedStaff.joinDate}</p>
                  </div>
                </div>

                {selectedStaff.recentSales.length > 0 && (
                  <div>
                    <p className="text-xs text-muted mb-2 uppercase tracking-wider">Recent Sales</p>
                    <div className="space-y-2">
                      {selectedStaff.recentSales.map((sale, idx) => (
                        <div key={idx} className="flex items-center justify-between bg-surface rounded-lg p-3">
                          <div>
                            <p className="text-sm font-medium text-foreground">{sale.product}</p>
                            <p className="text-xs text-muted">{sale.customer} · {sale.date}</p>
                          </div>
                          <span className="text-sm font-semibold text-success">₹{sale.amount.toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Detail: Activity */}
            {staffDetailTab === 'activity' && (
              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {selectedStaff.activities.map((act, i) => {
                  const config = activityIcons[act.type] || activityIcons.walkin;
                  const Icon = config.icon;
                  return (
                    <div key={i} className="flex items-start gap-3 p-3 rounded-xl bg-surface">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${config.color}`}><Icon className="w-4 h-4" /></div>
                      <div>
                        <p className="text-sm text-foreground">{act.text}</p>
                        <p className="text-[10px] text-muted">{act.date} · {act.time}</p>
                      </div>
                    </div>
                  );
                })}
                {selectedStaff.activities.length === 0 && <p className="text-sm text-muted text-center py-6">No activities recorded</p>}
              </div>
            )}

            {/* Detail: Field Visits */}
            {staffDetailTab === 'field' && (
              <div className="space-y-3 max-h-[400px] overflow-y-auto">
                {selectedStaff.fieldVisits.map(visit => (
                  <div key={visit.id} className="bg-surface rounded-xl p-4 border border-border">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <p className="text-sm font-semibold text-foreground">{visit.customer}</p>
                        <p className="text-xs text-muted flex items-center gap-1"><MapPin className="w-3 h-3" /> {visit.address}</p>
                      </div>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${visit.status === 'Completed' ? 'bg-emerald-500/10 text-emerald-700' : visit.status === 'In Progress' ? 'bg-blue-500/10 text-blue-700' : 'bg-amber-500/10 text-amber-700'}`}>{visit.status}</span>
                    </div>
                    <p className="text-xs text-muted mb-2">{visit.date} · {visit.time} · {visit.type}</p>
                    <p className="text-xs text-foreground mb-2">{visit.notes}</p>
                    {visit.measurements && (
                      <div className="bg-surface-hover rounded-lg p-2 mb-2">
                        <p className="text-[10px] text-muted mb-1">Measurements</p>
                        <div className="flex flex-wrap gap-2">
                          {Object.entries(visit.measurements).map(([k, v]) => (
                            <span key={k} className="px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-700 text-[10px]">{k}: {v}</span>
                          ))}
                        </div>
                      </div>
                    )}
                    {visit.photos && <p className="text-xs text-purple-700 flex items-center gap-1"><Camera className="w-3 h-3" /> {visit.photos} photos uploaded</p>}
                  </div>
                ))}
                {selectedStaff.fieldVisits.length === 0 && <p className="text-sm text-muted text-center py-6">No field visits</p>}
              </div>
            )}

            {/* Detail: Stock */}
            {staffDetailTab === 'stock' && (
              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {selectedStaff.stockUpdates.map((u, i) => (
                  <div key={i} className="flex items-center justify-between bg-surface rounded-xl p-3">
                    <div>
                      <p className="text-sm font-medium text-foreground">{u.product}</p>
                      <p className="text-xs text-muted">{u.warehouse} · {u.date} · {u.time}</p>
                    </div>
                    <div className="text-right">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${stockActionColors[u.action]}`}>{u.action}</span>
                      <p className="text-xs font-semibold text-foreground mt-1">Qty: {u.qty}</p>
                    </div>
                  </div>
                ))}
                {selectedStaff.stockUpdates.length === 0 && <p className="text-sm text-muted text-center py-6">No stock updates</p>}
              </div>
            )}

            {/* Detail: Attendance */}
            {staffDetailTab === 'attendance' && (
              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {selectedStaff.attendance.map((a, i) => (
                  <div key={i} className="flex items-center justify-between bg-surface rounded-xl p-3">
                    <div className="flex items-center gap-3">
                      <span className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold ${attendanceColors[a.status]}`}>
                        {new Date(a.date).getDate()}
                      </span>
                      <div>
                        <p className="text-sm font-medium text-foreground">{new Date(a.date).toLocaleDateString('en-IN', { weekday: 'short', month: 'short', day: 'numeric' })}</p>
                        <span className={`text-[10px] font-medium ${attendanceColors[a.status]} px-1.5 py-0.5 rounded`}>{a.status}</span>
                      </div>
                    </div>
                    <div className="text-right text-xs">
                      {a.clockIn ? (
                        <>
                          <p className="text-emerald-700"><LogIn className="w-3 h-3 inline mr-1" />{a.clockIn}</p>
                          {a.clockOut && <p className="text-red-700 mt-0.5"><LogOut className="w-3 h-3 inline mr-1" />{a.clockOut}</p>}
                          {a.hours && <p className="text-muted mt-0.5">{a.hours}h worked</p>}
                        </>
                      ) : <p className="text-muted">—</p>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
