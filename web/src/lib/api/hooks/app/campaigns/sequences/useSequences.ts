import getSequences from "@/lib/api/client/app/campaigns/sequences/getSequences";
import { useQuery } from "@tanstack/react-query";

const useSequences = (campaign_id: string) => useQuery({
    queryKey: ["campaigns", campaign_id, "sequences"],
    queryFn: () => getSequences(campaign_id),
    enabled: Boolean(campaign_id),
    staleTime: 15_000,
});

export default useSequences;
