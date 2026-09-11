"use client";

import React from 'react';
import { usePathname } from 'next/navigation';
import { Bell, Search } from 'lucide-react';
import { navPrimary } from '@/lib/nav-items';

export function Topbar() {
  const pathname = usePathname();
  const title =
    pathname.startsWith('/admin')
      ? 'Admin'
      : navPrimary.find((item) => pathname.startsWith(item.href))?.label ?? 'Overview';

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-[#dfe6f0] bg-[#f3f6fb]/95 px-4 backdrop-blur-md sm:px-7">
      <div className="flex items-center gap-3">
        <div>
          <p className="text-[11px] font-medium text-slate-400">
            Nexus Outbound / <span className="text-slate-600">{title}</span>
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          className="hidden h-9 items-center gap-2 rounded-lg border border-[#dfe6f0] bg-white px-3 text-xs text-slate-400 shadow-xs hover:border-[#b7c8dd] sm:flex"
          data-testid="button-command-search"
        >
          <Search size={14} />
          <span>Search commands</span>
          <kbd className="ml-5 rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-mono text-[9px]">
            ⌘ K
          </kbd>
        </button>
        <button
          className="relative rounded-lg p-2 text-slate-500 hover:bg-white"
          data-testid="button-notifications"
        >
          <Bell size={17} />
          <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-[#e9974b]" />
        </button>
      </div>
    </header>
  );
}
