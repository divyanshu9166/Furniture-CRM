'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, Users, ShoppingCart, Package,
  Grid3X3, X, ChevronRight,
  UserPlus, Calendar, Receipt, Headphones,
  MessageSquare, Settings, Megaphone, Ruler,
  Trash2, MailPlus, Truck, Warehouse, FileSpreadsheet,
  Factory, Wallet, BarChart3, Calculator, FileText, MapPin,
  KeyRound
} from 'lucide-react';
import { useState } from 'react';
import { useSession } from '@/components/AuthProvider';

const navItems = [
  { href: '/', label: 'Home', icon: LayoutDashboard },
  { href: '/leads', label: 'Leads', icon: Users },
  { href: '/orders', label: 'Orders', icon: ShoppingCart },
  { href: '/inventory', label: 'Stock', icon: Package },
  { href: '#more', label: 'More', icon: Grid3X3 },
];

const moreCategories = [
  {
    label: 'Sales',
    items: [
      { href: '/walkins', label: 'Walk-ins', icon: UserPlus },
      { href: '/appointments', label: 'Appointments', icon: Calendar },
      { href: '/quotations', label: 'Quotations', icon: FileText },
      { href: '/billing', label: 'Billing & POS', icon: Receipt, roles: ['ADMIN', 'MANAGER'] },
      { href: '/custom-orders', label: 'Custom Orders', icon: Ruler },
    ],
  },
  {
    label: 'Operations',
    items: [
      { href: '/purchases', label: 'Purchases', icon: Truck, roles: ['ADMIN', 'MANAGER'] },
      { href: '/godowns', label: 'Godowns', icon: Warehouse, roles: ['ADMIN', 'MANAGER'] },
      { href: '/manufacturing', label: 'Manufacturing', icon: Factory, roles: ['ADMIN', 'MANAGER'] },
      { href: '/expenses', label: 'Expenses', icon: Calculator, roles: ['ADMIN', 'MANAGER'] },
      { href: '/payroll', label: 'Payroll', icon: Wallet, roles: ['ADMIN'] },
    ],
  },
  {
    label: 'Communication',
    items: [
      { href: '/conversations', label: 'Conversations', icon: MessageSquare },
      { href: '/calls', label: 'Call Center', icon: Headphones },
      { href: '/email-marketing', label: 'Email Marketing', icon: MailPlus, roles: ['ADMIN', 'MANAGER'] },
      { href: '/marketing', label: 'Marketing', icon: Megaphone, roles: ['ADMIN', 'MANAGER'] },
    ],
  },
  {
    label: 'Finance & Reporting',
    items: [
      { href: '/gst', label: 'GST Compliance', icon: FileSpreadsheet, roles: ['ADMIN', 'MANAGER'] },
      { href: '/financials', label: 'Financials', icon: BarChart3, roles: ['ADMIN'] },
      { href: '/drafts', label: 'Drafts', icon: Trash2, roles: ['ADMIN', 'MANAGER'] },
    ],
  },
  {
    label: 'System',
    items: [
      { href: '/staff', label: 'Staff', icon: Users, roles: ['ADMIN', 'MANAGER'] },
      { href: '/staff-portal', label: 'Staff Portal', icon: KeyRound },
      { href: '/settings', label: 'Settings', icon: Settings, roles: ['ADMIN'] },
    ],
  },
];

