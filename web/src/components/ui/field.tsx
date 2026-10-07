// Form field primitives — slim, brae-density.
//
// Replaces the half-dozen ad-hoc inputs across pages. Two main pieces:
//
//   <SearchInput value={q} onChange={setQ} placeholder="Search…" />
//   <TextInput value={x} onChange={setX} placeholder="Domain" />
//
// All 28px tall, hairline border, 12.5px text, 12px horizontal padding,
// focus ring tuned to sky-200 so it blends with the rest of the chrome.

import React from "react";
import { SearchIcon, XIcon, ChevronUpIcon, ChevronDownIcon } from "lucide-react";
import { cn } from "@/lib/utils";

// 16px on mobile so iOS Safari doesn't auto-zoom on focus; 12.5px from md up.
const base =
    "h-7 px-2.5 rounded-md border border-slate-200 bg-white text-[16px] md:text-[12.5px] text-slate-900 placeholder:text-slate-400 outline-none transition-colors focus:border-slate-800 focus:ring-2 focus:ring-[#FFE600]/30 disabled:bg-slate-50 disabled:text-slate-400";

export function TextInput({
    value,
    onChange,
    placeholder,
    type = "text",
    disabled,
    autoFocus,
    autoComplete,
    className,
    onKeyDown,
    onBlur,
    invalid,
    title,
}: {
    value: string;
    onChange: (v: string) => void;
    placeholder?: string;
    type?: string;
    disabled?: boolean;
    autoFocus?: boolean;
    // Credential fields need it or password managers cannot fill or save them.
    autoComplete?: string;
    className?: string;
    onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
    // Fires when the field loses focus. Use it for inputs that parse their
    // text into something else (a clock value, a number) so the parse happens
    // once the user settles rather than on every keystroke.
    onBlur?: () => void;
    // Marks the value as rejected: red hairline + aria-invalid for screen
    // readers. Pair it with `title` (or nearby text) saying what is wrong.
    invalid?: boolean;
    title?: string;
}) {
    return (
        <input
            type={type}
            value={value}
            placeholder={placeholder}
            disabled={disabled}
            autoFocus={autoFocus}
            autoComplete={autoComplete}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={onKeyDown}
            onBlur={onBlur}
            aria-invalid={invalid || undefined}
            title={title}
            className={cn(
                base,
                "min-w-0",
                invalid && "border-red-300 focus:border-red-400 focus:ring-red-100",
                className,
            )}
        />
    );
}

export function SearchInput({
    value,
    onChange,
    placeholder = "Search…",
    autoFocus,
    className,
    onKeyDown,
    onSubmit,
}: {
    value: string;
    onChange: (v: string) => void;
    placeholder?: string;
    autoFocus?: boolean;
    className?: string;
    onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
    onSubmit?: (v: string) => void;
}) {
    return (
        <div className={cn(
            "h-7 pl-2 pr-1 rounded-md border border-slate-200 bg-white flex items-center gap-1.5 focus-within:border-slate-800 focus-within:ring-2 focus-within:ring-[#FFE600]/30 transition-colors min-w-0",
            className,
        )}>
            <SearchIcon className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <input
                value={value}
                placeholder={placeholder}
                autoFocus={autoFocus}
                onChange={(e) => onChange(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key === "Enter") onSubmit?.(value);
                    onKeyDown?.(e);
                }}
                className="flex-1 min-w-0 h-full bg-transparent outline-none text-[16px] md:text-[12.5px] text-slate-900 placeholder:text-slate-400"
            />
            {value && (
                <button
                    type="button"
                    onClick={() => onChange("")}
                    aria-label="Clear search"
                    className="size-5 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 flex items-center justify-center shrink-0 transition-colors cursor-pointer"
                >
                    <XIcon className="w-3 h-3" />
                </button>
            )}
        </div>
    );
}

export function Label({ children, className }: { children: React.ReactNode; className?: string }) {
    return (
        <label className={cn(
            "text-[10px] uppercase tracking-[0.14em] text-slate-500 font-semibold block mb-1.5",
            className,
        )}>
            {children}
        </label>
    );
}

export function FieldRow({ children, className }: { children: React.ReactNode; className?: string }) {
    return (
        <div className={cn("space-y-1.5", className)}>
            {children}
        </div>
    );
}

