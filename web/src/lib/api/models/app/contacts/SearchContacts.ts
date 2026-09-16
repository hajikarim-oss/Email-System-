import type { SearchContactsSortBy } from "./search-contacts.types";
import type SearchContactsFilter from "./SearchContactsFilter";
import type { LeadEngagement, LeadStatus, VerificationStatus } from "./Contact";

export default interface SearchContacts {
    query: string;
    custom_field_filters: SearchContactsFilter[];
    campaign_ids: string[];
    // Campaign Leads view only (exactly one campaign_id): narrow to one derived
    // lead status and/or one engagement bucket. The server ANDs the two.
    lead_status?: LeadStatus;
    engagement?: LeadEngagement;
    category_ids?: string[];
    // Contact must be a member of ALL of these segments.
    segment_ids?: string[];
    min_campaigns?: number;
    max_campaigns?: number;
    subscribed?: boolean;
    verification_status?: VerificationStatus;
    created_after?: Date;
    created_before?: Date;
    updated_after?: Date;
    updated_before?: Date;
    sort_by: SearchContactsSortBy;
    reverse: boolean;

    // Temporal Intelligence Filters
    recency_buckets?: string[];
    outreach_states?: string[];
    reply_classifications?: string[];
    days_since_contact_min?: number;
    days_since_contact_max?: number;
    is_burned?: boolean;
    is_dormant?: boolean;
    is_reengagement_candidate?: boolean;
    domains?: string[];
    tags?: string[];
}
