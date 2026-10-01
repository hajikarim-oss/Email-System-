import { useQuery } from "@tanstack/react-query";
import getReport from "@/lib/api/client/app/analytics/getReport";

export default function useReport(member_id?: string) {
    return useQuery({
        queryKey: ["analytics", "report", member_id ?? "all"],
        queryFn: () => getReport(member_id),
        staleTime: 60_000,
    });
}
