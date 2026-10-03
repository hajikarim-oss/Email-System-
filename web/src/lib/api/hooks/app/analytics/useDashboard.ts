import { useQuery } from "@tanstack/react-query";
import getDashboard from "@/lib/api/client/app/analytics/getDashboard";

export default function useDashboard(period: string = "7d", range?: { from?: string; to?: string }, member_id?: string) {
    return useQuery({
        queryKey: ["analytics", "dashboard", period, range?.from ?? "", range?.to ?? "", member_id ?? "all"],
        queryFn: () => getDashboard(period, range, member_id),
        staleTime: 1_000, // 1-second buffer load: instant cached paint, then revalidates
        gcTime: 15 * 60_000,
        refetchInterval: 15_000, // Automatic live telemetry sync every 15 seconds
        refetchOnWindowFocus: true,
    });
}
