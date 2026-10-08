import { useQuery } from "@tanstack/react-query";
import getCampaignAnalytics from "@/lib/api/client/app/analytics/getCampaignAnalytics";

export default function useCampaignAnalytics(id: string) {
    return useQuery({
        queryKey: ["analytics", "campaigns", id],
        queryFn: () => getCampaignAnalytics(id),
        enabled: !!id,
        staleTime: 3 * 1000,  // Keep fresh for 3 seconds
        gcTime: 10 * 60 * 1000,  // Keep in memory for 10 minutes
        refetchInterval: 5 * 1000,  // Refetch every 5 seconds (less aggressive)
    })
}
