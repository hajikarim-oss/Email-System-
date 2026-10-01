export interface CategoryCount {
    category_id: string;
    count: number;
}

export interface ContactCategory {
    id: string;
    title: string;
    count: number;
    color: string;
}

export interface ContactSegment {
    id: string;
    name: string;
    count: number;
    color: string;
}

const LEGACY_CATEGORY_COUNTS: Record<string, number> = {
    DORMANT_REPLIED: 697,
    COLD_REENGAGEMENT: 23232,
    WARM_STALE: 651,
    BURNED: 3488,
};

const LEGACY_SEGMENT_COUNTS: Record<string, number> = {
    DORMANT_REPLIED: 697,
    COLD_REENGAGEMENT: 23232,
    WARM_STALE: 651,
    BURNED: 3488,
    IN_SEQUENCE: 50,
};

/**
 * Category chips shown above the contacts table. Counts come from the live
 * Lead table (grouped by outreachState) when available; the historical fixture
 * values are only used when no database-backed endpoint answered.
 */
export function buildCategories(counts: CategoryCount[] | null | undefined): ContactCategory[] {
    const byId = new Map<string, number>(
        (counts ?? []).map((c) => [String(c.category_id), Number(c.count) || 0]),
    );
    const countFor = (id: string): number =>
        counts ? byId.get(id) ?? 0 : LEGACY_CATEGORY_COUNTS[id] ?? 0;

    return [
        { id: "DORMANT_REPLIED", title: "Dormant Replied", count: countFor("DORMANT_REPLIED"), color: "#10b981" },
        { id: "COLD_REENGAGEMENT", title: "Cold Re-engagement", count: countFor("COLD_REENGAGEMENT"), color: "#8b5cf6" },
        { id: "WARM_STALE", title: "Warm Stale", count: countFor("WARM_STALE"), color: "#f59e0b" },
        { id: "BURNED", title: "Burned / Quarantined", count: countFor("BURNED"), color: "#ef4444" },
    ];
}

/** Saved segments in the contacts sidebar — same counts, segment labels. */
export function buildSegments(counts: CategoryCount[] | null | undefined): ContactSegment[] {
    const byId = new Map<string, number>(
        (counts ?? []).map((c) => [String(c.category_id), Number(c.count) || 0]),
    );
    const countFor = (id: string): number =>
        counts ? byId.get(id) ?? 0 : LEGACY_SEGMENT_COUNTS[id] ?? 0;

    return [
        { id: "seg_dormant_replied", name: "Dormant Replied (Past Responders)", count: countFor("DORMANT_REPLIED"), color: "#10b981" },
        { id: "seg_cold_reengagement", name: "Cold Re-engagement Candidates", count: countFor("COLD_REENGAGEMENT"), color: "#8b5cf6" },
        { id: "seg_warm_stale", name: "Warm Stale Leads", count: countFor("WARM_STALE"), color: "#f59e0b" },
        { id: "seg_suppressed", name: "Quarantined / Burned (Shield Active)", count: countFor("BURNED"), color: "#ef4444" },
        { id: "seg_in_sequence", name: "Currently In Sequence", count: countFor("IN_SEQUENCE"), color: "#0ea5e9" },
    ];
}
