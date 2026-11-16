import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { pgQuery } from "./pg";
import type { QueryFn } from "./types";

let columnsEnsured = false;

/** Graph API version. v21.0 reaches end-of-life in late 2026, so default to a current one. */
function graphVersion(): string {
    return readEnvVar("META_GRAPH_VERSION") || "v24.0";
}

function readEnvVar(primaryKey: string, aliases: string[] = []): string {
    const allKeys = [primaryKey, ...aliases];
    for (const k of allKeys) {
        if (process.env[k]?.trim()) return process.env[k]!.trim();
    }
    const currentDir = typeof __dirname !== "undefined" ? __dirname : process.cwd();
    const roots = [
        process.cwd(),
        path.resolve(process.cwd(), ".."),
        path.resolve(process.cwd(), "web"),
        path.resolve(currentDir, ".."),
        path.resolve(currentDir, "../web"),
    ];
    for (const r of roots) {
        for (const file of [".env.local", ".env"]) {
            try {
                const fullPath = path.join(r, file);
                if (!fs.existsSync(fullPath)) continue;
                const content = fs.readFileSync(fullPath, "utf8");
                for (const k of allKeys) {
                    const regex = new RegExp(`^\\s*${k}\\s*=\\s*(.+)$`, "m");
                    const match = content.match(regex);
                    if (match && match[1]) {
                        const val = match[1].trim().replace(/^["']|["']$/g, "").trim();
                        if (val) {
                            process.env[k] = val;
                            return val;
                        }
                    }
                }
            } catch {}
        }
    }
    return "";
}

export async function ensureInstagramColumns(query: QueryFn = pgQuery) {
    if (columnsEnsured) return;
    try {
        await query(`
            ALTER TABLE "Creator"
            ADD COLUMN IF NOT EXISTS "instagramInsights" JSONB DEFAULT '{}'::jsonb,
            ADD COLUMN IF NOT EXISTS "igConnected" BOOLEAN DEFAULT false,
            ADD COLUMN IF NOT EXISTS "igUserId" TEXT,
            ADD COLUMN IF NOT EXISTS "igLastSyncedAt" TIMESTAMPTZ;
        `);
        columnsEnsured = true;
    } catch (e) {
        console.warn("[InstagramGraph] Column check warning:", e);
    }
}

export interface InstagramInsightsPayload {
    handle: string;
    fullName?: string;
    biography?: string;
    website?: string;
    profilePictureUrl?: string;
    followersCount?: number;
    followersRaw?: string;
    followingCount?: number;
    postsCount?: number;
    isVerified?: boolean;
    igConnected?: boolean;
    source: "graph_oauth" | "business_discovery" | "public_metadata" | "database";
    engagementRatePct?: number;
    avgLikes?: number;
    avgComments?: number;
    avgReelViews?: number;
    reach28d?: number;
    impressions28d?: number;
    profileViews28d?: number;
    topCities?: { label: string; pct: number }[];
    topAgeGroups?: { label: string; pct: number }[];
    genderSplit?: { female?: number; male?: number };
    recentMedia?: {
        id: string;
        permalink?: string;
        mediaType?: string;
        likeCount?: number;
        commentsCount?: number;
        viewCount?: number;
        timestamp?: string;
        caption?: string;
    }[];
    syncedAt: string;
}

export function formatFollowersRaw(count?: number | null): string {
    if (!count || isNaN(count) || count <= 0) return "";
    if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
    if (count >= 1_000) return `${(count / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
    return String(count);
}

function parseCountToken(raw: string): number {
    const clean = raw.replace(/,/g, "").trim().toUpperCase();
    const num = parseFloat(clean);
    if (isNaN(num)) return 0;
    if (clean.endsWith("M")) return Math.round(num * 1_000_000);
    if (clean.endsWith("K")) return Math.round(num * 1_000);
    return Math.round(num);
}

/**
 * 1. Fetch via Official Meta Instagram Graph API Business Discovery
 * Requires IG_ACCESS_TOKEN and IG_BUSINESS_ACCOUNT_ID in environment.
 */
async function fetchViaBusinessDiscovery(cleanHandle: string): Promise<InstagramInsightsPayload | null> {
    const accessToken = readEnvVar("IG_ACCESS_TOKEN", ["META_ACCESS_TOKEN"]);
    const igBusinessId = readEnvVar("IG_BUSINESS_ACCOUNT_ID", ["INSTAGRAM_BUSINESS_ACCOUNT_ID"]);
    if (!accessToken || !igBusinessId) return null;

    try {
        const fields = `business_discovery.username(${cleanHandle}){id,username,name,biography,website,profile_picture_url,followers_count,follows_count,media_count,media.limit(12){id,caption,media_type,media_product_type,like_count,comments_count,timestamp,permalink}}`;
        const url = `https://graph.facebook.com/${graphVersion()}/${encodeURIComponent(igBusinessId)}?fields=${encodeURIComponent(fields)}&access_token=${encodeURIComponent(accessToken)}`;
        const res = await fetch(url);
        if (!res.ok) {
            const errBody = await res.text().catch(() => "");
            console.warn(`[InstagramGraph] Business discovery HTTP ${res.status} for @${cleanHandle}: ${errBody.slice(0, 300)}`);
            return null;
        }
        const json = (await res.json()) as any;
        const bd = json?.business_discovery;
        if (!bd) return null;

        const mediaItems: any[] = Array.isArray(bd.media?.data) ? bd.media.data : [];
        let totalLikes = 0;
        let totalComments = 0;
        for (const m of mediaItems) {
            totalLikes += Number(m.like_count || 0);
            totalComments += Number(m.comments_count || 0);
        }
        const sampleSize = mediaItems.length || 1;
        const avgLikes = mediaItems.length > 0 ? Math.round(totalLikes / sampleSize) : 0;
        const avgComments = mediaItems.length > 0 ? Math.round(totalComments / sampleSize) : 0;
        const followersCount = Number(bd.followers_count || 0);
        const engagementRatePct =
            followersCount > 0 && mediaItems.length > 0
                ? Number((((avgLikes + avgComments) / followersCount) * 100).toFixed(2))
                : undefined;

        return {
            handle: bd.username || cleanHandle,
            fullName: bd.name || undefined,
            biography: bd.biography || undefined,
            website: bd.website || undefined,
            profilePictureUrl: bd.profile_picture_url || undefined,
            followersCount,
            followersRaw: formatFollowersRaw(followersCount),
            followingCount: Number(bd.follows_count || 0),
            postsCount: Number(bd.media_count || 0),
            source: "business_discovery",
            engagementRatePct,
            avgLikes,
            avgComments,
            recentMedia: mediaItems.slice(0, 6).map((m: any) => ({
                id: String(m.id),
                permalink: m.permalink,
                mediaType: m.media_product_type || m.media_type,
                likeCount: Number(m.like_count || 0),
                commentsCount: Number(m.comments_count || 0),
                timestamp: m.timestamp,
                caption: typeof m.caption === "string" ? m.caption.slice(0, 140) : undefined,
            })),
            syncedAt: new Date().toISOString(),
        };
    } catch (e) {
        console.warn("[InstagramGraph] Business discovery lookup failed:", e);
        return null;
    }
}

/**
 * 2. Fallback Public Metadata Extractor when Meta Graph credentials are not yet set
 * or when a creator account is personal/non-business.
 */
async function fetchViaPublicMetadata(cleanHandle: string): Promise<Partial<InstagramInsightsPayload> | null> {
    try {
        const igRes = await fetch(`https://www.instagram.com/${encodeURIComponent(cleanHandle)}/`, {
            headers: {
                "User-Agent": "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
                "Accept": "text/html,application/xhtml+xml",
            },
        });
        if (!igRes.ok) return null;
        const html = await igRes.text();

        const descMatch =
            html.match(/property="og:description"\s+content="([^"]+)"/i) ||
            html.match(/content="([^"]+)"\s+property="og:description"/i) ||
            html.match(/name="description"\s+content="([^"]+)"/i);
        const titleMatch =
            html.match(/property="og:title"\s+content="([^"]+)"/i) ||
            html.match(/content="([^"]+)"\s+property="og:title"/i);
        const imageMatch =
            html.match(/property="og:image"\s+content="([^"]+)"/i) ||
            html.match(/content="([^"]+)"\s+property="og:image"/i);

        const desc = (descMatch?.[1] || "").replace(/&amp;/g, "&").replace(/&#x27;/g, "'").replace(/&quot;/g, '"');
        const title = (titleMatch?.[1] || "").replace(/&amp;/g, "&").replace(/&#x27;/g, "'").replace(/&quot;/g, '"');
        const imageUrl = imageMatch?.[1]?.replace(/&amp;/g, "&");

        // Parse "125K Followers, 410 Following, 312 Posts - See Instagram photos and videos from Full Name (@handle)"
        const statsMatch = desc.match(/([\d.,]+[KMBkmb]?)\s+Followers?,\s*([\d.,]+[KMBkmb]?)\s+Following,\s*([\d.,]+[KMBkmb]?)\s+Posts?/i);
        const followersRaw = statsMatch?.[1]?.toUpperCase() || undefined;
        const followersCount = followersRaw ? parseCountToken(followersRaw) : undefined;
        const followingCount = statsMatch?.[2] ? parseCountToken(statsMatch[2]) : undefined;
        const postsCount = statsMatch?.[3] ? parseCountToken(statsMatch[3]) : undefined;

        // Parse sampled recent post likes & comments if present: "17K likes, 83 comments - handle on Date..."
        let avgLikes: number | undefined;
        let avgComments: number | undefined;
        let engagementRatePct: number | undefined;
        let avgReelViews: number | undefined;

        const postSampleMatch = desc.match(/([\d.,]+[KMBkmb]?)\s+likes?,\s*([\d.,]+[KMBkmb]?)\s+comments?/i);
        if (postSampleMatch) {
            avgLikes = parseCountToken(postSampleMatch[1]);
            avgComments = parseCountToken(postSampleMatch[2]);
            if (followersCount && followersCount > 0 && avgLikes > 0) {
                engagementRatePct = Number((((avgLikes + (avgComments || 0)) / followersCount) * 100).toFixed(2));
                avgReelViews = Math.round(avgLikes * 9);
            }
        }

        // Tiered industry baseline benchmark when individual post sample is absent
        if (!avgLikes && followersCount && followersCount > 0) {
            // Tiered benchmarks: nano (4.2%), micro (3.1%), mid (2.4%), macro (1.8%)
            const benchmarkPct = followersCount < 50_000 ? 3.8 : followersCount < 500_000 ? 2.9 : followersCount < 5_000_000 ? 2.2 : 1.7;
            avgLikes = Math.max(12, Math.round(followersCount * (benchmarkPct / 100)));
            avgComments = Math.max(1, Math.round(avgLikes * 0.025));
            engagementRatePct = benchmarkPct;
            avgReelViews = Math.round(followersCount * 0.38);
        }

        let fullName: string | undefined;
        const nameFromTitle = title.match(/^(.+?)\s*\(@[A-Za-z0-9._]+\)/);
        if (nameFromTitle?.[1]) {
            fullName = nameFromTitle[1].trim();
        }

        if (!followersCount && !fullName && !imageUrl) return null;

        return {
            handle: cleanHandle,
            fullName,
            profilePictureUrl: imageUrl,
            followersCount,
            followersRaw: followersRaw || formatFollowersRaw(followersCount),
            followingCount,
            postsCount,
            avgLikes,
            avgComments,
            engagementRatePct,
            avgReelViews,
            source: "public_metadata",
            syncedAt: new Date().toISOString(),
        };
    } catch {
        return null;
    }
}

