import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { pgQuery } from "./pg";
import type { QueryFn } from "./types";
import {
    ensureInstagramColumns,
    formatFollowersRaw,
    lookupAndSyncInstagramProfile,
    type InstagramInsightsPayload,
} from "./instagram_graph";

const EMAIL_RE = /[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+/g;
const PHONE_RE = /(?<!\d)(?:\+?91[\s.-]?|0)?[6-9]\d{4}[\s.-]?\d{5}(?!\d)/g;
const WA_LINK_RE = /(?:wa\.me\/|api\.whatsapp\.com\/send\?phone=)\+?(\d{10,13})/gi;
const BIO_LINK_RE = /(?:https?:\/\/)?(?:linktr\.ee|beacons\.ai|bio\.link|linkin\.bio|taplink\.cc|campsite\.bio|wishlink\.com|stan\.store)\/[A-Za-z0-9_.\-/]+/gi;

const EXCLUDE_EMAIL_DOMAINS = [
    "google.com",
    "schema.org",
    "sentry.io",
    "example.com",
    "instagram.com",
    "facebook.com",
    "w3.org",
    "gstatic.com",
    "googleapis.com",
    "creatordb.app",
    "beerbicepsskillhouse.com",
    "youtube.com",
    "wixpress.com",
    "cloudflare.com",
    "linktr.ee",
];

const AGENCY_KEYWORDS = [
    "agency",
    "talent",
    "mgmt",
    "management",
    "reach",
    "media",
    "social",
    "collab",
    "pr",
    "entertainment",
    "creators",
    "digital",
    "studio",
    "network",
];

const COLLAB_TAGS = [
    "#ad",
    "#collab",
    "#sponsored",
    "#partner",
    "#gifted",
    "#ambassador",
    "paid partnership",
    "use code",
    "discount code",
    "link in bio",
];

// 42 Official TBM Categories from Creator Scouting Master Taxonomy
export const TBM_CREATOR_CATEGORIES: { category: string; keywords: string[] }[] = [
    { category: "Skincare", keywords: ["skincare", "skin care", "sunscreen", "serum", "acne", "glass skin", "dermat", "moisturizer", "cleanser", "hyphen"] },
    { category: "Beauty", keywords: ["makeup", "beauty", "grwm", "lipstick", "cosmetics", "mua", "bridal makeup", "eyeliner", "blush", "nykaa"] },
    { category: "Haircare", keywords: ["haircare", "hair care", "curly hair", "hair fall", "hair growth", "hair oil", "shampoo", "hairstyle"] },
    { category: "Men's Grooming", keywords: ["mens grooming", "beard", "shaving", "trimmer", "men's style", "mens skincare"] },
    { category: "Fragrance", keywords: ["perfume", "fragrance", "scent", "attar", "eau de parfum", "cologne"] },
    { category: "Fashion", keywords: ["fashion", "outfit", "ootd", "streetwear", "styling", "haul", "clothing", "saree", "ethnic wear", "snitch", "myntra"] },
    { category: "Jewellery & Accessories", keywords: ["jewellery", "jewelry", "earrings", "necklace", "accessories", "watches", "rings"] },
    { category: "Tech", keywords: ["tech", "gadget", "smartphone", "unboxing", "laptop", "iphone", "android", "tech reviewer", "boat", "noise"] },
    { category: "Appliance Reviewer", keywords: ["appliance", "smart home", "kitchen gadget", "air purifier", "washing machine", "ac review"] },
    { category: "Food Blogger", keywords: ["food blogger", "foodie", "street food", "restaurant", "cafe", "food review", "zomato", "swiggy", "taste test"] },
    { category: "Chef / Home Chef", keywords: ["chef", "recipe", "cooking", "home cook", "baking", "easy recipes", "healthy recipe", "kitchen"] },
    { category: "Fitness", keywords: ["fitness", "gym", "workout", "yoga", "athlete", "running", "calisthenics", "protein", "muscle", "nutrition"] },
    { category: "Health", keywords: ["health", "wellness", "nutritionist", "dietitian", "ayurveda", "gut health", "mental health"] },
    { category: "Doctor", keywords: ["dr.", "doctor", "mbbs", "md", "dermatologist", "gynecologist", "pediatrician", "dentist", "medical"] },
    { category: "Finance", keywords: ["finance", "personal finance", "money", "credit card", "tax", "budgeting", "financial literacy", "wealth"] },
    { category: "Trading & Stock Market", keywords: ["stock market", "trading", "investing", "mutual funds", "nifty", "options trading", "crypto"] },
    { category: "Business & Startup", keywords: ["startup", "entrepreneur", "founder", "business", "marketing", "freelancing", "d2c"] },
    { category: "Education", keywords: ["educator", "study", "upsc", "exam", "career", "teacher", "coding", "learn english"] },
    { category: "AI & Productivity", keywords: ["ai tools", "chatgpt", "productivity", "artificial intelligence", "automation", "notion"] },
    { category: "Career & Jobs", keywords: ["career tips", "job search", "interview", "resume", "corporate", "linkedin"] },
    { category: "Traveller", keywords: ["travel", "wanderlust", "backpacker", "road trip", "staycation", "hotel review", "tourism", "solo travel"] },
    { category: "Automotive (Cars)", keywords: ["car review", "suv", "automobile", "auto expert", "test drive", "cars"] },
    { category: "Automotive (Bikes)", keywords: ["motovlog", "bike", "rider", "superbike", "motorcycle", "biker"] },
    { category: "Automotive (EV)", keywords: ["electric vehicle", "ev review", "electric scooter", "electric car"] },
    { category: "Gaming", keywords: ["gaming", "gamer", "bgmi", "esports", "streamer", "valorant", "playstation", "pc gaming"] },
    { category: "Comedy", keywords: ["comedy", "comedian", "funny", "humor", "standup", "memes", "sketch", "relatable"] },
    { category: "Family & Parenting", keywords: ["mom blogger", "parenting", "motherhood", "baby care", "toddler", "family vlog", "dad"] },
    { category: "Couple & Relationships", keywords: ["couple", "relationship", "married life", "couple goals"] },
    { category: "Pet Parent", keywords: ["dog", "cat", "pet parent", "puppy", "dogs of instagram", "pet lover"] },
    { category: "Home Decor", keywords: ["home decor", "interior", "room makeover", "apartment", "home tour", "aesthetic home"] },
    { category: "Home Cleaning & Homecare", keywords: ["home cleaning", "cleaning hacks", "organization", "homemaker"] },
    { category: "DIY", keywords: ["diy", "craft", "art", "painting", "handmade", "resin art", "upcycling"] },
    { category: "Photography & Content Creation", keywords: ["photographer", "videographer", "filmmaker", "cinematography", "photo editing"] },
    { category: "Podcast", keywords: ["podcast", "podcaster", "host", "interview"] },
    { category: "Infotainment", keywords: ["facts", "infotainment", "explainer", "history", "science", "did you know"] },
    { category: "Sports", keywords: ["cricket", "football", "sports", "badminton", "ipl", "kabaddi"] },
    { category: "Wedding", keywords: ["wedding", "bride", "bridal", "shaadi", "choreographer", "wedding planner"] },
    { category: "Real Estate", keywords: ["real estate", "property", "realtor", "luxury homes", "architecture"] },
    { category: "Movies & OTT", keywords: ["movie review", "film", "bollywood", "ott", "cinema", "web series"] },
    { category: "Students & College Life", keywords: ["college", "student", "campus", "hostel", "genz"] },
    { category: "Lifestyle", keywords: ["lifestyle", "vlog", "vlogger", "daily life", "creator", "digital creator"] },
];

const INDIAN_CITIES = [
    { city: "Mumbai", state: "Maharashtra" },
    { city: "Delhi", state: "Delhi NCR" },
    { city: "New Delhi", state: "Delhi NCR" },
    { city: "Gurugram", state: "Haryana" },
    { city: "Gurgaon", state: "Haryana" },
    { city: "Noida", state: "Uttar Pradesh" },
    { city: "Bengaluru", state: "Karnataka" },
    { city: "Bangalore", state: "Karnataka" },
    { city: "Hyderabad", state: "Telangana" },
    { city: "Pune", state: "Maharashtra" },
    { city: "Chennai", state: "Tamil Nadu" },
    { city: "Kolkata", state: "West Bengal" },
    { city: "Ahmedabad", state: "Gujarat" },
    { city: "Jaipur", state: "Rajasthan" },
    { city: "Chandigarh", state: "Chandigarh" },
    { city: "Lucknow", state: "Uttar Pradesh" },
    { city: "Indore", state: "Madhya Pradesh" },
    { city: "Kochi", state: "Kerala" },
    { city: "Goa", state: "Goa" },
    { city: "Surat", state: "Gujarat" },
    { city: "Bhopal", state: "Madhya Pradesh" },
    { city: "Dehradun", state: "Uttarakhand" },
    { city: "Guwahati", state: "Assam" },
    { city: "Coimbatore", state: "Tamil Nadu" },
    { city: "Nagpur", state: "Maharashtra" },
];

function getSerperKeys(): string[] {
    const keys: string[] = [];
    if (process.env.SERPER_API_KEY) {
        keys.push(...process.env.SERPER_API_KEY.split(",").map((k) => k.trim()).filter(Boolean));
    }
    const localJsonPath = "/Users/tbmmonkey/Downloads/Creator Scouting/TBM Master data set/_state/serper_keys.json";
    try {
        if (fs.existsSync(localJsonPath)) {
            const parsed = JSON.parse(fs.readFileSync(localJsonPath, "utf8"));
            if (Array.isArray(parsed)) {
                for (const k of parsed) {
                    if (typeof k === "string" && k.trim().length >= 30 && !keys.includes(k.trim())) {
                        keys.push(k.trim());
                    }
                }
            }
        }
    } catch {}
    return keys;
}

let serperKeyIdx = 0;

async function serperRequest(endpoint: "search" | "videos", payload: Record<string, any>): Promise<any | null> {
    const keys = getSerperKeys();
    if (keys.length === 0) return null;

    for (let attempt = 0; attempt < keys.length; attempt++) {
        const key = keys[(serperKeyIdx + attempt) % keys.length];
        try {
            const res = await fetch(`https://google.serper.dev/${endpoint}`, {
                method: "POST",
                headers: {
                    "X-API-KEY": key,
                    "Content-Type": "application/json",
                    "User-Agent": "TBM-CreatorScout/2.0",
                },
                body: JSON.stringify(payload),
                signal: AbortSignal.timeout(10000),
            });
            if (res.status === 403 || res.status === 429 || res.status === 402) {
                serperKeyIdx = (serperKeyIdx + 1) % keys.length;
                continue;
            }
            if (!res.ok) return null;
            return await res.json();
        } catch {
            continue;
        }
    }
    return null;
}

function parseCountToken(raw?: string | number | null): number {
    if (typeof raw === "number") return Math.round(raw);
    if (!raw) return 0;
    const clean = String(raw).replace(/,/g, "").trim().toUpperCase();
    const num = parseFloat(clean);
    if (isNaN(num)) return 0;
    if (clean.endsWith("M")) return Math.round(num * 1_000_000);
    if (clean.endsWith("K")) return Math.round(num * 1_000);
    return Math.round(num);
}

function decodeHtmlEntities(str: string): string {
    return String(str || "")
        .replace(/&amp;/g, "&")
        .replace(/&#0*64;/g, "@")
        .replace(/&#0*39;/g, "'")
        .replace(/&#x27;/gi, "'")
        .replace(/&quot;/g, '"')
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">");
}

function cleanEmails(rawEmails: string[]): { primaryEmail: string | null; agencyEmail: string | null; allEmails: string[] } {
    const unique: string[] = [];
    for (const raw of rawEmails) {
        const em = String(raw || "")
            .toLowerCase()
            .trim()
            .replace(/[.,:;!?)+\]]+$/, "")
            .replace(/\.watch$/i, "");
        if (!em.includes("@") || !em.includes(".")) continue;
        if (em.endsWith(".png") || em.endsWith(".jpg") || em.endsWith(".webp") || em.endsWith(".svg")) continue;
        if (EXCLUDE_EMAIL_DOMAINS.some((bad) => em.includes(bad))) continue;
        if (!unique.includes(em)) unique.push(em);
    }

    const personal: string[] = [];
    const agency: string[] = [];
    for (const em of unique) {
        if (AGENCY_KEYWORDS.some((kw) => em.includes(kw))) {
            agency.push(em);
        } else {
            personal.push(em);
        }
    }

    return {
        primaryEmail: personal[0] || agency[0] || null,
        agencyEmail: agency[0] || null,
        allEmails: unique,
    };
}

function cleanPhones(rawText: string): string | null {
    const phones: string[] = [];
    let m: RegExpExecArray | null;
    const waRegex = new RegExp(WA_LINK_RE.source, "gi");
    while ((m = waRegex.exec(rawText)) !== null) {
        const digits = m[1].replace(/\D/g, "").slice(-10);
        if (digits.length === 10 && "6789".includes(digits[0])) {
            phones.push(`+91 ${digits}`);
        }
    }
    const matches = rawText.match(PHONE_RE) || [];
    for (const ph of matches) {
        const digits = ph.replace(/\D/g, "").slice(-10);
        if (digits.length === 10 && "6789".includes(digits[0])) {
            const formatted = `+91 ${digits}`;
            if (!phones.includes(formatted)) phones.push(formatted);
        }
    }
    return phones[0] || null;
}

export function inferCategoryFromText(text: string, fallback = "Lifestyle"): string {
    const lower = String(text || "").toLowerCase();
    for (const item of TBM_CREATOR_CATEGORIES) {
        if (item.keywords.some((kw) => lower.includes(kw))) {
            return item.category;
        }
    }
    return fallback;
}

function inferCityFromText(text: string): { city: string | null; state: string | null } {
    const lower = String(text || "").toLowerCase();
    for (const loc of INDIAN_CITIES) {
        const regex = new RegExp(`\\b${loc.city.toLowerCase()}\\b`, "i");
        if (regex.test(lower)) {
            return { city: loc.city === "Bangalore" ? "Bengaluru" : loc.city === "Gurgaon" ? "Gurugram" : loc.city, state: loc.state };
        }
    }
    return { city: null, state: null };
}

/**
 * Parses an input string (handle, profile URL, or Reel/Post URL)
 */
export function parseCreatorInput(input: string): {
    type: "reel" | "profile" | "handle";
    handle?: string;
    reelUrl?: string;
    shortcode?: string;
} {
    const trimmed = String(input || "").trim();
    const reelMatch = trimmed.match(/instagram\.com\/(?:([A-Za-z0-9_.]+)\/)?(?:reel|reels|p)\/([A-Za-z0-9_-]+)/i);
    if (reelMatch) {
        const ownerInUrl = reelMatch[1] && !["reel", "reels", "p", "explore"].includes(reelMatch[1].toLowerCase())
            ? reelMatch[1].toLowerCase()
            : undefined;
        const shortcode = reelMatch[2];
        return {
            type: "reel",
            handle: ownerInUrl,
            shortcode,
            reelUrl: `https://www.instagram.com/reel/${shortcode}/`,
        };
    }

    const profMatch = trimmed.match(/instagram\.com\/([A-Za-z0-9_.]+)/i);
    if (profMatch) {
        const candidate = profMatch[1].toLowerCase();
        if (!["reel", "reels", "p", "explore", "stories", "accounts", "about"].includes(candidate)) {
            return {
                type: "profile",
                handle: candidate,
            };
        }
    }

    const cleanHandle = trimmed
        .replace(/^@+/, "")
        .replace(/[^A-Za-z0-9_.]/g, "")
        .toLowerCase();
    return {
        type: "handle",
        handle: cleanHandle || undefined,
    };
}

/**
 * Resolves an Instagram Reel URL -> Author Handle, Likes, Comments, and Caption
 */
export async function resolveInstagramReel(reelUrl: string): Promise<{
    handle?: string;
    title?: string;
    caption?: string;
    likes?: number;
    comments?: number;
    hasCollabTag?: boolean;
    brandMentions?: string[];
}> {
    // 1. Try facebookexternalhit OG tags (fast, unauthenticated, returns likes + comments + owner handle)
    try {
        const res = await fetch(reelUrl, {
            headers: {
                "User-Agent": "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
                "Accept": "text/html",
            },
            signal: AbortSignal.timeout(8000),
        });
        if (res.ok) {
            const html = await res.text();
            const urlMatch = html.match(/property="og:url"\s+content="https:\/\/www\.instagram\.com\/([A-Za-z0-9_.]+)\/(?:reel|p)\//i);
            let handle = urlMatch?.[1]?.toLowerCase();

            const descMatch =
                html.match(/property="og:description"\s+content="([^"]+)"/i) ||
                html.match(/content="([^"]+)"\s+property="og:description"/i);
            const titleMatch =
                html.match(/property="og:title"\s+content="([^"]+)"/i) ||
                html.match(/content="([^"]+)"\s+property="og:title"/i);

            const desc = decodeHtmlEntities(descMatch?.[1] || "");
            const title = decodeHtmlEntities(titleMatch?.[1] || "");

            if (!handle) {
                const descOwner = desc.match(/-\s*([A-Za-z0-9_.]{2,30})\s+on\s+/i);
                if (descOwner?.[1]) handle = descOwner[1].toLowerCase();
            }
            if (!handle) {
                const titleOwner = title.match(/\(@([A-Za-z0-9_.]+)\)/i) || title.match(/^([A-Za-z0-9_.]+)\s+on\s+Instagram/i);
                if (titleOwner?.[1]) handle = titleOwner[1].toLowerCase();
            }

            const statsMatch = desc.match(/([\d.,]+[KMBkmb]?)\s+likes?,\s*([\d.,]+[KMBkmb]?)\s+comments?/i);
            const likes = statsMatch?.[1] ? parseCountToken(statsMatch[1]) : undefined;
            const comments = statsMatch?.[2] ? parseCountToken(statsMatch[2]) : undefined;

            const captionMatch = desc.match(/:\s*"([\s\S]*)"$/);
            const caption = captionMatch?.[1] || desc || title;
            const hasCollabTag = COLLAB_TAGS.some((t) => caption.toLowerCase().includes(t));
            const brandMentions = Array.from(caption.matchAll(/@([A-Za-z0-9_.]+)/g)).map((m) => m[1].toLowerCase());

            if (handle) {
                return { handle, title, caption, likes, comments, hasCollabTag, brandMentions };
            }
        }
    } catch {}

    // 2. Fallback: Instagram oEmbed endpoint
    try {
        const oembedUrl = `https://api.instagram.com/oembed/?url=${encodeURIComponent(reelUrl)}`;
        const res = await fetch(oembedUrl, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
                "Accept": "application/json",
            },
            signal: AbortSignal.timeout(7000),
        });
        if (res.ok) {
            const data = (await res.json()) as any;
            const handle = data?.author_name ? String(data.author_name).toLowerCase() : undefined;
            const caption = String(data?.title || "");
            const hasCollabTag = COLLAB_TAGS.some((t) => caption.toLowerCase().includes(t));
            const brandMentions = Array.from(caption.matchAll(/@([A-Za-z0-9_.]+)/g)).map((m) => m[1].toLowerCase());
            return { handle, title: caption, caption, hasCollabTag, brandMentions };
        }
    } catch {}

    return {};
}

