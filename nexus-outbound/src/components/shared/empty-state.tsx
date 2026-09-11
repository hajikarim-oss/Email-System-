"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { FolderOpen, Inbox, Mail, Users, Send, BarChart3 } from "lucide-react";

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  campaigns: Send,
  leads: Users,
  inbox: Inbox,
  mailboxes: Mail,
  analytics: BarChart3,
  default: FolderOpen,
};

interface EmptyStateProps {
  icon?: string;
  title: string;
  description: string;
  action?: {
    label: string;
    href?: string;
    onClick?: () => void;
  };
  className?: string;
}

export function EmptyState({
  icon = "default",
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  const Icon = iconMap[icon] || iconMap.default;

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-xl border border-dashed border-white/10 bg-[#111128]/50 px-6 py-16 text-center",
        className
      )}
    >
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-white/5">
        <Icon className="h-8 w-8 text-gray-500" />
      </div>
      <h3 className="mb-1 text-lg font-semibold text-white">{title}</h3>
      <p className="mb-6 max-w-sm text-sm text-gray-500">{description}</p>
      {action && (
        action.href ? (
          <a
            href={action.href}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white shadow-lg shadow-blue-600/25 transition-all hover:bg-blue-500 hover:shadow-blue-500/30"
          >
            {action.label}
          </a>
        ) : (
          <button
            onClick={action.onClick}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white shadow-lg shadow-blue-600/25 transition-all hover:bg-blue-500 hover:shadow-blue-500/30"
          >
            {action.label}
          </button>
        )
      )}
    </div>
  );
}
