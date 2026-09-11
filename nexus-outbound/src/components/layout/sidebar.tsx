"use client";

import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import {
  ArrowRight,
  Gauge,
  MoreHorizontal,
  Zap,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { navPrimary, navAdmin, type NavItem } from '@/lib/nav-items';
import { Initials } from '@/components/shared/initials';

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside
      className="fixed inset-y-0 left-0 z-40 flex w-[232px] flex-col bg-[#172844] text-slate-300 transition-transform duration-200"
    >
      {/* Brand Header */}
      <div className="flex h-16 items-center border-b border-white/10 px-5">
        <Link
          href="/dashboard"
          className="flex items-center gap-2.5"
          data-testid="link-brand"
        >
          <Image
            src="/tbm-logo-black.png"
            alt="TheBoredMonkey"
            width={160}
            height={44}
            className="object-contain"
            priority
          />
        </Link>
      </div>

      {/* Nav List */}
      <div className="flex-1 overflow-y-auto px-3 py-5">
        <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[.16em] text-slate-500">
          Workspace
        </p>
        <nav className="space-y-1">
          {navPrimary.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'group flex items-center gap-3 rounded-xl px-3 py-2.5 text-[12px] font-medium transition-colors',
                  active
                    ? 'bg-white/10 text-white'
                    : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
                )}
                data-testid={`link-nav-${item.label.toLowerCase().replace(/\s/g, '-')}`}
              >
                <Icon
                  size={16}
                  strokeWidth={active ? 2.3 : 1.8}
                  className={active ? 'text-[#72c8e8]' : 'text-slate-500 group-hover:text-slate-300'}
                />
                <span className="flex-1">{item.label}</span>
                {item.badge && (
                  <span className="rounded-md bg-[#e9974b] px-1.5 py-0.5 text-[9px] font-bold text-[#172844]">
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="my-6 h-px bg-white/10" />

        <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[.16em] text-slate-500">
          Control plane
        </p>
        <nav className="space-y-1">
          {navAdmin.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'group flex items-center gap-3 rounded-xl px-3 py-2.5 text-[12px] font-medium transition-colors',
                  active
                    ? 'bg-white/10 text-white'
                    : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
                )}
                data-testid={`link-nav-${item.label.toLowerCase().replace(/\s/g, '-')}`}
              >
                <Icon
                  size={16}
                  strokeWidth={active ? 2.3 : 1.8}
                  className={active ? 'text-[#72c8e8]' : 'text-slate-500 group-hover:text-slate-300'}
                />
                <span className="flex-1">{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Bottom Health & User Card */}
      <div className="border-t border-white/10 p-3">
        <Link
          href="/mailboxes"
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-white/5"
          data-testid="button-rail-health"
        >
          <span className="relative flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-400/10 text-emerald-300">
            <Gauge size={15} />
            <span className="absolute right-0 top-0 h-1.5 w-1.5 rounded-full bg-emerald-300" />
          </span>
          <span className="min-w-0">
            <span className="block text-xs font-medium text-slate-200">Sending health</span>
            <span className="mono block text-[10px] text-slate-500">96.8 / 100</span>
          </span>
          <ArrowRight size={13} className="ml-auto text-slate-600" />
        </Link>

        <div className="mt-3 flex items-center gap-2 border-t border-white/10 px-2 pt-3">
          <Initials value="AS" dark />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-xs font-medium text-slate-200">Avery Stone</span>
            <span className="block text-[10px] text-slate-500">Operator</span>
          </span>
          <button className="text-slate-500 hover:text-white" data-testid="button-user-menu">
            <MoreHorizontal size={16} />
          </button>
        </div>
      </div>
    </aside>
  );
}
