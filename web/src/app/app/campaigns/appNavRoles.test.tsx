// Two-role sidebar contract: a team member gets the same shell minus the
// administrative sections (Forms, Deliverability, CRM, Resources, Settings),
// and the master gets the team-member strip above the Campaigns list whose
// chips narrow the list to one member's campaigns. This mounts the real
// dashboard shell (RootAppLayout -> AppLayout -> AppNav) around the real
// CampaignsPage, so a regression that leaks a manage-only row back into the
// member's sidebar — or drops the strip for the master — fails here.

import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, act, fireEvent } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// jsdom has no layout, so Element.scrollTo is missing entirely (the agent
// panel scrolls itself on mount).
(Element.prototype as unknown as { scrollTo: (o: { top?: number }) => void }).scrollTo = function () {};

// Every request the dashboard bootstrap fires, answered with the smallest
// shape each consumer needs. `meRoles` flips the session identity between
// the master (owner) and a team member.
let meRoles: string[] = [];
const members: unknown[] = [];
const campaignRows: unknown[] = [];

vi.mock("@/lib/api/client/Request", () => ({
    default: (cfg: { url?: string }) => Promise.resolve(route(String(cfg?.url ?? ""))),
}));
vi.mock("@/lib/helper/getToken", () => ({
    default: () => ({
        access_token: "a",
        refresh_token: "r",
        access_token_expires_at: new Date(Date.now() + 3600e3).toISOString(),
        refresh_token_expires_at: new Date(Date.now() + 3600e3).toISOString(),
    }),
}));
vi.mock("@/hooks/SocketProvider", () => ({
    default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/hooks/context/socket", async (orig) => {
    const actual = (await orig()) as Record<string, unknown>;
    return {
        ...actual,
        useSocket: () => ({
            isConnected: false,
            subscribeToChannel: () => () => {},
            pushToChannel: () => {},
            socket: null,
            status: "closed",
        }),
        useChannel: () => ({ state: "closed", push: () => {}, channel: null }),
        useChannelEvent: () => {},
        useChannelSubscription: () => {},
    };
});

const EMPTY_LIST = { data: [], pagination: { total: 0, next_cursor: null, has_more: false } };

function route(url: string): unknown {
    if (url.startsWith("/auth/me")) {
        return {
            id: "u-master", email: "haji.karim@theboredmonkey.com", first_name: "Haji", last_name: "Karim",
            onboarding_completed_at: new Date().toISOString(),
            tags: [], categories: [], folders: [], roles: meRoles,
        };
    }
    if (url.startsWith("/organization/members")) return members;
    if (url.startsWith("/organization/roles")) return [];
    if (url.startsWith("/organization")) return [{ id: "org-1", name: "Org", slug: "org" }];
    if (url.startsWith("/campaigns")) {
        return {
            data: campaignRows,
            count: campaignRows.length,
            pagination: { total: campaignRows.length, next_cursor: null, has_more: false },
        };
    }
    if (url.startsWith("/subscription/credits")) {
        return { monthly_balance: 100, monthly_allowance: 100, purchased_balance: 0, spent_today: 0, spent_week: 0, spent_month: 0 };
    }
    if (url.startsWith("/subscription")) return { plan: { name: "Pro" }, status: "active" };
    if (url.startsWith("/analytics")) return { summary: {}, steps: [], data: [] };
    if (url.startsWith("/advisor")) return { findings: [], data: [], total: 0 };
    if (url.includes("/steps")) return [];
    if (url.includes("connections")) return { connections: [] };
    return EMPTY_LIST;
}

const RootAppLayout = (await import("../layout")).default;
const CampaignsPage = (await import("./page")).default;

function mountCampaigns() {
    const router = createMemoryRouter(
        [
            {
                path: "/app",
                element: <RootAppLayout />,
                children: [{ path: "campaigns", element: <CampaignsPage /> }],
            },
        ],
        { initialEntries: ["/app/campaigns"] },
    );
    render(
        <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
            <RouterProvider router={router} />
        </QueryClientProvider>,
    );
}

async function settle() {
    await act(async () => {
        await new Promise((r) => setTimeout(r, 120));
    });
}

describe("two-role shell", () => {
    it("keeps the manage-only sections for the master and narrows the list through the member strip", async () => {
        meRoles = [];
        members.length = 0;
        members.push(
            { id: "m1", user_id: "u-master", name: "Haji Karim", email: "haji.karim@theboredmonkey.com", role: "owner" },
            { id: "m2", user_id: "u-snehal", name: "Snehal Maurya", email: "snehal.maurya@theboredmonkey.com", role: "team_member" },
        );
        campaignRows.length = 0;
        campaignRows.push(
            { id: "cmp-master", name: "Master Owned Campaign", status: "active", kind: "sequence", user_id: "u-master", created_at: "2026-09-01T00:00:00Z", description: "" },
            { id: "cmp-snehal", name: "Snehal Owned Campaign", status: "draft", kind: "sequence", user_id: "u-snehal", created_at: "2026-09-02T00:00:00Z", description: "" },
        );
        mountCampaigns();
        await settle();

        expect(screen.getByText("Forms")).toBeTruthy();
        expect(screen.getByText("Deliverability")).toBeTruthy();
        expect(screen.getByText("CRM")).toBeTruthy();
        expect(screen.getByText("Resources")).toBeTruthy();
        expect(screen.getByText("Settings")).toBeTruthy();

        // Both rows are visible under "Everyone".
        expect(screen.getByText("Master Owned Campaign")).toBeTruthy();
        expect(screen.getByText("Snehal Owned Campaign")).toBeTruthy();
        // Ownership marker on the member's row.
        expect(screen.getByTitle("Owned by Snehal Maurya")).toBeTruthy();

        // Selecting the member chip narrows the list to their campaign.
        const chip = screen.getByTitle("Campaigns owned by Snehal Maurya");
        fireEvent.click(chip);
        await settle();
        expect(screen.queryByText("Master Owned Campaign")).toBeNull();
        expect(screen.getByText("Snehal Owned Campaign")).toBeTruthy();

        // Clicking again clears the filter.
        fireEvent.click(screen.getByTitle("Campaigns owned by Snehal Maurya"));
        await settle();
        expect(screen.getByText("Master Owned Campaign")).toBeTruthy();
    });

    it("hides Forms, Deliverability, CRM, Resources and Settings from a team member", async () => {
        meRoles = ["team_member"];
        members.length = 0;
        campaignRows.length = 0;
        mountCampaigns();
        await settle();

        expect(screen.queryByText("Forms")).toBeNull();
        expect(screen.queryByText("Deliverability")).toBeNull();
        expect(screen.queryByText("CRM")).toBeNull();
        expect(screen.queryByText("Resources")).toBeNull();
        expect(screen.queryByText("Settings")).toBeNull();

        // The shared surfaces stay exactly where they were (several of them
        // also appear in the top bar, so match by set rather than singleton).
        expect(screen.getAllByText("Campaigns").length).toBeGreaterThan(0);
        expect(screen.getAllByText("Analytics").length).toBeGreaterThan(0);
        expect(screen.getAllByText("Contacts").length).toBeGreaterThan(0);
        expect(screen.getAllByText("Accounts").length).toBeGreaterThan(0);
    });
});
