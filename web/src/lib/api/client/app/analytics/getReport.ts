import type SystemReport from "@/lib/api/models/app/analytics/SystemReport";
import Request from "../../Request";

// Lifetime system report (bare object, no envelope).
export default async function getReport(member_id?: string): Promise<SystemReport> {
    const params = new URLSearchParams();
    if (member_id && member_id !== "all") params.set("member_id", member_id);
    const qs = params.toString() ? `?${params.toString()}` : "";
    return await Request<SystemReport>({
        method: "GET",
        url: `/analytics/report${qs}`,
        authorization: true,
    });
}
