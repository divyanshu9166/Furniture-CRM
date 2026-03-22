'use client';

import { Users, Calendar, ShoppingCart, DollarSign, Package, AlertTriangle, TrendingUp, ArrowRight, Clock, MessageSquare, Instagram, Globe, Facebook, Bot } from 'lucide-react';
import StatCard from '@/components/StatCard';
import { leads } from '@/data/leads';
import { appointments } from '@/data/appointments';
import { orders } from '@/data/orders';
import { products } from '@/data/products';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

const bestSellers = [
  { name: 'Bean Bag XXL', sold: 52 },
  { name: 'Office Chair', sold: 45 },
  { name: 'Bedside Table', sold: 41 },
  { name: 'Center Table', sold: 38 },
  { name: 'L-Shaped Sofa', sold: 34 },
  { name: 'Dressing Table', sold: 31 },
  { name: 'Tuscan Sofa', sold: 30 },
  { name: 'Shoe Rack', sold: 29 },
];

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
  const todaysLeads = leads.filter(l => l.date === '2026-03-14');
  const todaysAppointments = appointments.filter(a => a.date === '2026-03-14' || a.date === '2026-03-15');
  const totalRevenue = orders.reduce((sum, o) => sum + o.amount, 0);
  const lowStockItems = products.filter(p => p.stock <= 3);
  const activeOrders = orders.filter(o => o.status === 'Processing' || o.status === 'Shipped' || o.status === 'Confirmed');

  return (
    <div className="space-y-6 animate-[fade-in_0.5s_ease-out]">
      {/* Page Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl md:text-2xl font-bold text-foreground">Dashboard</h1>
          <p className="text-xs md:text-sm text-muted mt-1">Welcome back! Here&apos;s your store overview for today.</p>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-xs md:text-sm font-medium text-foreground">March 14, 2026</p>
          <p className="text-[10px] md:text-xs text-muted">Friday</p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-5">
        <StatCard title="Leads Today" value={todaysLeads.length} change="+18%" changeType="up" icon={Users} color="accent" />
        <StatCard title="Appointments" value={todaysAppointments.length} change="+8%" changeType="up" icon={Calendar} color="teal" />
        <StatCard title="Active Orders" value={activeOrders.length} change="+24%" changeType="up" icon={ShoppingCart} color="purple" />
        <StatCard title="Revenue" value={`₹${(totalRevenue/1000).toFixed(0)}K`} change="+12%" changeType="up" icon={DollarSign} color="success" />
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
            <BarChart data={bestSellers} barSize={32} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
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
            {lowStockItems.map((item) => (
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
            {leads.slice(0, 6).map((lead) => {
              const SourceIcon = sourceIconMap[lead.source] || Globe;
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
                    lead.status === 'New' ? 'bg-info-light text-info' :
                    lead.status === 'Contacted' ? 'bg-accent-light text-accent' :
                    lead.status === 'Won' ? 'bg-success-light text-success' :
                    lead.status === 'Lost' ? 'bg-danger-light text-danger' :
                    'bg-purple-light text-purple'
                  }`}>
                    {lead.status}
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
            {appointments.filter(a => a.status === 'Scheduled').slice(0, 5).map((apt) => (
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
