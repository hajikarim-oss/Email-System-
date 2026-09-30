// GET /analytics/report — the lifetime system report behind the dashboard's
// volume, category and head-of-department sections. Mirrors server/report.ts.

export interface ReportLifetime {
    // Message rows plus sends newer than the message table.
    emails_sent: number
    messages_tracked: number
    leads_total: number
    leads_contacted: number
    contacts_emailed: number
    leads_opened: number
    leads_replied: number
    reply_messages: number
    interested_replies: number
    delivered: number
    failed: number
    // Lifetime rates over the same counts printed beside them.
    open_rate: number
    reply_rate: number
    bounce_rate: number
    delivered_rate: number
    brands: number
    first_send: string | null
    last_send: string | null
}

export interface ReportCategory {
    category: string
    leads: number
    contacted: number
    opened: number
    replied: number
    reply_rate: number
}

export interface ReportClassification {
    classification: string
    leads: number
}

export interface ReportVolumePoint {
    month: string
    sent: number
    replies: number
}

export interface ReportCampaign {
    campaign: string
    sent: number
    replies: number
    contacts: number
    reply_rate: number
    first_sent: string | null
    last_sent: string | null
}

export interface ReportReply {
    contact_email: string
    subject: string
    snippet: string
    classification: string
    replied_at: string | null
    sender_email: string
    campaign: string
}

export interface ReportBrand {
    name: string
    domain: string
    contacts: number
    replied: number
}

export interface ReportMailbox {
    id: string
    senderEmail: string
    provider: string | null
    status: string
    dailySendLimit: number
    warmupReputationScore: number | null
    sent_today: number
    total_sent: number
}

export default interface SystemReport {
    generated_at: string
    lifetime: ReportLifetime
    categories: ReportCategory[]
    reply_breakdown: ReportClassification[]
    volume: ReportVolumePoint[]
    top_campaigns: ReportCampaign[]
    campaigns_total: number
    recent_replies: ReportReply[]
    brands: ReportBrand[]
    mailboxes: ReportMailbox[]
}
