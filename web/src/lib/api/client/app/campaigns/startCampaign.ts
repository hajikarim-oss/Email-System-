import Request from "../../Request";

export interface StartCampaignOptions {
    // Launch past the bounce-risk gate after reading the projection.
    acknowledge_list_risk?: boolean;
    leads?: Array<{
        email: string;
        first_name?: string;
        last_name?: string;
        company?: string;
        [key: string]: any;
    }>;
    mailbox_count?: number;
    daily_limit?: number;
    auto_optimize_interval?: boolean;
}

export interface StartCampaignResult {
    status: string;
    // The campaign started with nothing left to send and is active, waiting
    // for leads (Keep running for new leads is on).
    waiting_for_leads?: boolean;
}

export default async function startCampaign(id: string, options?: StartCampaignOptions): Promise<StartCampaignResult> {
    return await Request<StartCampaignResult>({
        method: "POST",
        url: `/campaigns/${id}/start`,
        data: options ?? {},
        authorization: true,
    })
}
