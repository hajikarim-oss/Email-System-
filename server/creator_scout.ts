import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { pgQuery } from "./pg";
import type { QueryFn } from "./types";
import {
    ensureInstagramColumns,
    formatFollowersRaw,
    getMetaTokenPool,
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

// Directory of Top Indian Influencer & Talent Management Agencies (maps @handle or keyword in bio -> verified agency desk)
const INDIAN_TALENT_AGENCY_DIRECTORY: Array<{
    handles: string[];
    name: string;
    email: string;
}> = [
    { handles: ["chtrbox", "chatterbox"], name: "Chtrbox Talent", email: "talent@chtrbox.com" },
    { handles: ["monk_e", "monke", "monketalent"], name: "Monk-E (Viraj Sheth / BeerBiceps)", email: "talent@monk-e.in" },
    { handles: ["opraahfx", "opraah"], name: "OpraahFx", email: "connect@opraahfx.com" },
    { handles: ["cloutpocketaces", "clout", "pocketaces"], name: "Clout by Pocket Aces", email: "clout@pocketaces.in" },
    { handles: ["collectiveartists", "collectiveartistsnetwork", "bigbangsocial"], name: "Collective Artists Network", email: "info@collectiveartists.com" },
    { handles: ["nofiltr", "nofiltr.social", "nofiltrsocial"], name: "Nofiltr.Group", email: "hello@nofiltr.social" },
    { handles: ["wldd", "wldd.social"], name: "WLDD Social", email: "hello@wldd.in" },
    { handles: ["madinfluence", "mad_influence"], name: "Mad Influence", email: "info@madinfluence.com" },
    { handles: ["iplix", "iplixmedia"], name: "IPLIX Media", email: "contact@iplix.in" },
    { handles: ["whackedout", "whackedoutmedia"], name: "Whacked Out Media", email: "info@whackedout.in" },
    { handles: ["onlymuchlouder", "oml"], name: "Only Much Louder (OML)", email: "info@oml.in" },
    { handles: ["viralpitch"], name: "Viral Pitch", email: "hello@viralpitch.co" },
    { handles: ["schbang", "schbanginfluence"], name: "Schbang Influence", email: "bd@schbang.com" },
    { handles: ["sociowash", "youthbeat"], name: "Sociowash / Youthbeat", email: "hello@sociowash.com" },
    { handles: ["honeycombmedia", "honeycomb"], name: "Honeycomb Media", email: "info@honeycombmedia.in" },
    { handles: ["siroeesisterpr", "siroeesister"], name: "Siroe Sister PR", email: "harsha@siroeesisterpr.in" },
];

function resolveIndianAgencyFromBio(bioText: string): { agencyName: string; agencyEmail: string } | null {
    const lower = String(bioText || "").toLowerCase();
    for (const agency of INDIAN_TALENT_AGENCY_DIRECTORY) {
        if (agency.handles.some((h) => lower.includes(`@${h}`) || lower.includes(h))) {
            return { agencyName: agency.name, agencyEmail: agency.email };
        }
    }
    return null;
}

/**
 * LLM Multi-Post Caption & Bio Semantic Analyst (gpt-4o-mini):
 * Analyzes the creator's bio + last 6-8 Reel/Post captions to determine:
 * - accountType: HUMAN_CREATOR vs BRAND_STORE vs MEME_PAGE
 * - originRegion: INDIA vs INDIAN_DIASPORA vs FOREIGN
 * - primaryCategory (from our 31 agency categories) & subNiches (3-6 specific micro-niches)
 * - contentLanguages: NEVER guesses from surname! Detects English, Romanized Indian phrases (Hinglish, Tanglish, Tenglish, Manglish, Roman Marathi), regional scripts, or regional hashtags across the 6-8 posts.
 */
export async function analyzeCreatorBioAndCaptionsWithLlm(params: {
    handle: string;
    fullName?: string;
    bio?: string;
    city?: string | null;
    recentCaptions?: string[];
}): Promise<{
    accountType: "HUMAN_CREATOR" | "BRAND_STORE" | "MEME_PAGE";
    originRegion: "INDIA" | "INDIAN_DIASPORA" | "FOREIGN";
    primaryCategory?: string;
    subNiches: string[];
    contentLanguages: string[];
    detectedCity?: string | null;
    detectedState?: string | null;
    agencyPitchSummary?: string;
} | null> {
    let openAiKey = process.env.OPENAI_API_KEY?.trim() || "";
    if (!openAiKey) {
        try {
            const envText = fs.readFileSync(path.resolve(process.cwd(), ".env"), "utf8");
            openAiKey = envText.match(/^\s*OPENAI_API_KEY\s*=\s*(.+)\s*$/m)?.[1]?.trim().replace(/^["']|["']$/g, "") || "";
        } catch {}
    }
    if (!openAiKey) return null;

    const captions = (params.recentCaptions || []).filter(Boolean).slice(0, 7);
    if (!params.bio && captions.length === 0) return null;

    const validCategories = TBM_CREATOR_CATEGORIES.map((c) => c.category).join(", ");

    try {
        const res = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
                Authorization: `Bearer ${openAiKey}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                model: "gpt-4o-mini",
                temperature: 0,
                response_format: { type: "json_object" },
                messages: [
                    {
                        role: "system",
                        content: `You are a Principal Indian Influencer Marketing Agency Analyst.
Analyze the Instagram creator based ONLY on their bio and recent post/Reel captions.
CRITICAL RULES:
1. NEVER guess contentLanguages from the creator's first name or surname.
2. Note that most Indian creators write captions in English or mix Romanized Indian sentences inside English captions (Hinglish e.g. "Agar aap...", Tanglish e.g. "Romba nalla...", Manglish e.g. "Adipoli...", Tenglish, Roman Marathi, Roman Punjabi, Roman Bengali) or use regional hashtags (#tamilcreator, #marathireels, #mallugram, #chennaifoodie).
3. If the captions are written purely in standard English with no regional script, Romanized regional sentences, or regional language hashtags, set contentLanguages to ["English"].
4. Choose primaryCategory from: [${validCategories}]. Infer primaryCategory and 3-5 specific subNiches primarily from what their recent 6-8 Reel captions are actually about.
5. Set accountType to "HUMAN_CREATOR" for individual creators/doctors/bloggers, "BRAND_STORE" for company/shop/brand/salon/clinic pages, or "MEME_PAGE" for anonymous meme/repost pages.
6. Set originRegion to "INDIA" if based in India, "INDIAN_DIASPORA" if an Indian-origin/NRI creator living abroad (UAE, UK, USA, Canada, Australia, Singapore), or "FOREIGN" if non-Indian.
Return JSON: { "accountType": "HUMAN_CREATOR"|"BRAND_STORE"|"MEME_PAGE", "originRegion": "INDIA"|"INDIAN_DIASPORA"|"FOREIGN", "primaryCategory": string, "subNiches": string[], "contentLanguages": string[], "detectedCity": string|null, "detectedState": string|null, "agencyPitchSummary": string }`,
                    },
                    {
                        role: "user",
                        content: JSON.stringify({
                            handle: params.handle,
                            fullName: params.fullName,
                            bio: params.bio,
                            knownCity: params.city,
                            recentPostAndReelCaptions: captions,
                        }),
                    },
                ],
            }),
            signal: AbortSignal.timeout(9000),
        });
        if (!res.ok) return null;
        const data = (await res.json()) as any;
        const parsed = JSON.parse(data?.choices?.[0]?.message?.content || "{}");
        return {
            accountType: parsed.accountType || "HUMAN_CREATOR",
            originRegion: parsed.originRegion || "INDIA",
            primaryCategory: parsed.primaryCategory || undefined,
            subNiches: Array.isArray(parsed.subNiches) ? parsed.subNiches : [],
            contentLanguages: Array.isArray(parsed.contentLanguages) && parsed.contentLanguages.length > 0 ? parsed.contentLanguages : ["English"],
            detectedCity: parsed.detectedCity || null,
            detectedState: parsed.detectedState || null,
            agencyPitchSummary: parsed.agencyPitchSummary || undefined,
        };
    } catch {
        return null;
    }
}

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

const DEFAULT_SERPER_KEY_POOL = [
    "2d8b8fad24671f9fee4dbe7e21981b9007143feb",
    "3c4a4d935878e81fd7dd4cc1ced0ad3c1871a23d",
    "3eaf394e428d301facc097b93e7cce894f804fcb",
];

// Instagram native category_name classifications (from Instagram web_profile_info / Graph API)
const IG_CREATOR_CATEGORIES = [
    "digital creator", "video creator", "blogger", "public figure", "artist", "actor", "model",
    "gamer", " gaming video creator", "chef", "coach", "fitness trainer", "doctor", "photographer",
    "personal blog", "comedian", "entrepreneur", "writer", "journalist", "musician", "dancer",
    "fashion model", "fashion designer", "beauty, cosmetic & personal care", "motivational speaker",
];

const IG_BRAND_STORE_CATEGORIES = [
    "product/service", "shopping & retail", "clothing (brand)", "e-commerce website",
    "company", "local business", "jewelry/watches", "appliance", "app page", "retail company",
    "food & beverage company", "automobiles and parts", "pharmaceuticals", "software company",
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
    for (const fallbackKey of DEFAULT_SERPER_KEY_POOL) {
        if (!keys.includes(fallbackKey)) keys.push(fallbackKey);
    }
    return keys;
}

export interface IndiaAndAuthenticityEvaluation {
    isIndianCreator: boolean;
    indiaConfidenceScore: number; // 0 - 100
    indiaSignals: string[];
    isVerifiedHumanCreator: boolean;
    isBrandOrStoreAccount: boolean;
    authenticityScore: number; // 0 - 100
    authenticitySignals: string[];
}

// High-precision Indian First Name, Surname & Linguistic Root Lexicon (for verifying Indian human creators when city is omitted from short bios)
const INDIAN_NAME_TOKENS = new Set([
    // Surnames / Family Names across North, South, East, West India
    "sharma", "verma", "varma", "patel", "singh", "kaur", "gupta", "kumar", "kumari", "iyer", "iyengar",
    "nair", "menon", "pillai", "kurian", "varghese", "chacko", "ooty", "reddy", "rao", "naidu", "chowdary",
    "choudhary", "chaudhary", "chauhan", "rathore", "rajput", "thakur", "mehta", "shah", "jain", "agarwal",
    "agrawal", "aggrawal", "garg", "goyal", "goel", "bansal", "mittal", "jindal", "singhal", "khandelwal",
    "maheshwari", "bhatia", "kapoor", "kapur", "malhotra", "khanna", "mehra", "chopra", "sethi", "tandon",
    "arora", "ahuja", "bajaj", "luthra", "aneja", "juneja", "saluja", "chadha", "grover", "surie", "suri",
    "kohli", "dhawan", "bedi", "sodhi", "gill", "sandhu", "dhillon", "sidhu", "grewal", "brar", "bajwa",
    "randhawa", "cheema", "mann", "virk", "bhullar", "pannu", "chahal", "deol", "aulakh", "tiwana",
    "yadav", "mishra", "misra", "tiwari", "tewari", "pandey", "pande", "dubey", "dwivedi", "trivedi",
    "chaturvedi", "shukla", "upadhyay", "pathak", "ojha", "jha", "thakur", "sinha", "prasad", "srivastava",
    "shrivastava", "saxena", "nigam", "mathur", "kulshreshtha", "bhatnagar", "astHANA".toLowerCase(), "khare",
    "deshmukh", "kulkarni", "joshi", "deshpande", "patil", "pawar", "shinde", "jadhav", "chavan", "more",
    "gaikwad", "sawant", "kadam", "bhosale", "thackeray", "gokhale", "apte", "bapat", "chitnis", "gadkari",
    "phadke", "ranade", "sane", "tambe", "vaidya", "wagh", "kamble", "salve", "lokhande", "thorat",
    "chatterjee", "chatTOPADHYAY".toLowerCase(), "mukherjee", "mukhopadhyay", "banerjee", "bandyopadhyay",
    "ganguly", "gangopadhyay", "bhattacharya", "bhattacharjee", "chakraborty", "chakravarty", "das", "dasgupta",
    "sengupta", "bose", "basu", "ghosh", "mitra", "dutta", "datta", "roy", "ray", "sen", "sarkar", "majumdar",
    "mazumdar", "mondal", "mandal", "halder", "kundu", "paul", "pal", "saha", "biswas", "chowdhury", "guha",
    "gowda", "hegde", "shetty", "kamath", "pai", "bhat", "bhatt", "holla", "poojary", "acharya", "murthy",
    "moorthy", "swamy", "subramanian", "sundaram", "krishnan", "raman", "venkatesh", "natarajan", "balaji",
    "srinivasan", "ramachandran", "parthasarathy", "rajagopal", "ananth", "chandrasekhar", "viswanathan",
    "rawal", "raval", "dave", "trivedi", "pandya", "pathak", "vyas", "parikh", "parekh", "desai", "modi",
    "ambani", "adani", "kotak", "parekh", "merchant", "contractor", "engineer", "daroga", "batliwala",
    "bora", "borah", "baruah", "barua", "saikia", "hazarika", "gogoi", "kalita", "deka", "sarma", "phukan",
    "mohanty", "patnaik", "pattnaik", "panda", "dash", "mishra", "behera", "sahoo", "sahu", "nayak", "rout",
    "biswal", "parida", "swain", "mahapatra", "panigrahi", "satpathy", "tripathy",
    "vohra", "chhabra", "oberoi", "kalra", "batra", "dua", "gulati", "kakkar", "kataria", "khatri",
    "kochhar", "madhok", "makkar", "marwah", "monga", "nagpal", "narang", "pahwa", "pasricha", "sachdeva",
    "sawhney", "talwar", "thapar", "trehan", "uppal", "wadhwa", "walia", "dhingra", "bhalla", "bhasin",
    "chawla", "chopra", "dang", "dhir", "duggal", "gandhi", "gera", "ghai", "handa", "jaggi", "jolly",
    "kanwar", "kapoor", "khurana", "kohli", "kumar", "lamba", "maggu", "malik", "manchanda", "mehndiratta",
    "midha", "minocha", "mutreja", "nanda", "narula", "nayyar", "nijhawan", "puri", "raheja", "rekhi",
    "sabharwal", "sahni", "sarna", "sehgal", "sekhon", "sibal", "sood", "suri", "taneja", "tuli", "vasudeva",
    "vij", "virmani", "vohra", "wadhawan", "wig", "khan", "ahmed", "ahmad", "shaikh", "sheikh", "ansari",
    "qureshi", "syed", "sayed", "mirza", "pathan", "siddiqui", "farooqui", "usmani", "rizvi", "zaidi",
    "naqvi", "kazmi", "jaffri", "chishti", "kadri", "qadri", "mansoori", "saifi", "alvi", "hashmi",
    "patgaonkar", "gaonkar", "tendulkar", "gavaskar", "mangeshkar", "kelkar", "karmarkar", "agle", "abinash",
    "akshita", "sadiya", "sadia", "basith", "paykat", "morbi", "morbhi", "prableen", "bhomrah", "lavisha",
    "niharika", "shikha", "harsha", "baidehi", "pavitra", "himadri", "dharti", "somya", "susmitha",
    "kamakshi", "swarnima", "rathi", "rastogi", "siroe", "khowala", "raizada",
    // Common Indian First Names (Female & Male)
    "aaditya", "aarti", "aashish", "aayush", "abhishek", "aditi", "aditya", "aishwarya", "ajay", "akash",
    "akshay", "akriti", "alok", "aman", "amar", "amit", "amrita", "ananya", "anchal", "aneesh", "aniket",
    "anil", "anisha", "anita", "anjali", "ankit", "ankita", "anmol", "anoop", "anshul", "anubhav", "anuj",
    "anupam", "anurag", "anushka", "apoorva", "apurva", "archana", "arjun", "arpit", "arpita", "arushi",
    "aryan", "asha", "ashish", "ashok", "ashwini", "astha", "atul", "avani", "avinash", "ayush", "ayushi",
    "barkha", "bhavana", "bhavya", "bhoomi", "bhumi", "bhumika", "bindu", "bipasha", "chaitanya", "chaitra",
    "chandan", "chandni", "charu", "chetan", "chetna", "chirag", "damini", "darshan", "deepa", "deepak",
    "deepali", "deepika", "deepti", "dev", "devanshi", "devika", "dhanush", "dharmendra", "dhruv", "diksha",
    "dilip", "dinesh", "dipika", "disha", "divya", "divyansh", "divyanshi", "diya", "ekta", "esha", "falguni",
    "farhan", "farida", "gaurav", "gauri", "gayatri", "geeta", "geetanjali", "girish", "gopitha", "govind",
    "gunjan", "hardik", "hari", "harish", "harsh", "harsha", "harshita", "hemant", "hema", "himani", "himanshu",
    "hina", "hrithik", "indira", "indu", "isha", "ishaan", "ishani", "ishita", "jairaj", "janhvi", "jaspreet",
    "jatin", "jaya", "jayant", "jayesh", "jeet", "jhanvi", "jigyasa", "jitendra", "juhi", "jyoti", "kabir",
    "kajal", "kajol", "kalpana", "kamal", "kamini", "kanchan", "kanika", "kapil", "karan", "karishma",
    "kartik", "karthik", "kashish", "kavita", "kavya", "kiran", "kirti", "kishore", "komal", "krishna",
    "kriti", "kritika", "krunal", "kshitij", "kunal", "kusum", "lakshmi", "lalit", "lata", "lavanya",
    "lokesh", "madhav", "madhu", "madhuri", "mahesh", "mahima", "malavika", "mallika", "mamta", "manas",
    "manasi", "manav", "mandeep", "manish", "manisha", "manju", "manoj", "mansi", "manu", "mayank", "maya",
    "mayuri", "meena", "meenakshi", "meera", "megha", "meghna", "mihir", "milind", "minal", "mitali",
    "mohammad", "mohan", "mohini", "mohit", "mona", "monali", "monika", "monu", "mrunal", "mukesh", "muskan",
    "namita", "namrata", "nandini", "nandita", "naresh", "natasha", "naveen", "navneet", "navya", "nayana",
    "neelam", "neena", "neeraj", "neetu", "neha", "nidhi", "nikhil", "nikita", "nilima", "nimesh", "nimisha",
    "niraj", "nirmal", "nisha", "nishant", "nishi", "nita", "nitesh", "nitin", "nitish", "nitya", "nupur",
    "ojas", "ojaswi", "omkar", "palak", "pallavi", "pankaj", "pankhuri", "parth", "parul", "parvati", "payal",
    "piyush", "pooja", "poonam", "prabhakar", "prabhat", "prachi", "pradeep", "pragati", "pragya", "prajakta",
    "prakash", "pranav", "pranay", "praneeth", "pranjal", "prasad", "prashant", "prateek", "pratik", "pratiksha",
    "pratima", "praveen", "preeti", "prem", "prerana", "prerna", "preethi", "priya", "priyanka", "priyanshu",
    "puja", "pulkit", "puneet", "punam", "purva", "pushpa", "rachana", "rachna", "radha", "radhika", "raghav",
    "rahul", "raj", "raja", "rajan", "rajani", "rajat", "rajeev", "rajendra", "rajesh", "rajiv", "rajni",
    "rakesh", "rakhi", "ram", "raman", "ramesh", "ramya", "rani", "ranjan", "ranjeet", "ranjit", "rashmi",
    "ratan", "ravi", "ravindra", "reena", "rekha", "renu", "renuka", "reshma", "revathi", "richa", "riddhi",
    "rinku", "abhinav", "rishabh", "rishi", "ritesh", "ritika", "ritu", "riya", "rohan", "rohit", "ashwin",
    "roop", "roopa", "roshan", "roshni", "rubina", "ruchi", "ruchika", "rupali", "rupam", "rupesh", "sachin",
    "sadhana", "sagar", "sahil", "sai", "sakshi", "saloni", "sameer", "samiksha", "samir", "sampada",
    "sana", "sandeep", "sandhya", "sangeeta", "sanjana", "sanjay", "sanजीव".toLowerCase(), "sanjeev", "sanket",
    "sanskriti", "santosh", "sapna", "sarika", "sarita", "sarोज".toLowerCase(), "sarthak", "satish", "satyam",
    "saumya", "saurabh", "saurav", "savita", "seema", "shailesh", "shakti", "shalini", "shankar", "shantanu",
    "shanti", "sharad", "sharmila", "shashank", "shashi", "radhika", "sheetal", "shekhar", "shikha", "shilpa",
    "shilpi", "shiv", "shivam", "shivangi", "shivani", "shobha", "shradha", "shraddha", "shreya", "shreyas",
    "shristi", "shruti", "shubham", "shubhangi", "shweta", "siddharth", "siddhi", "simran", "smita", "smriti",
    "sneha", "snehal", "soham", "sona", "sonal", "sonali", "sonam", "sonia", "sonu", "soumya", "sourabh",
    "sourav", "sridevi", "srikanth", "srinivas", "srishti", "subhash", "subodh", "suchitra", "sudha", "sudhir",
    "suhani", "suhas", "sujata", "sujeet", "sujit", "sukanya", "suman", "sumit", "sunaina", "sunil", "sunita",
    "sunny", "supriya", "suraj", "surbhi", "surekha", "suresh", "surya", "sushant", "sushil", "sushma",
    "sushmita", "swapnil", "swara", "swati", "sweta", "tanisha", "tanmay", "tanu", "tanuja", "tanvi", "tanya",
    "tapan", "tapas", "tara", "tarun", "tejas", "tejaswi", "tejaswini", "trisha", "tripti", "tushar", "uday",
    "udit", "ujjwal", "uma", "umesh", "unnati", "upasana", "urmila", "urvashi", "usha", "utkarsh", "vaibhav",
    "vaidehi", "vaishali", "vaishnavi", "vandana", "vani", "vansh", "vanshika", "varsha", "varun", "vasant",
    "vasudha", "vedant", "veena", "vibha", "vidhi", "vidya", "vijay", "vijaya", "vikas", "vikram", "vikrant",
    "vimal", "vinay", "vinayak", "vineet", "vineeta", "vinod", "vipin", "vipul", "viraj", "virat", "virendra",
    "vishakha", "vishal", "vishnu", "vivek", "yamini", "yash", "yashasvi", "yogesh", "yukti", "yuvraj", "zoya",
]);

function hasIndianNameIdentity(fullName: string, handle: string, email: string): { matched: boolean; token?: string } {
    // 1. Check word tokens in fullName
    const words = `${fullName} ${handle.replace(/[._0-9]+/g, " ")} ${email.split("@")[0].replace(/[._0-9]+/g, " ")}`
        .toLowerCase()
        .split(/[^a-z]+/)
        .filter((w) => w.length >= 3);

    for (const w of words) {
        if (INDIAN_NAME_TOKENS.has(w)) {
            return { matched: true, token: w };
        }
    }

    // 2. Check compound handles/emails (e.g. "snehadivya27p", "gopithareddy", "vanshikaanigam", "jairajxai")
    const compactSources = [
        handle.toLowerCase().replace(/[^a-z]/g, ""),
        email.split("@")[0].toLowerCase().replace(/[^a-z]/g, ""),
        fullName.toLowerCase().replace(/[^a-z]/g, ""),
    ].filter((s) => s.length >= 5);

    for (const src of compactSources) {
        for (const tok of INDIAN_NAME_TOKENS) {
            if (tok.length >= 5 && src.includes(tok)) {
                return { matched: true, token: tok };
            }
            if (tok.length === 4 && (src.startsWith(tok) || src.endsWith(tok))) {
                return { matched: true, token: tok };
            }
        }
        // Marathi / Konkani / Goan surname suffix (-gaonkar, -ulkar, -arkar, -dekar, -likar)
        if (/(gaonkar|ulkar|arkar|dekar|likar|purkar|wadkar|vankar)$/.test(src)) {
            return { matched: true, token: src };
        }
    }
    return { matched: false };
}

/**
 * Dynamic Structural Indian & Human Creator Classifier (Zero Hardcoded Brand Lists):
 * Works for ANY brand (existing in our 15,117-brand DB or brand-new startups created today).
 * Uses structural account signals (handle-to-brand ratio, Instagram native category_name, e-commerce store phrases,
 * creator bio Links, personal/agency emails) and multi-signal India geo-verification.
 */
export function evaluateIndiaAndCreatorAuthenticity(params: {
    handle: string;
    fullName?: string;
    bio?: string;
    caption?: string;
    categoryName?: string | null;
    primaryEmail?: string | null;
    agencyEmail?: string | null;
    phone?: string | null;
    externalUrl?: string | null;
    city?: string | null;
    state?: string | null;
    brand?: string | null;
    searchedBrand?: string | null;
    brandExistsInContactsDb?: boolean;
    followersCount?: number;
    isIgVerified?: boolean;
}): IndiaAndAuthenticityEvaluation {
    const cleanH = String(params.handle || "").replace(/^@+/, "").toLowerCase().trim();
    const nameLower = String(params.fullName || "").toLowerCase().trim();
    const bioLower = String(params.bio || "").toLowerCase();
    const capLower = String(params.caption || "").toLowerCase();
    const igCatLower = String(params.categoryName || "").toLowerCase();
    const extLower = String(params.externalUrl || "").toLowerCase();
    const emailLower = String(params.primaryEmail || "").toLowerCase();
    const targetBrandRaw = String(params.brand || params.searchedBrand || "").trim();
    const combo = `${cleanH} ${nameLower} ${bioLower} ${capLower} ${extLower} ${emailLower} ${params.agencyEmail || ""}`.toLowerCase();

    // --- A. Dynamic Structural Brand Store vs. Human Creator Detection (No Hardcoded Lists) ---
    const brandCleaned = targetBrandRaw.toLowerCase().replace(/[^a-z0-9]/g, "");
    const handleAlpha = cleanH.replace(/[^a-z0-9]/g, "");
    const nameAlpha = nameLower.replace(/[^a-z0-9]/g, "");

    const nameMatch = hasIndianNameIdentity(params.fullName || "", cleanH, emailLower);
    const handleHasBrand = brandCleaned.length >= 3 && handleAlpha.includes(brandCleaned);

    // 1. Dynamic Handle/Name/Email Domain match against the target brand
    const matchesTargetBrandIdentity =
        brandCleaned.length >= 3 &&
        (handleAlpha === brandCleaned ||
            handleAlpha.startsWith(brandCleaned) ||
            handleAlpha.startsWith(`lets${brandCleaned}`) ||
            handleAlpha.startsWith(`my${brandCleaned}`) ||
            handleAlpha.startsWith(`try${brandCleaned}`) ||
            handleAlpha.startsWith(`get${brandCleaned}`) ||
            handleAlpha.startsWith(`the${brandCleaned}`) ||
            handleAlpha === `${brandCleaned}india` ||
            handleAlpha === `${brandCleaned}official` ||
            (nameAlpha === brandCleaned && (handleHasBrand || !nameMatch.matched)) ||
            nameLower.includes(`(${brandCleaned}`) ||
            nameLower.includes(" brand)") ||
            (emailLower.includes("@") && emailLower.split("@")[1]?.replace(/[^a-z0-9]/g, "").startsWith(brandCleaned)) ||
            (emailLower.includes("@") && emailLower.split("@")[1]?.replace(/[^a-z0-9]/g, "").startsWith(`lets${brandCleaned}`)));

    // 2. Structural E-commerce / Corporate Store Indicators
    const storePhrases = [
        "official page", "official account", "shop now", "free shipping", "pan india delivery",
        "cash on delivery", "cod available", "order online", "customer care", "customer support",
        "store locator", "cruelty free brand", "dermatologically tested", "buy now", "shipping worldwide",
        "add to cart", "visit our store", "toll free", "use code", "flat 50% off", "worldwide shipping",
    ];
    const hasStoreBio = storePhrases.filter((p) => bioLower.includes(p)).length >= 2;
    const hasCustomerSupportEmail = /^(care|support|help|customercare|orders|shop|service|cs-reply|careers)@/i.test(emailLower) &&
        !emailLower.endsWith("@gmail.com");
    const hasCommercialSuffix = /(official|brands|store|shop|cosmetics|skincare|foods|wear|app|online|jewellery|motors|electric|appliances|pharmaceuticals|diagnostics|ventures|pvtltd|autogroup)$/i.test(handleAlpha) &&
        !/(blogger|creator|vlogs|reviews|diaries|kitchen|makeover|art|clicks|beats)/i.test(handleAlpha);
    const isIgBrandCategory = Boolean(igCatLower && IG_BRAND_STORE_CATEGORIES.some((c) => igCatLower.includes(c)));
    const isIgCreatorCategory = Boolean(igCatLower && IG_CREATOR_CATEGORIES.some((c) => igCatLower.includes(c)));

    const creatorLinkStacks = /\b(linktr\.ee|beacons\.ai|bio\.link|linkin\.bio|wishlink\.com|hypd\.store|lehlah\.club|topmate\.io|cosmofeed\.com|rigi\.club|stan\.store|taplink\.cc|youtube\.com|youtu\.be)\b/i;
    const creatorPersonaWords = [
        "creator", "blogger", "influencer", "vlogger", "reviewer", "artist", "mua", "stylist",
        "chef", "foodie", "fitness", "coach", "doctor", "dr.", "educator", "actor",
        "model", "photographer", "gamer", "comedian", "mom", "travel", "collab", "dm for",
        "managed by", "pr/", "inquiries", "enquiries", "youtuber", "personal",
    ];
    const hasCreatorPersona =
        isIgCreatorCategory ||
        creatorLinkStacks.test(combo) ||
        creatorPersonaWords.some((w) => bioLower.includes(w) || nameLower.includes(w));

    const isBrandOrStoreAccount = Boolean(
        matchesTargetBrandIdentity ||
        hasStoreBio ||
        hasCustomerSupportEmail ||
        (hasCommercialSuffix && !hasCreatorPersona && !nameMatch.matched) ||
        (isIgBrandCategory && !hasCreatorPersona)
    );

    const authenticitySignals: string[] = [];
    let authScore = 45;
    if (!isBrandOrStoreAccount) {
        authScore += 20;
        authenticitySignals.push("Human Creator Profile");
    } else {
        authScore = 10;
        authenticitySignals.push("Brand / Commercial Store Account");
    }

    if (params.followersCount && params.followersCount >= 1000) {
        authScore += 15;
        authenticitySignals.push(`Active Audience (${formatFollowersRaw(params.followersCount)})`);
    }
    if ((params.primaryEmail && !hasCustomerSupportEmail) || params.agencyEmail) {
        authScore += 15;
        authenticitySignals.push("Verified Creator/Talent Email");
    }
    if (params.isIgVerified) {
        authScore += 10;
        authenticitySignals.push("Meta Blue Tick Verified");
    }
    if (hasCreatorPersona) {
        authScore += 10;
        authenticitySignals.push("Creator Persona & Bio Signals");
    }
    authScore = Math.min(100, authScore);

    // --- B. Multi-Signal India Geo-Verification (Requires real Indian evidence; NO blind fallback) ---
    let indiaScore = 0;
    const indiaSignals: string[] = [];

    // 1. Indian City / State / Pin / Flag / Demonym (+45)
    if (params.city || params.state) {
        indiaScore += 45;
        indiaSignals.push(`Location: ${[params.city, params.state].filter(Boolean).join(", ")}`);
    } else if (
        combo.includes("🇮🇳") ||
        /\b(india|indian|mumbai|delhi|new delhi|bengaluru|bangalore|hyderabad|pune|chennai|kolkata|ahmedabad|jaipur|chandigarh|kochi|indore|lucknow|goa|surat|guwahati|noida|gurgaon|gurugram|faridabad|ghaziabad|thane|navi mumbai|bhopal|patna|vadodara|ludhiana|agra|nashik|rajkot|varanasi|srinagar|aurangabad|dhanbad|amritsar|allahabad|prayagraj|ranchi|coimbatore|jabalpur|gwalior|vijayawada|jodhpur|madurai|raipur|kota|mysore|mysuru|gulbarga|hubli|mangalore|belgaum|tiruchirappalli|salem|tiruppur|erode|vellore|thoothukudi|thiruvananthapuram|trivandrum|kozhikode|calicut|thrissur|kollam|kannur|visakhapatnam|vizag|tirupati|guntur|warangal|nellore|kurnool|kerala|punjab|maharashtra|gujarat|rajasthan|karnataka|tamil nadu|telangana|andhra|bengal|himachal|uttarakhand|assam|odisha|bihar|jharkhand|chhattisgarh|haryana|kashmir|ladakh|sikkim|meghalaya|manipur|mizoram|nagaland|tripura|arunachal|mumbaikar|delhite|punekar|mallu|desi)\b/i.test(combo)
    ) {
        indiaScore += 45;
        indiaSignals.push("Indian Geo / Regional Tag");
    }

    // 2. Indian Phone (+91) or .in / .co.in Email / Indian Creator Commerce Stack (+40)
    if (params.phone && params.phone.includes("+91")) {
        indiaScore += 40;
        indiaSignals.push("Verified +91 Mobile/WhatsApp");
    }
    if (
        emailLower.endsWith(".in") ||
        emailLower.endsWith(".co.in") ||
        extLower.includes(".in/") ||
        extLower.endsWith(".in") ||
        (params.agencyEmail && (params.agencyEmail.endsWith(".in") || params.agencyEmail.endsWith(".co.in"))) ||
        /\b(wishlink\.com|hypd\.store|lehlah\.club|rigi\.club|cosmofeed\.com|topmate\.io|monk-e\.in|opraahfx\.com|cloutpocketaces\.com|whackedout\.in|nofiltr\.social|collectiveartists\.com)\b/i.test(combo)
    ) {
        indiaScore += 40;
        indiaSignals.push("Indian Domain / Creator Stack");
    }

    // 3. Indian First Name / Surname / Linguistic Identity (+45)
    if (nameMatch.matched) {
        indiaScore += 45;
        indiaSignals.push("Indian Name / Identity");
    }

    // 4. Indic Unicode Script, Hinglish, Indian Rupee Currency (₹ / Rs. / INR), or Indian Retail Tag (+35)
    const hasIndicScript = /[\u0900-\u0D7F]/.test(combo);
    const hasRupeeOrHinglish = /(₹|\brs\.?\s*\d|\binr\s*\d|\bhai\b|\bkya\b|\bmera\b|\baccha\b|\bsabse\b|\bsasta\b|\bdesi\b|\bkurti\b|\bsaree\b|\blehenga\b|\bshaadi\b|\bdiwali\b|\bnykaa\b|\bmyntra\b|\bajio\b|\bmeesho\b|\bflipkart\b|\bblinkit\b|\bzepto\b|\bswiggy\b|\bzomato\b|\bmamaearth\b)/i.test(combo);
    if (hasIndicScript || hasRupeeOrHinglish) {
        indiaScore += 35;
        indiaSignals.push("Indian Language / ₹ / Ecosystem Signal");
    }

    // 5. Verified Human Creator Reviewing Target Brand in India (+35 — only if NOT the brand's own account)
    if (!isBrandOrStoreAccount && (targetBrandRaw.length >= 2 || params.brandExistsInContactsDb)) {
        indiaScore += 35;
        indiaSignals.push(`Brand Review / Affinity (${targetBrandRaw || "DB Brand"})`);
    }

    // 6. Negative Foreign Signal Penalty (-75)
    const hasForeignSignal = /(\+1\s*\d{3}|\+44\s*\d|\+92\s*3|\+62\s*8|\+971\s*5|\.pk\b|\.co\.uk\b|\.id\b|\.au\b|\.ca\b|\bkarachi\b|\blahore\b|\bislamabad\b|\bjakarta\b|\blagos\b|\bnigeria\b|\bpakistan\b|\blebanon\b|\bbeirut\b|\buk creator\b|\busa\b|\blondon\b|\bnyc\b|\btoronto\b|\bsydney\b|\bmelbourne\b|\bsephora haul\b)/i.test(combo);
    if (hasForeignSignal) {
        indiaScore = Math.max(0, indiaScore - 75);
        indiaSignals.push("Foreign Geo Penalty");
    }

    indiaScore = Math.min(100, indiaScore);
    const isIndianCreator = !isBrandOrStoreAccount && indiaScore >= 30 && !hasForeignSignal;
    const isVerifiedHumanCreator = !isBrandOrStoreAccount && authScore >= 50;

    return {
        isIndianCreator,
        indiaConfidenceScore: indiaScore,
        indiaSignals,
        isVerifiedHumanCreator,
        isBrandOrStoreAccount,
        authenticityScore: authScore,
        authenticitySignals,
    };
}

let serperKeyIdx = 0;

/**
 * Multi-Provider Google & Web Search Router:
 * Cascades automatically across:
 * 1. Serper.dev (Google Search & Video SERP API)
 * 2. Firecrawl Search API (FIRECRAWL_API_KEY — live Google SERP + page scrape)
 * 3. Google Official Custom Search JSON API (GOOGLE_CSE_API_KEY + GOOGLE_CSE_CX)
 * 4. SerpApi (SERPAPI_API_KEY)
 * 5. Brave Search API (BRAVE_SEARCH_API_KEY)
 */
async function serperRequest(endpoint: "search" | "videos", payload: Record<string, any>): Promise<any | null> {
    const queryStr = String(payload.q || "").trim();
    const num = Number(payload.num) || 15;

    // 1. Primary: Serper.dev Key Pool
    const keys = getSerperKeys();
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
                signal: AbortSignal.timeout(9000),
            });
            if (res.status === 403 || res.status === 429 || res.status === 402 || res.status === 400) {
                serperKeyIdx = (serperKeyIdx + 1) % keys.length;
                continue;
            }
            if (res.ok) {
                const data = await res.json();
                if ((Array.isArray(data?.organic) && data.organic.length > 0) || (Array.isArray(data?.videos) && data.videos.length > 0)) {
                    return data;
                }
            }
        } catch {
            continue;
        }
    }

    // 2. Fallback A: Firecrawl Search API (FIRECRAWL_API_KEY in .env)
    const firecrawlKey = process.env.FIRECRAWL_API_KEY?.trim();
    if (firecrawlKey && queryStr) {
        try {
            const fcRes = await fetch("https://api.firecrawl.dev/v1/search", {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${firecrawlKey}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    query: queryStr,
                    limit: Math.min(num, 20),
                    country: "in",
                    lang: "en",
                }),
                signal: AbortSignal.timeout(10000),
            });
            if (fcRes.ok) {
                const fcData = await fcRes.json();
                const items: any[] = Array.isArray(fcData?.data) ? fcData.data : [];
                if (items.length > 0) {
                    const mapped = items.map((it) => ({
                        title: it.title || "",
                        link: it.url || it.link || "",
                        snippet: it.description || it.markdown || "",
                    }));
                    return { organic: mapped, videos: mapped, provider: "firecrawl" };
                }
            }
        } catch {}
    }

    // 3. Fallback B: Official Google Custom Search JSON API (GOOGLE_CSE_API_KEY + GOOGLE_CSE_CX)
    const googleCseKey = process.env.GOOGLE_CSE_API_KEY?.trim();
    const googleCseCx = process.env.GOOGLE_CSE_CX?.trim();
    if (googleCseKey && googleCseCx && queryStr) {
        try {
            const cseUrl = `https://www.googleapis.com/customsearch/v1?key=${encodeURIComponent(googleCseKey)}&cx=${encodeURIComponent(googleCseCx)}&q=${encodeURIComponent(queryStr)}&gl=in&num=${Math.min(num, 10)}`;
            const cseRes = await fetch(cseUrl, { signal: AbortSignal.timeout(8000) });
            if (cseRes.ok) {
                const cseData = await cseRes.json();
                const items: any[] = Array.isArray(cseData?.items) ? cseData.items : [];
                if (items.length > 0) {
                    const mapped = items.map((it) => ({
                        title: it.title || "",
                        link: it.link || "",
                        snippet: it.snippet || "",
                    }));
                    return { organic: mapped, videos: mapped, provider: "google_cse" };
                }
            }
        } catch {}
    }

    // 4. Fallback C: SerpApi (SERPAPI_API_KEY)
    const serpApiKey = process.env.SERPAPI_API_KEY?.trim();
    if (serpApiKey && queryStr) {
        try {
            const saUrl = `https://serpapi.com/search.json?engine=google&q=${encodeURIComponent(queryStr)}&gl=in&hl=en&num=${num}&api_key=${encodeURIComponent(serpApiKey)}`;
            const saRes = await fetch(saUrl, { signal: AbortSignal.timeout(9000) });
            if (saRes.ok) {
                const saData = await saRes.json();
                const items: any[] = Array.isArray(saData?.organic_results) ? saData.organic_results : [];
                if (items.length > 0) {
                    const mapped = items.map((it) => ({
                        title: it.title || "",
                        link: it.link || "",
                        snippet: it.snippet || "",
                    }));
                    return { organic: mapped, videos: mapped, provider: "serpapi" };
                }
            }
        } catch {}
    }

    // 5. Fallback D: Brave Search API (BRAVE_SEARCH_API_KEY)
    const braveKey = process.env.BRAVE_SEARCH_API_KEY?.trim();
    if (braveKey && queryStr) {
        try {
            const bUrl = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(queryStr)}&country=IN&count=${Math.min(num, 20)}`;
            const bRes = await fetch(bUrl, {
                headers: { "X-Subscription-Token": braveKey, Accept: "application/json" },
                signal: AbortSignal.timeout(8000),
            });
            if (bRes.ok) {
                const bData = await bRes.json();
                const items: any[] = Array.isArray(bData?.web?.results) ? bData.web.results : [];
                if (items.length > 0) {
                    const mapped = items.map((it) => ({
                        title: it.title || "",
                        link: it.url || "",
                        snippet: it.description || "",
                    }));
                    return { organic: mapped, videos: mapped, provider: "brave" };
                }
            }
        } catch {}
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
        .replace(/&gt;/g, ">")
        .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => {
            try {
                return String.fromCodePoint(parseInt(hex, 16));
            } catch {
                return _;
            }
        })
        .replace(/&#(\d+);/g, (_, dec) => {
            try {
                return String.fromCodePoint(parseInt(dec, 10));
            } catch {
                return _;
            }
        });
}

function cleanEmails(rawEmails: string[]): { primaryEmail: string | null; agencyEmail: string | null; allEmails: string[] } {
    const unique: string[] = [];
    for (const raw of rawEmails) {
        let em = String(raw || "")
            .toLowerCase()
            .trim()
            .replace(/[.,:;!?)+\]]+$/, "")
            .replace(/\.watch$/i, "");
        // Trim glued trailing words after common TLDs in bios with no space (e.g. "name@gmail.comheyy" -> "name@gmail.com")
        em = em
            .replace(/(@[a-z0-9.-]+\.co\.in)[a-z]+$/i, "$1")
            .replace(/(@[a-z0-9.-]+\.com)[a-z]+$/i, "$1")
            .replace(/(@[a-z0-9.-]+\.org)[a-z]+$/i, "$1")
            .replace(/(@[a-z0-9.-]+\.net)[a-z]+$/i, "$1");
        if (!em.includes("@") || !em.includes(".")) continue;
        const [localPart, domainPart] = em.split("@");
        if (!localPart || !domainPart || !/^[a-z0-9.-]+\.[a-z]{2,12}$/.test(domainPart)) continue;
        const tld = domainPart.split(".").pop() || "";
        if (!/^[a-z]{2,12}$/.test(tld)) continue;
        if (em.endsWith(".png") || em.endsWith(".jpg") || em.endsWith(".webp") || em.endsWith(".svg") || em.endsWith(".js") || em.endsWith(".css")) continue;
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
    const addPhone = (raw: string) => {
        const digits = raw.replace(/\D/g, "").slice(-10);
        if (digits.length === 10 && "6789".includes(digits[0])) {
            const formatted = `+91 ${digits}`;
            if (!phones.includes(formatted)) phones.push(formatted);
        }
    };

    let m: RegExpExecArray | null;
    const waRegex = new RegExp(WA_LINK_RE.source, "gi");
    while ((m = waRegex.exec(rawText)) !== null) {
        addPhone(m[1]);
    }
    // Strip URLs so 10-digit Instagram CDN image IDs (e.g. _6426680573_n.jpg) never match as phone numbers
    const textWithoutUrls = String(rawText || "").replace(/https?:\/\/\S+/gi, " ");

    // 1. Prefix match: +91, 91-, keywords (call/whatsapp/wa/phone/mob/contact/dm), or phone emojis (📞/📱/☎️/📲)
    const prefixPhoneRe =
        /(?:(?:\+?91[\s.-]?)|(?:(?:call|whatsapp|whats\s*app|w\/a|wa|ph|phone|mob|mobile|contact|dm|enquir(?:y|ies)|bookings?|helpline|📞|📱|☎️|☎|📲)[\uFE0F\s:.\-\/()]{0,8}(?:\+?91[\s.-]?|0)?))([6-9]\d{4}[\s.-]?\d{5})\b/giu;
    while ((m = prefixPhoneRe.exec(textWithoutUrls)) !== null) {
        addPhone(m[1]);
    }

    // 2. Postfix match: e.g. "9870174555 Whatsapp", "9870174555 (WA)", "9870174555 📞"
    const postfixPhoneRe =
        /\b(?:0|\+?91[\s.-]?)?([6-9]\d{4}[\s.-]?\d{5})[\s:.\-()]{0,6}(?:whatsapp|whats\s*app|w\/a|wa\b|call|phone|mob|mobile|for\s*collab|for\s*booking|📞|📱|☎️|☎|📲)/giu;
    while ((m = postfixPhoneRe.exec(textWithoutUrls)) !== null) {
        addPhone(m[1]);
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

function getSocialCrawlKey(): string {
    if (process.env.SOCIALCRAWL_API_KEY?.trim()) {
        return process.env.SOCIALCRAWL_API_KEY.trim();
    }
    const roots = [process.cwd(), path.resolve(process.cwd(), "..")];
    for (const r of roots) {
        for (const f of [".env.local", ".env"]) {
            try {
                const full = path.join(r, f);
                if (!fs.existsSync(full)) continue;
                const m = fs.readFileSync(full, "utf8").match(/^\s*SOCIALCRAWL_API_KEY\s*=\s*(.+)\s*$/m);
                if (m?.[1]) {
                    const val = m[1].trim().replace(/^["']|["']$/g, "");
                    if (val) {
                        process.env.SOCIALCRAWL_API_KEY = val;
                        return val;
                    }
                }
            } catch {}
        }
    }
    return "sc_Ceb9ZpR0ahQiFir5nvuttThjVktow7r72NkSCEoHF2I";
}

// Cache pre-fetched SocialCrawl profiles from /search/profiles so we spend 0 extra credits
const socialCrawlProfileCache = new Map<string, any>();

/**
 * Resolves an Instagram Reel URL -> Author Handle, Likes, Comments, Views, and Caption
 */
export async function resolveInstagramReel(reelUrl: string): Promise<{
    handle?: string;
    title?: string;
    caption?: string;
    likes?: number;
    comments?: number;
    views?: number;
    shares?: number;
    hasCollabTag?: boolean;
    brandMentions?: string[];
}> {
    // 0. Option 2 Primary: SocialCrawl /v1/instagram/post API (returns exact views, shares, comments, author, coauthors, AI niche)
    const scKey = getSocialCrawlKey();
    if (scKey) {
        try {
            const scRes = await fetch(
                `https://www.socialcrawl.dev/v1/instagram/post?url=${encodeURIComponent(reelUrl)}`,
                {
                    headers: { "x-api-key": scKey },
                    signal: AbortSignal.timeout(15000),
                }
            );
            if (scRes.ok) {
                const scJson = (await scRes.json()) as any;
                const post = scJson?.data?.post;
                if (post?.author?.username) {
                    const handle = String(post.author.username).toLowerCase();
                    const caption = String(post.content?.text || "");
                    const views = Number(post.engagement?.views ?? post.ext?.instagram_views ?? 0) || undefined;
                    const likes = Number(post.engagement?.likes ?? 0) || undefined;
                    const comments = Number(post.engagement?.comments ?? 0) || undefined;
                    const shares = Number(post.engagement?.shares ?? 0) || undefined;
                    const hasCollabTag =
                        Boolean(post.ext?.sponsored_disclosed) ||
                        (Array.isArray(post.ext?.coauthors) && post.ext.coauthors.length > 0) ||
                        COLLAB_TAGS.some((t) => caption.toLowerCase().includes(t));
                    const brandMentions = Array.from(caption.matchAll(/@([A-Za-z0-9_.]+)/g)).map((m) => m[1].toLowerCase());
                    return {
                        handle,
                        title: post.author.display_name || handle,
                        caption,
                        likes,
                        comments,
                        views,
                        shares,
                        hasCollabTag,
                        brandMentions,
                    };
                }
            }
        } catch {}
    }

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
 * Fetches profile metadata with ZERO-WASTE CREDIT OPTIMIZATION:
 * 1. Check in-memory cache from /search/profiles (0 credits)
 * 2. Free Instagram web_profile_info & public OG metadata (0 credits)
 * 3. Only uses 1 SocialCrawl /profile credit if explicitly requested (useSocialCrawlProfile=true) and free tiers returned nothing,
 *    preserving SocialCrawl credits for /v1/instagram/similar (51 creators per 5 credits = 0.1 credit/creator)!
 */
async function fetchWebProfileInfo(cleanHandle: string, useSocialCrawlProfile = false): Promise<{
    fullName?: string;
    biography?: string;
    externalUrl?: string;
    bioLinks?: string[];
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
    // 0. Check SocialCrawl in-memory cache from /search/profiles or /similar first (0 credits!)
    const cachedAuthor = socialCrawlProfileCache.get(cleanHandle.toLowerCase());
    if (cachedAuthor && (cachedAuthor.followers || cachedAuthor.bio)) {
        const followersCount = Number(cachedAuthor.followers || 0);
        const followingCount = Number(cachedAuthor.following || 0);
        const postsCount = Number(cachedAuthor.posts_count || 0);
        const bioLinksArr: string[] = [];
        if (cachedAuthor.external_url) bioLinksArr.push(String(cachedAuthor.external_url));
        if (Array.isArray(cachedAuthor.ext?.bio_links)) {
            for (const bl of cachedAuthor.ext.bio_links) {
                if (bl?.url && !bioLinksArr.includes(bl.url)) bioLinksArr.push(String(bl.url));
            }
        }
        return {
            fullName: cachedAuthor.display_name || undefined,
            biography: cachedAuthor.bio || undefined,
            externalUrl: bioLinksArr[0] || undefined,
            bioLinks: bioLinksArr,
            followersCount: followersCount || undefined,
            followingCount: followingCount || undefined,
            postsCount: postsCount || undefined,
            isVerified: Boolean(cachedAuthor.verified),
            profilePictureUrl: cachedAuthor.ext?.hd_avatar_url || cachedAuthor.avatar_url || undefined,
            categoryName: cachedAuthor.ext?.business_category || undefined,
            businessEmail: cachedAuthor.ext?.public_email || undefined,
        };
    }

    // 1. Free Primary: Instagram web_profile_info (0 SocialCrawl credits)
    try {
        const url = `https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(cleanHandle)}`;
        const res = await fetch(url, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
                "X-IG-App-ID": "936619743392459",
                "Accept": "application/json",
                "Referer": `https://www.instagram.com/${cleanHandle}/`,
            },
            signal: AbortSignal.timeout(7000),
        });
        if (res.ok) {
            const json = (await res.json()) as any;
            const user = json?.data?.user;
            if (user) {
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
            }
        }
    } catch {}

    // 2. Free Fallback: Public Profile HTML OG Tags via facebookexternalhit (0 SocialCrawl credits — extracts followers, posts, fullName, bio snippet)
    try {
        const ogRes = await fetch(`https://www.instagram.com/${encodeURIComponent(cleanHandle)}/`, {
            headers: {
                "User-Agent": "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
                Accept: "text/html",
            },
            signal: AbortSignal.timeout(6000),
        });
        if (ogRes.ok) {
            const html = await ogRes.text();
            const descMatch =
                html.match(/property="og:description"\s+content="([^"]+)"/i) ||
                html.match(/content="([^"]+)"\s+property="og:description"/i);
            const titleMatch =
                html.match(/property="og:title"\s+content="([^"]+)"/i) ||
                html.match(/content="([^"]+)"\s+property="og:title"/i);
            const imgMatch =
                html.match(/property="og:image"\s+content="([^"]+)"/i) ||
                html.match(/content="([^"]+)"\s+property="og:image"/i);
            const desc = decodeHtmlEntities(descMatch?.[1] || "");
            const title = decodeHtmlEntities(titleMatch?.[1] || "");
            const fMatch = desc.match(/([\d.,]+[KMBkmb]?)\s+Followers/i);
            const flMatch = desc.match(/([\d.,]+[KMBkmb]?)\s+Following/i);
            const pMatch = desc.match(/([\d.,]+[KMBkmb]?)\s+Posts/i);
            const nameMatch = title.match(/^(.+?)\s*\(@/i);
            const followersCount = fMatch?.[1] ? parseCountToken(fMatch[1]) : 0;
            if (followersCount > 0) {
                return {
                    fullName: nameMatch?.[1]?.trim() || undefined,
                    // Do NOT set biography to the generic OG "X Followers, Y Following - See Instagram photos..." string
                    biography: undefined,
                    followersCount,
                    followingCount: flMatch?.[1] ? parseCountToken(flMatch[1]) : undefined,
                    postsCount: pMatch?.[1] ? parseCountToken(pMatch[1]) : undefined,
                    profilePictureUrl: imgMatch?.[1] ? decodeHtmlEntities(imgMatch[1]) : undefined,
                };
            }
        }
    } catch {}

    // 3. Last Resort: SocialCrawl /v1/instagram/profile (only if useSocialCrawlProfile=true)
    const scKey = getSocialCrawlKey();
    if (scKey && useSocialCrawlProfile) {
        try {
            const profRes = await fetch(
                `https://www.socialcrawl.dev/v1/instagram/profile?handle=${encodeURIComponent(cleanHandle)}&contact_email=1`,
                {
                    headers: { "x-api-key": scKey },
                    signal: AbortSignal.timeout(15000),
                }
            );
            if (profRes.ok) {
                const profJson = (await profRes.json()) as any;
                const author = profJson?.data?.author;
                if (author) {
                    socialCrawlProfileCache.set(cleanHandle.toLowerCase(), author);
                    return {
                        fullName: author.display_name || undefined,
                        biography: author.bio || undefined,
                        externalUrl: author.external_url || author.ext?.bio_links?.[0]?.url || undefined,
                        followersCount: Number(author.followers || 0) || undefined,
                        followingCount: Number(author.following || 0) || undefined,
                        postsCount: Number(author.posts_count || 0) || undefined,
                        isVerified: Boolean(author.verified),
                        profilePictureUrl: author.ext?.hd_avatar_url || author.avatar_url || undefined,
                        categoryName: author.ext?.business_category || undefined,
                        businessEmail: author.ext?.public_email || undefined,
                    };
                }
            }
        } catch {}
    }

    return null;
}

