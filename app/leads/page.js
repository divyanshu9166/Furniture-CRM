'use client';

import { useState } from 'react';
import { Search, Plus, Filter, MessageSquare, Instagram, Facebook, Globe, Phone, Mail, ChevronRight, Bot, Clock } from 'lucide-react';
import { leads, pipelineStages } from '@/data/leads';
import Modal from '@/components/Modal';

const sourceIconMap = {
  WhatsApp: MessageSquare,
  Instagram: Instagram,
  Facebook: Facebook,
  Website: Globe,
};

const sourceColorMap = {
  WhatsApp: 'text-success bg-success-light',
  Instagram: 'text-pink bg-pink-light',
  Facebook: 'text-info bg-info-light',
  Website: 'text-teal bg-teal-light',
};

const statusColorMap = {
  New: 'bg-info-light text-info border-info/20',
  Contacted: 'bg-accent-light text-accent border-accent/20',
  'Showroom Visit': 'bg-purple-light text-purple border-purple/20',
  Quotation: 'bg-teal-light text-teal border-teal/20',
  Won: 'bg-success-light text-success border-success/20',
  Lost: 'bg-danger-light text-danger border-danger/20',
};

export default function LeadsPage() {
  const [search, setSearch] = useState('');
  const [selectedLead, setSelectedLead] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [view, setView] = useState('pipeline');

  const filteredLeads = leads.filter(l =>
    l.name.toLowerCase().includes(search.toLowerCase()) ||
    l.interest.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6 animate-[fade-in_0.5s_ease-out] min-w-0">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-foreground">Leads</h1>
          <p className="text-xs md:text-sm text-muted mt-1">{leads.length} total leads · {leads.filter(l => l.status === 'New').length} new today</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex bg-surface rounded-xl border border-border p-0.5">
            <button onClick={() => setView('pipeline')} className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-all ${view === 'pipeline' ? 'bg-accent text-white' : 'text-muted hover:text-foreground'}`}>Pipeline</button>
            <button onClick={() => setView('list')} className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-all ${view === 'list' ? 'bg-accent text-white' : 'text-muted hover:text-foreground'}`}>List</button>
          </div>
          <button onClick={() => setShowAddModal(true)} className="flex items-center gap-2 px-4 py-2.5 bg-accent hover:bg-accent-hover text-white rounded-xl text-sm font-semibold transition-all">
            <Plus className="w-4 h-4" /> Add Lead
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
        <input
          type="text"
          placeholder="Search leads by name or product interest..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full md:max-w-md pl-10 pr-4 py-2.5 bg-surface rounded-xl border border-border text-sm"
        />
      </div>

      {view === 'pipeline' ? (
        /* Pipeline View */
        <div className="flex gap-4 overflow-x-auto pb-4">
          {pipelineStages.map((stage) => {
            const stageLeads = filteredLeads.filter(l => l.status === stage);
            return (
              <div key={stage} className="min-w-[280px] flex-shrink-0">
                <div className={`flex items-center gap-2 mb-3 px-1`}>
                  <span className={`badge ${statusColorMap[stage]}`}>{stage}</span>
                  <span className="text-xs text-muted">({stageLeads.length})</span>
                </div>
                <div className="space-y-3">
                  {stageLeads.map((lead) => {
                    const SourceIcon = sourceIconMap[lead.source];
                    return (
                      <div
                        key={lead.id}
                        onClick={() => setSelectedLead(lead)}
                        className="glass-card p-4 cursor-pointer group hover:scale-[1.02] transition-transform"
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-accent/10 flex items-center justify-center text-xs font-semibold text-accent">
                              {lead.name.split(' ').map(n => n[0]).join('')}
                            </div>
                            <div>
                              <p className="text-sm font-semibold text-foreground">{lead.name}</p>
                              <p className="text-[11px] text-muted">{lead.date}</p>
                            </div>
                          </div>
                          <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${sourceColorMap[lead.source]}`}>
                            <SourceIcon className="w-3.5 h-3.5" />
                          </div>
                        </div>
                        <p className="text-xs text-muted mb-2">🛋️ {lead.interest}</p>
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium text-accent">{lead.budget}</span>
                          <ChevronRight className="w-3.5 h-3.5 text-muted opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                      </div>
                    );
                  })}
                  {stageLeads.length === 0 && (
                    <div className="text-center py-8 text-sm text-muted">No leads</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* List View */
        <div className="glass-card overflow-hidden">
          <div className="overflow-x-auto">
          <table className="crm-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Interest</th>
                <th>Source</th>
                <th>Budget</th>
                <th>Status</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {filteredLeads.map((lead) => {
                const SourceIcon = sourceIconMap[lead.source];
                return (
                  <tr key={lead.id} className="cursor-pointer" onClick={() => setSelectedLead(lead)}>
                    <td>
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-accent/10 flex items-center justify-center text-xs font-semibold text-accent">
                          {lead.name.split(' ').map(n => n[0]).join('')}
                        </div>
                        <div>
                          <p className="font-medium text-foreground">{lead.name}</p>
                          <p className="text-xs text-muted">{lead.phone}</p>
                        </div>
                      </div>
                    </td>
                    <td className="text-foreground">{lead.interest}</td>
                    <td>
                      <div className="flex items-center gap-2">
                        <SourceIcon className={`w-4 h-4 ${sourceColorMap[lead.source].split(' ')[0]}`} />
                        <span>{lead.source}</span>
                      </div>
                    </td>
                    <td className="text-accent font-medium">{lead.budget}</td>
                    <td><span className={`badge ${statusColorMap[lead.status]}`}>{lead.status}</span></td>
                    <td className="text-muted">{lead.date}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        </div>
      )}

      {/* Lead Detail Modal */}
      <Modal isOpen={!!selectedLead} onClose={() => setSelectedLead(null)} title="Lead Details" size="lg">
        {selectedLead && (
          <div className="space-y-5">
            <div className="flex items-start gap-4">
              <div className="w-14 h-14 rounded-2xl bg-accent/10 flex items-center justify-center text-xl font-bold text-accent">
                {selectedLead.name.split(' ').map(n => n[0]).join('')}
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-foreground">{selectedLead.name}</h3>
                <div className="flex items-center gap-4 mt-1">
                  <span className="flex items-center gap-1 text-sm text-muted"><Phone className="w-3.5 h-3.5" /> {selectedLead.phone}</span>
                  <span className="flex items-center gap-1 text-sm text-muted"><Mail className="w-3.5 h-3.5" /> {selectedLead.email}</span>
                </div>
              </div>
              <span className={`badge ${statusColorMap[selectedLead.status]}`}>{selectedLead.status}</span>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="p-3 rounded-xl bg-surface">
                <p className="text-xs text-muted mb-1">Interest</p>
                <p className="text-sm font-medium text-foreground">🛋️ {selectedLead.interest}</p>
              </div>
              <div className="p-3 rounded-xl bg-surface">
                <p className="text-xs text-muted mb-1">Budget</p>
                <p className="text-sm font-medium text-accent">{selectedLead.budget}</p>
              </div>
              <div className="p-3 rounded-xl bg-surface">
                <p className="text-xs text-muted mb-1">Source</p>
                <p className="text-sm font-medium text-foreground">{selectedLead.source}</p>
              </div>
              <div className="p-3 rounded-xl bg-surface">
                <p className="text-xs text-muted mb-1">Date</p>
                <p className="text-sm font-medium text-foreground">{selectedLead.date}</p>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-surface">
              <p className="text-xs text-muted mb-1">Notes</p>
              <p className="text-sm text-foreground">{selectedLead.notes}</p>
            </div>

            {/* AI Follow-up Timeline */}
            {selectedLead.followUps && selectedLead.followUps.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Bot className="w-4 h-4 text-accent" />
                  <p className="text-sm font-semibold text-foreground">AI Follow-up Timeline</p>
                </div>
                <div className="space-y-3 relative before:absolute before:left-[15px] before:top-2 before:bottom-2 before:w-[2px] before:bg-border">
                  {selectedLead.followUps.map((fu, i) => (
                    <div key={i} className="flex gap-3 relative">
                      <div className="w-[32px] h-[32px] rounded-full bg-accent/20 flex items-center justify-center flex-shrink-0 z-10 border-2 border-background">
                        <Clock className="w-3.5 h-3.5 text-accent" />
                      </div>
                      <div className="flex-1 p-3 rounded-xl bg-surface">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-medium text-accent">Day {fu.day}</span>
                          <span className="text-[10px] text-muted">{fu.date}</span>
                        </div>
                        <p className="text-sm text-foreground">{fu.message}</p>
                        <span className="badge bg-success-light text-success text-[10px] mt-2">✓ Sent</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Add Lead Modal */}
      <Modal isOpen={showAddModal} onClose={() => setShowAddModal(false)} title="Add New Lead">
        <form className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-muted mb-1.5">Full Name</label>
              <input type="text" placeholder="Customer name" className="w-full" />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted mb-1.5">Phone</label>
              <input type="tel" placeholder="+91..." className="w-full" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-muted mb-1.5">Email</label>
            <input type="email" placeholder="customer@email.com" className="w-full" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-muted mb-1.5">Source</label>
              <select className="w-full">
                <option>WhatsApp</option>
                <option>Instagram</option>
                <option>Facebook</option>
                <option>Website</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted mb-1.5">Budget</label>
              <input type="text" placeholder="₹00,000" className="w-full" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-muted mb-1.5">Product Interest</label>
            <input type="text" placeholder="e.g., L-Shaped Sofa" className="w-full" />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted mb-1.5">Notes</label>
            <textarea rows={3} placeholder="Additional notes..." className="w-full" />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setShowAddModal(false)} className="px-4 py-2.5 rounded-xl text-sm text-muted hover:text-foreground hover:bg-surface-hover transition-colors">Cancel</button>
            <button type="submit" className="px-6 py-2.5 bg-accent hover:bg-accent-hover text-white rounded-xl text-sm font-semibold transition-all">Save Lead</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