// NumberInput — our own number field. No native browser spinner (those
// stubby up/down arrows are stripped with appearance:none); instead a
// pair of themed chevron steppers sits flush on the right inside the
// field border. Value is a number; onChange always gets a clamped
// number. `suffix` renders a muted unit label (e.g. "emails / day")
// inside the field, before the steppers.
//
// Internal string state fix: we let the user type freely (so "30" doesn't
// immediately clamp to min=3 while mid-typing "300") and only clamp on
// blur, Enter, or stepper clicks.
export function NumberInput({
    value,
    onChange,
    onCommit,
    min,
    max,
    step = 1,
    disabled,
    placeholder,
    suffix,
    align = "left",
    className,
}: {
    value: number;
    onChange: (value: number) => void;
    onCommit?: (value: number) => void;
    min?: number;
    max?: number;
    step?: number;
    disabled?: boolean;
    placeholder?: string;
    suffix?: React.ReactNode;
    align?: "left" | "right" | "center";
    className?: string;
}) {
    const clamp = (n: number) => {
        if (Number.isNaN(n)) return min ?? 0;
        if (min !== undefined && n < min) return min;
        if (max !== undefined && n > max) return max;
        return n;
    };

    // Internal text state lets the user type freely without mid-keystroke clamping.
    const [raw, setRaw] = React.useState(() => (Number.isFinite(value) ? String(value) : ""));
    const focused = React.useRef(false);

    // Sync when the external value changes while the field is NOT focused.
    React.useEffect(() => {
        if (!focused.current) {
            setRaw(Number.isFinite(value) ? String(value) : "");
        }
    }, [value]);

    const commit = () => {
        const parsed = raw === "" ? (min ?? 0) : Number(raw);
        const clamped = clamp(Number.isNaN(parsed) ? (min ?? 0) : parsed);
        setRaw(String(clamped));
        onChange(clamped);
        onCommit?.(clamped);
    };

    const bump = (dir: 1 | -1) => {
        if (disabled) return;
        const base = Number.isFinite(value) ? value : (min ?? 0);
        const next = clamp(base + dir * step);
        setRaw(String(next));
        onChange(next);
        onCommit?.(next);
    };

    const atMax = max !== undefined && value >= max;
    const atMin = min !== undefined && value <= min;

    return (
        <div
            className={cn(
                "relative inline-flex items-center h-7 rounded-md border border-slate-200 bg-white transition-colors focus-within:border-slate-800 focus-within:ring-2 focus-within:ring-[#FFE600]/30",
                disabled && "bg-slate-50",
                className,
            )}
        >
            <input
                type="text"
                inputMode="numeric"
                value={raw}
                disabled={disabled}
                placeholder={placeholder}
                onChange={(e) => {
                    const v = e.target.value;
                    // Allow digits, optional leading minus, nothing else
                    if (v === "" || /^-?\d*$/.test(v)) {
                        setRaw(v);
                        if (v !== "") {
                            const n = Number(v);
                            if (!Number.isNaN(n)) {
                                // Cap at max while typing if needed, but DO NOT clamp min mid-keystroke
                                const live = max !== undefined && n > max ? max : n;
                                onChange(live);
                            }
                        }
                    }
                }}
                onFocus={() => { focused.current = true; }}
                onBlur={() => { focused.current = false; commit(); }}
                onKeyDown={(e) => {
                    if (e.key === "Enter") {
                        e.preventDefault();
                        commit();
                        (e.target as HTMLInputElement).blur();
                    }
                }}
                className={cn(
                    "w-full min-w-0 h-full bg-transparent outline-none px-2.5 text-[16px] md:text-[12.5px] text-slate-900 tabular-nums disabled:text-slate-400",
                    "[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none",
                    align === "right" && "text-right",
                    align === "center" && "text-center",
                )}
            />
            {suffix ? (
                <span className="pr-2 text-[11px] text-slate-400 whitespace-nowrap select-none">{suffix}</span>
            ) : null}
            <div className="flex flex-col self-stretch border-l border-slate-200 shrink-0">
                <button
                    type="button"
                    tabIndex={-1}
                    aria-label="Increase"
                    disabled={disabled || atMax}
                    onClick={() => bump(1)}
                    className="flex-1 px-1 flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-50 disabled:opacity-30 disabled:hover:bg-transparent transition-colors rounded-tr-md cursor-pointer"
                >
                    <ChevronUpIcon className="w-3 h-3" />
                </button>
                <button
                    type="button"
                    tabIndex={-1}
                    aria-label="Decrease"
                    disabled={disabled || atMin}
                    onClick={() => bump(-1)}
                    className="flex-1 px-1 flex items-center justify-center border-t border-slate-200 text-slate-400 hover:text-slate-700 hover:bg-slate-50 disabled:opacity-30 disabled:hover:bg-transparent transition-colors rounded-br-md cursor-pointer"
                >
                    <ChevronDownIcon className="w-3 h-3" />
                </button>
            </div>
        </div>
    );
}