export default function BottomNav() {
  const pathname = usePathname();
  const [showMore, setShowMore] = useState(false);
  const { data: session } = useSession();
  const userRole = session?.user?.role || 'STAFF';

  const allMoreItems = moreCategories.map(cat => ({
    ...cat,
    items: cat.items.filter(item => !item.roles || item.roles.includes(userRole)),
  })).filter(cat => cat.items.length > 0);

  const isMoreActive = allMoreItems.some(cat =>
    cat.items.some(item => pathname === item.href)
  );

  return (
    <>
      {/* More Drawer — slide-up sheet */}
      {showMore && (
        <div
          className="fixed inset-0 z-[90] md:hidden"
          onClick={() => setShowMore(false)}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

          {/* Sheet */}
          <div
            className="absolute bottom-0 left-0 right-0 bg-white rounded-t-3xl shadow-2xl overflow-hidden"
            style={{ maxHeight: '80vh', animation: 'slideUp 0.28s cubic-bezier(0.32,0.72,0,1)' }}
            onClick={e => e.stopPropagation()}
          >
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full bg-border" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-border">
              <h3 className="text-sm font-semibold text-foreground">All Modules</h3>
              <button
                onClick={() => setShowMore(false)}
                className="p-1.5 rounded-full bg-surface-hover text-muted"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Categories */}
            <div className="overflow-y-auto" style={{ maxHeight: 'calc(80vh - 80px)' }}>
              {allMoreItems.map(cat => (
                <div key={cat.label}>
                  <p className="px-5 pt-4 pb-1.5 text-[10px] font-semibold text-muted uppercase tracking-widest">
                    {cat.label}
                  </p>
                  <div className="px-3 space-y-0.5">
                    {cat.items.map(item => {
                      const Icon = item.icon;
                      const isActive = pathname === item.href;
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          onClick={() => setShowMore(false)}
                          className={`flex items-center gap-3.5 px-3 py-2.5 rounded-xl transition-colors ${
                            isActive
                              ? 'bg-accent/8 text-accent'
                              : 'text-foreground hover:bg-surface-hover'
                          }`}
                        >
                          <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${
                            isActive ? 'bg-accent/15' : 'bg-surface'
                          }`}>
                            <Icon className={`w-4 h-4 ${isActive ? 'text-accent' : 'text-muted'}`} />
                          </div>
                          <span className={`text-sm font-medium flex-1 ${isActive ? 'text-accent' : 'text-foreground'}`}>
                            {item.label}
                          </span>
                          <ChevronRight className="w-3.5 h-3.5 text-muted/50" />
                        </Link>
                      );
                    })}
                  </div>
                </div>
              ))}
              {/* Safe area bottom */}
              <div className="h-6" />
            </div>
          </div>
        </div>
      )}

      {/* Bottom Nav Bar */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-[80] md:hidden"
        role="navigation"
        aria-label="Bottom navigation"
      >
        {/* Frosted glass bar */}
        <div
          className="border-t border-border/60"
          style={{
            background: 'rgba(255,255,255,0.92)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            paddingBottom: 'env(safe-area-inset-bottom)',
          }}
        >
          <div className="flex items-center justify-around px-1 h-[60px]">
            {navItems.map(item => {
              const Icon = item.icon;
              const isMore = item.href === '#more';
              const isActive = isMore
                ? isMoreActive || showMore
                : pathname === item.href;

              if (isMore) {
                return (
                  <button
                    key="more"
                    onClick={() => setShowMore(!showMore)}
                    className="flex flex-col items-center gap-0.5 px-2 min-w-[52px] py-1 cursor-pointer"
                    aria-label="More modules"
                  >
                    <div className={`relative flex items-center justify-center w-10 h-7 rounded-full transition-all duration-200 ${
                      isActive ? 'bg-accent/12' : ''
                    }`}>
                      <Icon className={`w-5 h-5 transition-colors ${isActive ? 'text-accent' : 'text-muted'}`} />
                    </div>
                    <span className={`text-[10px] font-medium transition-colors leading-tight ${isActive ? 'text-accent' : 'text-muted'}`}>
                      {item.label}
                    </span>
                  </button>
                );
              }

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="flex flex-col items-center gap-0.5 px-2 min-w-[52px] py-1 cursor-pointer"
                  aria-label={item.label}
                  aria-current={isActive ? 'page' : undefined}
                >
                  {/* Pill indicator + icon */}
                  <div className={`relative flex items-center justify-center w-10 h-7 rounded-full transition-all duration-200 ${
                    isActive ? 'bg-accent/12' : ''
                  }`}>
                    <Icon className={`w-5 h-5 transition-colors ${isActive ? 'text-accent' : 'text-muted'}`} />
                  </div>
                  <span className={`text-[10px] font-medium transition-colors leading-tight ${isActive ? 'text-accent font-semibold' : 'text-muted'}`}>
                    {item.label}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      </nav>

      <style jsx>{`
        @keyframes slideUp {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
      `}</style>
    </>
  );
}
