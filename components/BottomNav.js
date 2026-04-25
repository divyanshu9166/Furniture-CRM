'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Users, ShoppingCart, Package, MoreHorizontal } from 'lucide-react';
import { useState } from 'react';
import { useSession } from 'next-auth/react';

const navItems = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/leads', label: 'Leads', icon: Users },
  { href: '/orders', label: 'Orders', icon: ShoppingCart },
  { href: '/inventory', label: 'Inventory', icon: Package },
];

const moreItems = [
  { href: '/walkins', label: 'Walk-ins' },
  { href: '/staff', label: 'Staff', roles: ['ADMIN', 'MANAGER'] },
  { href: '/staff-portal', label: 'Staff Portal' },
  { href: '/appointments', label: 'Appointments' },
  { href: '/billing', label: 'Billing & POS', roles: ['ADMIN', 'MANAGER'] },
  { href: '/quotations', label: 'Quotations' },
  { href: '/custom-orders', label: 'Custom Orders' },
  { href: '/drafts', label: 'Drafts', roles: ['ADMIN', 'MANAGER'] },
  { href: '/email-marketing', label: 'Email Marketing', roles: ['ADMIN', 'MANAGER'] },
  { href: '/marketing', label: 'Marketing', roles: ['ADMIN', 'MANAGER'] },
  { href: '/conversations', label: 'Conversations' },
  { href: '/calls', label: 'Call Center' },
  { href: '/reviews', label: 'Reviews' },
  { href: '/recommend', label: 'AI Recommend' },
  { href: '/settings', label: 'Settings', roles: ['ADMIN'] },
];

export default function BottomNav() {
  const pathname = usePathname();
  const [showMore, setShowMore] = useState(false);
  const { data: session } = useSession();

  const userRole = session?.user?.role || 'STAFF';

  const visibleMore = moreItems.filter(item => {
    if (!item.roles) return true;
    return item.roles.includes(userRole);
  });

  const isMoreActive = visibleMore.some(item => pathname === item.href);

  return (
    <>
      {/* More menu popup */}
      {showMore && (
        <div className="fixed inset-0 z-[90] md:hidden" onClick={() => setShowMore(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <div
            className="absolute bottom-[68px] left-3 right-3 bg-surface border border-border rounded-2xl shadow-2xl p-2 max-h-[60vh] overflow-y-auto animate-[slide-up_0.2s_ease-out]"
            onClick={e => e.stopPropagation()}
          >
            <div className="grid grid-cols-3 gap-1">
              {visibleMore.map(item => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setShowMore(false)}
                  className={`flex items-center justify-center px-2 py-3 rounded-xl text-xs font-medium transition-colors ${
                    pathname === item.href
                      ? 'bg-accent/10 text-accent'
                      : 'text-muted hover:bg-surface-hover hover:text-foreground'
                  }`}
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Bottom nav bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-[80] md:hidden">
        <div className="bg-white/80 backdrop-blur-xl border-t border-border">
          <div className="flex items-center justify-around h-[64px] px-2">
            {navItems.map(item => {
              const Icon = item.icon;
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex flex-col items-center gap-1 px-3 py-1.5 rounded-xl transition-colors min-w-[56px] ${
                    isActive
                      ? 'text-accent'
                      : 'text-muted'
                  }`}
                >
                  <Icon className={`w-5 h-5 ${isActive ? 'text-accent' : ''}`} />
                  <span className={`text-[10px] font-medium ${isActive ? 'text-accent' : ''}`}>
                    {item.label}
                  </span>
                </Link>
              );
            })}

            {/* More button */}
            <button
              onClick={() => setShowMore(!showMore)}
              className={`flex flex-col items-center gap-1 px-3 py-1.5 rounded-xl transition-colors min-w-[56px] ${
                isMoreActive || showMore ? 'text-accent' : 'text-muted'
              }`}
            >
              <MoreHorizontal className="w-5 h-5" />
              <span className="text-[10px] font-medium">More</span>
            </button>
          </div>
        </div>
      </nav>
    </>
  );
}
