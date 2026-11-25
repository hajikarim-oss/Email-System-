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

export interface CalendarCampaignSlot {
    id: string
    name: string
    owner_name: string
    owner_id: string
    preferred_hour: number
    time_label: string
    total_leads: number
    new_leads: number
    followup_leads: number
    remaining_after: number
    max_steps: number
    is_finishing: boolean
    is_new_launch: boolean
}

export interface CapacityTimelineDay {
    date: string
    day_name: string
    full_day_name?: string
    projected_leads: number
    new_leads_count?: number
    followup_leads_count?: number
    free_slots?: number
    capacity: number
    utilization_pct: number
    is_sending_day: boolean
    campaigns_count: number
    finishing_campaigns_count?: number
    status: 'OPTIMAL' | 'BUSY' | 'CAPPED' | 'REST_DAY'
    scheduled_campaigns?: CalendarCampaignSlot[]
}

export interface AlignedCampaignItem {
    id: string
    name: string
    owner_name: string
    owner_id: string
    status: string
    uncontacted_leads: number
    in_sequence_leads: number
    sent_today?: number
    max_steps?: number
    is_dormant?: boolean
    estimated_days_left?: number
    runs_today: boolean
    runs_tomorrow: boolean
    estimated_daily: number
    quota_share_pct: number
    preferred_hour: number
    preferred_days?: number[]
}

export interface CapacityTracker {
    daily_limit: number
    today: {
        date: string
        day_name: string
        sent_so_far: number
        remaining_capacity: number
        utilization_pct: number
        active_campaigns_count: number
        status: 'OPTIMAL' | 'BUSY' | 'CAPPED'
        status_label: string
    }
    tomorrow: {
        date: string
        day_name: string
        is_sending_day: boolean
        projected_leads: number
        projected_remaining: number
        projected_utilization_pct: number
        aligned_campaigns_count: number
        status: 'OPTIMAL' | 'BUSY' | 'CAPPED'
        status_label: string
    }
    timeline: CapacityTimelineDay[]
    aligned_campaigns: AlignedCampaignItem[]
    decision_assistant: {
        can_launch_today: boolean
        safe_slots_today: number
        safe_slots_tomorrow: number
        recommended_action: string
        best_window: string
    }
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
    // Smart Capacity and Campaign Alignment Tracker
    capacity_tracker?: CapacityTracker
    // Opens/replies by weekday (Mon..Sun) and 3-hour window, from attributed
    // engagement (Lead counters, EmailEvent and EmailMessage).
    heatmap?: Record<string, DashboardHeatmapCell[]>
    overall_stats: DashboardOverallStats
    recent_activity: RecentActivityItem[]
    top_campaigns: TopCampaignStats[]
    account_health: AccountHealthSummary
    daily_trend: DashboardDailyStats[]
}
