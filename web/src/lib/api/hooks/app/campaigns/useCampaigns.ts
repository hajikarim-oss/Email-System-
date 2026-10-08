import { useEffect } from "react";
import { useInfiniteQuery, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import getCampaigns from "@/lib/api/client/app/campaigns/getCampaigns";
import { DEFAULT_PAGINATION_LIMIT } from "@/lib/information";
import type GetCampaigns from "@/lib/api/models/app/campaigns/GetCampaigns";
import useRealtimeFallbackInterval from "@/hooks/useRealtimeFallback";
import useUser from "@/lib/api/hooks/auth/useUser";

interface UseCampaignsProps {
    query: string;
    folder: string;
    limit?: number;
    enabled?: boolean;
}

export default function useCampaigns({ query, folder, limit = DEFAULT_PAGINATION_LIMIT, enabled = true }: UseCampaignsProps) {
    const queryClient = useQueryClient();

    // Get current user to include in cache key (prevents cross-user cache pollution)
    // CRITICAL: Wait for user data before fetching campaigns
    const { data: user, isLoading: userLoading } = useUser();
    const userId = user?.id || "";

    // CRITICAL: Clear all campaign caches when user changes (prevents stale data)
    useEffect(() => {
        if (userId && !userLoading) {
            // Clear localStorage campaign caches
            localStorage.removeItem("tbm_core_data_v5_campaigns");
            Object.keys(localStorage).forEach((key) => {
                if (key.startsWith("tbm_core_data_v5_campaign_")) {
                    localStorage.removeItem(key);
                }
            });

            // Invalidate React Query campaign cache
            queryClient.invalidateQueries({ queryKey: ["campaigns"] });

            console.log(`[Campaigns] User changed to ${userId} - cleared all caches`);
        }
    }, [userId, userLoading, queryClient]);

    // Send counts on these cards move on realtime invalidation, so the long
    // staleTime below is free while the socket is up and strands the list for
    // five minutes when it is not. Poll only in that second case.
    const refetchInterval = useRealtimeFallbackInterval(enabled);
    const queryResult = useInfiniteQuery<
        GetCampaigns,
        Error,
        InfiniteData<GetCampaigns, string | null>,
        [string, string, string, string, number, string],
        string | null
    >({
        // Include userId in cache key FIRST to ensure proper isolation
        // Add cache-buster timestamp to force fresh data on each user change
        queryKey: ["campaigns", "list", query, folder, limit, userId || "loading"],
        queryFn: async ({ pageParam }) => getCampaigns(query, pageParam, folder, limit),
        initialPageParam: null,
        getNextPageParam: (lastPage) => {
            if (lastPage?.pagination?.has_more) {
                return lastPage.pagination.next_cursor;
            }
            return undefined;
        },
        // CRITICAL: NO CACHING - Always fetch fresh data
        staleTime: 0,              // Immediately stale
        gcTime: 0,                 // Don't keep in memory
        refetchInterval: 0,        // Don't auto-refetch
        refetchOnWindowFocus: true, // Refetch when tab regains focus
        refetchOnReconnect: true,   // Refetch on reconnect
        refetchOnMount: true,       // ALWAYS refetch on mount
        // CRITICAL: Only fetch after user is loaded (userId must be set, not empty)
        enabled: enabled && !!userId && !userLoading,
    });

    // Defensive: backend may return `data: null` on empty result sets if
    // the underlying slice was nil. Coerce + drop nulls so consumers can
    // safely read fields without optional-chaining every access.
    const campaigns =
        queryResult.data?.pages
            .flatMap((p) => p.data ?? [])
            .filter((c): c is NonNullable<typeof c> => c != null) ?? [];

    return {
        ...queryResult,
        campaigns,
    };
}
