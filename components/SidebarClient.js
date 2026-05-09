'use client';

import dynamic from 'next/dynamic';

// Load Sidebar only on the client to prevent SSR hydration mismatches
// caused by session/role-based nav filtering and dynamic classNames.
const Sidebar = dynamic(() => import('@/components/Sidebar'), { ssr: false });

export default function SidebarClient() {
  return <Sidebar />;
}
