import { cn } from '@/lib/utils';
import { ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react';

export function ChartAnnotation({
  label,
  value,
  trend,
  className,
}: {
  label: string;
  value: string;
  trend?: 'up' | 'down' | 'flat';
  className?: string;
}) {
  const TrendIcon = trend === 'up' ? ArrowUpRight : trend === 'down' ? ArrowDownRight : Minus;
  const trendColor =
    trend === 'up'
      ? 'text-emerald-600 bg-emerald-50 border-emerald-100'
      : trend === 'down'
        ? 'text-rose-500 bg-rose-50 border-rose-100'
        : 'text-slate-500 bg-slate-50 border-slate-200';

  return (
    <div
      className={cn(
        'inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5',
        'bg-white shadow-md animate-fade-in-up',
        trendColor,
        className
      )}
    >
      <TrendIcon size={12} />
      <span className="mono text-[10px] font-semibold">{value}</span>
      <span className="text-[9px] text-slate-400">{label}</span>
    </div>
  );
}

export function ChartAnnotationGroup({
  annotations,
  className,
}: {
  annotations: Array<{
    label: string;
    value: string;
    trend?: 'up' | 'down' | 'flat';
  }>;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      {annotations.map((a, i) => (
        <ChartAnnotation
          key={`${a.label}-${i}`}
          label={a.label}
          value={a.value}
          trend={a.trend}
        />
      ))}
    </div>
  );
}
