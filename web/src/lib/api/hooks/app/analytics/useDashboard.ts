import { keepPreviousData, useQuery } from "@tanstack/react-query";
import getDashboard from "@/lib/api/client/app/analytics/getDashboard";
import type DashboardOverview from "@/lib/api/models/app/analytics/DashboardOverview";

const lsKey = (period: string, from = "", to = "", member = "all") =>
    `tbm_dash_v1_${period}_${from}_${to}_${member}`;

export default function useDashboard(period: string = "7d", range?: { from?: string; to?: string }, member_id?: string) {
    const key = lsKey(period, range?.from ?? "", range?.to ?? "", member_id ?? "all");
    const initialData = ((): DashboardOverview | undefined => {
        try {
            const raw = localStorage.getItem(key);
            if (raw) return JSON.parse(raw) as DashboardOverview;
        } catch {}
        return undefined;
    })();

    return useQuery({
        queryKey: ["analytics", "dashboard", period, range?.from ?? "", range?.to ?? "", member_id ?? "all"],
        queryFn: async () => {
            const data = await getDashboard(period, range, member_id);
            try { localStorage.setItem(key, JSON.stringify(data)); } catch {}
            return data;
        },
        initialData,
        // The localStorage copy is only a paint-fast placeholder: mark it as
        // stale so the selected range is always refetched from the database
        // immediately instead of being trusted for the 60s staleTime.
        initialDataUpdatedAt: 0,
        staleTime: 60_000,
        gcTime: 30 * 60_000,
        refetchInterval: 60_000,
        refetchOnWindowFocus: false,
        placeholderData: keepPreviousData,
        retry: 2,
    });
}
