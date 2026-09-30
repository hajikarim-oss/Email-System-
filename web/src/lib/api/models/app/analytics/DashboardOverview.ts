// GET /analytics/dashboard?period=7d|30d|90d[&from=YYYY-MM-DD&to=YYYY-MM-DD] —
// a single (un-enveloped) object mirroring the backend models.DashboardAnalytics.
// The previous flat shape (total_campaigns/total_contacts…) did not match the
// wire body. from/to (inclusive days) override period for Custom chart windows.

export interface DashboardOverallStats {
    total_emails_sent: number
    total_opens: number
    // Subset of total_opens from automated fetchers (auto-opens).
    machine_opens: number
    total_clicks: number
    // Steps clicked only by automated fetchers; not part of total_clicks.
    machine_clicks: number
    total_replies: number
    total_bounces: number
    open_rate: number
    click_rate: number
    reply_rate: number
    bounce_rate: number
    active_campaigns: number
    active_accounts: number
}

export interface RecentActivityItem {
    type: string // sent | opened | clicked | replied | bounced
    campaign_id: string
    campaign_name: string
    contact_email: string
    contact_id?: string
    timestamp: string
    link?: string
}

export interface TopCampaignStats {
    campaign_id: string
    name: string
    status: string
    emails_sent: number
    open_rate: number
    click_rate: number
    reply_rate: number
}

export interface AccountHealthSummary {
    total_accounts: number
    healthy_accounts: number
    warning_accounts: number
    error_accounts: number
}

export interface DashboardDailyStats {
    date: string
    sent: number
    opens: number
    clicks: number
    replies: number
    bounces: number
}

// One weekday x 3-hour bucket of the engagement heatmap. level is 0-4 shading
// relative to the busiest bucket in the period.
export interface DashboardHeatmapCell {
    opens: number
    replies: number
    level: number
}

export default interface DashboardOverview {
    period: string
    // Resolved window (inclusive UTC days); equals the requested range.
    from?: string
    to?: string
    // Emails sent so far today (UTC), independent of the chart window.
    today_sent?: number
    // Sum of daily send limits across ACTIVE/WARMING mailboxes, when reported.
    daily_capacity?: number
    // Opens/replies by weekday (Mon..Sun) and 3-hour window, from attributed
    // engagement (Lead counters, EmailEvent and EmailMessage).
    heatmap?: Record<string, DashboardHeatmapCell[]>
    overall_stats: DashboardOverallStats
    recent_activity: RecentActivityItem[]
    top_campaigns: TopCampaignStats[]
    account_health: AccountHealthSummary
    daily_trend: DashboardDailyStats[]
}
