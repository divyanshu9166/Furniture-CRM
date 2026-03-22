'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Users,
  Calendar,
  Package,
  ShoppingCart,
  Megaphone,
  MessageSquare,
  Star,
  Settings,
  ChevronLeft,
  ChevronRight,
  Armchair,
  Sparkles,
  Headphones,
  UserPlus,
  UsersRound,
  Receipt,
  Ruler,
  KeyRound,
  X,
} from 'lucide-react';
import { useState } from 'react';
import { useSidebarContext } from './SidebarContext';

const navItems = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/walkins', label: 'Walk-ins', icon: UserPlus },
  { href: '/leads', label: 'Leads', icon: Users },
  { href: '/staff', label: 'Staff', icon: UsersRound },
  { href: '/staff-portal', label: 'Staff Portal', icon: KeyRound },
  { href: '/appointments', label: 'Appointments', icon: Calendar },
  { href: '/inventory', label: 'Inventory', icon: Package },
  { href: '/orders', label: 'Orders', icon: ShoppingCart },
  { href: '/billing', label: 'Billing & POS', icon: Receipt },
  { href: '/custom-orders', label: 'Custom Orders', icon: Ruler },
  { href: '/marketing', label: 'Marketing', icon: Megaphone },
  { href: '/conversations', label: 'Conversations', icon: MessageSquare },
  { href: '/calls', label: 'Call Center', icon: Headphones },
  { href: '/reviews', label: 'Reviews', icon: Star },
  { href: '/recommend', label: 'AI Recommend', icon: Sparkles },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export default function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const { sidebarOpen, setSidebarOpen } = useSidebarContext();

  return (
    <>
      {/* Mobile overlay backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-[55] md:hidden animate-[fade-in_0.2s_ease]"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed top-0 left-0 h-screen bg-sidebar flex flex-col z-[60] transition-all duration-300
          ${/* Desktop */ ''}
          max-md:w-[280px]
          ${sidebarOpen ? 'max-md:translate-x-0' : 'max-md:translate-x-[-100%]'}
          ${collapsed ? 'md:w-[68px]' : 'md:w-[260px]'}
        `}
      >
        {/* Logo */}
        <div className="flex items-center justify-between px-5 h-[64px] border-b border-white/10 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center flex-shrink-0">
              <Armchair className="w-4.5 h-4.5 text-white" />
            </div>
            {(!collapsed || sidebarOpen) && (
              <div>
                <h1 className="text-sm font-semibold text-white tracking-wide">FurnitureCRM</h1>
                <p className="text-[10px] text-white/40 tracking-widest uppercase">Store Manager</p>
              </div>
            )}
          </div>
          {/* Mobile close button */}
          <button
            onClick={() => setSidebarOpen(false)}
            className="md:hidden p-1.5 rounded-lg text-white/40 hover:text-white/70 hover:bg-white/5 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-3 px-2.5 space-y-0.5 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setSidebarOpen(false)}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] font-medium transition-all duration-150 ${
                  isActive
                    ? 'bg-white/15 text-white'
                    : 'text-white/50 hover:text-white/80 hover:bg-white/5'
                }`}
                title={collapsed && !sidebarOpen ? item.label : undefined}
              >
                <Icon className={`w-[17px] h-[17px] flex-shrink-0 ${isActive ? 'text-white' : ''}`} />
                {(!collapsed || sidebarOpen) && <span>{item.label}</span>}
              </Link>
            );
          })}
        </nav>

        {/* User section (mobile only) */}
        <div className="md:hidden px-4 py-3 border-t border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-stone-700 flex items-center justify-center text-white text-xs font-semibold">
              A
            </div>
            <div>
              <p className="text-sm font-medium text-white">Admin</p>
              <p className="text-[10px] text-white/40">Store Manager</p>
            </div>
          </div>
        </div>

        {/* Collapse toggle (desktop only) */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="hidden md:flex mx-2.5 mb-3 p-2 rounded-lg border border-white/10 text-white/40 hover:text-white/70 hover:bg-white/5 transition-all duration-150 items-center justify-center"
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </aside>
    </>
  );
}

export function useSidebarWidth() {
  return 260;
}
