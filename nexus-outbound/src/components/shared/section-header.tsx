import type { ReactNode } from 'react';

export function SectionHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
      <div>
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-[.18em] text-[#2975bb]">
          {eyebrow ?? 'Workspace'}
        </p>
        <h1 className="text-[25px] font-semibold tracking-[-.035em] text-[#172844] sm:text-[28px]">
          {title}
        </h1>
        {description && (
          <p className="mt-1 text-sm text-slate-500">{description}</p>
        )}
      </div>
      {action}
    </div>
  );
}
