"use client";

import React, { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import {
  Mail,
  MessageSquare,
  Video,
  Sparkles,
  Search,
  SlidersHorizontal,
  HelpCircle,
  Settings,
  Grid,
  ChevronDown,
  LayoutDashboard,
  Target,
  Users,
  ShieldCheck,
  Zap,
  Menu,
  X,
  Send,
} from "lucide-react";
import { ReactQueryProvider } from "@/components/providers/query-provider";
import { ProfileDropdown } from "@/components/shared/profile-dropdown";
import { cn } from "@/lib/utils";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [globalSearch, setGlobalSearch] = useState("");

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!globalSearch.trim()) return;
    if (globalSearch.toLowerCase().startsWith("in:sent")) {
      router.push("/inbox?search=in:sent");
    } else {
      router.push(`/inbox?search=${encodeURIComponent(globalSearch)}`);
    }
  };

  const navApps = [
    { href: "/inbox", label: "Mail", icon: Mail },
    { href: "/prospects", label: "Prospects", icon: Search },
    { href: "/analytics", label: "Analytics", icon: LayoutDashboard },
    { href: "/mailboxes", label: "Senders", icon: ShieldCheck },
    { href: "/admin/team", label: "Team", icon: Users },
  ];

  const isInboxPage = pathname === "/inbox";

  return (
    <ReactQueryProvider>
      <div className="flex h-screen w-screen overflow-hidden bg-[#f6f8fc] font-sans text-[#1f1f1f] select-none">
        {/* ========================================================================= */}
        {/* 1. LEFT SLIM WORKSPACE APP RAIL (56px Compact) */}
        {/* ========================================================================= */}
        <aside className="w-[56px] shrink-0 flex flex-col items-center justify-between border-r border-[#e0e5ec] bg-[#f0f4f9] py-2 z-30">
          <div className="flex flex-col items-center gap-2 w-full">
            {/* Top Hamburger Logo */}
            <button className="grid h-8 w-8 place-items-center rounded-xl hover:bg-slate-200/80 text-[#444746] transition-colors">
              <Menu size={17} />
            </button>

            {/* App Icons */}
            <nav className="flex flex-col items-center gap-1 w-full px-1">
              {navApps.map((item) => {
                const Icon = item.icon;
                const isActive =
                  pathname === item.href ||
                  (item.href !== "/dashboard" && pathname.startsWith(item.href));

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "group relative flex flex-col items-center justify-center w-full py-1 rounded-xl transition-all",
                      isActive
                        ? "text-[#001d35]"
                        : "text-[#444746] hover:bg-slate-200/60"
                    )}
                    title={item.label}
                  >
                    <div
                      className={cn(
                        "relative flex h-7 w-9 items-center justify-center rounded-lg transition-all",
                        isActive ? "bg-[#d3e3fd] text-[#001d35] font-bold shadow-2xs" : ""
                      )}
                    >
                      <Icon size={16} strokeWidth={isActive ? 2.2 : 1.8} />
                    </div>
                    <span
                      className={cn(
                        "mt-0.5 text-[9px] font-medium tracking-tight transition-colors",
                        isActive ? "font-bold text-[#001d35]" : "text-[#5f6368]"
                      )}
                    >
                      {item.label}
                    </span>
                  </Link>
                );
              })}
            </nav>
          </div>

          {/* Bottom Gemini AI Sparkle Icon */}
          <div className="flex flex-col items-center pb-0.5">
            <button
              onClick={() => router.push("/inbox")}
              className="grid h-8 w-8 place-items-center rounded-xl hover:bg-slate-200/80 text-[#0b57d0] transition-colors"
              title="Gemini AI Assistant"
            >
              <Sparkles size={16} className="animate-pulse" />
            </button>
          </div>
        </aside>

        {/* ========================================================================= */}
        {/* 2. MAIN WORKSPACE CONTAINER (TOP HEADER + CONTENT) */}
        {/* ========================================================================= */}
        <div className="flex flex-1 flex-col min-w-0 overflow-hidden bg-white">
          {/* Top Compact Header Strip (h-12 = 48px) */}
          <header className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-[#e0e5ec] bg-[#f0f4f9] px-3 sm:px-5">
            {/* Brand Title */}
            <div className="flex items-center gap-2">
              <Image
                src="/tbm-logo-black.png"
                alt="TheBoredMonkey"
                width={130}
                height={36}
                className="object-contain"
                priority
              />
            </div>

            {/* Central Search Pill */}
            <form
              onSubmit={handleSearchSubmit}
              className="flex flex-1 max-w-xl items-center gap-2.5 rounded-full bg-[#eaf1fb] px-3.5 py-1.5 shadow-2xs focus-within:bg-white focus-within:shadow-xs focus-within:ring-1 focus-within:ring-slate-300 transition-all"
            >
              <Search size={15} className="text-[#5f6368] shrink-0" />
              <input
                type="text"
                placeholder="Search mail, leads, campaigns (e.g. in:sent, sarah@acme.io)..."
                value={globalSearch}
                onChange={(e) => setGlobalSearch(e.target.value)}
                className="w-full bg-transparent text-xs text-[#1f1f1f] outline-none placeholder:text-[#5f6368]"
              />
              {globalSearch && (
                <button
                  type="button"
                  onClick={() => setGlobalSearch("")}
                  className="p-0.5 rounded-full hover:bg-slate-200 text-[#5f6368]"
                >
                  <X size={13} />
                </button>
              )}
              <button
                type="button"
                className="p-0.5 rounded-full hover:bg-slate-200 text-[#5f6368]"
              >
                <SlidersHorizontal size={14} />
              </button>
            </form>

            {/* Right Account & Indicators */}
            <div className="flex items-center gap-2 text-[#5f6368]">
              {/* Active Status Badge */}
              <div className="hidden sm:flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-0.5 text-[11px] font-bold text-slate-700 shadow-2xs">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span>Active</span>
                <ChevronDown size={11} className="text-slate-400" />
              </div>

              <button className="grid h-7 w-7 place-items-center rounded-lg hover:bg-slate-200 text-[#5f6368]">
                <HelpCircle size={15} />
              </button>
              <button
                onClick={() => router.push("/admin/settings")}
                className="grid h-7 w-7 place-items-center rounded-lg hover:bg-slate-200 text-[#5f6368]"
              >
                <Settings size={15} />
              </button>
              <button className="grid h-7 w-7 place-items-center rounded-lg hover:bg-slate-200 text-[#5f6368]">
                <Grid size={15} />
              </button>

              {/* Profile & Account Switcher Dropdown */}
              <div className="flex items-center pl-1.5 border-l border-slate-300">
                <ProfileDropdown />
              </div>
            </div>
          </header>

          {/* Page Body Viewport */}
          <main className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-5">
            {children}
          </main>
        </div>
      </div>
    </ReactQueryProvider>
  );
}
