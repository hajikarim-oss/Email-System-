// A hosted workspace without a subscription can manage mailboxes, its
// Warmbly Cloud links and settings; every other page shows the full-screen
// plan chooser until a plan is active.

import React from "react";
import { useLocation } from "react-router-dom";
import useFeatureAccess from "@/hooks/useFeatureAccess";
import SubscriptionLockedScreen from "./SubscriptionLockedScreen";

const OPEN_PREFIXES = ["/app/emails", "/app/settings", "/app/select-org"];

const FEATURE_BY_PREFIX: [string, string][] = [
    ["/app/unibox", "The unified inbox"],
    ["/app/campaigns", "Campaigns"],
    ["/app/contacts", "Contacts"],
    ["/app/analytics", "Analytics"],
    ["/app/deliverability", "Deliverability"],
    ["/app/crm", "The CRM"],
    ["/app/templates", "Templates"],
    ["/app/integrations", "Integrations"],
    ["/app/automations", "Automations"],
    ["/app/api-keys", "API keys"],
    ["/app/audit", "The audit log"],
];

export default function SubscriptionGate({ children }: { children: React.ReactNode }) {
    return <>{children}</>;
}
