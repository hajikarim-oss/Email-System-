import React from "react";
import { useParams } from "react-router-dom";
import { useCampaign } from "@/hooks/context/campaign";
import useCampaignHook from "@/lib/api/hooks/app/campaigns/useCampaign";
import CampaignTemplateEditor from "@/components/app/campaigns/templates/CampaignTemplateEditor";

export default function CampaignTemplatePage() {
    const campaignFromContext = useCampaign();
    const { id } = useParams();
    const campaignQuery = useCampaignHook(id || "");
    const campaign = (campaignFromContext && campaignFromContext.id) ? campaignFromContext : campaignQuery.data;

    if (!campaign || !campaign.id) {
        return (
            <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="h-6 w-48 bg-slate-100 rounded-md animate-pulse mb-3" />
                <p className="text-xs text-slate-400">Loading campaign template sequence...</p>
            </div>
        );
    }

    return (
        <CampaignTemplateEditor campaign={campaign} />
    );
}
