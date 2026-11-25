import { keepPreviousData, useQuery } from "@tanstack/react-query";
import getDashboard from "@/lib/api/client/app/analytics/getDashboard";

export default function useDashboard(period: string = "7d", range?: { from?: string; to?: string }, member_id?: string) {
    return useQuery({
        queryKey: ["analytics", "dashboard", period, range?.from ?? "", range?.to ?? "", member_id ?? "all"],
        queryFn: () => getDashboard(period, range, member_id),
        staleTime: 60_000,
        gcTime: 30 * 60_000,
        refetchInterval: 60_000,
        refetchOnWindowFocus: false,
        placeholderData: keepPreviousData,
        retry: 2,
    });
}
