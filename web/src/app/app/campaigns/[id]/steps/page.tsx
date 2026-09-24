import React, { useState } from "react";
import { LayersIcon, Loader2Icon, MailIcon, PlusIcon } from "lucide-react";
import toast from "react-hot-toast";
import { useCampaign } from "@/hooks/context/campaign";
import CampaignFlow from "@/components/app/campaigns/sequences/CampaignFlow";
import CampaignTemplateEditor from "@/components/app/campaigns/templates/CampaignTemplateEditor";
import PermissionButton from "@/components/ui/PermissionButton";
import useSequences from "@/lib/api/hooks/app/campaigns/sequences/useSequences";
import useCreateSequence from "@/lib/api/hooks/app/campaigns/sequences/useCreateSequence";
import type { AppError } from "@/lib/api/client/normalizeError";
import buildError from "@/lib/helper/buildError";

export default function CampaignSteps() {
    const campaign = useCampaign();
    if (!campaign) {
        throw new Error("CampaignSteps cannot be rendered without a campaign");
    }

    return (
        <React.Suspense fallback={<StepsSkeleton />}>
            <StepsContent campaign={campaign} />
        </React.Suspense>
    );
}

function StepsContent({ campaign }: { campaign: any }) {
    const [viewMode, setViewMode] = useState<"template" | "flow">("template");

    if (viewMode === "flow") {
        return (
            <div className="space-y-4">
                <div className="flex items-center justify-between bg-white px-4 py-2.5 rounded-lg border border-slate-200">
                    <div className="flex items-center gap-2 text-[12.5px] text-slate-600">
                        <LayersIcon className="w-4 h-4 text-sky-600" />
                        <span>Interactive Node Flow Canvas</span>
                    </div>
                    <button
                        type="button"
                        onClick={() => setViewMode("template")}
                        className="h-7 px-3 rounded-md bg-sky-50 text-sky-700 hover:bg-sky-100 text-[12px] font-medium inline-flex items-center gap-1.5 transition-colors border border-sky-200"
                    >
                        <MailIcon className="w-3.5 h-3.5" />
                        Switch to Template Editor
                    </button>
                </div>
                <CampaignFlow key={campaign.id} campaignId={campaign.id} />
            </div>
        );
    }

    return (
        <CampaignTemplateEditor
            campaign={campaign}
            showFlowToggle={true}
            onSwitchToFlow={() => setViewMode("flow")}
        />
    );
}

function StepsSkeleton() {
    return (
        <div className="max-w-4xl mx-auto space-y-4 py-6">
            <div className="h-14 w-full bg-slate-100 rounded-xl animate-pulse" />
            <div className="h-64 w-full bg-slate-100 rounded-xl animate-pulse" />
        </div>
    );
}
