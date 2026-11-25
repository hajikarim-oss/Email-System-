import { useEffect, useRef } from "react";
import { keepPreviousData, useInfiniteQuery, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import getCampaigns from "@/lib/api/client/app/campaigns/getCampaigns";
import { DEFAULT_PAGINATION_LIMIT } from "@/lib/information";
import type GetCampaigns from "@/lib/api/models/app/campaigns/GetCampaigns";
import useUser from "@/lib/api/hooks/auth/useUser";

interface UseCampaignsProps {
    query: string;
    folder: string;
    limit?: number;
    enabled?: boolean;
    scope?: string;
}

export default function useCampaigns({ query, folder, limit = DEFAULT_PAGINATION_LIMIT, enabled = true, scope = "" }: UseCampaignsProps) {
    const queryClient = useQueryClient();

    // Get current user to include in cache key (prevents cross-user cache pollution)
    const { data: user, isLoading: userLoading } = useUser();
    const userId = user?.id || "";
    const prevUserIdRef = useRef<string>("");

    // Only clear caches when the logged-in user actually switches accounts (never on routine page mounts)
    useEffect(() => {
        if (userId && !userLoading) {
            if (prevUserIdRef.current && prevUserIdRef.current !== userId) {
                localStorage.removeItem("tbm_core_data_v5_campaigns");
                Object.keys(localStorage).forEach((key) => {
                    if (key.startsWith("tbm_core_data_v5_campaign_")) {
                        localStorage.removeItem(key);
                    }
                });
                queryClient.invalidateQueries({ queryKey: ["campaigns"] });
            }
            prevUserIdRef.current = userId;
        }
    }, [userId, userLoading, queryClient]);

    const queryResult = useInfiniteQuery<
        GetCampaigns,
        Error,
        InfiniteData<GetCampaigns, string | null>,
        [string, string, string, string, number, string, string],
        string | null
    >({
        queryKey: ["campaigns", "list", query, folder, limit, userId || "loading", scope],
        queryFn: async ({ pageParam }) => getCampaigns(query, pageParam, folder, limit, scope || undefined),
        initialPageParam: null,
        getNextPageParam: (lastPage) => {
            if (lastPage?.pagination?.has_more) {
                return lastPage.pagination.next_cursor;
            }
            return undefined;
        },
        staleTime: 60_000,
        gcTime: 30 * 60_000,
        refetchInterval: 60_000,
        refetchOnWindowFocus: false,
        refetchOnReconnect: true,
        refetchOnMount: false,
        placeholderData: keepPreviousData,
        retry: 2,
        enabled: enabled && !!userId && !userLoading,
    });

    const campaigns =
        queryResult.data?.pages
            .flatMap((p: any) => (Array.isArray(p) ? p : (p?.data ?? [])))
            .filter((c): c is NonNullable<typeof c> => c != null) ?? [];

    return {
        ...queryResult,
        campaigns,
    };
}
