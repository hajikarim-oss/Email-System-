"use client";

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function statusTone(status: string): string {
  if (['ACTIVE', 'REPLIED', 'INTERESTED', 'POTENTIAL'].includes(status))
    return 'text-emerald-700 bg-emerald-50 border-emerald-100';
  if (['PAUSED', 'WARMING', 'WORKING', 'PENDING_REVIEW'].includes(status))
    return 'text-amber-700 bg-amber-50 border-amber-100';
  if (['BOUNCED', 'UNSUBSCRIBED', 'DO_NOT_CONTACT', 'NOT_INTERESTED'].includes(status))
    return 'text-rose-700 bg-rose-50 border-rose-100';
  return 'text-slate-600 bg-slate-50 border-slate-200';
}

function dotColor(status?: string): string {
  if (['ACTIVE', 'REPLIED', 'INTERESTED', 'POTENTIAL'].includes(status ?? '')) return 'bg-emerald-500';
  if (['PAUSED', 'WARMING', 'WORKING', 'PENDING_REVIEW'].includes(status ?? '')) return 'bg-amber-500';
  if (['BOUNCED', 'UNSUBSCRIBED', 'DO_NOT_CONTACT', 'NOT_INTERESTED'].includes(status ?? '')) return 'bg-rose-500';
  return 'bg-slate-400';
}

export function StatusBadge({ children, status }: { children: ReactNode; status?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[.08em]',
        status ? statusTone(status) : 'border-slate-200 bg-slate-50 text-slate-600'
      )}
    >
      <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', dotColor(status))} />
      {children}
    </span>
  );
}
