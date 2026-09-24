import React from "react";
import { useCampaign } from "@/hooks/context/campaign";
import CampaignTemplateEditor from "@/components/app/campaigns/templates/CampaignTemplateEditor";

export default function CampaignTemplatePage() {
    const campaign = useCampaign();
    if (!campaign) {
        throw new Error("CampaignTemplatePage cannot be rendered without a campaign");
    }

    return (
        <CampaignTemplateEditor campaign={campaign} />
    );
}
