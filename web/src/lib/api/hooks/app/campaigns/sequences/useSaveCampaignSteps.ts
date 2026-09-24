import { useMutation, useQueryClient } from "@tanstack/react-query";
import saveCampaignSteps from "@/lib/api/client/app/campaigns/sequences/saveCampaignSteps";
import type Sequence from "@/lib/api/models/app/campaigns/sequences/Sequence";

export default function useSaveCampaignSteps(campaign_id: string) {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (steps: Array<{
            id?: string;
            name?: string;
            subject?: string;
            body_plain?: string;
            body_html?: string;
            wait_after?: number;
        }>) => saveCampaignSteps(campaign_id, steps),
        onSuccess: (savedSteps) => {
            queryClient.setQueryData<Sequence[]>(
                ["campaigns", campaign_id, "sequences"],
                savedSteps
            );
            queryClient.invalidateQueries({
                queryKey: ["campaigns", campaign_id],
            });
            queryClient.invalidateQueries({
                queryKey: ["campaign", campaign_id],
            });
        },
    });
}
