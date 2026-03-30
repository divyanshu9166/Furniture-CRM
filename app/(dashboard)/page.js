'use client';

import { useState, useEffect } from 'react';
import { Users, Calendar, ShoppingCart, DollarSign, AlertTriangle, TrendingUp, ArrowRight, Clock, MessageSquare, Instagram, Globe, Facebook, Bot, MapPin, CheckCircle2, Ruler, Loader, Target, Percent } from 'lucide-react';
import StatCard from '@/components/StatCard';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { getDashboardStats } from '@/app/actions/dashboard';

const sourceIconMap = {
  WhatsApp: MessageSquare,
  Instagram: Instagram,
  Facebook: Facebook,
  Website: Globe,
};

const sourceColorMap = {
  WhatsApp: 'text-success',
  Instagram: 'text-pink',
  Facebook: 'text-info',
  Website: 'text-teal',
};

const statusDisplayMap = {
  NEW: 'New',
  CONTACTED: 'Contacted',
  SHOWROOM_VISIT: 'Showroom Visit',
  QUOTATION: 'Quotation',
  WON: 'Converted',
  LOST: 'Lost',
};

const formatCompactINR = (value) => `₹${Intl.NumberFormat('en-IN', { notation: 'compact', maximumFractionDigits: 1 }).format(value || 0)}`;

