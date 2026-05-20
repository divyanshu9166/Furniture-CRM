'use client';

import dynamic from 'next/dynamic';

const WhatsAppMarketingClient = dynamic(
  () => import('./whatsapp-marketing-client').then((mod) => mod.WhatsAppMarketingClient),
  {
    loading: () => null,
    ssr: false,
  },
);

export function WhatsAppMarketingShell() {
  return <WhatsAppMarketingClient />;
}
