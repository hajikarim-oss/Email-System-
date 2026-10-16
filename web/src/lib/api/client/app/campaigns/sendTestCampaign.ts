import Request from "../../Request";

export interface SendTestCampaignResult {
    success: boolean;
    campaignId: string;
    providerCampaignId?: string;
    recipients: string[];
    stepsCount: number;
    message: string;
}

export default async function sendTestCampaign(
    campaignId: string,
    recipients: string[] = ["snehal.maurya@theboredmonkey.com", "vatsal.vadecha@theboredmonkey.com"]
): Promise<SendTestCampaignResult> {
    return await Request<SendTestCampaignResult>({
        method: "POST",
        url: `/campaigns/${campaignId}/test-campaign`,
        data: { recipients },
        authorization: true,
    });
}
