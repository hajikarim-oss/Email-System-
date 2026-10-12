import { useQuery } from "@tanstack/react-query";
import getTeamMembers from "@/lib/api/client/app/unibox/getTeamMembers";

export default function useTeamMembers() {
  return useQuery({
    queryKey: ["unibox", "team"],
    queryFn: getTeamMembers,
    staleTime: 5_000,
    gcTime: 30 * 60 * 1000,
  });
}
