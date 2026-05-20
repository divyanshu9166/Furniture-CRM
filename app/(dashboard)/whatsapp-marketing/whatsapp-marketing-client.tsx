'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  MessageSquare, Radio, Bot, Settings,
  BarChart3, Wifi, WifiOff, Loader2, Megaphone,
  Users, Kanban
} from 'lucide-react';
import { useTotalUnread } from '@/lib/use-total-unread';

import { OverviewTab } from '@/components/whatsapp/dashboard/overview-tab';
import { InboxTab } from '@/components/whatsapp/inbox/inbox-tab';
import { BroadcastsTab } from '@/components/whatsapp/broadcasts/broadcasts-tab';
import { AutomationsTab } from '@/components/whatsapp/automations/automations-tab';
import { ContactsTab } from '@/components/whatsapp/contacts/contacts-tab';
import { PipelinesTab } from '@/components/whatsapp/pipelines/pipelines-tab';
import { SettingsTab } from '@/components/whatsapp/settings/settings-tab';

const TABS = [
  { id: 'overview', label: 'Overview', icon: BarChart3 },
  { id: 'inbox', label: 'Inbox', icon: MessageSquare },
  { id: 'broadcasts', label: 'Broadcasts', icon: Radio },
  { id: 'automations', label: 'Automations', icon: Bot },
  { id: 'contacts', label: 'Contacts', icon: Users },
  { id: 'pipelines', label: 'Pipelines', icon: Kanban },
  { id: 'settings', label: 'Settings', icon: Settings },
] as const;

type TabId = (typeof TABS)[number]['id'];

function isTabId(value: string | null): value is TabId {
  return !!value && TABS.some((tab) => tab.id === value);
}

export function WhatsAppMarketingClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [waConfig, setWaConfig] = useState(null);
  const [configLoading, setConfigLoading] = useState(true);
  const totalUnread = useTotalUnread();
  const queryTab = searchParams.get('tab');
  const activeTab: TabId = isTabId(queryTab) ? queryTab : 'overview';

  const setActiveTab = (tabId: TabId) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', tabId);

    if (tabId !== 'inbox') {
      params.delete('c');
    }

    if (tabId !== 'settings') {
      params.delete('settingsTab');
    }

    router.replace(`/whatsapp-marketing?${params.toString()}`, { scroll: false });
  };

  useEffect(() => {
    fetch('/api/whatsapp/config')
      .then(r => r.json())
      .then(data => { setWaConfig(data); setConfigLoading(false); })
      .catch(() => setConfigLoading(false));
  }, []);

  useEffect(() => {
    document.body.classList.add('wa-light-active');
    return () => {
      document.body.classList.remove('wa-light-active');
    };
  }, []);

  return (
    <div className="wa-light space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Megaphone className="w-6 h-6 text-accent" />
            WhatsApp Marketing
          </h1>
          <p className="text-sm text-muted mt-1">
            Manage conversations, broadcasts, and automations
          </p>
        </div>
        <ConnectionBadge config={waConfig} loading={configLoading} />
      </div>

      <div className="flex gap-1 p-1 bg-surface rounded-xl border border-border overflow-x-auto">
        {TABS.map(tab => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          const badge = tab.id === 'inbox' && totalUnread > 0 ? totalUnread : null;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
                active
                  ? 'bg-white text-accent shadow-sm border border-border/50'
                  : 'text-muted hover:text-foreground hover:bg-surface-hover'
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
              {badge && (
                <span className="ml-1 px-1.5 py-0.5 rounded-full bg-success text-white text-[10px] font-bold leading-none">
                  {badge > 99 ? '99+' : badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {activeTab === 'overview' && <OverviewTab />}
      {activeTab === 'inbox' && <InboxTab />}
      {activeTab === 'broadcasts' && <BroadcastsTab />}
      {activeTab === 'automations' && <AutomationsTab />}
      {activeTab === 'contacts' && <ContactsTab />}
      {activeTab === 'pipelines' && <PipelinesTab />}
      {activeTab === 'settings' && <SettingsTab />}
    </div>
  );
}

function ConnectionBadge({ config, loading }: { config: any, loading: boolean }) {
  if (loading) return <div className="px-3 py-1.5 rounded-full bg-surface border border-border text-xs text-muted flex items-center gap-2"><Loader2 className="w-3 h-3 animate-spin" />Checking...</div>;
  const connected = config?.connected;
  return (
    <div className={`px-3 py-1.5 rounded-full text-xs font-medium flex items-center gap-2 ${connected ? 'bg-success-light text-success border border-success/20' : 'bg-warning-light text-warning border border-warning/20'}`}>
      {connected ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
      {connected ? 'WhatsApp Connected' : 'Not Connected'}
    </div>
  );
}
