import Request from "../../../Request";
import type Sequence from "@/lib/api/models/app/campaigns/sequences/Sequence";

export default async function saveCampaignSteps(
    campaign_id: string,
    steps: Array<{
        id?: string;
        name?: string;
        subject?: string;
        body_plain?: string;
        body_html?: string;
        wait_after?: number;
    }>
): Promise<Sequence[]> {
    return await Request<Sequence[]>({
        method: "PUT",
        url: `/campaigns/${campaign_id}/steps`,
        data: { steps },
        authorization: true,
    });
}
