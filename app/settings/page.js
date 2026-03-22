'use client';

import { useState } from 'react';
import { Store, Users, Link2, Bell, Bot, Save, Plus, Trash2 } from 'lucide-react';

const integrations = [
  { name: 'WhatsApp Business', description: 'Connect WhatsApp Business API for automated messaging', connected: true, icon: '💬' },
  { name: 'Google Calendar', description: 'Sync appointments with Google Calendar', connected: true, icon: '📅' },
  { name: 'Instagram', description: 'Receive and reply to Instagram DMs', connected: false, icon: '📸' },
  { name: 'Facebook Messenger', description: 'Connect Facebook page for lead capture', connected: false, icon: '👥' },
  { name: 'Google My Business', description: 'Manage Google reviews and listings', connected: true, icon: '⭐' },
  { name: 'Razorpay', description: 'Accept online payments and track transactions', connected: false, icon: '💳' },
];

const teamMembers = [
  { name: 'Admin', email: 'admin@furniturecrm.com', role: 'Owner', status: 'Active' },
  { name: 'Rahul M.', email: 'rahul@furniturecrm.com', role: 'Sales Manager', status: 'Active' },
  { name: 'Priya S.', email: 'priya@furniturecrm.com', role: 'Sales Rep', status: 'Active' },
  { name: 'Amit K.', email: 'amit@furniturecrm.com', role: 'Inventory Manager', status: 'Active' },
  { name: 'Neha R.', email: 'neha@furniturecrm.com', role: 'Marketing', status: 'Invited' },
];

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState('store');

  const tabs = [
    { key: 'store', label: 'Store Profile', icon: Store },
    { key: 'team', label: 'Team', icon: Users },
    { key: 'integrations', label: 'Integrations', icon: Link2 },
    { key: 'notifications', label: 'Notifications', icon: Bell },
    { key: 'ai', label: 'AI Settings', icon: Bot },
  ];

  return (
    <div className="space-y-4 sm:space-y-6 animate-[fade-in_0.5s_ease-out]">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-foreground">Settings</h1>
        <p className="text-sm text-muted mt-1">Manage your store configuration and integrations</p>
      </div>

      {/* Mobile Tab Nav - horizontal scroll */}
      <div className="flex gap-1.5 overflow-x-auto pb-2 -mx-1 px-1 sm:hidden no-scrollbar">
        {tabs.map(tab => {
          const Icon = tab.icon;
          return (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)} className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-all ${activeTab === tab.key ? 'bg-accent/10 text-accent' : 'text-muted hover:text-foreground bg-surface'}`}>
              <Icon className="w-4 h-4" /> {tab.label}
            </button>
          );
        })}
      </div>

      <div className="flex gap-6">
        {/* Desktop Tab Nav - vertical sidebar */}
        <div className="hidden sm:block w-56 flex-shrink-0 space-y-1">
          {tabs.map(tab => {
            const Icon = tab.icon;
            return (
              <button key={tab.key} onClick={() => setActiveTab(tab.key)} className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${activeTab === tab.key ? 'bg-accent/10 text-accent' : 'text-muted hover:text-foreground hover:bg-surface-hover'}`}>
                <Icon className="w-4 h-4" /> {tab.label}
              </button>
            );
          })}
        </div>

        {/* Tab Content */}
        <div className="flex-1 min-w-0">
          {activeTab === 'store' && (
            <div className="glass-card p-4 sm:p-6">
              <h2 className="text-lg font-semibold text-foreground mb-4 sm:mb-5">Store Profile</h2>
              <form className="space-y-4 max-w-2xl">
                <div className="flex items-center gap-4 sm:gap-5 mb-4 sm:mb-6">
                  <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-accent/10 flex items-center justify-center text-2xl sm:text-3xl flex-shrink-0">🪑</div>
                  <div>
                    <button type="button" className="px-4 py-2 border border-border rounded-xl text-sm text-foreground hover:bg-surface-hover transition-colors">Upload Logo</button>
                    <p className="text-xs text-muted mt-1">Recommended: 200x200px, PNG or JPG</p>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div><label className="block text-xs font-medium text-muted mb-1.5">Store Name</label><input type="text" defaultValue="FurnitureCRM Store" className="w-full" /></div>
                  <div><label className="block text-xs font-medium text-muted mb-1.5">Phone</label><input type="tel" defaultValue="+91 98765 43210" className="w-full" /></div>
                </div>
                <div><label className="block text-xs font-medium text-muted mb-1.5">Email</label><input type="email" defaultValue="contact@furniturecrm.com" className="w-full" /></div>
                <div><label className="block text-xs font-medium text-muted mb-1.5">Address</label><textarea rows={2} defaultValue="123 Furniture Lane, MI Road, Jaipur, Rajasthan 302001" className="w-full" /></div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div><label className="block text-xs font-medium text-muted mb-1.5">GST Number</label><input type="text" defaultValue="08AABCU9603R1ZM" className="w-full" /></div>
                  <div><label className="block text-xs font-medium text-muted mb-1.5">Website</label><input type="url" defaultValue="https://furniturecrm.com" className="w-full" /></div>
                </div>
                <button type="submit" className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-2.5 bg-accent hover:bg-accent-hover text-white rounded-xl text-sm font-semibold transition-all mt-2"><Save className="w-4 h-4" /> Save Changes</button>
              </form>
            </div>
          )}

          {activeTab === 'team' && (
            <div className="glass-card p-4 sm:p-6">
              <div className="flex items-center justify-between mb-4 sm:mb-5">
                <h2 className="text-lg font-semibold text-foreground">Team Members</h2>
                <button className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-hover text-white rounded-xl text-sm font-semibold transition-all"><Plus className="w-4 h-4" /> Invite</button>
              </div>
              {/* Desktop table */}
              <table className="crm-table hidden sm:table">
                <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th></th></tr></thead>
                <tbody>
                  {teamMembers.map((m, i) => (
                    <tr key={i}>
                      <td className="font-medium text-foreground">{m.name}</td>
                      <td className="text-muted">{m.email}</td>
                      <td><span className="badge bg-accent-light text-accent">{m.role}</span></td>
                      <td><span className={`badge ${m.status === 'Active' ? 'bg-success-light text-success' : 'bg-info-light text-info'}`}>{m.status}</span></td>
                      <td>{m.role !== 'Owner' && <button className="p-1.5 rounded-lg hover:bg-surface-hover text-muted hover:text-danger"><Trash2 className="w-4 h-4" /></button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {/* Mobile cards */}
              <div className="space-y-3 sm:hidden">
                {teamMembers.map((m, i) => (
                  <div key={i} className="p-3 rounded-xl bg-surface border border-border">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-sm font-medium text-foreground">{m.name}</p>
                        <p className="text-xs text-muted mt-0.5">{m.email}</p>
                      </div>
                      {m.role !== 'Owner' && <button className="p-1.5 rounded-lg hover:bg-surface-hover text-muted hover:text-danger"><Trash2 className="w-4 h-4" /></button>}
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                      <span className="badge bg-accent-light text-accent">{m.role}</span>
                      <span className={`badge ${m.status === 'Active' ? 'bg-success-light text-success' : 'bg-info-light text-info'}`}>{m.status}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'integrations' && (
            <div className="space-y-3">
              <h2 className="text-lg font-semibold text-foreground mb-2">Integrations</h2>
              {integrations.map((int, i) => (
                <div key={i} className="glass-card p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
                  <div className="flex items-center gap-3 sm:gap-4">
                    <span className="text-2xl sm:text-3xl flex-shrink-0">{int.icon}</span>
                    <div><p className="text-sm font-semibold text-foreground">{int.name}</p><p className="text-xs text-muted">{int.description}</p></div>
                  </div>
                  <button className={`w-full sm:w-auto px-4 py-2 rounded-xl text-sm font-medium transition-all text-center flex-shrink-0 ${int.connected ? 'bg-success-light text-success border border-success/20 hover:bg-danger-light hover:text-danger hover:border-danger/20' : 'bg-accent hover:bg-accent-hover text-white'}`}>
                    {int.connected ? 'Connected' : 'Connect'}
                  </button>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'notifications' && (
            <div className="glass-card p-4 sm:p-6">
              <h2 className="text-lg font-semibold text-foreground mb-4 sm:mb-5">Notification Preferences</h2>
              <div className="space-y-4 max-w-2xl">
                {[
                  { label: 'New lead received', desc: 'Get notified when a new lead comes in', on: true },
                  { label: 'Appointment reminders', desc: '24hr and 2hr before appointments', on: true },
                  { label: 'Low stock alerts', desc: 'When inventory falls below threshold', on: true },
                  { label: 'Order status changes', desc: 'When orders are shipped or delivered', on: true },
                  { label: 'Negative reviews', desc: 'Alert when 1-2 star review is posted', on: true },
                  { label: 'Campaign completion', desc: 'When a campaign finishes sending', on: false },
                  { label: 'Daily summary email', desc: 'Daily digest of leads, orders, revenue', on: false },
                ].map((n, i) => (
                  <div key={i} className="flex items-center justify-between p-3 rounded-xl bg-surface hover:bg-surface-hover transition-colors">
                    <div><p className="text-sm font-medium text-foreground">{n.label}</p><p className="text-xs text-muted">{n.desc}</p></div>
                    <div className={`w-10 h-6 rounded-full flex items-center cursor-pointer transition-all ${n.on ? 'bg-accent justify-end' : 'bg-border justify-start'}`}>
                      <div className="w-4.5 h-4.5 m-0.5 bg-white rounded-full shadow" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'ai' && (
            <div className="glass-card p-4 sm:p-6">
              <h2 className="text-lg font-semibold text-foreground mb-4 sm:mb-5">AI Configuration</h2>
              <div className="space-y-5 max-w-2xl">
                <div className="p-4 rounded-xl bg-surface border border-border">
                  <div className="flex items-center justify-between mb-3">
                    <div><p className="text-sm font-semibold text-foreground">AI Chatbot</p><p className="text-xs text-muted">Automatically respond to customer queries</p></div>
                    <div className="w-10 h-6 rounded-full flex items-center bg-accent justify-end cursor-pointer"><div className="w-4.5 h-4.5 m-0.5 bg-white rounded-full shadow" /></div>
                  </div>
                </div>
                <div><label className="block text-xs font-medium text-muted mb-1.5">Bot Personality</label>
                  <select className="w-full"><option>Friendly & Professional</option><option>Formal</option><option>Casual</option></select>
                </div>
                <div><label className="block text-xs font-medium text-muted mb-1.5">Welcome Message</label>
                  <textarea rows={3} defaultValue="Hello! 👋 Welcome to our furniture store. How can I help you today?" className="w-full" />
                </div>
                <div><label className="block text-xs font-medium text-muted mb-1.5">Auto Follow-up Schedule</label>
                  <div className="space-y-2">
                    {['Day 1: Share product catalog','Day 3: Schedule showroom visit','Day 7: Share discount offer'].map((d,i) => (
                      <div key={i} className="flex items-center gap-3 p-2.5 rounded-lg bg-surface-hover text-sm text-foreground"><Bot className="w-4 h-4 text-accent flex-shrink-0" />{d}</div>
                    ))}
                  </div>
                </div>
                <button className="flex items-center gap-2 px-5 py-2.5 bg-accent hover:bg-accent-hover text-white rounded-xl text-sm font-semibold transition-all"><Save className="w-4 h-4" /> Save AI Settings</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
