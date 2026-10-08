import { useQuery } from "@tanstack/react-query";
import getMembers from "@/lib/api/client/app/organizations/getMembers";

export default function useMembers() {
    return useQuery({
        queryKey: ["organizations", "members"],
        queryFn: () => getMembers(),
        staleTime: 60 * 1000,  // Keep fresh for 60 seconds
        gcTime: 10 * 60 * 1000,  // Keep in memory for 10 minutes
        refetchInterval: 30 * 1000,  // Refetch every 30 seconds for real-time updates
    })
}
