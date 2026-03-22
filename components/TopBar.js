'use client';

import { Bell, Search, Menu, ChevronDown } from 'lucide-react';
import { useState } from 'react';
import { useSidebarContext } from './SidebarContext';

export default function TopBar() {
  const [searchFocused, setSearchFocused] = useState(false);
  const { setSidebarOpen } = useSidebarContext();

  return (
    <header className="h-[64px] border-b border-border bg-white flex items-center justify-between px-4 md:px-6 sticky top-0 z-40">
      {/* Left section */}
      <div className="flex items-center gap-3 flex-1 min-w-0">
        {/* Hamburger — mobile only */}
        <button
          type="button"
          onClick={() => setSidebarOpen(true)}
          className="md:hidden p-2 -ml-1 rounded-lg hover:bg-surface-hover transition-colors flex-shrink-0 relative z-10"
          aria-label="Open menu"
        >
          <Menu className="w-5 h-5 text-foreground" />
        </button>

        {/* Search */}
        <div className={`relative flex items-center transition-all duration-200 min-w-0 ${searchFocused ? 'md:w-[400px] w-full' : 'md:w-[300px] w-full'}`}>
          <Search className="absolute left-3 w-4 h-4 text-muted pointer-events-none" />
          <input
            type="text"
            placeholder="Search leads, products, orders..."
            className="w-full pl-10 pr-4 py-2 bg-surface-hover rounded-lg border border-border text-sm placeholder:text-muted/60 focus:bg-white transition-all"
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
          />
        </div>
      </div>

      {/* Right section */}
      <div className="flex items-center gap-2 md:gap-3 flex-shrink-0 ml-2">
        {/* Notifications */}
        <button className="relative p-2 rounded-lg hover:bg-surface-hover transition-colors">
          <Bell className="w-[18px] h-[18px] text-muted" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-danger rounded-full" />
        </button>

        {/* Divider — desktop only */}
        <div className="w-px h-7 bg-border hidden md:block" />

        {/* User */}
        <button className="flex items-center gap-2.5 hover:bg-surface-hover rounded-lg px-2.5 py-1.5 transition-colors">
          <div className="w-7 h-7 rounded-full bg-stone-700 flex items-center justify-center text-white text-xs font-semibold">
            A
          </div>
          <div className="text-left hidden md:block">
            <p className="text-sm font-medium text-foreground leading-tight">Admin</p>
            <p className="text-[10px] text-muted">Store Manager</p>
          </div>
          <ChevronDown className="w-3 h-3 text-muted hidden md:block" />
        </button>
      </div>
    </header>
  );
}