/**
 * Fetches rich profile metadata from Instagram's web_profile_info endpoint
 */
async function fetchWebProfileInfo(cleanHandle: string): Promise<{
    fullName?: string;
    biography?: string;
    externalUrl?: string;
    followersCount?: number;
    followingCount?: number;
    postsCount?: number;
    isVerified?: boolean;
    profilePictureUrl?: string;
    categoryName?: string;
    businessEmail?: string;
    businessPhone?: string;
    recentMedia?: any[];
    avgLikes?: number;
    avgComments?: number;
    avgReelViews?: number;
    engagementRatePct?: number;
} | null> {
    try {
        const url = `https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(cleanHandle)}`;
        const res = await fetch(url, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
                "X-IG-App-ID": "936619743392459",
                "Accept": "application/json",
                "Referer": `https://www.instagram.com/${cleanHandle}/`,
            },
            signal: AbortSignal.timeout(8000),
        });
        if (!res.ok) return null;
        const json = (await res.json()) as any;
        const user = json?.data?.user;
        if (!user) return null;

        const followersCount = Number(user.edge_followed_by?.count || 0);
        const followingCount = Number(user.edge_follow?.count || 0);
        const postsCount = Number(user.edge_owner_to_timeline_media?.count || 0);
        const edges: any[] = Array.isArray(user.edge_owner_to_timeline_media?.edges)
            ? user.edge_owner_to_timeline_media.edges
            : [];

        let totalLikes = 0;
        let totalComments = 0;
        let totalViews = 0;
        let viewNodes = 0;

        const recentMedia = edges.slice(0, 8).map((edge: any) => {
            const node = edge?.node || {};
            const likeCount = Number(node.edge_liked_by?.count ?? node.edge_media_preview_like?.count ?? 0);
            const commentsCount = Number(node.edge_media_to_comment?.count ?? 0);
            const viewCount = Number(node.video_view_count ?? 0);
            totalLikes += likeCount;
            totalComments += commentsCount;
            if (viewCount > 0) {
                totalViews += viewCount;
                viewNodes++;
            }
            const capEdges = node.edge_media_to_caption?.edges;
            const caption = Array.isArray(capEdges) && capEdges[0]?.node?.text ? String(capEdges[0].node.text).slice(0, 180) : undefined;
            return {
                id: String(node.id || node.shortcode || ""),
                permalink: node.shortcode ? `https://www.instagram.com/reel/${node.shortcode}/` : undefined,
                mediaType: node.is_video ? "REELS" : "IMAGE",
                likeCount,
                commentsCount,
                viewCount: viewCount || undefined,
                timestamp: node.taken_at_timestamp ? new Date(node.taken_at_timestamp * 1000).toISOString() : undefined,
                caption,
            };
        });

        const sampleCount = recentMedia.length || 0;
        const avgLikes = sampleCount > 0 ? Math.round(totalLikes / sampleCount) : undefined;
        const avgComments = sampleCount > 0 ? Math.round(totalComments / sampleCount) : undefined;
        const avgReelViews = viewNodes > 0 ? Math.round(totalViews / viewNodes) : (avgLikes ? Math.round(avgLikes * 9.5) : undefined);
        const engagementRatePct =
            followersCount > 0 && avgLikes !== undefined
                ? Number((((avgLikes + (avgComments || 0)) / followersCount) * 100).toFixed(2))
                : undefined;

        return {
            fullName: user.full_name || undefined,
            biography: user.biography || undefined,
            externalUrl: user.external_url || undefined,
            followersCount: followersCount || undefined,
            followingCount: followingCount || undefined,
            postsCount: postsCount || undefined,
            isVerified: Boolean(user.is_verified),
            profilePictureUrl: user.profile_pic_url_hd || user.profile_pic_url || undefined,
            categoryName: user.category_name || undefined,
            businessEmail: user.business_email || undefined,
            businessPhone: user.business_phone_number || undefined,
            recentMedia,
            avgLikes,
            avgComments,
            avgReelViews,
            engagementRatePct,
        };
    } catch {
        return null;
    }
}

