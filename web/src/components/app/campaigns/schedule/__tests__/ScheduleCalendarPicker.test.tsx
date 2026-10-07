import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import ScheduleCalendarPicker, { WEEKDAYS_MASK } from "../ScheduleCalendarPicker";

describe("ScheduleCalendarPicker", () => {
    it("renders start and end date target selectors and updates both dates", () => {
        const onStartDateChange = vi.fn();
        const onEndDateChange = vi.fn();
        const onDaysChange = vi.fn();

        const startDate = new Date(2026, 9, 7); // Oct 7, 2026
        const endDate = new Date(2026, 9, 21); // Oct 21, 2026

        const { rerender } = render(
            <ScheduleCalendarPicker
                days={WEEKDAYS_MASK}
                onDaysChange={onDaysChange}
                startDate={startDate}
                onStartDateChange={onStartDateChange}
                endDate={endDate}
                onEndDateChange={onEndDateChange}
            />
        );

        // Verify Start and End pills and summary are displayed
        expect(screen.getByText(/Start:/i)).toBeInTheDocument();
        expect(screen.getByText(/End:/i)).toBeInTheDocument();
        expect(screen.getAllByText(/Oct 7/i).length).toBeGreaterThanOrEqual(1);
        expect(screen.getAllByText(/Oct 21, 2026/i).length).toBe(2);

        // Verify range status shows Oct 7 -> Oct 21, 2026
        expect(screen.getByText(/Oct 7 → Oct 21, 2026/i)).toBeInTheDocument();

        // Clear range button triggers clearing both
        const clearBtn = screen.getByRole("button", { name: /Clear range/i });
        fireEvent.click(clearBtn);
        expect(onStartDateChange).toHaveBeenCalledWith(null);
        expect(onEndDateChange).toHaveBeenCalledWith(null);
    });

    it("handles switching picking target between start and end date", () => {
        const onStartDateChange = vi.fn();
        const onEndDateChange = vi.fn();

        render(
            <ScheduleCalendarPicker
                days={WEEKDAYS_MASK}
                onDaysChange={vi.fn()}
                startDate={null}
                onStartDateChange={onStartDateChange}
                endDate={null}
                onEndDateChange={onEndDateChange}
            />
        );

        const endBtn = screen.getByRole("button", { name: /End:/i });
        fireEvent.click(endBtn);
        expect(screen.getByText(/\(Click to set End Date\)/i)).toBeInTheDocument();

        const startBtn = screen.getByRole("button", { name: /Start:/i });
        fireEvent.click(startBtn);
        expect(screen.getByText(/\(Click to set Start Date\)/i)).toBeInTheDocument();
    });
});
