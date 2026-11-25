import { AnimatePresence, motion } from "framer-motion";
import React from "react";
import { createPortal } from "react-dom";
import {
    format,
    parse,
    isValid,
    addMonths,
    subMonths,
    addYears,
    subYears,
    startOfMonth,
    endOfMonth,
    startOfWeek,
    endOfWeek,
    eachDayOfInterval,
    isSameMonth,
    isSameDay,
    isBefore,
    isAfter,
    differenceInCalendarDays,
} from "date-fns";
import { CalendarIcon, ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { cn } from "@/lib/utils";

function parseISODate(v: string): Date | null {
    if (!v) return null;
    const d = parse(v, "yyyy-MM-dd", new Date());
    return isValid(d) ? d : null;
}

export function DateRangePicker({
    from,
    to,
    onApply,
    className,
}: {
    from: string;
    to: string;
    onApply: (range: { from: string; to: string }) => void;
    className?: string;
}) {
    const [open, setOpen] = React.useState(false);
    const triggerRef = React.useRef<HTMLButtonElement>(null);
    const panelRef = React.useRef<HTMLDivElement>(null);
    const [pos, setPos] = React.useState<{ top: number; left: number } | null>(null);

    const committedStart = parseISODate(from);
    const committedEnd = parseISODate(to);

    const [draftStart, setDraftStart] = React.useState<Date | null>(committedStart);
    const [draftEnd, setDraftEnd] = React.useState<Date | null>(committedEnd);
    const [hoverDate, setHoverDate] = React.useState<Date | null>(null);
    const [selectingSecond, setSelectingSecond] = React.useState(false);
    const [currentMonth, setCurrentMonth] = React.useState<Date>(committedStart || new Date());

    React.useEffect(() => {
        if (open) {
            const s = parseISODate(from);
            const e = parseISODate(to);
            setDraftStart(s);
            setDraftEnd(e);
            setSelectingSecond(false);
            setHoverDate(null);
            if (s) setCurrentMonth(s);
        }
    }, [open, from, to]);

    // Close on outside click
    React.useEffect(() => {
        if (!open) return;
        const onDown = (e: MouseEvent | TouchEvent) => {
            const t = e.target as Node;
            if (
                triggerRef.current &&
                !triggerRef.current.contains(t) &&
                panelRef.current &&
                !panelRef.current.contains(t)
            ) {
                setOpen(false);
            }
        };
        document.addEventListener("mousedown", onDown);
        document.addEventListener("touchstart", onDown);
        return () => {
            document.removeEventListener("mousedown", onDown);
            document.removeEventListener("touchstart", onDown);
        };
    }, [open]);

    React.useLayoutEffect(() => {
        if (!open) {
            setPos(null);
            return;
        }
        const compute = () => {
            const trigger = triggerRef.current;
            const panel = panelRef.current;
            if (!trigger) return;
            const r = trigger.getBoundingClientRect();
            const sideOffset = 8;
            const ch = panel?.offsetHeight ?? 360;
            const cw = panel?.offsetWidth ?? 284;
            let top = r.bottom + sideOffset;
            if (ch && top + ch > window.innerHeight - 8) {
                const above = r.top - ch - sideOffset;
                if (above >= 8) top = above;
            }
            let left = r.left;
            if (cw && left + cw > window.innerWidth - 8) left = window.innerWidth - 8 - cw;
            if (left < 8) left = 8;
            setPos({ top, left });
        };
        compute();
        window.addEventListener("resize", compute);
        window.addEventListener("scroll", compute, true);
        return () => {
            window.removeEventListener("resize", compute);
            window.removeEventListener("scroll", compute, true);
        };
    }, [open, currentMonth]);

    const handleDayClick = (day: Date) => {
        if (!selectingSecond || !draftStart) {
            setDraftStart(day);
            setDraftEnd(day);
            setSelectingSecond(true);
        } else {
            let nextStart = draftStart;
            let nextEnd = day;
            if (isBefore(day, draftStart)) {
                nextStart = day;
                nextEnd = draftStart;
            }
            setDraftStart(nextStart);
            setDraftEnd(nextEnd);
            setSelectingSecond(false);
            setHoverDate(null);
            // Immediately apply the selected range so the user sees live data right away,
            // even before clicking Apply / Close.
            onApply({
                from: format(nextStart, "yyyy-MM-dd"),
                to: format(nextEnd, "yyyy-MM-dd"),
            });
        }
    };

    const previewEnd =
        selectingSecond && draftStart && hoverDate ? hoverDate : draftEnd || draftStart;
    const rangeStart =
        draftStart && previewEnd
            ? isBefore(previewEnd, draftStart)
                ? previewEnd
                : draftStart
            : draftStart;
    const rangeEnd =
        draftStart && previewEnd
            ? isBefore(previewEnd, draftStart)
                ? draftStart
                : previewEnd
            : previewEnd;

    const spanDays =
        rangeStart && rangeEnd
            ? Math.max(1, differenceInCalendarDays(rangeEnd, rangeStart) + 1)
            : 1;

    const headerRangeLabel = React.useMemo(() => {
        if (!rangeStart) return "Select date range";
        if (!rangeEnd || isSameDay(rangeStart, rangeEnd)) {
            return format(rangeStart, "MMM d, yyyy");
        }
        if (rangeStart.getFullYear() === rangeEnd.getFullYear()) {
            if (rangeStart.getMonth() === rangeEnd.getMonth()) {
                return `${format(rangeStart, "MMM yyyy")}`;
            }
            return `${format(rangeStart, "MMM")} — ${format(rangeEnd, "MMM yyyy")}`;
        }
        return `${format(rangeStart, "MMM yyyy")} — ${format(rangeEnd, "MMM yyyy")}`;
    }, [rangeStart, rangeEnd]);

    const calendarDays = React.useMemo(() => {
        const monthStart = startOfMonth(currentMonth);
        const monthEnd = endOfMonth(currentMonth);
        const calendarStart = startOfWeek(monthStart, { weekStartsOn: 0 });
        const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
        return eachDayOfInterval({ start: calendarStart, end: calendarEnd });
    }, [currentMonth]);

    const handleApplyClick = () => {
        const s = rangeStart || committedStart || new Date();
        const e = rangeEnd || rangeStart || committedEnd || new Date();
        onApply({
            from: format(s, "yyyy-MM-dd"),
            to: format(e, "yyyy-MM-dd"),
        });
        setOpen(false);
    };

    const triggerLabel =
        committedStart && committedEnd
            ? `${format(committedStart, "yyyy-MM-dd")} - ${format(committedEnd, "yyyy-MM-dd")}`
            : `${from} - ${to}`;

    return (
        <>
            <button
                ref={triggerRef}
                type="button"
                onClick={() => setOpen((o) => !o)}
                className={cn(
                    "h-7 px-2.5 rounded-md border bg-white inline-flex items-center gap-2 text-[12px] font-medium transition-all cursor-pointer shadow-2xs shrink-0",
                    open
                        ? "border-slate-900 ring-2 ring-[#FFE600]/40 text-slate-900"
                        : "border-slate-200 hover:border-slate-300 text-slate-800",
                    className,
                )}
            >
                <CalendarIcon className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                <span className="tabular-nums">{triggerLabel}</span>
            </button>

            {typeof document !== "undefined" &&
                createPortal(
                    <AnimatePresence>
                        {open && (
                            <motion.div
                                ref={panelRef}
                                initial={{ opacity: 0, y: -6, scale: 0.97 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                exit={{ opacity: 0, y: -6, scale: 0.97 }}
                                transition={{ type: "spring", duration: 0.18, bounce: 0.15 }}
                                style={{
                                    position: "fixed",
                                    top: pos?.top ?? -9999,
                                    left: pos?.left ?? -9999,
                                    visibility: pos ? "visible" : "hidden",
                                    zIndex: 120,
                                }}
                                data-floating="true"
                                className="w-[284px] bg-white border border-slate-200 rounded-xl shadow-[0_18px_42px_-10px_rgba(15,23,42,0.22),0_4px_12px_-4px_rgba(15,23,42,0.12)] overflow-hidden select-none"
                            >
                                {/* Top summary banner (Smartlead-style) */}
                                <div className="bg-slate-900 text-white px-4 py-3.5 flex items-center justify-between">
                                    <div>
                                        <div className="text-[11.5px] text-slate-300 font-medium">
                                            {headerRangeLabel}
                                        </div>
                                        <div className="text-[22px] font-bold tracking-tight leading-tight mt-0.5 text-[#FFE600]">
                                            {spanDays} {spanDays === 1 ? "day" : "days"}
                                        </div>
                                    </div>
                                    <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center text-white">
                                        <CalendarIcon className="w-4 h-4" />
                                    </div>
                                </div>

                                {/* Month & Year Navigation */}
                                <div className="flex items-center justify-between px-3 py-2.5 border-b border-slate-100">
                                    <div className="flex items-center gap-1">
                                        <button
                                            type="button"
                                            onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
                                            className="size-6 rounded-md inline-flex items-center justify-center text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
                                            aria-label="Previous month"
                                        >
                                            <ChevronLeftIcon className="w-3.5 h-3.5" />
                                        </button>
                                        <span className="text-[12.5px] font-semibold text-slate-900 min-w-[78px] text-center">
                                            {format(currentMonth, "MMMM")}
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
                                            className="size-6 rounded-md inline-flex items-center justify-center text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
                                            aria-label="Next month"
                                        >
                                            <ChevronRightIcon className="w-3.5 h-3.5" />
                                        </button>
                                    </div>

                                    <div className="flex items-center gap-0.5">
                                        <button
                                            type="button"
                                            onClick={() => setCurrentMonth(subYears(currentMonth, 1))}
                                            className="size-6 rounded-md inline-flex items-center justify-center text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
                                            aria-label="Previous year"
                                        >
                                            <ChevronLeftIcon className="w-3.5 h-3.5" />
                                        </button>
                                        <span className="text-[12.5px] font-semibold text-slate-900 tabular-nums px-1">
                                            {format(currentMonth, "yyyy")}
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() => setCurrentMonth(addYears(currentMonth, 1))}
                                            className="size-6 rounded-md inline-flex items-center justify-center text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
                                            aria-label="Next year"
                                        >
                                            <ChevronRightIcon className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                </div>

                                {/* Calendar Grid */}
                                <div className="px-3 pt-2.5 pb-2">
                                    <div className="grid grid-cols-7 mb-1.5">
                                        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
                                            <div
                                                key={day}
                                                className="text-center text-[11px] font-medium text-slate-400 py-1"
                                            >
                                                {day}
                                            </div>
                                        ))}
                                    </div>

                                    <div
                                        className="grid grid-cols-7 gap-y-1"
                                        onMouseLeave={() => setHoverDate(null)}
                                    >
                                        {calendarDays.map((day) => {
                                            const inMonth = isSameMonth(day, currentMonth);
                                            const isStart = !!rangeStart && isSameDay(day, rangeStart);
                                            const isEnd = !!rangeEnd && isSameDay(day, rangeEnd);
                                            const inRange =
                                                !!rangeStart &&
                                                !!rangeEnd &&
                                                (isAfter(day, rangeStart) || isSameDay(day, rangeStart)) &&
                                                (isBefore(day, rangeEnd) || isSameDay(day, rangeEnd));

                                            return (
                                                <button
                                                    key={day.toISOString()}
                                                    type="button"
                                                    onClick={() => handleDayClick(day)}
                                                    onMouseEnter={() => {
                                                        if (selectingSecond) setHoverDate(day);
                                                    }}
                                                    className={cn(
                                                        "h-8 w-full inline-flex items-center justify-center text-[12px] transition-colors cursor-pointer relative",
                                                        !inMonth && !inRange && "text-slate-300",
                                                        inMonth && !inRange && "text-slate-700 hover:bg-slate-100 rounded-md",
                                                        inRange && !isStart && !isEnd && "bg-[#FFF9DB] text-slate-900 font-medium",
                                                        isStart && isEnd && "bg-slate-900 text-[#FFE600] font-bold rounded-full",
                                                        isStart && !isEnd && "bg-slate-900 text-[#FFE600] font-bold rounded-l-full",
                                                        isEnd && !isStart && "bg-slate-900 text-[#FFE600] font-bold rounded-r-full",
                                                    )}
                                                >
                                                    {format(day, "d")}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* Footer: Close & Apply */}
                                <div className="flex items-center justify-end gap-3 px-4 py-2.5 border-t border-slate-100 bg-slate-50/50">
                                    <button
                                        type="button"
                                        onClick={() => setOpen(false)}
                                        className="px-3 h-7 rounded-md text-[12.5px] font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-200/50 transition-colors cursor-pointer"
                                    >
                                        Close
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleApplyClick}
                                        className="px-3.5 h-7 rounded-md bg-slate-900 hover:bg-black text-[#FFE600] text-[12.5px] font-semibold shadow-2xs transition-colors cursor-pointer"
                                    >
                                        Apply
                                    </button>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>,
                    document.body,
                )}
        </>
    );
}

export default DateRangePicker;
