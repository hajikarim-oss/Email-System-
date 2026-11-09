// Overview tab — at-a-glance contact 360.
//
// Composition:
//   - Suppression card (only when suppressed)
//   - Engagement: six flat stat tiles with a thin ratio bar where
//     a ratio over Sent makes sense
//   - Latest activity rail
//   - Profile rows for the fields not already in the panel header

import {
    AlertOctagonIcon,
    BanIcon,
    CheckIcon,
    CopyIcon,
    ExternalLinkIcon,
    MailIcon,
    MailOpenIcon,
    MailWarningIcon,
    MousePointerClickIcon,
    ReplyIcon,
    SparklesIcon,
} from "lucide-react";
import toast from "react-hot-toast";
import type ContactDetail from "@/lib/api/models/app/contacts/ContactDetail";
import type Contact from "@/lib/api/models/app/contacts/Contact";
import { useConfirm } from "@/hooks/context/confirm";
import { useWriteGuard } from "@/hooks/usePermission";
import { useRemoveSuppression } from "@/lib/api/hooks/app/suppressions/useSuppressions";
import { SOURCE_LABEL } from "@/lib/api/models/app/suppressions/Suppression";
import type { AppError } from "@/lib/api/client/normalizeError";
import buildError from "@/lib/helper/buildError";
import { fmtAbsolute, fmtRelative } from "./format";
import { sourceLabel } from "./ActivityTab";
import { ContactSegmentsSection } from "./ContactSegmentsSection";
import VerificationCard from "./VerificationCard";

