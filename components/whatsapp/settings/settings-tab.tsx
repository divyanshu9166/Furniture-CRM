'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { MessageSquare, Settings, Tag } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { WhatsAppConfig } from '@/components/whatsapp/settings/whatsapp-config';
import { TemplateManager } from '@/components/whatsapp/settings/template-manager';
import { TagManager } from '@/components/whatsapp/settings/tag-manager';

const TAB_VALUES = ['whatsapp', 'templates', 'tags'] as const;
type TabValue = (typeof TAB_VALUES)[number];

function isTabValue(v: string | null): v is TabValue {
  return !!v && (TAB_VALUES as readonly string[]).includes(v);
}

export function SettingsTab() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryTab = searchParams.get('settingsTab');
  const tab: TabValue = isTabValue(queryTab) ? queryTab : 'whatsapp';

  const onChange = (next: TabValue) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', 'settings');
    params.set('settingsTab', next);
    router.replace(`/whatsapp-marketing?${params.toString()}`, { scroll: false });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Settings</h1>
        <p className="text-sm text-muted mt-1">
          Manage the WhatsApp integration, message templates, and tags.
        </p>
      </div>

      <Tabs value={tab} onValueChange={(v) => onChange(v as TabValue)}>
        <TabsList className="bg-surface border border-border">
          <TabsTrigger
            value="whatsapp"
            className="data-active:bg-surface-light data-active:text-accent text-muted"
          >
            <Settings className="size-4" />
            WhatsApp Config
          </TabsTrigger>
          <TabsTrigger
            value="templates"
            className="data-active:bg-surface-light data-active:text-accent text-muted"
          >
            <MessageSquare className="size-4" />
            Templates
          </TabsTrigger>
          <TabsTrigger
            value="tags"
            className="data-active:bg-surface-light data-active:text-accent text-muted"
          >
            <Tag className="size-4" />
            Tags
          </TabsTrigger>
        </TabsList>

        <TabsContent value="whatsapp">
          <WhatsAppConfig />
        </TabsContent>

        <TabsContent value="templates">
          <TemplateManager />
        </TabsContent>

        <TabsContent value="tags">
          <TagManager />
        </TabsContent>
      </Tabs>
    </div>
  );
}
