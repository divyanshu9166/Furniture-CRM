'use client';

import { useState } from 'react';
import { Plus, Send, Calendar, Eye, Users, MousePointerClick, Mail, MessageSquare, Smartphone, Edit3, Trash2 } from 'lucide-react';
import { campaigns, channelOptions, statusOptions } from '@/data/campaigns';
import Modal from '@/components/Modal';

const channelIcons = {
  WhatsApp: MessageSquare,
  Email: Mail,
  SMS: Smartphone,
};

const channelColors = {
  WhatsApp: 'text-success bg-success-light',
  Email: 'text-info bg-info-light',
  SMS: 'text-purple bg-purple-light',
};

const statusColors = {
  Draft: 'bg-surface-light text-muted border border-border',
  Scheduled: 'bg-info-light text-info',
  Sent: 'bg-success-light text-success',
};

export default function MarketingPage() {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedCampaign, setSelectedCampaign] = useState(null);

  const totalSent = campaigns.reduce((s, c) => s + c.sent, 0);
  const totalOpened = campaigns.reduce((s, c) => s + c.opened, 0);
  const totalClicked = campaigns.reduce((s, c) => s + c.clicked, 0);

  return (
    <div className="space-y-6 animate-[fade-in_0.5s_ease-out]">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Marketing & Campaigns</h1>
          <p className="text-sm text-muted mt-1">{campaigns.length} campaigns · {totalSent.toLocaleString()} messages sent</p>
        </div>
        <button onClick={() => setShowCreateModal(true)} className="flex items-center gap-2 px-4 py-2.5 bg-accent hover:bg-accent-hover text-white rounded-xl text-sm font-semibold transition-all">
          <Plus className="w-4 h-4" /> Create Campaign
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="glass-card p-4 flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-accent-light"><Send className="w-5 h-5 text-accent" /></div>
          <div><p className="text-xs text-muted">Total Sent</p><p className="text-lg font-bold text-foreground">{totalSent.toLocaleString()}</p></div>
        </div>
        <div className="glass-card p-4 flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-info-light"><Eye className="w-5 h-5 text-info" /></div>
          <div><p className="text-xs text-muted">Total Opened</p><p className="text-lg font-bold text-foreground">{totalOpened.toLocaleString()}</p></div>
        </div>
        <div className="glass-card p-4 flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-success-light"><MousePointerClick className="w-5 h-5 text-success" /></div>
          <div><p className="text-xs text-muted">Total Clicked</p><p className="text-lg font-bold text-foreground">{totalClicked.toLocaleString()}</p></div>
        </div>
        <div className="glass-card p-4 flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-purple-light"><Users className="w-5 h-5 text-purple" /></div>
          <div><p className="text-xs text-muted">Avg Open Rate</p><p className="text-lg font-bold text-foreground">{totalSent > 0 ? Math.round((totalOpened / totalSent) * 100) : 0}%</p></div>
        </div>
      </div>

      {/* Campaign Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {campaigns.map(campaign => {
          const ChannelIcon = channelIcons[campaign.channel];
          const openRate = campaign.sent > 0 ? Math.round((campaign.opened / campaign.sent) * 100) : 0;
          const clickRate = campaign.sent > 0 ? Math.round((campaign.clicked / campaign.sent) * 100) : 0;

          return (
            <div key={campaign.id} className="glass-card overflow-hidden group hover:scale-[1.01] transition-transform cursor-pointer" onClick={() => setSelectedCampaign(campaign)}>
              <div className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <h3 className="text-base font-semibold text-foreground mb-1">{campaign.name}</h3>
                    <div className="flex items-center gap-2">
                      <div className={`w-6 h-6 rounded-lg flex items-center justify-center ${channelColors[campaign.channel]}`}>
                        <ChannelIcon className="w-3.5 h-3.5" />
                      </div>
                      <span className="text-xs text-muted">{campaign.channel}</span>
                      <span className={`badge text-[10px] ${statusColors[campaign.status]}`}>{campaign.status}</span>
                    </div>
                  </div>
                </div>

                {campaign.scheduledDate && (
                  <div className="flex items-center gap-1.5 text-xs text-muted mb-3">
                    <Calendar className="w-3.5 h-3.5" />
                    {campaign.status === 'Sent' ? 'Sent on' : 'Scheduled for'} {campaign.scheduledDate}
                  </div>
                )}

                <div className="flex items-center gap-1.5 text-xs text-muted mb-4">
                  <Users className="w-3.5 h-3.5" />
                  {campaign.audience.toLocaleString()} audience
                </div>

                {campaign.sent > 0 && (
                  <div className="grid grid-cols-3 gap-3 pt-3 border-t border-border">
                    <div className="text-center">
                      <p className="text-xs text-muted">Sent</p>
                      <p className="text-sm font-bold text-foreground">{campaign.sent.toLocaleString()}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-muted">Opened</p>
                      <p className="text-sm font-bold text-info">{openRate}%</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-muted">Clicked</p>
                      <p className="text-sm font-bold text-success">{clickRate}%</p>
                    </div>
                  </div>
                )}

                {campaign.sent === 0 && (
                  <div className="pt-3 border-t border-border">
                    <p className="text-xs text-muted text-center">Not yet sent</p>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Campaign Detail Modal */}
      <Modal isOpen={!!selectedCampaign} onClose={() => setSelectedCampaign(null)} title="Campaign Details" size="lg">
        {selectedCampaign && (
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-foreground">{selectedCampaign.name}</h3>
              <span className={`badge ${statusColors[selectedCampaign.status]}`}>{selectedCampaign.status}</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3 rounded-xl bg-surface text-center">
                <p className="text-xs text-muted">Channel</p>
                <p className="text-sm font-medium text-foreground">{selectedCampaign.channel}</p>
              </div>
              <div className="p-3 rounded-xl bg-surface text-center">
                <p className="text-xs text-muted">Audience</p>
                <p className="text-sm font-medium text-foreground">{selectedCampaign.audience.toLocaleString()}</p>
              </div>
              <div className="p-3 rounded-xl bg-surface text-center">
                <p className="text-xs text-muted">Sent</p>
                <p className="text-sm font-medium text-foreground">{selectedCampaign.sent.toLocaleString()}</p>
              </div>
              <div className="p-3 rounded-xl bg-surface text-center">
                <p className="text-xs text-muted">Opened</p>
                <p className="text-sm font-medium text-foreground">{selectedCampaign.opened.toLocaleString()}</p>
              </div>
            </div>

            <div>
              <p className="text-xs font-medium text-muted mb-2">Template Preview</p>
              <div className="p-4 rounded-xl bg-surface border border-border">
                <pre className="text-sm text-foreground whitespace-pre-wrap font-sans leading-relaxed">{selectedCampaign.template}</pre>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* Create Campaign Modal */}
      <Modal isOpen={showCreateModal} onClose={() => setShowCreateModal(false)} title="Create Campaign">
        <form className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-muted mb-1.5">Campaign Name</label>
            <input type="text" placeholder="e.g., Diwali Mega Sale 🪔" className="w-full" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-muted mb-1.5">Channel</label>
              <select className="w-full">
                {channelOptions.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted mb-1.5">Schedule Date</label>
              <input type="date" className="w-full" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-muted mb-1.5">Template Message</label>
            <textarea rows={6} placeholder="Write your campaign message..." className="w-full" />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setShowCreateModal(false)} className="px-4 py-2.5 rounded-xl text-sm text-muted hover:text-foreground hover:bg-surface-hover transition-colors">Cancel</button>
            <button type="button" className="px-5 py-2.5 border border-border rounded-xl text-sm font-medium text-foreground hover:bg-surface-hover transition-colors">Save as Draft</button>
            <button type="submit" className="px-6 py-2.5 bg-accent hover:bg-accent-hover text-white rounded-xl text-sm font-semibold transition-all">Schedule</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
