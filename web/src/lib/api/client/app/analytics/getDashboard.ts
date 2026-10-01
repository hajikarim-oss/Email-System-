import type DashboardOverview from "@/lib/api/models/app/analytics/DashboardOverview";
import Request from "../../Request";

// Workspace dashboard analytics. Returned as a bare object (no {data} envelope),
// so no unwrap is needed here — but the period must be forwarded. An explicit
// from/to day range (inclusive) overrides the period for Custom chart windows.
export default async function getDashboard(
    period: string = "7d",
    range?: { from?: string; to?: string },
    member_id?: string,
): Promise<DashboardOverview> {
    const params = new URLSearchParams({ period });
    if (range?.from) params.set("from", range.from);
    if (range?.to) params.set("to", range.to);
    if (member_id && member_id !== "all") params.set("member_id", member_id);
    return await Request<DashboardOverview>({
        method: "GET",
        url: `/analytics/dashboard?${params.toString()}`,
        authorization: true,
    });
}
