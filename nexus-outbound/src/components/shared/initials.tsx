import { cn } from '@/lib/utils';

export function Initials({ value, dark = false }: { value: string; dark?: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[10px] font-bold',
        dark ? 'bg-white/10 text-slate-200' : 'bg-[#dcecff] text-[#1558a5]'
      )}
    >
      {value}
    </span>
  );
}
