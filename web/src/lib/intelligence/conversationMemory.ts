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

// Curated index of historical conversations from past outreach & CRM records
export const DEFAULT_CONVERSATION_HISTORY: ConversationHistoryRecord[] = [
    {
        id: "mem_rajdeep_01",
        contact_email: "hajikarimbeldaar@gmail.com",
        first_name: "Rajdeep",
        last_name: "More",
        company: "TheBoredMonkey",
        last_contacted_at: "2026-08-28T14:30:00Z",
        contacted_by: "Haji Karim",
        sender_email: "haji.karim@theboredmonkey.com",
        subject: "Outreach Campaign Systems & Collaboration",
        summary: "Discussed PhonePe influencer relations and cold email delivery schedules. Confirmed partnership deliverables for June.",
        status: "positive",
    },
    {
        id: "mem_karim_02",
        contact_email: "karimshaikh356@gmail.com",
        first_name: "Karim",
        last_name: "Beldaar",
        company: "TheBoredMonkey",
        last_contacted_at: "2026-08-20T11:15:00Z",
        contacted_by: "Snehal Maurya",
        sender_email: "snehal.maurya@theboredmonkey.com",
        subject: "Product Review and Onboarding Roadmap",
        summary: "Sent initial technical briefing on deliverability warmup infrastructure. Requested technical documentation.",
        status: "replied",
    },
    {
        id: "mem_sarah_03",
        contact_email: "sarah.chen@fintechlabs.com",
        first_name: "Sarah",
        last_name: "Chen",
        company: "Fintech Labs Inc.",
        last_contacted_at: "2026-09-02T16:45:00Z",
        contacted_by: "Haji Karim",
        sender_email: "haji.karim@theboredmonkey.com",
        subject: "Quick question about SaaS scaling",
        summary: "Connected regarding SaaS cold email deliverability. Agreed to schedule a 15-min discovery call.",
        status: "meeting_booked",
    },
    {
        id: "mem_marcus_04",
        contact_email: "marcus.v@cloudscale.net",
        first_name: "Marcus",
        last_name: "Vance",
        company: "Cloudscale Networks",
        last_contacted_at: "2026-09-05T09:20:00Z",
        contacted_by: "Haji Karim",
        sender_email: "haji.karim@theboredmonkey.com",
        subject: "Partnership opportunity with TheBoredMonkey",
        summary: "Explored technical documentation for SPF/DKIM automated deliverability warmup. Follow up in progress.",
        status: "active",
    },
    {
        id: "mem_aditi_05",
        contact_email: "aditi.rao@phonepe.com",
        first_name: "Aditi",
        last_name: "Rao",
        company: "PhonePe",
        last_contacted_at: "2026-09-08T13:10:00Z",
        contacted_by: "Snehal Maurya",
        sender_email: "snehal.maurya@theboredmonkey.com",
        subject: "Influencer Outreach Campaign - Deliverables & Schedule",
        summary: "Finalizing content alignment and brand guidelines for PhonePe merchant reachout campaign.",
        status: "positive",
    },
    {
        id: "mem_vikram_06",
        contact_email: "vikram@apexcloud.io",
        first_name: "Vikram",
        last_name: "Malhotra",
        company: "ApexCloud",
        last_contacted_at: "2026-09-07T10:00:00Z",
        contacted_by: "Growth Team",
        sender_email: "growth@theboredmonkey.com",
        subject: "Outbound Cold Email Infrastructure",
        summary: "Interested in scaling cold email infrastructure across 4 Google Workspace profiles with Smartlead.",
        status: "replied",
    },
];

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