const formatPctChange = (value) => {
  if (value > 0) return `+${value}%`;
  if (value < 0) return `${value}%`;
  return '0%';
};

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-surface border border-border rounded-xl px-4 py-2.5 shadow-lg">
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className="text-sm text-accent font-semibold">{payload[0].value} units sold</p>
      </div>
    );
  }
  return null;
};

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getDashboardStats().then(res => {
      if (res.success) setStats(res.data);
      setLoading(false);
    });
  }, []);

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 w-48 bg-surface rounded-lg" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-5">
          {[1,2,3,4].map(i => <div key={i} className="h-28 bg-surface rounded-2xl" />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 h-80 bg-surface rounded-2xl" />
          <div className="h-80 bg-surface rounded-2xl" />
        </div>
      </div>
    );
  }

  if (!stats) return null;

  const todayStr = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const dayStr = new Date().toLocaleDateString('en-US', { weekday: 'long' });
  const pipeline = stats.pipeline || [];
  const maxPipelineCount = Math.max(1, ...pipeline.map(p => p.count || 0));

  return (
    <div className="space-y-6 animate-[fade-in_0.5s_ease-out]">
      {/* Page Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl md:text-2xl font-bold text-foreground">Dashboard</h1>
          <p className="text-xs md:text-sm text-muted mt-1">Welcome back! Here&apos;s your store overview for today.</p>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-xs md:text-sm font-medium text-foreground">{todayStr}</p>
          <p className="text-[10px] md:text-xs text-muted">{dayStr}</p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-5">
        <StatCard
          title="Revenue (MTD)"
          value={formatCompactINR(stats.kpis?.revenueMtd || 0)}
          change={formatPctChange(stats.kpis?.revenueChangePct || 0)}
          changeType={(stats.kpis?.revenueChangePct || 0) >= 0 ? 'up' : 'down'}
          icon={DollarSign}
          color="success"
        />
        <StatCard
          title="Lead Conversion"
          value={`${stats.kpis?.conversionRate || 0}%`}
          change={`${(stats.kpis?.conversionChangePct || 0) > 0 ? '+' : ''}${stats.kpis?.conversionChangePct || 0} pts`}
          changeType={(stats.kpis?.conversionChangePct || 0) >= 0 ? 'up' : 'down'}
          icon={TrendingUp}
          color="accent"
        />
        <StatCard
          title="Avg Order Value"
          value={formatCompactINR(stats.kpis?.avgOrderValue || 0)}
          change={formatPctChange(stats.kpis?.avgOrderValueChangePct || 0)}
          changeType={(stats.kpis?.avgOrderValueChangePct || 0) >= 0 ? 'up' : 'down'}
          icon={ShoppingCart}
          color="purple"
        />
        <StatCard
          title="Pending Collections"
          value={formatCompactINR(stats.kpis?.pendingCollections || 0)}
          change={`${stats.kpis?.overdueInvoices || 0} overdue`}
          changeType={(stats.kpis?.overdueInvoices || 0) === 0 ? 'up' : 'down'}
          icon={AlertTriangle}
          color="teal"
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-5">
        {/* Best Selling Chart */}
        <div className="lg:col-span-2 glass-card p-5">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-base font-semibold text-foreground">Best Selling Furniture</h2>
              <p className="text-xs text-muted mt-0.5">Top 8 products by units sold</p>
            </div>
            <TrendingUp className="w-5 h-5 text-accent" />
          </div>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={stats.bestSellers} barSize={32} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
              <XAxis dataKey="name" tick={{ fill: '#71717a', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#71717a', fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(245,158,11,0.05)' }} />
              <Bar dataKey="sold" fill="url(#barGradient)" radius={[6, 6, 0, 0]} />
              <defs>
                <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#f59e0b" />
                  <stop offset="100%" stopColor="#d97706" />
                </linearGradient>
              </defs>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Low Stock Alerts */}
        <div className="glass-card p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-semibold text-foreground">Stock Alerts</h2>
              <p className="text-xs text-muted mt-0.5">Items running low</p>
            </div>
            <AlertTriangle className="w-5 h-5 text-danger" />
          </div>
          <div className="space-y-3">
            {stats.lowStockItems.map((item) => (
              <div key={item.id} className="flex items-center gap-3 p-3 rounded-xl bg-surface hover:bg-surface-hover transition-colors">
                <span className="text-2xl">{item.image}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{item.name}</p>
                  <p className="text-xs text-muted">{item.category}</p>
                </div>
                <span className={`badge ${item.stock === 0 ? 'bg-danger-light text-danger' : 'bg-warning-light text-warning'}`}>
                  {item.stock === 0 ? 'Out' : `${item.stock} left`}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Conversion + Action Analytics */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-5">
        {/* Funnel */}
        <div className="glass-card p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-semibold text-foreground">Sales Funnel</h2>
              <p className="text-xs text-muted mt-0.5">Current lead stage distribution</p>
            </div>
            <Target className="w-5 h-5 text-accent" />
          </div>
          <div className="space-y-2.5">
            {pipeline.map(stage => (
              <div key={stage.key}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-foreground">{stage.label}</span>
                  <span className="text-xs font-semibold text-foreground">{stage.count}</span>
                </div>
                <div className="h-2 rounded-full bg-surface overflow-hidden">
                  <div
                    className={`h-full rounded-full ${stage.key === 'WON' ? 'bg-emerald-500' : stage.key === 'LOST' ? 'bg-red-500' : 'bg-accent'}`}
                    style={{ width: `${Math.max(6, (stage.count / maxPipelineCount) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Channel Performance */}
        <div className="glass-card p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-semibold text-foreground">Channel Performance</h2>
              <p className="text-xs text-muted mt-0.5">Leads and win rate by source</p>
            </div>
            <Percent className="w-5 h-5 text-accent" />
          </div>
          <div className="space-y-2">
            {(stats.channelPerformance || []).slice(0, 6).map(c => {
              const SourceIcon = sourceIconMap[c.source] || Globe;
              return (
                <div key={c.source} className="flex items-center gap-3 p-2.5 rounded-xl bg-surface">
                  <SourceIcon className={`w-4 h-4 ${sourceColorMap[c.source] || 'text-muted'}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-foreground truncate">{c.source}</p>
                    <p className="text-[10px] text-muted">{c.leads} leads · {c.won} converted</p>
                  </div>
                  <span className="text-xs font-semibold text-accent">{c.winRate}%</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Action Center */}
        <div className="glass-card p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-semibold text-foreground">Action Center</h2>
              <p className="text-xs text-muted mt-0.5">High-priority items today</p>
            </div>
            <AlertTriangle className="w-5 h-5 text-danger" />
          </div>

          <div className="grid grid-cols-2 gap-2 mb-3">
            <div className="p-2 rounded-lg bg-surface text-center">
              <p className="text-[10px] text-muted">Follow-ups</p>
              <p className="text-sm font-bold text-foreground">{stats.actionCenter?.pendingFollowUps || 0}</p>
            </div>
            <div className="p-2 rounded-lg bg-surface text-center">
              <p className="text-[10px] text-muted">Overdue Invoices</p>
              <p className="text-sm font-bold text-red-600">{stats.actionCenter?.overdueInvoices || 0}</p>
            </div>
          </div>

          <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
            {(stats.actionCenter?.followUpItems || []).slice(0, 4).map(item => (
              <div key={`fu-${item.id}`} className="p-2.5 rounded-lg bg-surface border border-border/70">
                <p className="text-xs font-medium text-foreground truncate">Follow up: {item.customer}</p>
                <p className="text-[10px] text-muted">{item.interest} · Due {item.dueDate}</p>
              </div>
            ))}
            {(stats.actionCenter?.overdueInvoicesList || []).slice(0, 3).map(inv => (
              <div key={`inv-${inv.id}`} className="p-2.5 rounded-lg bg-red-500/5 border border-red-500/20">
                <p className="text-xs font-medium text-foreground truncate">{inv.displayId} · {inv.customer}</p>
                <p className="text-[10px] text-red-700">Due {inv.dueDate} · {formatCompactINR(inv.balanceDue)}</p>
              </div>
            ))}
            {(stats.actionCenter?.followUpItems || []).length === 0 && (stats.actionCenter?.overdueInvoicesList || []).length === 0 && (
              <div className="p-3 rounded-lg bg-emerald-500/10 text-emerald-700 text-xs">No urgent items right now.</div>
            )}
          </div>
        </div>
      </div>

      {/* Recent Leads & Upcoming Appointments */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-5">
        {/* Recent Leads */}
        <div className="glass-card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-foreground">Recent Leads</h2>
            <a href="/leads" className="text-xs text-accent hover:text-accent-hover flex items-center gap-1 transition-colors">
              View all <ArrowRight className="w-3.5 h-3.5" />
            </a>
          </div>
          <div className="space-y-2">
            {stats.recentLeads.map((lead) => {
              const SourceIcon = sourceIconMap[lead.source] || Globe;
              const displayStatus = statusDisplayMap[lead.status] || lead.status;
              return (
                <div key={lead.id} className="flex items-center gap-3 p-3 rounded-xl hover:bg-surface-hover transition-colors">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold bg-accent/10 text-accent`}>
                    {lead.name.split(' ').map(n => n[0]).join('')}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{lead.name}</p>
                    <p className="text-xs text-muted">{lead.interest}</p>
                  </div>
                  <SourceIcon className={`w-4 h-4 ${sourceColorMap[lead.source] || 'text-muted'}`} />
                  <span className={`badge text-[10px] ${
                    displayStatus === 'New' ? 'bg-info-light text-info' :
                    displayStatus === 'Contacted' ? 'bg-accent-light text-accent' :
                    displayStatus === 'Converted' ? 'bg-success-light text-success' :
                    displayStatus === 'Lost' ? 'bg-danger-light text-danger' :
                    'bg-purple-light text-purple'
                  }`}>
                    {displayStatus}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Upcoming Appointments */}
        <div className="glass-card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-foreground">Upcoming Appointments</h2>
            <a href="/appointments" className="text-xs text-accent hover:text-accent-hover flex items-center gap-1 transition-colors">
              View all <ArrowRight className="w-3.5 h-3.5" />
            </a>
          </div>
          <div className="space-y-2">
            {stats.upcomingAppointments.map((apt) => (
              <div key={apt.id} className="flex items-center gap-3 p-3 rounded-xl hover:bg-surface-hover transition-colors">
                <div className="w-10 h-10 rounded-xl bg-teal-light flex flex-col items-center justify-center flex-shrink-0">
                  <p className="text-[10px] font-bold text-teal leading-none">{new Date(apt.date).toLocaleDateString('en-US', { month: 'short' })}</p>
                  <p className="text-sm font-bold text-teal leading-none">{new Date(apt.date).getDate()}</p>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{apt.customer}</p>
                  <p className="text-xs text-muted">{apt.purpose}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="flex items-center gap-1 text-xs text-muted">
                    <Clock className="w-3 h-3" />
                    {apt.time}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Field Visit Activity */}
      {stats.fieldVisits?.length > 0 && (
        <div className="glass-card p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <MapPin className="w-5 h-5 text-blue-600" />
              <h2 className="text-base font-semibold text-foreground">Field Visit Activity</h2>
              <span className="badge bg-blue-500/10 text-blue-700 text-[10px] border border-blue-500/20">
                {stats.fieldVisits.filter(v => v.status !== 'Completed').length} active
              </span>
            </div>
            <a href="/custom-orders" className="text-xs text-accent hover:text-accent-hover flex items-center gap-1 transition-colors">
              View orders <ArrowRight className="w-3.5 h-3.5" />
            </a>
          </div>
          <div className="space-y-2">
            {stats.fieldVisits.map((visit) => (
              <div key={visit.id} className="flex items-center gap-3 p-3 rounded-xl bg-surface hover:bg-surface-hover transition-colors">
                {/* Status icon */}
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
                  visit.status === 'Completed' ? 'bg-emerald-500/10' :
                  visit.status === 'In Progress' ? 'bg-amber-500/10' :
                  'bg-blue-500/10'
                }`}>
                  {visit.status === 'Completed' ? (
                    <CheckCircle2 className="w-4.5 h-4.5 text-emerald-600" />
                  ) : visit.status === 'In Progress' ? (
                    <Loader className="w-4 h-4 text-amber-600" />
                  ) : (
                    <MapPin className="w-4 h-4 text-blue-600" />
                  )}
                </div>

                {/* Details */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium text-foreground truncate">{visit.customer}</p>
                    {visit.orderDisplayId && (
                      <span className="font-mono text-[10px] text-accent bg-accent/10 rounded px-1.5 py-0.5">{visit.orderDisplayId}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    <p className="text-xs text-muted">{visit.staffName}</p>
                    {visit.orderType && <span className="text-[10px] text-muted">· {visit.orderType}</span>}
                    {visit.hasMeasurements && (
                      <span className="flex items-center gap-0.5 text-[10px] text-purple-600 bg-purple-500/10 rounded px-1.5 py-0.5">
                        <Ruler className="w-2.5 h-2.5" /> Measurements saved
                      </span>
                    )}
                    {visit.hasNotes && (
                      <span className="text-[10px] text-teal-600 bg-teal-500/10 rounded px-1.5 py-0.5">Notes added</span>
                    )}
                  </div>
                </div>

                {/* Right side */}
                <div className="text-right flex-shrink-0">
                  <span className={`badge text-[10px] ${
                    visit.status === 'Completed' ? 'bg-emerald-500/10 text-emerald-700 border border-emerald-500/20' :
                    visit.status === 'In Progress' ? 'bg-amber-500/10 text-amber-700 border border-amber-500/20' :
                    'bg-blue-500/10 text-blue-700 border border-blue-500/20'
                  }`}>
                    {visit.status}
                  </span>
                  <div className="flex items-center gap-1 text-[10px] text-muted mt-1 justify-end">
                    <Clock className="w-2.5 h-2.5" />
                    {visit.status === 'Completed' ? visit.completedAt : `${visit.scheduledDate} ${visit.scheduledTime}`}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* AI Activity Feed */}
      <div className="glass-card p-5">
        <div className="flex items-center gap-2 mb-4">
          <Bot className="w-5 h-5 text-accent" />
          <h2 className="text-base font-semibold text-foreground">AI Activity Feed</h2>
          <span className="badge bg-accent-light text-accent text-[10px]">Live</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[
            { action: 'Follow-up sent', target: 'Rahul Sharma', detail: 'Sofa options shared via WhatsApp', time: '2 min ago', icon: '📤' },
            { action: 'Lead captured', target: 'Kavita Tiwari', detail: 'Study table inquiry from website', time: '15 min ago', icon: '🎯' },
            { action: 'Chat handled', target: 'Unknown Customer', detail: 'Warranty policy question answered', time: '32 min ago', icon: '🤖' },
            { action: 'Appointment booked', target: 'Sneha Reddy', detail: 'Wardrobe design consultation', time: '1 hr ago', icon: '📅' },
            { action: 'Review requested', target: 'Arjun Rao', detail: 'Post-delivery review request sent', time: '2 hrs ago', icon: '⭐' },
            { action: 'Catalog shared', target: 'Ananya Iyer', detail: 'TV unit collection via WhatsApp', time: '3 hrs ago', icon: '📋' },
          ].map((activity, i) => (
            <div key={i} className="flex items-start gap-3 p-3 rounded-xl bg-surface hover:bg-surface-hover transition-colors">
              <span className="text-lg flex-shrink-0">{activity.icon}</span>
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">{activity.action}</p>
                <p className="text-xs text-accent">{activity.target}</p>
                <p className="text-xs text-muted mt-0.5">{activity.detail}</p>
              </div>
              <span className="text-[10px] text-muted whitespace-nowrap ml-auto flex-shrink-0">{activity.time}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
