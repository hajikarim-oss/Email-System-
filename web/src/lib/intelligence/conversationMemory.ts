// Enterprise Cross-Team Contact Collision & Conversation Memory Engine
// Integrates historical transcripts & multi-profile conversation memory
// Prevents duplicate cross-team outreach across all 4 Smartlead profiles.

export interface ConversationHistoryRecord {
    id: string;
    contact_email: string;
    first_name: string;
    last_name: string;
    company: string;
    last_contacted_at: string;
    contacted_by: string;
    sender_email: string;
    subject: string;
    summary: string;
    status: "positive" | "replied" | "meeting_booked" | "unresponsive" | "active";
}

const STORAGE_KEY = "tbm_conversation_memory_v1";

export const DEFAULT_CONVERSATION_HISTORY: ConversationHistoryRecord[] = [];

export function getStoredMemory(): ConversationHistoryRecord[] {
    try {
        const item = localStorage.getItem(STORAGE_KEY);
        if (item) {
            const parsed = JSON.parse(item);
            if (Array.isArray(parsed) && parsed.length > 0) return parsed;
        }
    } catch {}
    return DEFAULT_CONVERSATION_HISTORY;
}

/**
 * Check if a lead/contact has previous interaction history across any team member.
 * Checks uniqueness by:
 * 1. Email (exact match)
 * 2. Full Name (first name + last name)
 */
export function checkContactHistory(
    email?: string,
    firstName?: string,
    lastName?: string
): ConversationHistoryRecord | null {
    const memory = getStoredMemory();
    const cleanEmail = (email || "").trim().toLowerCase();
    const cleanFirst = (firstName || "").trim().toLowerCase();
    const cleanLast = (lastName || "").trim().toLowerCase();
    const fullName = `${cleanFirst} ${cleanLast}`.trim();

    return memory.find((rec) => {
        const recEmail = rec.contact_email.toLowerCase();
        const recName = `${rec.first_name} ${rec.last_name}`.toLowerCase();

        // Match by email
        if (cleanEmail && recEmail === cleanEmail) return true;

        // Match by full name if both first and last name provided
        if (fullName.length > 3 && recName === fullName) return true;

        return false;
    }) || null;
}

/**
 * Record a new conversation touchpoint into the historical memory index.
 */
export function recordConversationTouchpoint(record: Omit<ConversationHistoryRecord, "id">): void {
    const memory = getStoredMemory();
    const newRecord: ConversationHistoryRecord = {
        ...record,
        id: `mem_${Date.now()}`,
    };
    const updated = [newRecord, ...memory.filter(m => m.contact_email.toLowerCase() !== record.contact_email.toLowerCase())];
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch {}
}
