"use client";

import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

export function GaugeRing({
  value,
  max = 100,
  size = 56,
  strokeWidth = 5,
  className,
}: {
  value: number;
  max?: number;
  size?: number;
  strokeWidth?: number;
  className?: string;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const percent = Math.min(1, Math.max(0, value / max));
  const offset = circumference * (1 - percent);

  const color =
    percent >= 0.95
      ? '#2caa79'
      : percent >= 0.85
        ? '#e9a54b'
        : percent >= 0.7
          ? '#e0884b'
          : '#e05555';

  return (
    <div className={cn('relative inline-flex items-center justify-center', className)}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#edf2f7"
          strokeWidth={strokeWidth}
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1], delay: 0.2 }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="mono text-[11px] font-bold text-[#172844]">{value}</span>
      </div>
    </div>
  );
}

export function GaugeRingLarge({
  value,
  max = 100,
  label = 'out of 100',
}: {
  value: number;
  max?: number;
  label?: string;
}) {
  const size = 112;
  const strokeWidth = 8;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const percent = Math.min(1, Math.max(0, value / max));
  const offset = circumference * (1 - percent);
  const color = percent >= 0.95 ? '#2caa79' : percent >= 0.85 ? '#e9a54b' : '#e05555';

  return (
    <div className="relative flex h-28 w-28 items-center justify-center rounded-full">
      <svg
        width={size}
        height={size}
        className="absolute inset-0 -rotate-90"
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#edf2f7"
          strokeWidth={strokeWidth}
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1, ease: [0.22, 1, 0.36, 1], delay: 0.3 }}
        />
      </svg>
      <div className="flex flex-col items-center justify-center">
        <motion.span
          className="text-2xl font-semibold tracking-[-.05em] text-[#172844]"
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, delay: 0.6 }}
        >
          {value}
        </motion.span>
        <span className="text-[9px] uppercase tracking-wider text-slate-400">{label}</span>
      </div>
    </div>
  );
}
