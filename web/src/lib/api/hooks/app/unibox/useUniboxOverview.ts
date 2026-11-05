import { useQuery } from "@tanstack/react-query";
import getOverview from "@/lib/api/client/app/unibox/getOverview";

export default function useUniboxOverview(creatorOnly?: boolean) {
    return useQuery({
        queryKey: ["unibox", "overview", creatorOnly ? "creators" : "all"],
        queryFn: () => getOverview(creatorOnly),
        staleTime: 15_000,
        gcTime: 30 * 60 * 1000,
        refetchOnWindowFocus: true,
    })
}