export default function OverviewTab({
    contact,
    detail,
    detailLoading,
}: {
    contact: Contact;
    detail?: ContactDetail;
    detailLoading: boolean;
}) {
    const eng = detail?.engagement;
    const supp = detail?.suppression;
    const sent = eng?.total_sent ?? 0;
    const confirm = useConfirm();
    const write = useWriteGuard("MANAGE_CONTACTS");
    const removeSuppression = useRemoveSuppression();
    const [copiedForm, setCopiedForm] = React.useState(false);

    const rawFormLink = contact.custom_fields?.form_link || contact.custom_fields?.intake_link || contact.custom_fields?.IntakeFormUrl || contact.form_link || contact.intake_link || (() => {
        const rawH = (contact.custom_fields?.handle || (contact.company?.startsWith("@") ? contact.company : "")).replace(/^@/, "");
        if (!rawH && !contact.email) return "";
        const token = contact.custom_fields?.intakeToken || contact.custom_fields?.intake_token || contact.id || rawH || contact.email.split("@")[0];
        return `https://tbmoutreach.tech/creator/intake/${encodeURIComponent(token)}`;
    })();
    const formLink = rawFormLink
        ? String(rawFormLink).replace(/^https?:\/\/(www\.)?(theboredmonkey\.com|app\.theboredmonkey\.com|localhost:\d+)/i, "https://tbmoutreach.tech")
        : "";

    function copyForm() {
        if (!formLink) return;
        navigator.clipboard.writeText(formLink).then(() => {
            setCopiedForm(true);
            toast.success("Creator intake link copied to clipboard!");
            setTimeout(() => setCopiedForm(false), 1500);
        });
    }

    function askLift() {
        if (!supp) return;
        const own = supp.source === "unsubscribe" || supp.source === "complaint" || supp.source === "bounce";
        const what = supp.kind === "domain" ? `the whole @${supp.value} domain` : contact.email;
        const text = own
            ? `${contact.email} ${SOURCE_LABEL[supp.source]?.toLowerCase() ?? "was suppressed"} on their own. Removing the entry lets campaigns email ${what} again, and that is recorded in the audit log. Continue?`
            : `Remove ${what} from the suppression list? Campaigns can email them again.`;
        confirm.show(text, async () => {
            try {
                await removeSuppression.mutateAsync(supp.id);
                toast.success("Removed from the suppression list");
            } catch (err) {
                toast.error(buildError(err as AppError));
            }
        });
    }

    return (
        <div className="space-y-5">
            {supp && (
                <div className="rounded-md border border-red-200 bg-red-50/60 px-3 py-2.5 flex items-start gap-2">
                    <BanIcon className="w-3.5 h-3.5 text-red-600 mt-px shrink-0" />
                    <div className="min-w-0 flex-1">
                        <div className="text-[12px] font-medium text-red-900 leading-tight">
                            {SOURCE_LABEL[supp.source] ?? "Suppressed"}
                            {supp.kind === "domain" ? ` · whole @${supp.value} domain` : ""}
                        </div>
                        <div className="text-[11px] text-red-700/90 mt-0.5">
                            {supp.reason || "No reason given"} · since{" "}
                            {fmtAbsolute(supp.created_at)}
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={(e) => write.guard(askLift)(e)}
                        disabled={removeSuppression.isPending}
                        className="shrink-0 h-6 px-2 rounded-md border border-red-200 bg-white text-[11px] font-medium text-red-700 hover:bg-red-50 transition-colors disabled:opacity-50"
                    >
                        Remove
                    </button>
                </div>
            )}

            {contact.temporal_state?.outreach_state && (
                <Section title="Live Outreach Intelligence">
                    <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-3.5 space-y-3">
                        <div className="flex items-center justify-between">
                            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Outreach State</span>
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold ${
                                contact.temporal_state.outreach_state === "DORMANT_REPLIED"
                                    ? "bg-emerald-100 text-emerald-800"
                                    : contact.temporal_state.outreach_state === "WARM_STALE"
                                    ? "bg-amber-100 text-amber-800"
                                    : contact.temporal_state.outreach_state === "COLD_REENGAGEMENT"
                                    ? "bg-purple-100 text-purple-800"
                                    : contact.temporal_state.outreach_state === "BURNED"
                                    ? "bg-rose-100 text-rose-800"
                                    : "bg-slate-200 text-slate-700"
                            }`}>
                                {contact.temporal_state.outreach_state.replace(/_/g, " ")}
                            </span>
                        </div>
                        {contact.temporal_state.days_since_last_contact !== null && contact.temporal_state.days_since_last_contact !== undefined && (
                            <div className="flex items-center justify-between text-[11.5px] border-t border-slate-200/60 pt-2">
                                <span className="text-slate-500">Last Touchpoint</span>
                                <span className="font-medium text-slate-700 font-mono">
                                    {contact.temporal_state.days_since_last_contact} days ago ({contact.temporal_state.recency_bucket?.replace(/_/g, " ")})
                                </span>
                            </div>
                        )}
                        {contact.last_message_context?.subject && contact.last_message_context.subject !== "No prior outreach" && (
                            <div className="border-t border-slate-200/60 pt-2.5 space-y-1">
                                <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Last Subject</div>
                                <div className="text-[12px] font-medium text-slate-900 bg-white border border-slate-200 rounded px-2.5 py-1.5 shadow-2xs">
                                    {contact.last_message_context.subject}
                                </div>
                                {contact.last_message_context.body_hook && (
                                    <>
                                        <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider pt-1">Last Conversation Message</div>
                                        <div className="text-[12px] text-slate-700 bg-white border border-slate-200 rounded p-2.5 italic leading-relaxed border-l-2 border-l-[#18181B] shadow-2xs">
                                            "{contact.last_message_context.body_hook}"
                                        </div>
                                    </>
                                )}
                            </div>
                        )}
                    </div>
                </Section>
            )}

            <Section title="Deliverability">
                <VerificationCard detail={detail?.verification} loading={detailLoading} />
            </Section>

            <Section title="Engagement">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-1.5">
                    <StatTile
                        icon={<MailIcon className="w-3 h-3" />}
                        label="Sent"
                        value={sent}
                        loading={detailLoading}
                    />
                    <StatTile
                        icon={<MailOpenIcon className="w-3 h-3" />}
                        label="Opened"
                        value={eng?.total_opened ?? 0}
                        loading={detailLoading}
                        ratioOf={sent}
                    />
                    <StatTile
                        icon={<MousePointerClickIcon className="w-3 h-3" />}
                        label="Clicked"
                        value={eng?.total_clicked ?? 0}
                        loading={detailLoading}
                        ratioOf={sent}
                    />
                    <StatTile
                        icon={<ReplyIcon className="w-3 h-3" />}
                        label="Replied"
                        value={eng?.total_replied ?? 0}
                        loading={detailLoading}
                        ratioOf={sent}
                        accent={
                            eng && eng.total_replied > 0 ? "positive" : undefined
                        }
                    />
                    <StatTile
                        icon={<MailWarningIcon className="w-3 h-3" />}
                        label="Bounced"
                        value={eng?.total_bounced ?? 0}
                        loading={detailLoading}
                        ratioOf={sent}
                        accent={
                            eng && eng.total_bounced > 0 ? "negative" : undefined
                        }
                    />
                    <StatTile
                        icon={<AlertOctagonIcon className="w-3 h-3" />}
                        label="Complained"
                        value={eng?.total_complained ?? 0}
                        loading={detailLoading}
                        ratioOf={sent}
                        accent={
                            eng && eng.total_complained > 0
                                ? "negative"
                                : undefined
                        }
                    />
                </div>
            </Section>

            <Section title="Latest activity">
                <div className="rounded-md border border-slate-200 bg-white overflow-hidden">
                    <LatestRow
                        label="Last sent"
                        ts={eng?.last_sent_at}
                        icon={<MailIcon className="w-3 h-3" />}
                    />
                    <LatestRow
                        label="Last opened"
                        ts={eng?.last_opened_at}
                        icon={<MailOpenIcon className="w-3 h-3" />}
                    />
                    <LatestRow
                        label="Last clicked"
                        ts={eng?.last_clicked_at}
                        icon={<MousePointerClickIcon className="w-3 h-3" />}
                    />
                    <LatestRow
                        label="Last replied"
                        ts={eng?.last_replied_at}
                        icon={<ReplyIcon className="w-3 h-3" />}
                    />
                    <LatestRow
                        label="Last bounced"
                        ts={eng?.last_bounced_at}
                        icon={<MailWarningIcon className="w-3 h-3" />}
                    />
                </div>
            </Section>

            {formLink && (
                <Section title="Creator Intake Form">
                    <div className="rounded-md border border-amber-200/80 bg-amber-50/50 p-3.5 space-y-2.5">
                        <div className="flex items-center justify-between">
                            <span className="text-[12px] font-semibold text-slate-900 flex items-center gap-1.5">
                                <SparklesIcon className="w-3.5 h-3.5 text-amber-600" />
                                Personalized Intake Form
                            </span>
                            <div className="flex items-center gap-1.5">
                                <button
                                    type="button"
                                    onClick={copyForm}
                                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors shadow-2xs cursor-pointer"
                                >
                                    {copiedForm ? <CheckIcon className="w-3 h-3 text-emerald-600" /> : <CopyIcon className="w-3 h-3 text-slate-500" />}
                                    <span>{copiedForm ? "Copied" : "Copy Form Link"}</span>
                                </button>
                                <a
                                    href={formLink}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium bg-[#ea580c] hover:bg-[#c2410c] text-white transition-colors shadow-2xs cursor-pointer"
                                >
                                    <ExternalLinkIcon className="w-3 h-3" />
                                    <span>Open Form</span>
                                </a>
                            </div>
                        </div>
                        <div className="text-[11px] font-mono text-slate-600 bg-white p-2 rounded border border-amber-200/60 break-all select-all">
                            {formLink}
                        </div>
                    </div>
                </Section>
            )}

            <Section title="Profile">
                <div className="rounded-md border border-slate-200 bg-white overflow-hidden">
                    <ProfileRow
                        label="Company"
                        value={contact.company || "—"}
                    />
                    <ProfileRow label="Phone" value={contact.phone || "—"} />
                    <ProfileRow
                        label="Categories"
                        value={
                            contact.categories.length > 0 ? (
                                <span className="flex flex-wrap gap-1 justify-end">
                                    {contact.categories.map((c) => (
                                        <span
                                            key={c.id}
                                            className="inline-flex h-4 items-center px-1.5 rounded text-[10.5px] font-medium"
                                            style={{
                                                backgroundColor: `${c.color}1a`,
                                                color: c.color,
                                            }}
                                        >
                                            {c.title}
                                        </span>
                                    ))}
                                </span>
                            ) : (
                                "None"
                            )
                        }
                    />
                    <ProfileRow
                        label="Campaigns"
                        value={
                            contact.campaigns.length > 0
                                ? `${contact.campaigns.length} active`
                                : "None"
                        }
                    />
                </div>
            </Section>

            <ContactSegmentsSection contactId={contact.id} />

            {detail && (
                <Section title="Source">
                    <div className="rounded-md border border-slate-200 bg-white overflow-hidden">
                        <ProfileRow
                            label="Came from"
                            value={
                                detail.source_detail
                                    ? `${sourceLabel(detail.source)} · ${detail.source_detail}`
                                    : sourceLabel(detail.source)
                            }
                        />
                        <ProfileRow
                            label="First seen"
                            value={fmtAbsolute(detail.first_seen_at)}
                        />
                    </div>
                </Section>
            )}

            {Object.keys(contact.custom_fields || {}).length > 0 && (
                <Section title="Custom fields">
                    <div className="rounded-md border border-slate-200 bg-white overflow-hidden">
                        {Object.entries(contact.custom_fields).map(([k, v]) => (
                            <ProfileRow key={k} label={k} value={v} mono />
                        ))}
                    </div>
                </Section>
            )}
        </div>
    );
}

function Section({
    title,
    children,
}: {
    title: string;
    children: React.ReactNode;
}) {
    return (
        <section>
            <h2 className="text-[10px] uppercase tracking-[0.14em] font-semibold text-slate-500 mb-2">
                {title}
            </h2>
            {children}
        </section>
    );
}

function StatTile({
    icon,
    label,
    value,
    loading,
    ratioOf,
    accent,
}: {
    icon: React.ReactNode;
    label: string;
    value: number;
    loading: boolean;
    ratioOf?: number;
    accent?: "positive" | "negative";
}) {
    const pct =
        ratioOf && ratioOf > 0 ? Math.round((value / ratioOf) * 100) : null;
    const valueTone =
        accent === "negative"
            ? "text-red-700"
            : accent === "positive"
              ? "text-emerald-700"
              : "text-slate-900";
    const barTone =
        accent === "negative"
            ? "bg-red-500/80"
            : accent === "positive"
              ? "bg-emerald-500/80"
              : "bg-slate-900/70";

    return (
        <div className="rounded-md border border-slate-200 bg-white px-2.5 py-2">
            <div className="text-[10px] uppercase tracking-[0.12em] text-slate-500 font-medium flex items-center gap-1">
                <span className="text-slate-400">{icon}</span>
                {label}
            </div>
            <div className="mt-1 flex items-baseline justify-between gap-1.5">
                <span
                    className={`text-[15px] font-semibold tabular-nums leading-none ${valueTone}`}
                >
                    {loading ? (
                        <span className="inline-block w-6 h-3.5 rounded bg-slate-100 animate-pulse align-middle" />
                    ) : (
                        value.toLocaleString()
                    )}
                </span>
                {pct !== null && (
                    <span className="text-[10px] text-slate-400 tabular-nums">
                        {pct}%
                    </span>
                )}
            </div>
            {pct !== null && (
                <div className="mt-1.5 h-0.5 rounded-full bg-slate-100 overflow-hidden">
                    <div
                        className={`h-full ${barTone} transition-all`}
                        style={{ width: `${Math.min(100, pct)}%` }}
                    />
                </div>
            )}
        </div>
    );
}

function LatestRow({
    label,
    ts,
    icon,
}: {
    label: string;
    ts?: string | null;
    icon: React.ReactNode;
}) {
    return (
        <div className="flex items-center gap-2 px-3 py-1.5 border-b last:border-b-0 border-slate-100">
            <span className={ts ? "text-slate-500" : "text-slate-300"}>
                {icon}
            </span>
            <div className="text-[11.5px] text-slate-700 flex-1">{label}</div>
            <div
                className={`text-[11.5px] tabular-nums ${
                    ts ? "text-slate-600" : "text-slate-300"
                }`}
            >
                {ts ? fmtRelative(ts) : "never"}
            </div>
        </div>
    );
}

function ProfileRow({
    label,
    value,
    mono,
}: {
    label: string;
    value: React.ReactNode;
    mono?: boolean;
}) {
    return (
        <div className="flex items-start gap-2 px-3 py-1.5 border-b last:border-b-0 border-slate-100">
            <div className="text-[11px] text-slate-500 w-24 shrink-0">
                {label}
            </div>
            <div
                className={`text-[12px] flex-1 text-right break-words text-slate-900 ${
                    mono ? "font-mono" : ""
                }`}
            >
                {value}
            </div>
        </div>
    );
}
