"use client";

import { motion } from 'framer-motion';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react';

export function KpiCard({
  label,
  value,
  change,
  icon: Icon,
  tone = 'blue',
  index = 0,
}: {
  label: string;
  value: string;
  change: string;
  icon: LucideIcon;
  tone?: 'blue' | 'green' | 'amber';
  index?: number;
}) {
  const iconBg =
    tone === 'green'
      ? 'text-emerald-600 bg-emerald-50'
      : tone === 'amber'
        ? 'text-amber-600 bg-amber-50'
        : 'text-[#2165b2] bg-[#e9f3fb]';

  const TrendIcon = change.startsWith('+')
    ? ArrowUpRight
    : change.startsWith('-')
      ? ArrowDownRight
      : Minus;

  const trendColor = change.startsWith('+')
    ? 'text-emerald-600'
    : change.startsWith('-')
      ? 'text-rose-500'
      : 'text-slate-400';

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: index * 0.07, ease: [0.22, 1, 0.36, 1] }}
      className="surface-shadow rounded-2xl border border-[#e1e8f1] bg-white p-4 sm:p-5 transition-shadow hover:surface-shadow-lg"
    >
      <div className="flex items-start justify-between">
        <span className={cn('flex h-9 w-9 items-center justify-center rounded-xl', iconBg)}>
          <Icon size={17} strokeWidth={2} />
        </span>
        <span className={cn('flex items-center gap-0.5 text-[10px] font-semibold', trendColor)}>
          <TrendIcon size={11} strokeWidth={2.5} />
          {change}
        </span>
      </div>
      <p className="mt-4 text-[11px] font-medium text-slate-500">{label}</p>
      <p
        className="mt-0.5 text-[26px] font-semibold tracking-[-.04em] text-[#172844]"
        data-testid={`metric-${label.toLowerCase().replace(/\s/g, '-')}`}
      >
        {value}
      </p>
    </motion.div>
  );
}
