export function fmtNumber(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}m`;
  if (value >= 10_000) return `${(value / 1000).toFixed(1)}k`;
  return new Intl.NumberFormat('en-US').format(value);
}

export function fmtRate(numerator: number, denominator: number): string {
  if (!denominator || denominator <= 0) return '0.0%';
  return `${((numerator / denominator) * 100).toFixed(1)}%`;
}

export function fmtRelativeTime(dateString: string): string {
  if (!dateString) return 'Just now';
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return dateString;
  const now = new Date();
  const diffSec = Math.floor((now.getTime() - date.getTime()) / 1000);
  if (diffSec < 60) return 'Just now';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return `${Math.floor(diffSec / 86400)}d ago`;
}

export function getHealthBand(health: number) {
  if (health >= 90) {
    return {
      label: 'Healthy',
      textClass: 'text-emerald-700',
      bgClass: 'bg-emerald-50',
      borderClass: 'border-emerald-200',
      dotClass: 'bg-emerald-500',
      strokeColor: '#10b981',
    };
  }
  if (health >= 75) {
    return {
      label: 'Warning',
      textClass: 'text-amber-700',
      bgClass: 'bg-amber-50',
      borderClass: 'border-amber-200',
      dotClass: 'bg-amber-500',
      strokeColor: '#f59e0b',
    };
  }
  return {
    label: 'Critical',
    textClass: 'text-rose-700',
    bgClass: 'bg-rose-50',
    borderClass: 'border-rose-200',
    dotClass: 'bg-rose-500',
    strokeColor: '#ef4444',
  };
}

export function getScoreBand(score: number) {
  if (score >= 80) {
    return {
      label: 'High Intent',
      textClass: 'text-blue-700',
      bgClass: 'bg-blue-50',
      strokeColor: '#2165b2',
    };
  }
  if (score >= 50) {
    return {
      label: 'Warm',
      textClass: 'text-amber-700',
      bgClass: 'bg-amber-50',
      strokeColor: '#f59e0b',
    };
  }
  return {
    label: 'Cold',
    textClass: 'text-slate-600',
    bgClass: 'bg-slate-100',
    strokeColor: '#94a3b8',
  };
}

export function getBounceBand(bounceRate: number) {
  if (bounceRate <= 2.0) {
    return { label: 'Optimal', textClass: 'text-emerald-600', bgClass: 'bg-emerald-50' };
  }
  if (bounceRate <= 5.0) {
    return { label: 'Elevated', textClass: 'text-amber-600', bgClass: 'bg-amber-50' };
  }
  return { label: 'Critical', textClass: 'text-rose-600', bgClass: 'bg-rose-50' };
}