/**
 * Deep Linktree / Beacons / External Bio Link Contact Miner (via Jina Reader + Direct HTML)
 */
async function mineExternalLinkContacts(externalUrl?: string | null): Promise<{
    emails: string[];
    phone: string | null;
}> {
    if (!externalUrl) return { emails: [], phone: null };
    const fullUrl = externalUrl.startsWith("http") ? externalUrl : `https://${externalUrl}`;
    const collectedEmails: string[] = [];
    let discoveredPhone: string | null = null;

    // 1. Try Jina Reader (renders JS-heavy Linktree/Beacons into clean markdown)
    try {
        const jinaRes = await fetch(`https://r.jina.ai/${fullUrl}`, {
            headers: { "User-Agent": "TBM-AgentReach/2.0" },
            signal: AbortSignal.timeout(7000),
        });
        if (jinaRes.ok) {
            const text = await jinaRes.text();
            const matches = text.match(EMAIL_RE) || [];
            collectedEmails.push(...matches);
            discoveredPhone = cleanPhones(text);
        }
    } catch {}

    // 2. Fallback direct fetch if Jina didn't find email
    if (collectedEmails.length === 0) {
        try {
            const directRes = await fetch(fullUrl, {
                headers: {
                    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
                },
                signal: AbortSignal.timeout(6000),
            });
            if (directRes.ok) {
                const html = await directRes.text();
                const matches = html.match(EMAIL_RE) || [];
                collectedEmails.push(...matches);
                if (!discoveredPhone) discoveredPhone = cleanPhones(html);
            }
        } catch {}
    }

    return { emails: collectedEmails, phone: discoveredPhone };
}

