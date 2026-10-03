import { useQuery } from "@tanstack/react-query";
import getReport from "@/lib/api/client/app/analytics/getReport";

export default function useReport(member_id?: string) {
    return useQuery({
        queryKey: ["analytics", "report", member_id ?? "all"],
        queryFn: () => getReport(member_id),
        staleTime: 1_000, // 1-second buffer load: instant cached paint, then revalidates
        gcTime: 30 * 60_000,
        refetchInterval: 30_000, // Auto-sync report every 30 seconds
        refetchOnWindowFocus: true,
    });
}
