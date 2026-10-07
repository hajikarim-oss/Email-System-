import React from "react";
import {
    format,
    addMonths,
    subMonths,
    startOfMonth,
    endOfMonth,
    startOfWeek,
    endOfWeek,
    eachDayOfInterval,
    isSameMonth,
    isSameDay,
    isToday,
    isBefore,
    isAfter,
    startOfDay,
} from "date-fns";
import {
    CalendarDaysIcon,
    CalendarIcon,
    ChevronLeftIcon,
    ChevronRightIcon,
    BriefcaseIcon,
    GlobeIcon,
    ClockIcon,
    SparklesIcon,
    CheckIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/field";

export const WEEKDAYS_MASK = 0b0011111; // Mon-Fri
export const EVERY_DAY_MASK = 0b1111111; // Mon-Sun
export const WEEKDAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
export const WEEKDAY_ABBR = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

interface ScheduleCalendarPickerProps {
    days: number;
    onDaysChange: (days: number) => void;
    startDate?: string | Date | null;
    onStartDateChange?: (d: Date | null) => void;
    endDate?: string | Date | null;
    onEndDateChange?: (d: Date | null) => void;
    startTime?: string;
    endTime?: string;
    timezone?: string;
    className?: string;
}

export default function ScheduleCalendarPicker({
    days,
    onDaysChange,
    startDate,
    onStartDateChange,
    endDate,
    onEndDateChange,
    startTime = "08:00",
    endTime = "18:00",
    timezone = "Asia/Kolkata",
    className,
}: ScheduleCalendarPickerProps) {
    const selectedStart = startDate ? (startDate instanceof Date ? startDate : new Date(startDate)) : null;
    const selectedEnd = endDate ? (endDate instanceof Date ? endDate : new Date(endDate)) : null;

    const [currentMonth, setCurrentMonth] = React.useState<Date>(() => selectedStart || new Date());
    const [pickingTarget, setPickingTarget] = React.useState<"start" | "end">(() => (selectedStart && !selectedEnd ? "end" : "start"));
    const [activeTab, setActiveTab] = React.useState<"weekdays" | "everyday" | "calendar">(() => {
        if (days === WEEKDAYS_MASK) return "weekdays";
        if (days === EVERY_DAY_MASK) return "everyday";
        return "calendar";
    });

    const isWeekdays = days === WEEKDAYS_MASK;
    const isEveryday = days === EVERY_DAY_MASK;

    const handleSelectManner = (manner: "weekdays" | "everyday" | "calendar") => {
        setActiveTab(manner);
        if (manner === "weekdays") {
            onDaysChange(WEEKDAYS_MASK);
        } else if (manner === "everyday") {
            onDaysChange(EVERY_DAY_MASK);
        }
    };

    const toggleWeekday = (index: number) => {
        const mask = 1 << index;
        const next = days ^ mask;
        onDaysChange(next);
        if (next === WEEKDAYS_MASK) setActiveTab("weekdays");
        else if (next === EVERY_DAY_MASK) setActiveTab("everyday");
        else setActiveTab("calendar");
    };

    // date-fns startOfWeek with weekStartsOn: 1 (Monday)
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 });
    const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
    const daysInGrid = eachDayOfInterval({ start: calendarStart, end: calendarEnd });
    const today = startOfDay(new Date());

    const isSendingDay = (d: Date): boolean => {
        // Monday=0 ... Sunday=6
        const dayOfWeekIndex = (d.getDay() + 6) % 7;
        return (days & (1 << dayOfWeekIndex)) !== 0;
    };

    const activeDaysCount = [0, 1, 2, 3, 4, 5, 6].filter((i) => (days & (1 << i)) !== 0).length;

    const mannerLabel = isWeekdays
        ? "Weekdays (Mon – Fri)"
        : isEveryday
        ? "Every day (Mon – Sun)"
        : activeDaysCount === 0
        ? "No days selected"
        : `${activeDaysCount} days / week`;

    const handleDateClick = (d: Date) => {
        const dDay = startOfDay(d);

        if (pickingTarget === "start") {
            if (selectedStart && isSameDay(dDay, selectedStart)) {
                onStartDateChange?.(null);
            } else {
                onStartDateChange?.(dDay);
                // If existing end date is before the new start date, clear it
                if (selectedEnd && isBefore(selectedEnd, dDay)) {
                    onEndDateChange?.(null);
                }
                // Automatically switch target to end date so user can pick end date right next
                setPickingTarget("end");
            }
        } else {
            // pickingTarget === "end"
            if (selectedEnd && isSameDay(dDay, selectedEnd)) {
                onEndDateChange?.(null);
            } else if (selectedStart && isBefore(dDay, selectedStart)) {
                // If user clicks before start date, update start date
                onStartDateChange?.(dDay);
            } else {
                onEndDateChange?.(dDay);
            }
        }
    };

    return (
        <div className={cn("space-y-4 select-none", className)}>
            {/* 1. Sending Manner Selector Pills */}
            <div>
                <div className="flex items-center justify-between mb-2">
                    <Label className="mb-0 text-[12.5px] font-medium text-slate-900">
                        Sending manner
                    </Label>
                    <span className="text-[11px] text-slate-500 font-medium">
                        {mannerLabel}
                    </span>
                </div>

                <div className="grid grid-cols-3 gap-2">
                    <button
                        type="button"
                        id="schedule-manner-weekdays"
                        onClick={() => handleSelectManner("weekdays")}
                        className={cn(
                            "flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg border text-[12px] font-medium transition-all cursor-pointer",
                            activeTab === "weekdays" && isWeekdays
                                ? "bg-[#FFF9DB] border-slate-900 text-slate-900 shadow-xs ring-1 ring-slate-900 font-semibold"
                                : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-300"
                        )}
                    >
                        <BriefcaseIcon className="w-3.5 h-3.5 shrink-0 text-slate-700" />
                        <span>Weekdays</span>
                    </button>

                    <button
                        type="button"
                        id="schedule-manner-everyday"
                        onClick={() => handleSelectManner("everyday")}
                        className={cn(
                            "flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg border text-[12px] font-medium transition-all cursor-pointer",
                            activeTab === "everyday" && isEveryday
                                ? "bg-[#FFF9DB] border-slate-900 text-slate-900 shadow-xs ring-1 ring-slate-900 font-semibold"
                                : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-300"
                        )}
                    >
                        <SparklesIcon className="w-3.5 h-3.5 shrink-0 text-amber-500" />
                        <span>Every day</span>
                    </button>

                    <button
                        type="button"
                        id="schedule-manner-calendar"
                        onClick={() => handleSelectManner("calendar")}
                        className={cn(
                            "flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg border text-[12px] font-medium transition-all cursor-pointer",
                            activeTab === "calendar" || (!isWeekdays && !isEveryday)
                                ? "bg-[#FFF9DB] border-slate-900 text-slate-900 shadow-xs ring-1 ring-slate-900 font-semibold"
                                : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-300"
                        )}
                    >
                        <CalendarDaysIcon className="w-3.5 h-3.5 shrink-0 text-slate-700" />
                        <span>Calendar</span>
                    </button>
                </div>
            </div>

            {/* 2. Weekday Bar (Quick Clickable Mon..Sun) */}
            <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[11px] text-slate-500">
                    <span>Active days of week</span>
                    <span className="text-[10.5px] text-slate-400">Click to toggle specific days</span>
                </div>
                <div className="grid grid-cols-7 gap-1.5">
                    {WEEKDAY_ABBR.map((abbr, index) => {
                        const mask = 1 << index;
                        const active = (days & mask) !== 0;
                        return (
                            <button
                                key={abbr}
                                type="button"
                                id={`weekday-pill-${abbr.toLowerCase()}`}
                                aria-pressed={active}
                                title={`${WEEKDAY_NAMES[index]} — click to toggle`}
                                onClick={() => toggleWeekday(index)}
                                className={cn(
                                    "h-10 rounded-md border flex flex-col items-center justify-center transition-all cursor-pointer",
                                    active
                                        ? "border-slate-900 bg-[#FFF9DB] text-slate-900 font-semibold shadow-xs"
                                        : "border-slate-200 bg-white text-slate-400 hover:border-slate-300 hover:text-slate-600"
                                )}
                            >
                                <span className="text-[11px] leading-tight">{abbr}</span>
                                <span
                                    className={cn(
                                        "mt-1 size-1.5 rounded-full transition-colors",
                                        active ? "bg-amber-500" : "bg-slate-200"
                                    )}
                                />
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* 3. Interactive Monthly Calendar View with Start & End Date Selection */}
            <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-xs">
                {/* Start Date & End Date target pills */}
                <div className="grid grid-cols-2 gap-2 mb-3">
                    <button
                        type="button"
                        id="schedule-pick-start-btn"
                        onClick={() => setPickingTarget("start")}
                        className={cn(
                            "flex items-center justify-between px-2.5 py-1.5 rounded-lg border text-[11.5px] transition-all cursor-pointer text-left",
                            pickingTarget === "start"
                                ? "bg-slate-900 text-white border-slate-900 shadow-xs ring-1 ring-slate-900 font-medium"
                                : "bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200"
                        )}
                    >
                        <div className="flex items-center gap-1.5 min-w-0">
                            <span className={cn("size-2 rounded-full shrink-0", pickingTarget === "start" ? "bg-amber-400" : "bg-slate-400")} />
                            <span className="truncate">
                                Start: <strong className="font-semibold">{selectedStart ? format(selectedStart, "MMM d, yyyy") : "Now / Custom"}</strong>
                            </span>
                        </div>
                        {selectedStart && onStartDateChange && (
                            <span
                                role="button"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onStartDateChange(null);
                                }}
                                title="Clear start date"
                                className="text-[10px] text-amber-200 hover:text-white px-1 py-0.5 rounded hover:bg-white/10 shrink-0 ml-1"
                            >
                                Clear
                            </span>
                        )}
                    </button>

                    <button
                        type="button"
                        id="schedule-pick-end-btn"
                        onClick={() => setPickingTarget("end")}
                        className={cn(
                            "flex items-center justify-between px-2.5 py-1.5 rounded-lg border text-[11.5px] transition-all cursor-pointer text-left",
                            pickingTarget === "end"
                                ? "bg-slate-900 text-white border-slate-900 shadow-xs ring-1 ring-indigo-400 font-medium"
                                : "bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200"
                        )}
                    >
                        <div className="flex items-center gap-1.5 min-w-0">
                            <span className={cn("size-2 rounded-full shrink-0", pickingTarget === "end" ? "bg-indigo-400" : "bg-slate-400")} />
                            <span className="truncate">
                                End: <strong className="font-semibold">{selectedEnd ? format(selectedEnd, "MMM d, yyyy") : "Indefinite"}</strong>
                            </span>
                        </div>
                        {selectedEnd && onEndDateChange && (
                            <span
                                role="button"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onEndDateChange(null);
                                }}
                                title="Clear end date"
                                className="text-[10px] text-indigo-200 hover:text-white px-1 py-0.5 rounded hover:bg-white/10 shrink-0 ml-1"
                            >
                                Clear
                            </span>
                        )}
                    </button>
                </div>

                {/* Month navigation */}
                <div className="flex items-center justify-between mb-3 px-1">
                    <div className="flex items-center gap-2">
                        <CalendarIcon className="w-4 h-4 text-slate-500" />
                        <span className="text-[13px] font-semibold text-slate-900">
                            {format(currentMonth, "MMMM yyyy")}
                        </span>
                        <span className="text-[10.5px] text-slate-400 font-normal">
                            ({pickingTarget === "start" ? "Click to set Start Date" : "Click to set End Date"})
                        </span>
                    </div>
                    <div className="flex items-center gap-1">
                        <button
                            type="button"
                            aria-label="Previous month"
                            onClick={() => setCurrentMonth((m) => subMonths(m, 1))}
                            className="size-7 rounded-md border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors cursor-pointer"
                        >
                            <ChevronLeftIcon className="w-3.5 h-3.5" />
                        </button>
                        <button
                            type="button"
                            aria-label="Next month"
                            onClick={() => setCurrentMonth((m) => addMonths(m, 1))}
                            className="size-7 rounded-md border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors cursor-pointer"
                        >
                            <ChevronRightIcon className="w-3.5 h-3.5" />
                        </button>
                    </div>
                </div>

                {/* Day headers */}
                <div className="grid grid-cols-7 gap-1 text-center mb-1">
                    {WEEKDAY_ABBR.map((abbr, index) => {
                        const active = (days & (1 << index)) !== 0;
                        return (
                            <button
                                key={abbr}
                                type="button"
                                title={`Toggle all ${WEEKDAY_NAMES[index]}s`}
                                onClick={() => toggleWeekday(index)}
                                className={cn(
                                    "py-1 text-[10.5px] font-medium rounded hover:bg-slate-100 transition-colors cursor-pointer",
                                    active ? "text-slate-900 font-semibold" : "text-slate-400"
                                )}
                            >
                                {abbr[0]}
                            </button>
                        );
                    })}
                </div>

                {/* Days matrix */}
                <div className="grid grid-cols-7 gap-1">
                    {daysInGrid.map((d) => {
                        const inCurrentMonth = isSameMonth(d, currentMonth);
                        const dDay = startOfDay(d);
                        const isPast = isBefore(dDay, today);
                        const sending = isSendingDay(d);
                        const isStart = selectedStart ? isSameDay(dDay, selectedStart) : false;
                        const isEnd = selectedEnd ? isSameDay(dDay, selectedEnd) : false;
                        const isInRange = selectedStart && selectedEnd && isAfter(dDay, selectedStart) && isBefore(dDay, selectedEnd);
                        const isBeforeStart = selectedStart ? isBefore(dDay, selectedStart) : false;
                        const isAfterEnd = selectedEnd ? isAfter(dDay, selectedEnd) : false;
                        const isOutSideRange = isBeforeStart || isAfterEnd;
                        const isTodayDate = isToday(d);

                        return (
                            <button
                                key={d.toISOString()}
                                type="button"
                                disabled={isPast}
                                onClick={() => handleDateClick(d)}
                                title={`${format(d, "EEE, MMM d, yyyy")}${
                                    isPast
                                        ? " (Past date)"
                                        : isStart
                                        ? " (Start Date)"
                                        : isEnd
                                        ? " (End Date)"
                                        : isInRange
                                        ? " (In campaign schedule window)"
                                        : sending
                                        ? " (Sending day)"
                                        : " (Off day)"
                                }`}
                                className={cn(
                                    "relative h-8 rounded-md flex flex-col items-center justify-center text-[11px] transition-all cursor-pointer",
                                    !inCurrentMonth && "opacity-25",
                                    isPast && "opacity-30 cursor-not-allowed hover:bg-transparent",
                                    !isPast && isStart && "bg-slate-900 text-white font-bold ring-2 ring-amber-400 z-10 shadow-xs",
                                    !isPast && isEnd && "bg-slate-900 text-white font-bold ring-2 ring-indigo-400 z-10 shadow-xs",
                                    !isPast && !isStart && !isEnd && isInRange && (
                                        sending
                                            ? "bg-[#FFF9DB] border-y border-amber-300 text-slate-900 font-semibold"
                                            : "bg-amber-50/70 border-y border-amber-200 text-slate-400"
                                    ),
                                    !isPast && !isStart && !isEnd && !isInRange && !isOutSideRange && sending && "bg-[#FFF9DB]/80 border border-amber-300 text-slate-900 font-medium hover:bg-[#FFF9DB]",
                                    !isPast && !isStart && !isEnd && !isInRange && !isOutSideRange && !sending && "bg-slate-50/60 text-slate-400 hover:bg-slate-100",
                                    !isPast && isOutSideRange && !isStart && !isEnd && "text-slate-300 hover:bg-slate-50",
                                    isTodayDate && !isStart && !isEnd && "ring-1 ring-slate-800"
                                )}
                            >
                                <span>{format(d, "d")}</span>
                                {!isPast && !isStart && !isEnd && sending && !isOutSideRange && (
                                    <span className="absolute bottom-1 size-1 rounded-full bg-amber-500" />
                                )}
                            </button>
                        );
                    })}
                </div>

                {/* Calendar Legend / Start & End Date Status */}
                <div className="mt-3 pt-2.5 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
                    <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1.5">
                            <span className="size-2.5 rounded-sm bg-[#FFF9DB] border border-amber-300 inline-block" />
                            <span>Sending day</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <span className="size-2.5 rounded-sm bg-slate-900 ring-1 ring-amber-400 inline-block" />
                            <span>Start date</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <span className="size-2.5 rounded-sm bg-slate-900 ring-1 ring-indigo-400 inline-block" />
                            <span>End date</span>
                        </div>
                    </div>

                    {selectedStart || selectedEnd ? (
                        <div className="flex items-center gap-1 text-slate-900 font-medium">
                            <CheckIcon className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                            <span>
                                {selectedStart && selectedEnd
                                    ? `${format(selectedStart, "MMM d")} → ${format(selectedEnd, "MMM d, yyyy")}`
                                    : selectedStart
                                    ? `Starts ${format(selectedStart, "MMM d, yyyy")} (No end date)`
                                    : `Ends ${format(selectedEnd!, "MMM d, yyyy")}`}
                            </span>
                            <button
                                type="button"
                                onClick={() => {
                                    onStartDateChange?.(null);
                                    onEndDateChange?.(null);
                                    setPickingTarget("start");
                                }}
                                className="ml-1 text-[10px] text-rose-500 hover:underline cursor-pointer"
                            >
                                Clear range
                            </button>
                        </div>
                    ) : (
                        <span className="text-slate-400">Click dates to set Start & End</span>
                    )}
                </div>
            </div>

            {/* 4. Schedule Live Details Bar */}
            <div className="rounded-lg bg-slate-50 border border-slate-200/80 p-2.5 flex items-center justify-between text-[11.5px] text-slate-600">
                <div className="flex items-center gap-2">
                    <ClockIcon className="w-3.5 h-3.5 text-slate-400" />
                    <span>
                        Window: <strong className="text-slate-900 font-semibold">{startTime} – {endTime}</strong>
                    </span>
                </div>
                <div className="flex items-center gap-1.5 text-slate-500 text-[11px]">
                    <GlobeIcon className="w-3 h-3 text-slate-400" />
                    <span className="truncate max-w-[140px]">{timezone}</span>
                </div>
            </div>
        </div>
    );
}