/**
 * Serper.dev Contact & Profile Enricher:
 * Searches Google's index for "@handle" emails, talent agency desks, WhatsApp numbers, and follower snippets.
 */
async function enrichViaSerperSearch(cleanHandle: string): Promise<{
    emails: string[];
    phone: string | null;
    fullName?: string;
    followersCount?: number;
    followersRaw?: string;
    bioSnippet?: string;
    externalUrl?: string;
}> {
    const q = `"${cleanHandle}" ("@gmail.com" OR email OR collab OR pr OR agency OR instagram)`;
    const res = await serperRequest("search", { q, gl: "in", hl: "en", num: 10 });
    if (!res || !Array.isArray(res.organic)) {
        return { emails: [], phone: null };
    }

    const rawEmails: string[] = [];
    let phone: string | null = null;
    let fullName: string | undefined;
    let followersCount: number | undefined;
    let followersRaw: string | undefined;
    let bioSnippet: string | undefined;
    let externalUrl: string | undefined;

    for (const item of res.organic) {
        const title = String(item.title || "");
        const snippet = String(item.snippet || "");
        const link = String(item.link || "");
        const combo = `${title} ${snippet}`;

        if (!combo.toLowerCase().includes(cleanHandle.toLowerCase()) && !link.toLowerCase().includes(cleanHandle.toLowerCase())) {
            continue;
        }

        const ems = combo.match(EMAIL_RE) || [];
        rawEmails.push(...ems);

        if (!phone) {
            phone = cleanPhones(combo);
        }

        if (!externalUrl) {
            const bioMatch = combo.match(BIO_LINK_RE);
            if (bioMatch?.[0]) externalUrl = bioMatch[0];
        }

        if (!fullName && link.includes(`instagram.com/${cleanHandle}`)) {
            const nameMatch = title.match(/^(.+?)\s*\(@/i);
            if (nameMatch?.[1]) fullName = nameMatch[1].trim();
        }

        if (!followersCount) {
            const fMatch = combo.match(/([\d.,]+[KMBkmb]?)\s+Followers/i);
            if (fMatch?.[1]) {
                followersRaw = fMatch[1].toUpperCase();
                followersCount = parseCountToken(followersRaw);
            }
        }

        if (!bioSnippet && snippet.length > 25) {
            bioSnippet = snippet.slice(0, 220);
        }
    }

    return {
        emails: rawEmails,
        phone,
        fullName,
        followersCount,
        followersRaw,
        bioSnippet,
        externalUrl,
    };
}

export interface ScoutedCreatorResult {
    id: string;
    handle: string;
    fullName: string;
    profileUrl: string;
    category: string;
    brandAffinity: string | null;
    followersCount: number;
    followersRaw: string;
    followingCount: number | null;
    postsCount: number | null;
    publicBio: string;
    primaryEmail: string | null;
    agencyEmail: string | null;
    agencyName: string | null;
    managementType: string;
    phone: string | null;
    whatsappNumber: string | null;
    externalUrl: string | null;
    sampleReelUrl: string | null;
    isVerified: boolean;
    city: string | null;
    state: string | null;
    engagementRatePct: number;
    avgLikes: number;
    avgComments: number;
    avgReelViews: number;
    viralityRatio: number;
    scoutFitScore: number;
    intakeToken: string;
    intakeStatus: string;
    intakeCompletionPct: number;
    formLink: string;
    igConnected: boolean;
    instagramInsights: any;
    isNewInDb: boolean;
}

/**
 * Core Single Creator End-to-End Scout & Auto-Store Pipeline:
 * Accepts @handle, Instagram profile URL, or Instagram Reel URL.
 * Resolves -> Enriches -> Deep Mines Contacts -> Scores -> Auto-Stores in PostgreSQL -> Returns Outreach-Ready Record.
 */
export async function scoutAndAutoStoreCreator(
    input: string,
    opts: {
        workspaceId?: string;
        category?: string;
        brand?: string;
        forceRefresh?: boolean;
        appOrigin?: string;
        query?: QueryFn;
    } = {}
): Promise<ScoutedCreatorResult | null> {
    const query = opts.query || pgQuery;
    const workspaceId = opts.workspaceId || "org_troops_outreach";
    const appOrigin = (opts.appOrigin || process.env.APP_URL || "https://tbmoutreach.tech").replace(/\/$/, "");
    await ensureInstagramColumns(query);

    const parsed = parseCreatorInput(input);
    let cleanHandle = parsed.handle;
    let reelMeta: Awaited<ReturnType<typeof resolveInstagramReel>> = {};

    // 1. If input is a Reel URL, resolve shortcode -> author handle & reel metrics
    if (parsed.type === "reel" && parsed.reelUrl) {
        reelMeta = await resolveInstagramReel(parsed.reelUrl);
        if (!cleanHandle && reelMeta.handle) {
            cleanHandle = reelMeta.handle;
        }
    }

    if (!cleanHandle) return null;
    cleanHandle = cleanHandle.replace(/^@+/, "").trim().toLowerCase();
    if (!cleanHandle || ["reel", "reels", "p", "explore", "stories"].includes(cleanHandle)) {
        return null;
    }

    // 2. Check existing record in PostgreSQL first
    const existingRows = await query<any>(
        `SELECT * FROM "Creator"
         WHERE "workspaceId" = $1
           AND (lower(replace("handle", '@', '')) = $2 OR lower("handle") = $2 OR lower("handle") = ('@' || $2))
         LIMIT 1`,
        [workspaceId, cleanHandle]
    ).catch(() => []);
    const existing = existingRows?.[0] || null;

    // 3. Run parallel Profile + Contact Mining layers
    const [webProf, graphOrOg, serperData] = await Promise.all([
        fetchWebProfileInfo(cleanHandle),
        lookupAndSyncInstagramProfile(query, {
            token: existing?.intakeToken || existing?.id || "new",
            handle: cleanHandle,
        }),
        enrichViaSerperSearch(cleanHandle),
    ]);

    const externalUrl =
        webProf?.externalUrl ||
        graphOrOg?.website ||
        serperData.externalUrl ||
        existing?.instagramInsights?.externalUrl ||
        null;

    // 4. Mine external Linktree / Bio link if we still need email or phone
    const bioText =
        webProf?.biography ||
        graphOrOg?.biography ||
        existing?.publicBio ||
        reelMeta.caption ||
        serperData.bioSnippet ||
        "";

    const initialEmails: string[] = [
        ...(webProf?.businessEmail ? [webProf.businessEmail] : []),
        ...(existing?.primaryEmail ? [existing.primaryEmail] : []),
        ...(bioText.match(EMAIL_RE) || []),
        ...(reelMeta.caption ? reelMeta.caption.match(EMAIL_RE) || [] : []),
        ...serperData.emails,
    ];

    let linktreeResult: { emails: string[]; phone: string | null } = { emails: [], phone: null };
    if (externalUrl && cleanEmails(initialEmails).allEmails.length === 0) {
        linktreeResult = await mineExternalLinkContacts(externalUrl);
    }

    const { primaryEmail, agencyEmail, allEmails } = cleanEmails([
        ...initialEmails,
        ...linktreeResult.emails,
    ]);

    const phone =
        existing?.whatsappNumber ||
        existing?.phone ||
        webProf?.businessPhone ||
        cleanPhones(bioText) ||
        linktreeResult.phone ||
        serperData.phone ||
        null;

    // 5. Consolidate Metrics
    const followersCount =
        webProf?.followersCount ||
        graphOrOg?.followersCount ||
        serperData.followersCount ||
        Number(existing?.followersCount || 0) ||
        0;

    const followersRaw =
        formatFollowersRaw(followersCount) ||
        graphOrOg?.followersRaw ||
        serperData.followersRaw ||
        existing?.followersRaw ||
        "";

    const followingCount =
        webProf?.followingCount ??
        graphOrOg?.followingCount ??
        (existing?.followingCount ? Number(existing.followingCount) : null);

    const postsCount =
        webProf?.postsCount ??
        graphOrOg?.postsCount ??
        (existing?.postsCount ? Number(existing.postsCount) : null);

    const avgLikes =
        webProf?.avgLikes ??
        reelMeta.likes ??
        graphOrOg?.avgLikes ??
        existing?.instagramInsights?.avgLikes ??
        (followersCount > 0 ? Math.max(15, Math.round(followersCount * 0.032)) : 0);

    const avgComments =
        webProf?.avgComments ??
        reelMeta.comments ??
        graphOrOg?.avgComments ??
        existing?.instagramInsights?.avgComments ??
        Math.max(1, Math.round(avgLikes * 0.03));

    const avgReelViews =
        webProf?.avgReelViews ??
        graphOrOg?.avgReelViews ??
        existing?.instagramInsights?.avgReelViews ??
        (followersCount > 0 ? Math.round(followersCount * 0.38) : Math.round(avgLikes * 9));

    const engagementRatePct =
        webProf?.engagementRatePct ??
        graphOrOg?.engagementRatePct ??
        (followersCount > 0 && avgLikes > 0
            ? Number((((avgLikes + avgComments) / followersCount) * 100).toFixed(2))
            : 3.2);

    const viralityRatio =
        followersCount > 0 && avgReelViews > 0
            ? Number((avgReelViews / followersCount).toFixed(2))
            : 1.0;

    // 6. Compute Agency Fit Score (0 - 100)
    let fitScore = 25;
    if (primaryEmail) fitScore += 35;
    if (phone) fitScore += 15;
    if (engagementRatePct >= 3.0) fitScore += 15;
    else if (engagementRatePct >= 1.5) fitScore += 8;
    if (reelMeta.hasCollabTag || agencyEmail) fitScore += 10;
    fitScore = Math.min(100, fitScore);

    // 7. Category, City, Management & Brand Affinity inference
    const combinedContext = `${bioText} ${reelMeta.caption || ""} ${webProf?.categoryName || ""} ${opts.brand || ""}`;
    const resolvedCategory =
        (opts.category && opts.category !== "all" ? opts.category : null) ||
        (existing?.category && existing.category !== "Creator" ? existing.category : null) ||
        inferCategoryFromText(combinedContext, "Lifestyle");

    const loc = inferCityFromText(combinedContext);
    const city = existing?.city || loc.city || null;
    const state = existing?.state || loc.state || null;

    const fullName =
        webProf?.fullName ||
        graphOrOg?.fullName ||
        serperData.fullName ||
        existing?.fullName ||
        cleanHandle;

    const sampleReelUrl =
        parsed.reelUrl ||
        existing?.sampleReelUrl ||
        webProf?.recentMedia?.[0]?.permalink ||
        graphOrOg?.recentMedia?.[0]?.permalink ||
        null;

    const brandAffinity =
        opts.brand ||
        existing?.brandAffinity ||
        (reelMeta.brandMentions && reelMeta.brandMentions.length > 0 ? reelMeta.brandMentions[0] : null);

    const agencyDomain = agencyEmail ? agencyEmail.split("@")[1]?.split(".")[0] : null;
    const agencyName =
        existing?.agencyName ||
        (agencyDomain ? agencyDomain.charAt(0).toUpperCase() + agencyDomain.slice(1) + " Talent" : null);
    const managementType = existing?.managementType || (agencyName ? "agency" : "self");

    const isVerified = Boolean(webProf?.isVerified || graphOrOg?.isVerified || existing?.isVerified);
    const igConnected = Boolean(existing?.igConnected || graphOrOg?.igConnected);

    const enrichedInsights = {
        ...(existing?.instagramInsights || {}),
        ...(graphOrOg || {}),
        handle: cleanHandle,
        fullName,
        biography: bioText || undefined,
        website: externalUrl || undefined,
        externalUrl: externalUrl || undefined,
        profilePictureUrl:
            webProf?.profilePictureUrl ||
            graphOrOg?.profilePictureUrl ||
            existing?.instagramInsights?.profilePictureUrl ||
            undefined,
        followersCount,
        followersRaw,
        followingCount: followingCount || undefined,
        postsCount: postsCount || undefined,
        isVerified,
        igConnected,
        engagementRatePct,
        avgLikes,
        avgComments,
        avgReelViews,
        viralityRatio,
        scoutFitScore: fitScore,
        agencyEmail,
        allEmails,
        recentMedia:
            (webProf?.recentMedia && webProf.recentMedia.length > 0
                ? webProf.recentMedia
                : graphOrOg?.recentMedia) ||
            existing?.instagramInsights?.recentMedia ||
            [],
        syncedAt: new Date().toISOString(),
    };

    // 8. Auto-Store (UPSERT) into PostgreSQL "Creator" table
    const formattedHandle = `@${cleanHandle}`;
    const id = existing?.id || `crt_${crypto.randomBytes(8).toString("hex")}`;
    const intakeToken = existing?.intakeToken || `tok_${crypto.randomBytes(10).toString("hex")}`;
    const profileUrl = `https://www.instagram.com/${cleanHandle}/`;

    const upsertedRows = await query<any>(
        `INSERT INTO "Creator" (
            "id", "workspaceId", "handle", "platform", "fullName", "profileUrl",
            "primaryEmail", "phone", "whatsappNumber",
            "followersRaw", "followersCount", "followingCount", "postsCount",
            "publicBio", "category", "brandAffinity", "sampleReelUrl",
            "discoveryKeyword", "discoveryEngine", "isVerified", "indiaSignal",
            "city", "state", "managementType", "agencyName",
            "intakeToken", "intakeStatus", "intakeCompletionPct",
            "instagramInsights", "igConnected", "igLastSyncedAt",
            "createdAt", "updatedAt"
        ) VALUES (
            $1, $2, $3, 'instagram', $4, $5,
            $6, $7, $8,
            $9, $10, $11, $12,
            $13, $14, $15, $16,
            $17, 'TBM 4-Tier Live Scout Engine', $18, true,
            $19, $20, $21, $22,
            $23, 'SCRAPED_BASELINE', 35,
            $24::jsonb, $25, NOW(),
            NOW(), NOW()
        )
        ON CONFLICT ("workspaceId", "handle") DO UPDATE SET
            "fullName" = COALESCE(NULLIF(EXCLUDED."fullName", ''), "Creator"."fullName"),
            "primaryEmail" = COALESCE("Creator"."primaryEmail", EXCLUDED."primaryEmail"),
            "phone" = COALESCE("Creator"."phone", EXCLUDED."phone"),
            "whatsappNumber" = COALESCE("Creator"."whatsappNumber", EXCLUDED."whatsappNumber"),
            "followersCount" = CASE WHEN EXCLUDED."followersCount" > 0 THEN EXCLUDED."followersCount" ELSE "Creator"."followersCount" END,
            "followersRaw" = COALESCE(NULLIF(EXCLUDED."followersRaw", ''), "Creator"."followersRaw"),
            "followingCount" = COALESCE(EXCLUDED."followingCount", "Creator"."followingCount"),
            "postsCount" = COALESCE(EXCLUDED."postsCount", "Creator"."postsCount"),
            "publicBio" = COALESCE(NULLIF(EXCLUDED."publicBio", ''), "Creator"."publicBio"),
            "category" = CASE WHEN "Creator"."category" IS NULL OR "Creator"."category" = 'Creator' THEN EXCLUDED."category" ELSE "Creator"."category" END,
            "brandAffinity" = COALESCE(EXCLUDED."brandAffinity", "Creator"."brandAffinity"),
            "sampleReelUrl" = COALESCE(EXCLUDED."sampleReelUrl", "Creator"."sampleReelUrl"),
            "city" = COALESCE("Creator"."city", EXCLUDED."city"),
            "state" = COALESCE("Creator"."state", EXCLUDED."state"),
            "managementType" = COALESCE("Creator"."managementType", EXCLUDED."managementType"),
            "agencyName" = COALESCE("Creator"."agencyName", EXCLUDED."agencyName"),
            "isVerified" = ("Creator"."isVerified" OR EXCLUDED."isVerified"),
            "instagramInsights" = EXCLUDED."instagramInsights",
            "igLastSyncedAt" = NOW(),
            "updatedAt" = NOW()
        RETURNING *`,
        [
            id,
            workspaceId,
            formattedHandle,
            fullName,
            profileUrl,
            primaryEmail,
            phone,
            phone,
            followersRaw,
            followersCount,
            followingCount,
            postsCount,
            bioText,
            resolvedCategory,
            brandAffinity,
            sampleReelUrl,
            opts.brand ? `brand:${opts.brand}` : "live_scout",
            isVerified,
            city,
            state,
            managementType,
            agencyName,
            intakeToken,
            JSON.stringify(enrichedInsights),
            igConnected,
        ]
    ).catch((err) => {
        console.warn("[CreatorScout] Upsert warning:", err?.message);
        return [];
    });

    const saved = upsertedRows?.[0] || existing;
    const finalToken = saved?.intakeToken || intakeToken;

    return {
        id: saved?.id || id,
        handle: saved?.handle || formattedHandle,
        fullName: saved?.fullName || fullName,
        profileUrl,
        category: saved?.category || resolvedCategory,
        brandAffinity: saved?.brandAffinity || brandAffinity,
        followersCount: Number(saved?.followersCount ?? followersCount),
        followersRaw: saved?.followersRaw || followersRaw,
        followingCount: saved?.followingCount ?? followingCount,
        postsCount: saved?.postsCount ?? postsCount,
        publicBio: saved?.publicBio || bioText,
        primaryEmail: saved?.primaryEmail || primaryEmail,
        agencyEmail,
        agencyName: saved?.agencyName || agencyName,
        managementType: saved?.managementType || managementType,
        phone: saved?.phone || phone,
        whatsappNumber: saved?.whatsappNumber || phone,
        externalUrl,
        sampleReelUrl: saved?.sampleReelUrl || sampleReelUrl,
        isVerified: Boolean(saved?.isVerified ?? isVerified),
        city: saved?.city || city,
        state: saved?.state || state,
        engagementRatePct,
        avgLikes,
        avgComments,
        avgReelViews,
        viralityRatio,
        scoutFitScore: fitScore,
        intakeToken: finalToken,
        intakeStatus: saved?.intakeStatus || "SCRAPED_BASELINE",
        intakeCompletionPct: Number(saved?.intakeCompletionPct || 35),
        formLink: `${appOrigin}/creator/intake/${encodeURIComponent(finalToken)}`,
        igConnected: Boolean(saved?.igConnected ?? igConnected),
        instagramInsights: enrichedInsights,
        isNewInDb: !existing,
    };
}

/**
 * Live Brand / Keyword / Category Discovery via Serper Video & Search SERP + Database Search:
 * Discovers Instagram Reel creators mentioning a brand/keyword, resolves handles, enriches contacts,
 * auto-stores every new creator in PostgreSQL, and returns the combined results.
 */
export async function discoverCreatorsByBrandOrKeyword(
    params: {
        brand?: string;
        keyword?: string;
        category?: string;
        urls?: string[];
        limit?: number;
        workspaceId?: string;
        appOrigin?: string;
    },
    query: QueryFn = pgQuery
): Promise<{
    creators: ScoutedCreatorResult[];
    newlyScoutedCount: number;
    emailReadyCount: number;
    dorkQuery: string;
    googleVideoUrl: string;
}> {
    const workspaceId = params.workspaceId || "org_troops_outreach";
    const limit = Math.min(Math.max(params.limit || 15, 1), 50);
    const brand = (params.brand || "").trim();
    const keyword = (params.keyword || "").trim();
    const category = (params.category && params.category !== "all" ? params.category : "").trim();

    const queryParts: string[] = [];
    if (brand) queryParts.push(`"${brand}"`);
    if (keyword) queryParts.push(`"${keyword}"`);
    else if (category) queryParts.push(`"${category}"`);
    queryParts.push("(reel OR reels) site:instagram.com/reel/");
    const dorkQuery = queryParts.join(" ");
    const googleVideoUrl = `https://www.google.com/search?q=${encodeURIComponent(dorkQuery)}&tbm=vid`;

    // 1. Collect explicit URLs/handles if provided by user
    const candidateInputs: string[] = [];
    if (Array.isArray(params.urls)) {
        for (const u of params.urls) {
            const clean = String(u || "").trim();
            if (clean && !candidateInputs.includes(clean)) {
                candidateInputs.push(clean);
            }
        }
    }

    // 2. If brand or keyword is provided, query Serper Videos & Organic Search for live Instagram Reels
    if (brand || keyword) {
        const serperQuery = `${brand} ${keyword || category} reel site:instagram.com/reel/`.trim();
        const [videoRes, searchRes] = await Promise.all([
            serperRequest("videos", { q: serperQuery, gl: "in", hl: "en", num: 20 }),
            serperRequest("search", { q: serperQuery, gl: "in", hl: "en", num: 15 }),
        ]);

        const videoItems: any[] = Array.isArray(videoRes?.videos) ? videoRes.videos : [];
        for (const it of videoItems) {
            const link = String(it?.link || "").split("?")[0];
            if (link.includes("instagram.com/reel/") && !candidateInputs.includes(link)) {
                candidateInputs.push(link);
            }
        }

        const organicItems: any[] = Array.isArray(searchRes?.organic) ? searchRes.organic : [];
        for (const it of organicItems) {
            const link = String(it?.link || "").split("?")[0];
            if ((link.includes("instagram.com/reel/") || link.includes("instagram.com/")) && !candidateInputs.includes(link)) {
                candidateInputs.push(link);
            }
        }
    }

    // 3. Process discovered candidates in parallel batches of 5
    const toProcess = candidateInputs.slice(0, limit);
    const scoutedResults: ScoutedCreatorResult[] = [];
    const seenHandles = new Set<string>();
    let newlyScoutedCount = 0;

    const CONCURRENCY = 5;
    for (let i = 0; i < toProcess.length; i += CONCURRENCY) {
        const slice = toProcess.slice(i, i + CONCURRENCY);
        const batchRes = await Promise.all(
            slice.map((item) =>
                scoutAndAutoStoreCreator(item, {
                    workspaceId,
                    category: category || undefined,
                    brand: brand || keyword || undefined,
                    appOrigin: params.appOrigin,
                    query,
                }).catch(() => null)
            )
        );
        for (const r of batchRes) {
            if (!r) continue;
            const hKey = r.handle.replace(/^@/, "").toLowerCase();
            if (seenHandles.has(hKey)) continue;
            seenHandles.add(hKey);
            if (r.isNewInDb) newlyScoutedCount++;
            scoutedResults.push(r);
        }
    }

    const emailReadyCount = scoutedResults.filter((c) => Boolean(c.primaryEmail)).length;

    return {
        creators: scoutedResults,
        newlyScoutedCount,
        emailReadyCount,
        dorkQuery,
        googleVideoUrl,
    };
}