const SKIP_HOP_DOMAINS = [
    "instagram.com", "facebook.com", "fb.com", "twitter.com", "x.com", "tiktok.com",
    "youtube.com", "youtu.be", "spotify.com", "apple.com", "amazon.", "amzn.to",
    "flipkart.com", "myntra.com", "nykaa.com", "meesho.com", "ajio.com",
    "linktr.ee", "beacons.ai", "bio.link", "linkin.bio", "taplink.cc", "campsite.bio",
    "wa.me", "whatsapp.com", "t.me", "telegram.me", "discord.gg", "linkedin.com",
    "google.com", "gstatic.com", "googleapis.com", "w3.org", "schema.org",
    "cloudflare.com", "cloudfront.net", "amazonaws.com", "jsdelivr.net", "unpkg.com",
    "fonts.googleapis.com", "gravatar.com", "vimeo.com", "pinterest.com", "snapchat.com",
];

function extractContactsFromHtml(html: string): { emails: string[]; phone: string | null } {
    const emails: string[] = [];
    // 1. Explicit mailto: links (also catches encoded %40 and __NEXT_DATA__ JSON)
    const mailtoRe = /mailto:([a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+)/gi;
    let mm: RegExpExecArray | null;
    while ((mm = mailtoRe.exec(html)) !== null) {
        if (mm[1]) emails.push(mm[1]);
    }
    // 2. Raw regex emails
    const rawMatches = html.match(EMAIL_RE) || [];
    emails.push(...rawMatches);
    const phone = cleanPhones(html);
    return { emails, phone };
}

async function fetchHtmlFast(url: string, timeoutMs = 5500): Promise<{ html: string; finalUrl: string } | null> {
    try {
        const res = await fetch(url, {
            redirect: "follow",
            headers: {
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
                Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            },
            signal: AbortSignal.timeout(timeoutMs),
        });
        if (!res.ok) return null;
        const ct = (res.headers.get("content-type") || "").toLowerCase();
        if (ct && !ct.includes("text/html") && !ct.includes("application/json") && !ct.includes("text/plain")) return null;
        const html = (await res.text()).slice(0, 350_000);
        return { html, finalUrl: res.url || url };
    } catch {
        return null;
    }
}

/**
 * Upgrade 1 ($0): Deep Linktree + Personal Website /contact 1-Hop Crawler.
 * 1. Direct HTML fetch -> extracts mailto:, raw emails, WhatsApp/phone.
 * 2. If Linktree/Beacons/shortlink & no email -> follows up to 2 outbound personal/contact URLs.
 * 3. If personal domain & no email -> checks /contact and /contact-us in parallel.
 * 4. Jina Reader fallback only if direct HTML returned 0 emails.
 */
export async function mineExternalLinkContacts(url: string): Promise<{ emails: string[]; phone: string | null }> {
    const fullUrl = url.startsWith("http") ? url : `https://${url}`;
    const collectedEmails: string[] = [];
    let discoveredPhone: string | null = null;

    // Skip pure shopping/affiliate links that never contain creator contact emails
    if (/^https?:\/\/(?:www\.)?(?:amzn\.to|amazon\.|flipkart\.com|myntra\.com|nykaa\.com|meesho\.com)/i.test(fullUrl)) {
        return { emails: [], phone: null };
    }

    // 1. Direct HTML fetch (fast, preserves mailto: & Linktree __NEXT_DATA__ JSON)
    const primary = await fetchHtmlFast(fullUrl, 6000);
    if (primary) {
        const c1 = extractContactsFromHtml(primary.html);
        collectedEmails.push(...c1.emails);
        if (!discoveredPhone) discoveredPhone = c1.phone;

        const hasValidEmail = cleanEmails(collectedEmails).allEmails.length > 0;
        const finalUrl = primary.finalUrl;

        // 2. If still no email, follow 1-hop outbound links (Linktree/Beacons/etc.) OR /contact pages on personal domain
        if (!hasValidEmail) {
            const isLinkStack = /(?:linktr\.ee|beacons\.ai|bio\.link|linkin\.bio|taplink\.cc|campsite\.bio|stan\.store|wishlink\.com|topmate\.io|cosmofeed\.com)/i.test(
                finalUrl
            );
            const hopUrls: string[] = [];

            if (isLinkStack) {
                // Extract up to 2 personal/business outbound URLs from Linktree HTML/JSON
                const urlRe = /https?:\/\/[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}(?:\/[^\s"'<>\\)]*)?/g;
                const found = primary.html.match(urlRe) || [];
                const seenOrigins = new Set<string>();
                for (const u of found) {
                    const cleaned = u.replace(/[\\"',.)]+$/, "");
                    const lower = cleaned.toLowerCase();
                    if (SKIP_HOP_DOMAINS.some((d) => lower.includes(d))) continue;
                    if (/\.(?:jpg|jpeg|png|webp|gif|svg|css|js|ico|woff2?|pdf|mp4)(?:\?|$)/i.test(lower)) continue;
                    try {
                        const parsed = new URL(cleaned);
                        if (seenOrigins.has(parsed.origin)) continue;
                        seenOrigins.add(parsed.origin);
                        hopUrls.push(cleaned);
                        if (hopUrls.length >= 2) break;
                    } catch {}
                }
            } else if (!/(?:youtube\.com|youtu\.be|instagram\.com|facebook\.com)/i.test(finalUrl)) {
                // Personal/business website: check /contact and /contact-us (plus any explicit contact href in page)
                try {
                    const parsed = new URL(finalUrl);
                    const contactHrefMatch = primary.html.match(/href=["']([^"']*(?:contact|about|collab|work-with)[^"']*)["']/i);
                    if (contactHrefMatch?.[1]) {
                        try {
                            const resolved = new URL(contactHrefMatch[1], parsed.origin).toString();
                            if (resolved !== finalUrl) hopUrls.push(resolved);
                        } catch {}
                    }
                    const defaultContact = `${parsed.origin}/contact`;
                    const defaultContactUs = `${parsed.origin}/contact-us`;
                    if (!hopUrls.includes(defaultContact) && defaultContact !== finalUrl) hopUrls.push(defaultContact);
                    if (hopUrls.length < 2 && !hopUrls.includes(defaultContactUs) && defaultContactUs !== finalUrl) {
                        hopUrls.push(defaultContactUs);
                    }
                } catch {}
            }

            if (hopUrls.length > 0) {
                const hopResults = await Promise.all(hopUrls.slice(0, 2).map((hu) => fetchHtmlFast(hu, 4500)));
                for (const hr of hopResults) {
                    if (!hr) continue;
                    const ch = extractContactsFromHtml(hr.html);
                    collectedEmails.push(...ch.emails);
                    if (!discoveredPhone) discoveredPhone = ch.phone;
                }
            }
        }
    }

    // 3. Fallback: Jina Reader only if direct HTML + 1-hop didn't find a valid email (helps on JS-rendered SPAs)
    if (cleanEmails(collectedEmails).allEmails.length === 0) {
        try {
            const jinaRes = await fetch(`https://r.jina.ai/${fullUrl}`, {
                headers: { "User-Agent": "TBM-AgentReach/2.0" },
                signal: AbortSignal.timeout(6500),
            });
            if (jinaRes.ok) {
                const text = await jinaRes.text();
                const matches = text.match(EMAIL_RE) || [];
                collectedEmails.push(...matches);
                if (!discoveredPhone) discoveredPhone = cleanPhones(text);
            }
        } catch {}
    }

    return { emails: collectedEmails, phone: discoveredPhone };
}

// Read-only in-memory cache for resolved @agency / @brand handles via free Meta Graph ($0)
const agencyMetaCache = new Map<string, { email: string | null; phone: string | null; agencyName: string | null }>();

/**
 * Upgrade 2 ($0): Auto-Resolve Mentioned @agency / @brand Handles via Free Meta Graph.
 * Reads the tagged @agency's Instagram bio + website (without inserting the agency into "Creator")
 * to recover booking emails & WhatsApp numbers for creators managed by agencies not in our static directory.
 */
export async function resolveMentionedAgencyViaMetaGraph(
    bioText: string,
    creatorHandle: string
): Promise<{ email: string | null; phone: string | null; agencyName: string | null }> {
    const cleanSelf = creatorHandle.replace(/^@+/, "").toLowerCase();
    const mentions: string[] = [];

    // Prioritize handles appearing right after management/agency/business keywords
    const priorityRe = /(?:rep(?:resented)?\s*by|managed\s*by|mgmt|management|agency|talent|founder\s*(?:of|@)?|owner\s*(?:of|@)?|co-?founder|collab(?:s|orations)?|bookings?|work|business|dm)[^@\n]{0,25}@([a-z0-9._]{2,30})/gi;
    let pm: RegExpExecArray | null;
    while ((pm = priorityRe.exec(bioText)) !== null) {
        const h = pm[1].replace(/\.+$/, "").toLowerCase();
        if (h && h !== cleanSelf && !mentions.includes(h)) mentions.push(h);
    }

    // Also inspect up to 1 other @mention in bio if no priority match
    if (mentions.length === 0) {
        const anyRe = /@([a-z0-9._]{3,30})/gi;
        while ((pm = anyRe.exec(bioText)) !== null) {
            const h = pm[1].replace(/\.+$/, "").toLowerCase();
            if (h && h !== cleanSelf && !h.includes("backup") && !mentions.includes(h)) {
                mentions.push(h);
                if (mentions.length >= 1) break;
            }
        }
    }

    if (mentions.length === 0) return { email: null, phone: null, agencyName: null };

    const tokenPool = getMetaTokenPool();
    if (tokenPool.length === 0) return { email: null, phone: null, agencyName: null };

    const target = mentions[0];
    if (agencyMetaCache.has(target)) {
        return agencyMetaCache.get(target)!;
    }

    const cred = tokenPool[0];
    try {
        const fields = `business_discovery.username(${encodeURIComponent(target)}){username,name,biography,website}`;
        const url = `https://graph.facebook.com/v21.0/${cred.igAccountId}?fields=${fields}&access_token=${encodeURIComponent(cred.token)}`;
        const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
        if (!res.ok) {
            const empty = { email: null, phone: null, agencyName: null };
            agencyMetaCache.set(target, empty);
            return empty;
        }
        const json = (await res.json()) as any;
        const bd = json?.business_discovery;
        const agBio = String(bd?.biography || "");
        const agWeb = String(bd?.website || "");
        const agName = String(bd?.name || `@${target}`).trim();

        const rawEmails = agBio.match(EMAIL_RE) || [];
        let phone = cleanPhones(agBio);

        // If agency bio didn't have an email directly, check the agency's website (1 hop)
        if (cleanEmails(rawEmails).allEmails.length === 0 && agWeb) {
            const webRes = await mineExternalLinkContacts(agWeb);
            rawEmails.push(...webRes.emails);
            if (!phone) phone = webRes.phone;
        }

        const cleaned = cleanEmails(rawEmails);
        const result = {
            email: cleaned.primaryEmail || cleaned.agencyEmail || null,
            phone,
            agencyName: cleaned.primaryEmail || cleaned.agencyEmail || phone ? agName : null,
        };
        agencyMetaCache.set(target, result);
        return result;
    } catch {
        return { email: null, phone: null, agencyName: null };
    }
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

    // 3. Meta-First Hydration (Official Free Meta IG_ACCESS_TOKEN first -> 2x faster & zero datacenter IG blocks on Vercel/VPS!)
    const graphOrOg = await lookupAndSyncInstagramProfile(query, {
        token: existing?.intakeToken || existing?.id || "new",
        handle: cleanHandle,
    });

    // Only call unauthenticated web_profile_info fallback if Official Meta business_discovery didn't return profile
    const webProf =
        graphOrOg?.source === "business_discovery" && graphOrOg.followersCount
            ? null
            : await fetchWebProfileInfo(cleanHandle);

    const externalUrl =
        graphOrOg?.website ||
        webProf?.externalUrl ||
        existing?.instagramInsights?.externalUrl ||
        null;

    // 4. Mine Bio -> Linktree/Website -> 60-Agency Directory FIRST (0 Serper credits), and ONLY call Serper if still missing email!
    const existingCleanBio =
        existing?.publicBio && !/Followers,.*Following,.*Posts\s*-\s*See Instagram photos/i.test(existing.publicBio)
            ? existing.publicBio
            : "";
    const bioText =
        graphOrOg?.biography ||
        webProf?.biography ||
        existingCleanBio ||
        reelMeta.caption ||
        "";

    const matchedAgencyFromBio = resolveIndianAgencyFromBio(bioText);

    const initialEmails: string[] = [
        ...(webProf?.businessEmail ? [webProf.businessEmail] : []),
        ...(existing?.primaryEmail ? [existing.primaryEmail] : []),
        ...(bioText.match(EMAIL_RE) || []),
        ...(reelMeta.caption ? reelMeta.caption.match(EMAIL_RE) || [] : []),
        ...(matchedAgencyFromBio?.agencyEmail ? [matchedAgencyFromBio.agencyEmail] : []),
    ];

    let linktreeResult: { emails: string[]; phone: string | null } = { emails: [], phone: null };
    if (externalUrl && cleanEmails(initialEmails).allEmails.length === 0) {
        linktreeResult = await mineExternalLinkContacts(externalUrl);
    }

    // Upgrade 2 ($0): If still missing email, auto-resolve mentioned @agency / @brand handle via Free Meta Graph
    let mentionedAgencyMeta: { email: string | null; phone: string | null; agencyName: string | null } = {
        email: null,
        phone: null,
        agencyName: null,
    };
    if (cleanEmails([...initialEmails, ...linktreeResult.emails]).allEmails.length === 0 && bioText.includes("@")) {
        mentionedAgencyMeta = await resolveMentionedAgencyViaMetaGraph(bioText, cleanHandle);
    }

    let serperData: Awaited<ReturnType<typeof enrichViaSerperSearch>> = { emails: [], phone: null };
    const preSerperClean = cleanEmails([
        ...initialEmails,
        ...linktreeResult.emails,
        ...(mentionedAgencyMeta.email ? [mentionedAgencyMeta.email] : []),
    ]);
    if (preSerperClean.allEmails.length === 0 || (!graphOrOg?.followersCount && !webProf?.followersCount)) {
        serperData = await enrichViaSerperSearch(cleanHandle);
    }

    const { primaryEmail: cleanedPrimaryEmail, agencyEmail: cleanedAgencyEmail, allEmails } = cleanEmails([
        ...initialEmails,
        ...linktreeResult.emails,
        ...(mentionedAgencyMeta.email ? [mentionedAgencyMeta.email] : []),
        ...serperData.emails,
    ]);

    const primaryEmail = cleanedPrimaryEmail;
    const agencyEmail = cleanedAgencyEmail || matchedAgencyFromBio?.agencyEmail || mentionedAgencyMeta.email || null;

    const phone =
        existing?.whatsappNumber ||
        existing?.phone ||
        webProf?.businessPhone ||
        cleanPhones(bioText) ||
        linktreeResult.phone ||
        mentionedAgencyMeta.phone ||
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

    // 7. Category, City, Management, Brand Affinity & LLM Multi-Post Caption Analysis
    const recentMediaList =
        (graphOrOg?.recentMedia && graphOrOg.recentMedia.length > 0
            ? graphOrOg.recentMedia
            : webProf?.recentMedia) ||
        existing?.instagramInsights?.recentMedia ||
        [];
    const recentCaptions: string[] = recentMediaList.map((m: any) => m?.caption).filter(Boolean);
    if (reelMeta.caption && !recentCaptions.includes(reelMeta.caption)) {
        recentCaptions.unshift(reelMeta.caption);
    }

    const combinedContext = `${bioText} ${recentCaptions.join(" ")} ${webProf?.categoryName || ""} ${opts.brand || ""}`;
    const loc = inferCityFromText(combinedContext);

    const fullName =
        graphOrOg?.fullName ||
        webProf?.fullName ||
        serperData.fullName ||
        existing?.fullName ||
        cleanHandle;

    // Run LLM Multi-Post Caption & Bio Analyst (gpt-4o-mini) when we have bio or post captions
    const llmAnalysis = await analyzeCreatorBioAndCaptionsWithLlm({
        handle: cleanHandle,
        fullName,
        bio: bioText,
        city: existing?.city || loc.city || null,
        recentCaptions,
    });

    const resolvedCategory =
        (opts.category && opts.category !== "all" ? opts.category : null) ||
        llmAnalysis?.primaryCategory ||
        (existing?.category && existing.category !== "Creator" ? existing.category : null) ||
        inferCategoryFromText(combinedContext, "Lifestyle");

    const subGenres: string[] =
        llmAnalysis?.subNiches && llmAnalysis.subNiches.length > 0
            ? llmAnalysis.subNiches
            : Array.isArray(existing?.subGenres)
              ? existing.subGenres
              : [];

    const contentLanguages: string[] =
        llmAnalysis?.contentLanguages && llmAnalysis.contentLanguages.length > 0
            ? llmAnalysis.contentLanguages
            : Array.isArray(existing?.languages) && existing.languages.length > 0
              ? existing.languages
              : ["English"];

    const city = existing?.city || llmAnalysis?.detectedCity || loc.city || null;
    const state = existing?.state || llmAnalysis?.detectedState || loc.state || null;

    const sampleReelUrl =
        parsed.reelUrl ||
        existing?.sampleReelUrl ||
        graphOrOg?.recentMedia?.[0]?.permalink ||
        webProf?.recentMedia?.[0]?.permalink ||
        null;

    const brandAffinity =
        opts.brand ||
        existing?.brandAffinity ||
        (reelMeta.brandMentions && reelMeta.brandMentions.length > 0 ? reelMeta.brandMentions[0] : null);

    const agencyDomain = agencyEmail ? agencyEmail.split("@")[1]?.split(".")[0] : null;
    const agencyName =
        matchedAgencyFromBio?.agencyName ||
        existing?.agencyName ||
        (agencyDomain ? agencyDomain.charAt(0).toUpperCase() + agencyDomain.slice(1) + " Talent" : null);
    const managementType = existing?.managementType || (agencyName ? "agency" : "self");

    const isVerified = Boolean(webProf?.isVerified || graphOrOg?.isVerified || existing?.isVerified);
    const igConnected = Boolean(existing?.igConnected || graphOrOg?.igConnected);

    // 7b. Run Smart Multi-Signal Indian & Human Creator Verification + LLM Account Type Override
    const verification = evaluateIndiaAndCreatorAuthenticity({
        handle: cleanHandle,
        fullName,
        bio: bioText,
        caption: recentCaptions.join(" "),
        categoryName: webProf?.categoryName || null,
        primaryEmail,
        agencyEmail,
        phone,
        externalUrl,
        city,
        state,
        brand: brandAffinity,
        followersCount,
        isIgVerified: isVerified,
    });

    if (llmAnalysis?.accountType === "BRAND_STORE" || llmAnalysis?.accountType === "MEME_PAGE") {
        verification.isBrandOrStoreAccount = true;
        verification.isVerifiedHumanCreator = false;
        verification.isIndianCreator = false;
    } else if (llmAnalysis?.originRegion === "FOREIGN") {
        verification.isIndianCreator = false;
    } else if (
        llmAnalysis?.accountType === "HUMAN_CREATOR" &&
        (llmAnalysis.originRegion === "INDIA" || llmAnalysis.originRegion === "INDIAN_DIASPORA") &&
        !verification.isBrandOrStoreAccount
    ) {
        verification.isIndianCreator = true;
        verification.indiaConfidenceScore = Math.max(verification.indiaConfidenceScore, 75);
        if (llmAnalysis.originRegion === "INDIAN_DIASPORA" && !contentLanguages.includes("Indian Diaspora (NRI)")) {
            contentLanguages.push("Indian Diaspora (NRI)");
        }
    }

    const enrichedInsights = {
        ...(existing?.instagramInsights || {}),
        ...(graphOrOg || {}),
        handle: cleanHandle,
        fullName,
        biography: bioText || undefined,
        website: externalUrl || undefined,
        externalUrl: externalUrl || undefined,
        profilePictureUrl:
            graphOrOg?.profilePictureUrl ||
            webProf?.profilePictureUrl ||
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
        subGenres,
        contentLanguages,
        originRegion: llmAnalysis?.originRegion || "INDIA",
        agencyPitchSummary: llmAnalysis?.agencyPitchSummary || undefined,
        indiaConfidenceScore: verification.indiaConfidenceScore,
        indiaSignals: verification.indiaSignals,
        isIndianCreator: verification.isIndianCreator,
        isVerifiedHumanCreator: verification.isVerifiedHumanCreator,
        isBrandOrStoreAccount: verification.isBrandOrStoreAccount,
        authenticityScore: verification.authenticityScore,
        authenticitySignals: verification.authenticitySignals,
        recentMedia: recentMediaList,
        syncedAt: new Date().toISOString(),
    };

    // If running automated brand discovery (not an explicit user handle query) and this is a brand store or non-Indian account, skip storing
    if (opts.brand && !opts.forceRefresh && (verification.isBrandOrStoreAccount || !verification.isIndianCreator)) {
        return null;
    }

    // 8. Auto-Store (UPSERT) into PostgreSQL "Creator" table
    const formattedHandle = existing?.handle || `@${cleanHandle}`;
    const id = existing?.id || `crt_${crypto.randomBytes(8).toString("hex")}`;
    const intakeToken = existing?.intakeToken || `tok_${crypto.randomBytes(10).toString("hex")}`;
    const profileUrl = `https://www.instagram.com/${cleanHandle}/`;

    const upsertedRows = await query<any>(
        `INSERT INTO "Creator" (
            "id", "workspaceId", "handle", "platform", "fullName", "profileUrl",
            "primaryEmail", "phone", "whatsappNumber",
            "followersRaw", "followersCount", "followingCount", "postsCount",
            "publicBio", "category", "subGenres", "languages", "brandAffinity", "sampleReelUrl",
            "discoveryKeyword", "discoveryEngine", "isVerified", "indiaSignal",
            "city", "state", "managementType", "agencyName",
            "intakeToken", "intakeStatus", "intakeCompletionPct",
            "instagramInsights", "igConnected", "igLastSyncedAt",
            "createdAt", "updatedAt"
        ) VALUES (
            $1, $2, $3, 'instagram', $4, $5,
            $6, $7, $8,
            $9, $10, $11, $12,
            $13, $14, $27::text[], $28::text[], $15, $16,
            $17, 'TBM 4-Tier Live Scout Engine', $18, $26,
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
            "category" = COALESCE(NULLIF(EXCLUDED."category", ''), "Creator"."category"),
            "subGenres" = CASE WHEN array_length(EXCLUDED."subGenres", 1) > 0 THEN EXCLUDED."subGenres" ELSE "Creator"."subGenres" END,
            "languages" = CASE WHEN array_length(EXCLUDED."languages", 1) > 0 THEN EXCLUDED."languages" ELSE "Creator"."languages" END,
            "brandAffinity" = COALESCE(EXCLUDED."brandAffinity", "Creator"."brandAffinity"),
            "sampleReelUrl" = COALESCE(EXCLUDED."sampleReelUrl", "Creator"."sampleReelUrl"),
            "city" = COALESCE(EXCLUDED."city", "Creator"."city"),
            "state" = COALESCE(EXCLUDED."state", "Creator"."state"),
            "managementType" = COALESCE(EXCLUDED."managementType", "Creator"."managementType"),
            "agencyName" = COALESCE(EXCLUDED."agencyName", "Creator"."agencyName"),
            "isVerified" = ("Creator"."isVerified" OR EXCLUDED."isVerified"),
            "indiaSignal" = EXCLUDED."indiaSignal",
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
            isVerified || verification.isVerifiedHumanCreator,
            city,
            state,
            managementType,
            agencyName,
            intakeToken,
            JSON.stringify(enrichedInsights),
            igConnected,
            verification.isIndianCreator,
            subGenres,
            contentLanguages,
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

function extractDirectHandleFromInput(urlOrHandle: string): string | null {
    const parsed = parseCreatorInput(urlOrHandle);
    return parsed.handle || null;
}

/**
 * Option 2 Native Instagram Search via SocialCrawl (/v1/instagram/search/reels & /v1/instagram/search/profiles):
 * Pre-filters returned profiles for 5,000 to 50,000,000 followers + Verified Indian Human Creator,
 * and caches profile objects in socialCrawlProfileCache so 0 extra credits are spent on profile metadata!
 */
async function searchSocialCrawlInstagram(params: {
    brand?: string;
    keyword?: string;
    category?: string;
    city?: string;
}): Promise<string[]> {
    const scKey = getSocialCrawlKey();
    if (!scKey) return [];

    const brand = (params.brand || "").trim();
    const keyword = (params.keyword || "").trim();
    const category = (params.category || "").trim();
    const city = (params.city || "").trim();
    const baseTerm = [brand, keyword, category].filter(Boolean).join(" ").trim();
    if (!baseTerm) return [];

    const reelQuery = [brand || keyword, category, city].filter(Boolean).join(" ").trim();
    const geoAnchor = city || (/\b(india|mumbai|delhi|bangalore|bengaluru|pune|hyderabad|chennai|kolkata)\b/i.test(baseTerm) ? "" : "india");
    const profileQuery = [keyword || category || brand, "creator", geoAnchor].filter(Boolean).join(" ").trim();
    const brandCleaned = (brand || keyword).toLowerCase().replace(/[^a-z0-9]/g, "");

    const discoveredHandles: string[] = [];

    const [reelsRes, profilesRes] = await Promise.all([
        fetch(`https://www.socialcrawl.dev/v1/instagram/search/reels?query=${encodeURIComponent(reelQuery)}`, {
            headers: { "x-api-key": scKey },
            signal: AbortSignal.timeout(18000),
        })
            .then((r) => (r.ok ? r.json() : null))
            .catch(() => null),
        fetch(`https://www.socialcrawl.dev/v1/instagram/search/profiles?query=${encodeURIComponent(profileQuery)}`, {
            headers: { "x-api-key": scKey },
            signal: AbortSignal.timeout(18000),
        })
            .then((r) => (r.ok ? r.json() : null))
            .catch(() => null),
    ]);

    // 1. Extract creator handles from native Instagram Reels Search
    const reelItems: any[] = Array.isArray(reelsRes?.data?.items) ? reelsRes.data.items : [];
    for (const item of reelItems) {
        const post = item?.post;
        const username = String(post?.author?.username || "").toLowerCase().trim();
        if (!username) continue;
        const hAlpha = username.replace(/[^a-z0-9]/g, "");
        if (
            brandCleaned.length >= 3 &&
            (hAlpha === brandCleaned || hAlpha.startsWith(brandCleaned) || hAlpha.startsWith(`lets${brandCleaned}`) || hAlpha.startsWith(`my${brandCleaned}`))
        ) {
            continue;
        }
        const handleToken = `@${username}`;
        if (!discoveredHandles.includes(handleToken)) {
            discoveredHandles.push(handleToken);
        }
    }

    // 2. Extract & pre-filter creator profiles from native Instagram Profiles Search (1 credit returns up to 20 profiles with followers & bio!)
    const profileItems: any[] = Array.isArray(profilesRes?.data?.items) ? profilesRes.data.items : [];
    for (const item of profileItems) {
        const author = item?.author;
        const username = String(author?.username || "").toLowerCase().trim();
        if (!username) continue;

        const followers = Number(author?.followers || 0);
        // Enforce 5K to 50M Follower Gate
        if (followers > 0 && (followers < 5000 || followers > 50_000_000)) {
            continue;
        }

        // Pre-evaluate Brand Store & Indian Creator authenticity (0 extra credits!)
        const ev = evaluateIndiaAndCreatorAuthenticity({
            handle: username,
            fullName: author?.display_name,
            bio: author?.bio,
            externalUrl: author?.external_url,
            brand: brand || undefined,
            followersCount: followers,
            isIgVerified: Boolean(author?.verified),
        });
        if (ev.isBrandOrStoreAccount || !ev.isIndianCreator) {
            continue;
        }

        // Cache author so scoutAndAutoStoreCreator doesn't spend another credit fetching basic profile info
        socialCrawlProfileCache.set(username, author);
        const handleToken = `@${username}`;
        if (!discoveredHandles.includes(handleToken)) {
            discoveredHandles.push(handleToken);
        }
    }

    return discoveredHandles;
}

/**
 * Live Brand / Keyword / Category Discovery via Unified Instagram Search + Google Video/Web Search + Contacts DB Brands:
 * Works dynamically for ANY brand (from our 15,117+ Contacts DB brands or any brand-new startup) or free-text query.
 * Supports searchEngine: "both" | "instagram" | "google"
 */
export async function discoverCreatorsByBrandOrKeyword(
    params: {
        brand?: string;
        keyword?: string;
        category?: string;
        searchEngine?: "both" | "instagram" | "google";
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
    matchedDbBrand?: { name: string; domain: string; totalContacts: number } | null;
}> {
    const workspaceId = params.workspaceId || "org_troops_outreach";
    const limit = Math.min(Math.max(params.limit || 15, 1), 50);
    let brand = (params.brand || "").trim();
    const keyword = (params.keyword || "").trim();
    const category = (params.category && params.category !== "all" ? params.category : "").trim();
    const engineMode = params.searchEngine || "both";

    // Cross-check against our live PostgreSQL "Brand" table (15,117+ brands from Contacts DB)
    let matchedDbBrand: { name: string; domain: string; totalContacts: number } | null = null;
    const lookupTerm = brand || keyword;
    if (lookupTerm && lookupTerm.length >= 2) {
        const dbBrandRows = await query<any>(
            `SELECT "name", "domain", "totalContacts"
             FROM "Brand"
             WHERE lower("name") = lower($1)
                OR lower("domain") = lower($1)
                OR lower("name") LIKE lower($2)
             ORDER BY "totalContacts" DESC NULLS LAST
             LIMIT 1`,
            [lookupTerm, `${lookupTerm}%`]
        ).catch(() => []);
        if (dbBrandRows?.[0]) {
            matchedDbBrand = {
                name: dbBrandRows[0].name,
                domain: dbBrandRows[0].domain,
                totalContacts: Number(dbBrandRows[0].totalContacts || 0),
            };
            if (!brand && matchedDbBrand.name) {
                brand = matchedDbBrand.name;
            }
        }
    }

    const queryParts: string[] = [];
    if (brand) queryParts.push(`"${brand}"`);
    if (keyword && keyword.toLowerCase() !== brand.toLowerCase()) queryParts.push(`"${keyword}"`);
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

    // 2. Execute Live Instagram Search & Google Search via Serper India Index (gl: "in")
    const subjectTerm = [brand, keyword, category].filter(Boolean).join(" ").trim();
    if (subjectTerm) {
        const searchPromises: Promise<any>[] = [];

        // A. Google Reel / Video Search (discovers creators who posted Reels featuring the brand/topic)
        if (engineMode === "both" || engineMode === "google") {
            const googleReelQuery = `${subjectTerm} (reel OR review OR collab) site:instagram.com/reel/`.trim();
            searchPromises.push(serperRequest("videos", { q: googleReelQuery, gl: "in", hl: "en", num: 20 }));
            searchPromises.push(serperRequest("search", { q: googleReelQuery, gl: "in", hl: "en", num: 15 }));
        }

        // B. Instagram Profile & Handle Search (Option 2 SocialCrawl Native IG Search + Serper IG Index)
        if (engineMode === "both" || engineMode === "instagram") {
            const scHandles = await searchSocialCrawlInstagram({ brand, keyword, category });
            for (const h of scHandles) {
                if (!candidateInputs.includes(h)) candidateInputs.push(h);
            }

            const igProfileQuery = `${subjectTerm} ("creator" OR "blogger" OR "collab" OR "followers" OR "@gmail.com") site:instagram.com -inurl:/reel/ -inurl:/p/`.trim();
            searchPromises.push(serperRequest("search", { q: igProfileQuery, gl: "in", hl: "en", num: 15 }));

            // If user typed a single word/handle candidate, also check direct Instagram handle
            const handleCandidate = (keyword || brand).replace(/^@+/, "").trim().toLowerCase();
            if (/^[a-z0-9_.]{3,30}$/.test(handleCandidate) && !candidateInputs.includes(handleCandidate)) {
                candidateInputs.push(`@${handleCandidate}`);
            }
        }

        const responses = await Promise.all(searchPromises);
        for (const res of responses) {
            if (!res) continue;
            const videoItems: any[] = Array.isArray(res?.videos) ? res.videos : [];
            for (const it of videoItems) {
                const link = String(it?.link || "").split("?")[0];
                if (link.includes("instagram.com/reel/") && !candidateInputs.includes(link)) {
                    candidateInputs.push(link);
                }
            }
            const organicItems: any[] = Array.isArray(res?.organic) ? res.organic : [];
            for (const it of organicItems) {
                const link = String(it?.link || "").split("?")[0];
                if (link.includes("instagram.com/") && !candidateInputs.includes(link)) {
                    candidateInputs.push(link);
                }
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
            // Exclude official brand store accounts from creator discovery results
            if (r.instagramInsights?.isBrandOrStoreAccount) continue;
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
        matchedDbBrand,
    };
}

/**
 * Phase 1 Fast Discovery (< 2 seconds, Vercel timeout-proof):
 * Immediately returns:
 * 1. Matching creators already in our PostgreSQL "Creator" table
 * 2. Matched Brand from our 15,117+ Contacts DB ("Brand" table)
 * 3. Live candidate Instagram URLs / @handles discovered from Instagram Search + Google Video Search
 * so the frontend can display DB results in 200ms and progressively enrich new candidates 3 at a time!
 */
export async function discoverCandidateCreatorsFast(
    params: {
        brand?: string;
        keyword?: string;
        category?: string;
        city?: string;
        searchEngine?: "both" | "instagram" | "google";
        limit?: number;
    },
    query: QueryFn = pgQuery
): Promise<{
    candidateUrls: string[];
    matchedDbBrand: { name: string; domain: string; totalContacts: number } | null;
    dorkQuery: string;
}> {
    let brand = (params.brand || "").trim();
    const keyword = (params.keyword || "").trim();
    const category = (params.category && params.category !== "all" ? params.category : "").trim();
    const city = (params.city || "").trim();
    const engineMode = params.searchEngine || "both";
    const limit = Math.min(Math.max(params.limit || 18, 3), 40);

    let matchedDbBrand: { name: string; domain: string; totalContacts: number } | null = null;
    const lookupTerm = brand || keyword;
    if (lookupTerm && lookupTerm.length >= 2) {
        const dbBrandRows = await query<any>(
            `SELECT "name", "domain", "totalContacts"
             FROM "Brand"
             WHERE lower("name") = lower($1)
                OR lower("domain") = lower($1)
                OR lower("name") LIKE lower($2)
             ORDER BY "totalContacts" DESC NULLS LAST
             LIMIT 1`,
            [lookupTerm, `${lookupTerm}%`]
        ).catch(() => []);
        if (dbBrandRows?.[0]) {
            matchedDbBrand = {
                name: dbBrandRows[0].name,
                domain: dbBrandRows[0].domain,
                totalContacts: Number(dbBrandRows[0].totalContacts || 0),
            };
            if (!brand && matchedDbBrand.name) {
                brand = matchedDbBrand.name;
            }
        }
    }

    const subjectTerm = [brand, keyword, category, city].filter(Boolean).join(" ").trim();
    const dorkQuery = `${subjectTerm} (reel OR review OR collab) site:instagram.com/reel/`.trim();
    const candidateUrls: string[] = [];

    if (subjectTerm) {
        const searchPromises: Promise<any>[] = [];
        if (engineMode === "both" || engineMode === "google") {
            searchPromises.push(serperRequest("videos", { q: dorkQuery, gl: "in", hl: "en", num: 20 }));
            searchPromises.push(serperRequest("search", { q: dorkQuery, gl: "in", hl: "en", num: 15 }));
        }
        if (engineMode === "both" || engineMode === "instagram") {
            const scHandles = await searchSocialCrawlInstagram({ brand, keyword, category, city });
            for (const h of scHandles) {
                if (!candidateUrls.includes(h)) candidateUrls.push(h);
            }
            const igProfileQuery = `${subjectTerm} ("creator" OR "blogger" OR "collab" OR "@gmail.com" OR "India") site:instagram.com -inurl:/reel/ -inurl:/p/`.trim();
            searchPromises.push(serperRequest("search", { q: igProfileQuery, gl: "in", hl: "en", num: 15 }));
        }

        const responses = await Promise.all(searchPromises);
        const brandCleaned = (brand || keyword).toLowerCase().replace(/[^a-z0-9]/g, "");

        for (const res of responses) {
            if (!res) continue;
            const allItems = [...(Array.isArray(res?.videos) ? res.videos : []), ...(Array.isArray(res?.organic) ? res.organic : [])];
            for (const it of allItems) {
                const link = String(it?.link || "").split("?")[0];
                if (!link.includes("instagram.com/")) continue;
                // Skip if the profile link is literally the brand's own handle
                const handleCandidate = extractDirectHandleFromInput(link);
                if (handleCandidate && brandCleaned.length >= 3) {
                    const hAlpha = handleCandidate.replace(/[^a-z0-9]/g, "");
                    if (
                        hAlpha === brandCleaned ||
                        hAlpha.startsWith(brandCleaned) ||
                        hAlpha.startsWith(`lets${brandCleaned}`) ||
                        hAlpha.startsWith(`my${brandCleaned}`)
                    ) {
                        continue;
                    }
                }
                if (!candidateUrls.includes(link)) {
                    candidateUrls.push(link);
                }
            }
        }
    }

    return {
        candidateUrls: candidateUrls.slice(0, limit),
        matchedDbBrand,
        dorkQuery,
    };
}

export function getActiveLookalikeProvider(): "hikerapi" | "rapidapi" | "socialcrawl" | "none" {
    if (process.env.HIKERAPI_TOKEN?.trim()) return "hikerapi";
    if (process.env.RAPIDAPI_KEY?.trim()) return "rapidapi";
    if (getSocialCrawlKey()) return "socialcrawl";
    return "none";
}

/**
 * Engine 1: Pluggable Instagram "Lookalike / Suggested Similar Profiles" Graph Expansion (1 -> 55 Lookalikes):
 * Automatically selects the lowest-cost configured provider:
 * 1. HikerAPI (HIKERAPI_TOKEN — ~$0.001/call, 4x-5x cheaper at 100K-1M scale)
 * 2. RapidAPI Instagram Scraper API2 (RAPIDAPI_KEY — flat monthly tier)
 * 3. SocialCrawl (SOCIALCRAWL_API_KEY — verified live, 55 lookalikes in 2.4s)
 */
export async function discoverSimilarLookalikeHandles(
    seedHandle: string,
    limit: number = 50
): Promise<{
    seedHandle: string;
    provider: string;
    lookalikes: Array<{ handle: string; fullName: string; isVerified: boolean; avatarUrl?: string }>;
    candidateUrls: string[];
}> {
    const cleanSeed = String(seedHandle || "").replace(/^@+/, "").trim().toLowerCase();
    if (!cleanSeed) {
        return { seedHandle: "@", provider: "none", lookalikes: [], candidateUrls: [] };
    }

    const lookalikes: Array<{ handle: string; fullName: string; isVerified: boolean; avatarUrl?: string }> = [];
    const candidateUrls: string[] = [];

    // 1. Cheapest Option: HikerAPI (/v1/user/chaining)
    const hikerKey = process.env.HIKERAPI_TOKEN?.trim();
    if (hikerKey) {
        try {
            const uRes = await fetch(`https://api.hikerapi.com/v1/user/by/username?username=${encodeURIComponent(cleanSeed)}`, {
                headers: { "x-access-key": hikerKey },
                signal: AbortSignal.timeout(12000),
            });
            if (uRes.ok) {
                const uJson = (await uRes.json()) as any;
                const pk = uJson?.pk || uJson?.id;
                if (pk) {
                    const chRes = await fetch(`https://api.hikerapi.com/v1/user/chaining?user_id=${encodeURIComponent(String(pk))}`, {
                        headers: { "x-access-key": hikerKey },
                        signal: AbortSignal.timeout(15000),
                    });
                    if (chRes.ok) {
                        const chData = (await chRes.json()) as any;
                        const items: any[] = Array.isArray(chData) ? chData : Array.isArray(chData?.users) ? chData.users : [];
                        for (const u of items) {
                            const username = String(u?.username || "").toLowerCase().trim();
                            if (!username || username === cleanSeed) continue;
                            lookalikes.push({
                                handle: `@${username}`,
                                fullName: u?.full_name || username,
                                isVerified: Boolean(u?.is_verified),
                                avatarUrl: u?.profile_pic_url || undefined,
                            });
                            candidateUrls.push(`@${username}`);
                            if (candidateUrls.length >= limit) break;
                        }
                        if (candidateUrls.length > 0) {
                            return { seedHandle: `@${cleanSeed}`, provider: "hikerapi", lookalikes, candidateUrls };
                        }
                    }
                }
            }
        } catch {}
    }

    // 2. Flat-Rate Option: RapidAPI Instagram Scraper API2 (/v1/similar_accounts)
    const rapidKey = process.env.RAPIDAPI_KEY?.trim();
    const rapidHost = process.env.RAPIDAPI_IG_HOST?.trim() || "instagram-scraper-api2.p.rapidapi.com";
    if (rapidKey) {
        try {
            const rRes = await fetch(
                `https://${rapidHost}/v1/similar_accounts?username_or_id_or_url=${encodeURIComponent(cleanSeed)}`,
                {
                    headers: {
                        "x-rapidapi-key": rapidKey,
                        "x-rapidapi-host": rapidHost,
                    },
                    signal: AbortSignal.timeout(15000),
                }
            );
            if (rRes.ok) {
                const rJson = (await rRes.json()) as any;
                const items: any[] = Array.isArray(rJson?.data?.items) ? rJson.data.items : Array.isArray(rJson?.items) ? rJson.items : [];
                for (const u of items) {
                    const username = String(u?.username || "").toLowerCase().trim();
                    if (!username || username === cleanSeed) continue;
                    lookalikes.push({
                        handle: `@${username}`,
                        fullName: u?.full_name || username,
                        isVerified: Boolean(u?.is_verified),
                        avatarUrl: u?.profile_pic_url || undefined,
                    });
                    candidateUrls.push(`@${username}`);
                    if (candidateUrls.length >= limit) break;
                }
                if (candidateUrls.length > 0) {
                    return { seedHandle: `@${cleanSeed}`, provider: "rapidapi", lookalikes, candidateUrls };
                }
            }
        } catch {}
    }

    // 3. Verified Active Option: SocialCrawl (/v1/instagram/similar)
    const scKey = getSocialCrawlKey();
    if (scKey) {
        try {
            const res = await fetch(
                `https://www.socialcrawl.dev/v1/instagram/similar?handle=${encodeURIComponent(cleanSeed)}`,
                {
                    headers: { "x-api-key": scKey },
                    signal: AbortSignal.timeout(20000),
                }
            );
            if (res.ok) {
                const data = (await res.json()) as any;
                const items: any[] = Array.isArray(data?.data?.items) ? data.data.items : [];
                for (const it of items) {
                    const author = it?.author;
                    const username = String(author?.username || "").toLowerCase().trim();
                    if (!username || username === cleanSeed) continue;
                    lookalikes.push({
                        handle: `@${username}`,
                        fullName: author?.display_name || username,
                        isVerified: Boolean(author?.verified),
                        avatarUrl: author?.avatar_url || undefined,
                    });
                    candidateUrls.push(`@${username}`);
                    if (candidateUrls.length >= limit) break;
                }
                return { seedHandle: `@${cleanSeed}`, provider: "socialcrawl", lookalikes, candidateUrls };
            }
        } catch {}
    }

    return { seedHandle: `@${cleanSeed}`, provider: "none", lookalikes, candidateUrls };
}

/**
 * Searches our live PostgreSQL "Brand" table (15,117+ brands from Contacts DB) + Creator brand affinities
 * so any brand in our contacts database (plus any new brand) is searchable and linked.
 */
export async function searchDatabaseBrands(
    searchQuery: string,
    limit: number = 25,
    query: QueryFn = pgQuery
): Promise<{ name: string; domain: string; totalContacts: number; creatorCount: number }[]> {
    const q = (searchQuery || "").trim();
    const likePattern = q ? `%${q.toLowerCase()}%` : "%";
    const safeLimit = Math.min(Math.max(Number(limit) || 25, 1), 100);

    const [brandRows, creatorBrands] = await Promise.all([
        query<any>(
            `SELECT "name", "domain", COALESCE("totalContacts", 0)::int as "totalContacts"
             FROM "Brand"
             WHERE "name" IS NOT NULL AND "name" <> ''
               AND ($1 = '%' OR lower("name") LIKE $1 OR lower("domain") LIKE $1)
             ORDER BY COALESCE("totalContacts", 0) DESC, "name" ASC
             LIMIT $2`,
            [likePattern, safeLimit]
        ).catch(() => []),
        query<any>(
            `SELECT "brandAffinity" as name, count(*)::int as "creatorCount"
             FROM "Creator"
             WHERE "brandAffinity" IS NOT NULL AND "brandAffinity" <> ''
               AND ($1 = '%' OR lower("brandAffinity") LIKE $1)
             GROUP BY 1
             ORDER BY "creatorCount" DESC
             LIMIT $2`,
            [likePattern, safeLimit]
        ).catch(() => []),
    ]);

    const merged = new Map<string, { name: string; domain: string; totalContacts: number; creatorCount: number }>();

    for (const cb of creatorBrands || []) {
        const key = String(cb.name).toLowerCase().trim();
        merged.set(key, {
            name: cb.name,
            domain: "",
            totalContacts: 0,
            creatorCount: Number(cb.creatorCount || 0),
        });
    }

    for (const b of brandRows || []) {
        const cleanName = String(b.name).split(":")[0].trim();
        const key = cleanName.toLowerCase();
        const existing = merged.get(key);
        if (existing) {
            existing.domain = b.domain || existing.domain;
            existing.totalContacts = Math.max(existing.totalContacts, Number(b.totalContacts || 0));
        } else {
            merged.set(key, {
                name: cleanName,
                domain: b.domain || "",
                totalContacts: Number(b.totalContacts || 0),
                creatorCount: 0,
            });
        }
    }

    return Array.from(merged.values()).slice(0, 30);
}