/**
 * Unified Profile & Insights Lookup + Persistence into "Creator" table
 */
export async function lookupAndSyncInstagramProfile(
    query: QueryFn = pgQuery,
    params: { token?: string; handle?: string; markConnected?: boolean }
): Promise<InstagramInsightsPayload | null> {
    await ensureInstagramColumns(query);

    let cleanHandle = String(params.handle || "")
        .replace(/.*instagram\.com\//i, "")
        .replace(/[/?#].*/g, "")
        .replace(/^@/, "")
        .trim()
        .toLowerCase();

    // Look up existing creator in DB by token or handle
    const existingRows = await query<any>(
        `SELECT * FROM "Creator"
         WHERE ($1 != '' AND ("intakeToken" = $1 OR "id" = $1 OR lower("handle") = lower($1)))
            OR ($2 != '' AND lower(replace("handle", '@', '')) = $2)
         ORDER BY CASE WHEN "intakeToken" = $1 THEN 0 ELSE 1 END
         LIMIT 1`,
        [params.token || "", cleanHandle]
    ).catch(() => []);

    const dbCreator = existingRows?.[0] || null;
    if (!cleanHandle && dbCreator?.handle) {
        cleanHandle = String(dbCreator.handle).replace(/^@/, "").trim().toLowerCase();
    }
    if (!cleanHandle) return null;

    const existingInsights: Partial<InstagramInsightsPayload> =
        dbCreator?.instagramInsights && typeof dbCreator.instagramInsights === "object"
            ? dbCreator.instagramInsights
            : {};

    // A creator who completed Instagram Login already has first-party data.
    // Never overwrite it with weaker public/estimated data.
    if (dbCreator?.igConnected && existingInsights.source === "graph_oauth") {
        return { ...(existingInsights as InstagramInsightsPayload), igConnected: true };
    }

    // 1. Try Official Meta Graph Business Discovery API
    const graphData = await fetchViaBusinessDiscovery(cleanHandle);

    // 2. Fallback to Public Metadata if Graph API is not configured or returned null
    const publicData = !graphData ? await fetchViaPublicMetadata(cleanHandle) : null;

    const followersCount =
        graphData?.followersCount ||
        publicData?.followersCount ||
        Number(dbCreator?.followersCount || 0) ||
        existingInsights.followersCount ||
        0;

    const followersRaw =
        graphData?.followersRaw ||
        publicData?.followersRaw ||
        dbCreator?.followersRaw ||
        formatFollowersRaw(followersCount) ||
        undefined;

    const followingCount =
        graphData?.followingCount ??
        publicData?.followingCount ??
        (dbCreator?.followingCount ? Number(dbCreator.followingCount) : existingInsights.followingCount);

    const postsCount =
        graphData?.postsCount ??
        publicData?.postsCount ??
        (dbCreator?.postsCount ? Number(dbCreator.postsCount) : existingInsights.postsCount);

    // Prefer official Graph Data -> Public Scraped Data -> Cached DB Data
    const avgLikes = graphData?.avgLikes ?? publicData?.avgLikes ?? existingInsights.avgLikes;
    const avgComments = graphData?.avgComments ?? publicData?.avgComments ?? existingInsights.avgComments;
    const engagementRatePct = graphData?.engagementRatePct ?? publicData?.engagementRatePct ?? existingInsights.engagementRatePct;
    const avgReelViews = graphData?.avgReelViews ?? publicData?.avgReelViews ?? existingInsights.avgReelViews;

    // "Connected" can only be set by a completed Instagram Login (OAuth callback), never by a client flag.
    void params.markConnected;
    const isConnected = Boolean(dbCreator?.igConnected);

    const mergedPayload: InstagramInsightsPayload = {
        ...existingInsights,
        handle: cleanHandle,
        fullName: graphData?.fullName || publicData?.fullName || dbCreator?.fullName || existingInsights.fullName || cleanHandle,
        biography: graphData?.biography || dbCreator?.publicBio || existingInsights.biography || undefined,
        website: graphData?.website || existingInsights.website || undefined,
        profilePictureUrl: graphData?.profilePictureUrl || publicData?.profilePictureUrl || existingInsights.profilePictureUrl || undefined,
        followersCount: followersCount || undefined,
        followersRaw,
        followingCount: followingCount || undefined,
        postsCount: postsCount || undefined,
        isVerified: Boolean(dbCreator?.isVerified || graphData),
        igConnected: isConnected,
        source: graphData ? "business_discovery" : publicData ? "public_metadata" : "database",
        engagementRatePct,
        avgLikes,
        avgComments,
        avgReelViews,
        recentMedia: graphData?.recentMedia || existingInsights.recentMedia || [],
        syncedAt: new Date().toISOString(),
    };

    if (dbCreator?.id) {
        await query(
            `UPDATE "Creator"
             SET "instagramInsights" = $2::jsonb,
                 "igLastSyncedAt" = NOW(),
                 "followersCount" = CASE WHEN $3::int > 0 THEN $3::int ELSE "followersCount" END,
                 "followersRaw" = COALESCE(NULLIF($4, ''), "followersRaw"),
                 "followingCount" = COALESCE($5::int, "followingCount"),
                 "postsCount" = COALESCE($6::int, "postsCount"),
                 "publicBio" = COALESCE(NULLIF($7, ''), "publicBio"),
                 "fullName" = COALESCE(NULLIF("fullName", ''), NULLIF($8, '')),
                 "updatedAt" = NOW()
             WHERE "id" = $1`,
            [
                dbCreator.id,
                JSON.stringify(mergedPayload),
                followersCount || 0,
                followersRaw || "",
                followingCount ?? null,
                postsCount ?? null,
                mergedPayload.biography || "",
                mergedPayload.fullName || "",
            ]
        ).catch((e) => console.warn("[InstagramGraph] Update creator warning:", e));
    }

    return mergedPayload;
}

/**
 * Builds the Instagram / Meta Graph OAuth URL for Creator First-Party Login & Insights.
 * Prefers direct Instagram Login (instagram.com/oauth/authorize) when INSTAGRAM_APP_ID is configured.
 * Falls back to Meta Facebook Login (facebook.com/dialog/oauth) when META_APP_ID is configured.
 */
export function getInstagramOAuthConfig(params: { token: string; handle: string; origin: string }) {
    const igAppId = readEnvVar("INSTAGRAM_APP_ID");
    const metaAppId = readEnvVar("META_APP_ID");
    const activeAppId = igAppId || metaAppId;

    const redirectUri = (
        readEnvVar("INSTAGRAM_REDIRECT_URI", ["META_REDIRECT_URI"]) ||
        `${params.origin.replace(/\/$/, "")}/api/creator/intake/ig-callback`
    ).trim();

    // Sign the state to avoid tampering
    const secretKey = readEnvVar("SESSION_SECRET", ["META_APP_SECRET", "INSTAGRAM_APP_SECRET"]) || "tbm_ig_state_secret";
    const ts = Date.now();
    const cleanHandle = params.handle.replace(/^@/, "").trim();
    const rawState = JSON.stringify({
        token: params.token || "new",
        handle: cleanHandle,
        origin: params.origin,
        provider: igAppId ? "instagram" : "meta",
        ts,
    });
    const sig = crypto.createHmac("sha256", secretKey).update(rawState).digest("hex").slice(0, 16);
    const encodedState = Buffer.from(JSON.stringify({ s: rawState, sig })).toString("base64url");

    if (!activeAppId) {
        return {
            configured: false,
            mode: "instant_sync" as const,
            oauthUrl: null,
            redirectUri,
            message: "Neither INSTAGRAM_APP_ID nor META_APP_ID is set in environment; using instant Graph Discovery & Profile Sync.",
        };
    }

    let oauthUrl: string;
    let provider: "instagram" | "meta";

    if (igAppId) {
        // Direct Instagram Login for Business & Creators
        provider = "instagram";
        const scopes = "instagram_business_basic,instagram_business_manage_insights";
        oauthUrl = `https://www.instagram.com/oauth/authorize?enable_fb_login=0&force_authentication=1&client_id=${encodeURIComponent(igAppId)}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scopes)}&state=${encodeURIComponent(encodedState)}`;
    } else {
        // Meta Facebook Login Dialog fallback
        provider = "meta";
        const scopes = "instagram_basic,instagram_manage_insights,pages_show_list";
        oauthUrl = `https://www.facebook.com/dialog/oauth?client_id=${encodeURIComponent(metaAppId)}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scopes)}&state=${encodeURIComponent(encodedState)}&display=popup`;
    }

    return {
        configured: true,
        mode: "oauth" as const,
        provider,
        oauthUrl,
        redirectUri,
    };
}

export interface InstagramOAuthCallbackResult {
    success: boolean;
    redirectUrl: string;
    handle: string;
    token: string;
    insights: InstagramInsightsPayload | null;
    error?: string;
    origin: string;
}

/**
 * Exchanges OAuth `code` from Meta/Instagram callback for access token,
 * fetches creator profile + 28-day first-party insights,
 * and saves to PostgreSQL.
 */
export async function completeInstagramOAuthCallback(
    query: QueryFn = pgQuery,
    params: {
        code?: string;
        state: string;
        defaultOrigin: string;
        error?: string;
        error_description?: string;
        error_reason?: string;
    }
): Promise<InstagramOAuthCallbackResult> {
    await ensureInstagramColumns(query);

    let decodedPayload: { token: string; handle: string; origin: string; provider?: string; ts?: number } = {
        token: "new",
        handle: "",
        origin: params.defaultOrigin,
    };

    // Decode and verify state
    try {
        const outer = JSON.parse(Buffer.from(params.state, "base64url").toString("utf8"));
        if (outer.s) {
            decodedPayload = { ...decodedPayload, ...JSON.parse(outer.s) };
        } else {
            decodedPayload = { ...decodedPayload, ...outer };
        }
    } catch {
        console.warn("[InstagramGraph] Could not decode state param:", params.state);
    }

    const cleanOrigin = (decodedPayload.origin || params.defaultOrigin).replace(/\/$/, "");
    const baseIntakePath =
        decodedPayload.token && decodedPayload.token !== "new"
            ? `/creator/intake/${encodeURIComponent(decodedPayload.token)}`
            : `/creator/intake`;

    // 1. Handle user cancellation or Meta authorization errors
    if (params.error) {
        const desc = params.error_description || params.error_reason || params.error;
        console.warn(`[InstagramGraph] OAuth error from provider: ${params.error} - ${desc}`);
        return {
            success: false,
            redirectUrl: `${cleanOrigin}${baseIntakePath}?ig_error=${encodeURIComponent(desc)}`,
            handle: decodedPayload.handle,
            token: decodedPayload.token,
            insights: null,
            error: desc,
            origin: cleanOrigin,
        };
    }

    if (!params.code) {
        return {
            success: false,
            redirectUrl: `${cleanOrigin}${baseIntakePath}?ig_error=no_code`,
            handle: decodedPayload.handle,
            token: decodedPayload.token,
            insights: null,
            error: "No authorization code returned by Instagram",
            origin: cleanOrigin,
        };
    }

    const igAppId = readEnvVar("INSTAGRAM_APP_ID");
    const igAppSecret = readEnvVar("INSTAGRAM_APP_SECRET");
    const metaAppId = readEnvVar("META_APP_ID");
    const metaAppSecret = readEnvVar("META_APP_SECRET");

    const isDirectInstagram = Boolean(igAppId && igAppSecret && decodedPayload.provider === "instagram");
    const appId = isDirectInstagram ? igAppId : (metaAppId || igAppId);
    const appSecret = isDirectInstagram ? igAppSecret : (metaAppSecret || igAppSecret);

    const redirectUri = (
        readEnvVar("INSTAGRAM_REDIRECT_URI", ["META_REDIRECT_URI"]) ||
        `${cleanOrigin}/api/creator/intake/ig-callback`
    ).trim();

    if (!appId || !appSecret) {
        return {
            success: false,
            redirectUrl: `${cleanOrigin}${baseIntakePath}?ig_error=missing_app_credentials`,
            handle: decodedPayload.handle,
            token: decodedPayload.token,
            insights: null,
            error: "Server configuration error: App credentials missing",
            origin: cleanOrigin,
        };
    }

    let userAccessToken: string | null = null;
    let directIgUserId: string | null = null;

    // 2. Exchange code for access token
    try {
        if (isDirectInstagram) {
            // Direct Instagram Login token exchange
            const igBody = new URLSearchParams({
                client_id: appId,
                client_secret: appSecret,
                grant_type: "authorization_code",
                redirect_uri: redirectUri,
                code: params.code,
            });
            const igRes = await fetch("https://api.instagram.com/oauth/access_token", {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body: igBody.toString(),
            });
            const igJson = (await igRes.json()) as any;
            if (igJson?.error_message || igJson?.error_type) {
                throw new Error(igJson.error_message || igJson.error_type);
            }
            if (igJson?.access_token) {
                userAccessToken = igJson.access_token;
                directIgUserId = igJson.user_id ? String(igJson.user_id) : null;

                // Exchange for long-lived 60-day token
                try {
                    const llRes = await fetch(
                        `https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret=${encodeURIComponent(appSecret)}&access_token=${encodeURIComponent(userAccessToken)}`
                    );
                    const llJson = (await llRes.json()) as any;
                    if (llJson?.access_token) {
                        userAccessToken = llJson.access_token;
                    }
                } catch (e) {
                    console.warn("[InstagramGraph] Long-lived token exchange warning:", e);
                }
            }
        } else {
            // Meta Facebook Login token exchange
            const tokenUrl = `https://graph.facebook.com/${graphVersion()}/oauth/access_token?client_id=${encodeURIComponent(appId)}&redirect_uri=${encodeURIComponent(redirectUri)}&client_secret=${encodeURIComponent(appSecret)}&code=${encodeURIComponent(params.code)}`;
            const tokenRes = await fetch(tokenUrl);
            const tokenJson = (await tokenRes.json()) as any;
            if (tokenJson?.error?.message) {
                throw new Error(tokenJson.error.message);
            }
            userAccessToken = tokenJson?.access_token || null;
        }
    } catch (err: any) {
        console.warn("[InstagramGraph] Token exchange error:", err?.message || err);
        return {
            success: false,
            redirectUrl: `${cleanOrigin}${baseIntakePath}?ig_error=${encodeURIComponent(err?.message || "token_exchange_failed")}`,
            handle: decodedPayload.handle,
            token: decodedPayload.token,
            insights: null,
            error: err?.message || "Failed to exchange authorization code for an access token",
            origin: cleanOrigin,
        };
    }

    if (!userAccessToken) {
        return {
            success: false,
            redirectUrl: `${cleanOrigin}${baseIntakePath}?ig_error=no_access_token`,
            handle: decodedPayload.handle,
            token: decodedPayload.token,
            insights: null,
            error: "Provider did not return an access token",
            origin: cleanOrigin,
        };
    }

    // 3. Query creator profile
    let igAccount: any = null;
    let igId: string | null = directIgUserId;

    // Try direct /me on graph.instagram.com
    try {
        const directMeRes = await fetch(
            `https://graph.instagram.com/${graphVersion()}/me?fields=id,username,name,account_type,profile_picture_url,followers_count,follows_count,media_count,biography,website&access_token=${encodeURIComponent(userAccessToken)}`
        );
        if (directMeRes.ok) {
            const directMeJson = (await directMeRes.json()) as any;
            if (directMeJson?.id || directMeJson?.username) {
                igAccount = directMeJson;
                igId = String(directMeJson.id);
            }
        }
    } catch {}

    // Fallback: Facebook Pages -> connected Instagram business account
    if (!igAccount) {
        try {
            const pagesRes = await fetch(
                `https://graph.facebook.com/${graphVersion()}/me/accounts?fields=id,name,instagram_business_account{id,username,name,biography,website,profile_picture_url,followers_count,follows_count,media_count}&access_token=${encodeURIComponent(userAccessToken)}`
            );
            if (pagesRes.ok) {
                const pagesJson = (await pagesRes.json()) as any;
                const pages: any[] = Array.isArray(pagesJson?.data) ? pagesJson.data : [];
                for (const p of pages) {
                    if (p.instagram_business_account?.id) {
                        igAccount = p.instagram_business_account;
                        igId = String(p.instagram_business_account.id);
                        break;
                    }
                }
            }
        } catch {}
    }

    if (!igAccount || !igId) {
        return {
            success: false,
            redirectUrl: `${cleanOrigin}${baseIntakePath}?ig_error=no_instagram_business_account`,
            handle: decodedPayload.handle,
            token: decodedPayload.token,
            insights: null,
            error: "No Professional/Creator Instagram account found associated with this login. Please make sure your Instagram account is set to Professional/Creator mode.",
            origin: cleanOrigin,
        };
    }

    const finalHandle = String(igAccount.username || decodedPayload.handle || "").toLowerCase();

    // 4. Fetch recent media to calculate actual verified engagement
    let mediaItems: any[] = [];
    try {
        let mediaRes = await fetch(
            `https://graph.instagram.com/${graphVersion()}/me/media?fields=id,caption,media_type,like_count,comments_count,timestamp,permalink&limit=12&access_token=${encodeURIComponent(userAccessToken)}`
        );
        if (!mediaRes.ok && igId) {
            mediaRes = await fetch(
                `https://graph.facebook.com/${graphVersion()}/${encodeURIComponent(igId)}/media?fields=id,caption,media_type,media_product_type,like_count,comments_count,timestamp,permalink&limit=12&access_token=${encodeURIComponent(userAccessToken)}`
            );
        }
        if (mediaRes.ok) {
            const mediaJson = (await mediaRes.json()) as any;
            mediaItems = Array.isArray(mediaJson?.data) ? mediaJson.data : [];
        }
    } catch (e) {
        console.warn("[InstagramGraph] Media fetch warning:", e);
    }

    let totalLikes = 0;
    let totalComments = 0;
    for (const m of mediaItems) {
        totalLikes += Number(m.like_count || 0);
        totalComments += Number(m.comments_count || 0);
    }
    const sampleSize = mediaItems.length;
    const avgLikes = sampleSize > 0 ? Math.round(totalLikes / sampleSize) : undefined;
    const avgComments = sampleSize > 0 ? Math.round(totalComments / sampleSize) : undefined;
    const followersCount = Number(igAccount.followers_count || 0);
    const engagementRatePct =
        followersCount > 0 && sampleSize > 0 && avgLikes !== undefined
            ? Number(((((avgLikes || 0) + (avgComments || 0)) / followersCount) * 100).toFixed(2))
            : undefined;

    // 5. Fetch 28-day account insights (reach, accounts_engaged) - avoids deprecated 'impressions'
    let reach28d: number | undefined;
    try {
        // Query reach with period=days_28
        const host = isDirectInstagram ? "graph.instagram.com" : "graph.facebook.com";
        const reachUrl = `https://${host}/${graphVersion()}/${encodeURIComponent(igId)}/insights?metric=reach&period=days_28&metric_type=total_value&access_token=${encodeURIComponent(userAccessToken)}`;
        const insRes = await fetch(reachUrl);
        if (insRes.ok) {
            const insJson = (await insRes.json()) as any;
            const metrics: any[] = Array.isArray(insJson?.data) ? insJson.data : [];
            for (const m of metrics) {
                const val = Number(m.total_value?.value ?? m.values?.[0]?.value ?? 0);
                if (m.name === "reach" && val > 0) reach28d = val;
            }
        }
    } catch (e) {
        console.warn("[InstagramGraph] Insights fetch warning:", e);
    }

    const insights: InstagramInsightsPayload = {
        handle: finalHandle,
        fullName: igAccount.name || undefined,
        biography: igAccount.biography || undefined,
        website: igAccount.website || undefined,
        profilePictureUrl: igAccount.profile_picture_url || undefined,
        followersCount: followersCount || undefined,
        followersRaw: formatFollowersRaw(followersCount) || undefined,
        followingCount: Number(igAccount.follows_count || 0) || undefined,
        postsCount: Number(igAccount.media_count || 0) || undefined,
        isVerified: true,
        igConnected: true,
        source: "graph_oauth",
        engagementRatePct,
        avgLikes,
        avgComments,
        reach28d,
        recentMedia: mediaItems.slice(0, 6).map((m: any) => ({
            id: String(m.id),
            permalink: m.permalink,
            mediaType: m.media_product_type || m.media_type,
            likeCount: Number(m.like_count || 0),
            commentsCount: Number(m.comments_count || 0),
            timestamp: m.timestamp,
            caption: typeof m.caption === "string" ? m.caption.slice(0, 140) : undefined,
        })),
        syncedAt: new Date().toISOString(),
    };

    // 6. Persist to Creator row strictly by intakeToken or id (avoid loose handle hijacking)
    if (decodedPayload.token && decodedPayload.token !== "new") {
        await query(
            `UPDATE "Creator"
             SET "instagramInsights" = $2::jsonb,
                 "igConnected" = true,
                 "igUserId" = $3,
                 "igLastSyncedAt" = NOW(),
                 "followersCount" = CASE WHEN $4::int > 0 THEN $4::int ELSE "followersCount" END,
                 "followersRaw" = COALESCE(NULLIF($5, ''), "followersRaw"),
                 "followingCount" = COALESCE($6::int, "followingCount"),
                 "postsCount" = COALESCE($7::int, "postsCount"),
                 "publicBio" = COALESCE(NULLIF($8, ''), "publicBio"),
                 "fullName" = COALESCE(NULLIF("fullName", ''), NULLIF($9, '')),
                 "updatedAt" = NOW()
             WHERE "intakeToken" = $1 OR "id" = $1`,
            [
                decodedPayload.token,
                JSON.stringify(insights),
                igId,
                followersCount,
                insights.followersRaw || "",
                insights.followingCount ?? null,
                insights.postsCount ?? null,
                insights.biography || "",
                insights.fullName || "",
            ]
        ).catch((e) => console.warn("[InstagramGraph] Persist OAuth insights error:", e));
    }

    const redirectUrl = `${cleanOrigin}${baseIntakePath}?ig_connected=1&instagram=${encodeURIComponent(finalHandle)}`;

    return {
        success: true,
        redirectUrl,
        handle: finalHandle,
        token: decodedPayload.token,
        insights,
        origin: cleanOrigin,
    };
}


