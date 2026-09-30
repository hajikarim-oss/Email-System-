export type QueryRow = Record<string, any>;

export type QueryFn = <T extends QueryRow = QueryRow>(sql: string, params?: unknown[]) => Promise<T[]>;

export interface ContactsRequest {
    query?: string;
    page?: number;
    limit?: number;
    campaignIds?: string[];
    outreachState?: string;
    recencyBucket?: string;
    subscribed?: boolean | null;
    company?: string;
    domain?: string;
}

export interface ContactsCounts {
    total: number;
    subscribed: number;
    unsubscribed: number;
    in_campaign: number;
    not_contacted: number;
    categories: { category_id: string; count: number }[];
}

export interface LeadCounts {
    total: number;
    queued: number;
    processing: number;
    completed: number;
    contacted: number;
    replied: number;
    replied_any: number;
    bounced: number;
    failed: number;
    unsubscribed: number;
    undeliverable: number;
    opened: number;
    clicked: number;
}

export interface ContactsResponse {
    data: any[];
    total: number;
    counts: ContactsCounts;
    lead_counts?: LeadCounts;
    pagination: {
        total: number;
        page: number;
        limit: number;
        has_more: boolean;
        next_cursor?: string | null;
    };
}
