import type SystemReport from "@/lib/api/models/app/analytics/SystemReport";
import Request from "../../Request";

// Lifetime system report (bare object, no envelope).
export default async function getReport(): Promise<SystemReport> {
    return await Request<SystemReport>({
        method: "GET",
        url: "/analytics/report",
        authorization: true,
    })
}
