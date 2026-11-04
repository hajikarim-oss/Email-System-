import type { IncomingMessage, ServerResponse } from "node:http";
import { resolveToken } from "../../server/auth";
import { pgQuery } from "../../server/pg";
import {
    searchCreators,
    getCreatorFacets,
    getCreatorById,
    getCreatorByIntakeToken,
    saveCreatorIntake,
    getCreatorTemplates,
    saveCreatorTemplate,
    deleteCreatorTemplate,
} from "../../server/creators";

const avatarCache = new Map<string, { buf: Buffer; type: string }>();

function sendJson(res: ServerResponse, status: number, data: any) {
    res.writeHead(status, {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
    });
    res.end(JSON.stringify(data));
}

function parseBody(req: IncomingMessage): Promise<any> {
    return new Promise((resolve) => {
        let body = "";
        req.on("data", (chunk) => (body += chunk));
        req.on("end", () => {
            try {
                resolve(body ? JSON.parse(body) : {});
            } catch {
                resolve({});
            }
        });
    });
}

export default async function creatorsHandler(req: IncomingMessage, res: ServerResponse) {
    if (req.method === "OPTIONS") {
        res.writeHead(204, {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, Authorization",
        });
        res.end();
        return;
    }

    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    const pathname = url.pathname;
    const method = req.method?.toUpperCase() || "GET";

    try {
        // Protect internal /api/creators endpoints so only Master accounts can access them.
        // External creator intake form routes (/api/creator/intake/:token) remain public.
        const isPublicIntakeRoute =
            pathname.startsWith("/api/creator/intake/") ||
            pathname.startsWith("/api/v1/creator/intake/");
        if (!isPublicIntakeRoute) {
            const authHeader = req.headers.authorization || "";
            const bearerToken = authHeader.toLowerCase().startsWith("bearer ")
                ? authHeader.slice(7).trim()
                : "";
            const caller = await resolveToken(bearerToken || undefined);
            if (!caller || caller.role !== "MASTER") {
                return sendJson(res, 403, {
                    error: "forbidden",
                    message: "The Creators database is restricted to Troops Workspace Masters.",
                });
            }
        }

        // 1. Facets Endpoint
        if (pathname === "/api/creators/facets" || pathname === "/api/v1/creators/facets") {
            const workspaceId = url.searchParams.get("workspaceId") || "org_troops_outreach";
            const facets = await getCreatorFacets(undefined, workspaceId);
            return sendJson(res, 200, facets);
        }

        // 2. Templates Endpoints
        if (pathname === "/api/creators/templates" || pathname === "/api/v1/creators/templates") {
            const workspaceId = url.searchParams.get("workspaceId") || "org_troops_outreach";
            if (method === "GET") {
                const templates = await getCreatorTemplates(undefined, workspaceId);
                return sendJson(res, 200, templates);
            }
            if (method === "POST") {
                const body = await parseBody(req);
                const saved = await saveCreatorTemplate(undefined, { ...body, workspaceId });
                return sendJson(res, 200, saved);
            }
        }

        if ((pathname.startsWith("/api/creators/templates/") || pathname.startsWith("/api/v1/creators/templates/")) && method === "DELETE") {
            const id = pathname.split("/").pop();
            if (id) {
                await deleteCreatorTemplate(undefined, id);
                return sendJson(res, 200, { success: true });
            }
        }

        // 3. Public Intake Form Endpoints (/api/creator/intake/:token)
        if (pathname.startsWith("/api/creator/intake/") || pathname.startsWith("/api/v1/creator/intake/")) {
            const parts = pathname.split("/").filter(Boolean);
            const lastPart = parts[parts.length - 1];
            const isSubmit = lastPart === "submit";
            const isAvatar = lastPart === "avatar";
            const token = isSubmit || isAvatar ? parts[parts.length - 2] : lastPart;

            if ((method === "GET" || method === "HEAD") && isAvatar) {
                const creator = await getCreatorByIntakeToken(undefined, token);
                if (!creator || !creator.handle) {
                    res.writeHead(404);
                    res.end();
                    return;
                }
                const cleanHandle = String(creator.handle).replace(/^@/, "").trim().toLowerCase();

                // 1. Serve from PostgreSQL avatarUrl if stored as data:image/...;base64,...
                if (typeof creator.avatarUrl === "string" && creator.avatarUrl.startsWith("data:image/")) {
                    const commaIdx = creator.avatarUrl.indexOf(",");
                    if (commaIdx > 0) {
                        const header = creator.avatarUrl.slice(5, commaIdx);
                        const mimeType = header.split(";")[0] || "image/jpeg";
                        const b64 = creator.avatarUrl.slice(commaIdx + 1);
                        const buf = Buffer.from(b64, "base64");
                        avatarCache.set(cleanHandle, { buf, type: mimeType });
                        res.writeHead(200, {
                            "Content-Type": mimeType,
                            "Cache-Control": "public, max-age=86400",
                            "Access-Control-Allow-Origin": "*",
                        });
                        res.end(method === "HEAD" ? undefined : buf);
                        return;
                    }
                }

                // 2. Serve from in-memory cache
                const cached = avatarCache.get(cleanHandle);
                if (cached) {
                    res.writeHead(200, {
                        "Content-Type": cached.type,
                        "Cache-Control": "public, max-age=86400",
                        "Access-Control-Allow-Origin": "*",
                    });
                    res.end(method === "HEAD" ? undefined : cached.buf);
                    return;
                }
                try {
                    const igRes = await fetch(`https://www.instagram.com/${encodeURIComponent(cleanHandle)}/`, {
                        headers: {
                            "User-Agent": "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
                            "Accept": "text/html",
                        },
                    });
                    const html = await igRes.text();
                    const match =
                        html.match(/property="og:image"\s+content="([^"]+)"/i) ||
                        html.match(/content="([^"]+)"\s+property="og:image"/i);
                    const imgUrl = match?.[1]?.replace(/&amp;/g, "&");
                    if (!imgUrl) {
                        res.writeHead(404);
                        res.end();
                        return;
                    }
                    const imgResp = await fetch(imgUrl, {
                        headers: {
                            "User-Agent": "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
                        },
                    });
                    if (!imgResp.ok) {
                        res.writeHead(404);
                        res.end();
                        return;
                    }
                    const arrayBuf = await imgResp.arrayBuffer();
                    const buf = Buffer.from(arrayBuf);
                    const contentType = imgResp.headers.get("content-type") || "image/jpeg";
                    avatarCache.set(cleanHandle, { buf, type: contentType });

                    // Persist to PostgreSQL so cloud/Vercel deployments serve it without calling Instagram
                    const dataUri = `data:${contentType};base64,${buf.toString("base64")}`;
                    pgQuery(`UPDATE "Creator" SET "avatarUrl" = $1 WHERE "id" = $2`, [dataUri, creator.id]).catch(() => {});

                    res.writeHead(200, {
                        "Content-Type": contentType,
                        "Cache-Control": "public, max-age=86400",
                        "Access-Control-Allow-Origin": "*",
                    });
                    res.end(method === "HEAD" ? undefined : buf);
                    return;
                } catch {
                    res.writeHead(404);
                    res.end();
                    return;
                }
            }

            if (method === "GET") {
                const creator = await getCreatorByIntakeToken(undefined, token);
                if (!creator) return sendJson(res, 404, { error: "Creator not found for token" });
                return sendJson(res, 200, creator);
            }

            if (method === "PATCH" || method === "POST") {
                const body = await parseBody(req);
                const updated = await saveCreatorIntake(undefined, token, { ...body, isFinal: isSubmit });
                if (!updated) return sendJson(res, 404, { error: "Creator not found or update failed" });
                return sendJson(res, 200, updated);
            }
        }

        // 4. Single Creator by ID
        if ((pathname.startsWith("/api/creators/") || pathname.startsWith("/api/v1/creators/")) && pathname.split("/").length === 4) {
            const id = pathname.split("/").pop();
            if (id && id !== "facets" && id !== "templates") {
                const creator = await getCreatorById(undefined, id);
                if (!creator) return sendJson(res, 404, { error: "Creator not found" });
                return sendJson(res, 200, creator);
            }
        }

        // 5. Search / List Creators
        if (pathname === "/api/creators" || pathname === "/api/v1/creators") {
            const params = {
                workspaceId: url.searchParams.get("workspaceId") || "org_troops_outreach",
                search: url.searchParams.get("search") || url.searchParams.get("query") || "",
                category: url.searchParams.get("category") || "",
                tier: (url.searchParams.get("tier") as any) || "all",
                intakeStatus: (url.searchParams.get("intakeStatus") as any) || "all",
                channel: (url.searchParams.get("channel") as any) || "all",
                sortBy: (url.searchParams.get("sortBy") as any) || "followersCount",
                reverse: url.searchParams.get("reverse") === "true",
                limit: parseInt(url.searchParams.get("limit") || "50", 10),
                offset: parseInt(url.searchParams.get("offset") || "0", 10),
            };

            const result = await searchCreators(undefined, params);
            return sendJson(res, 200, result);
        }

        return sendJson(res, 404, { error: "Not found", path: pathname });
    } catch (err: any) {
        console.error("[Creators API Error]:", err);
        return sendJson(res, 500, { error: "internal_server_error", message: err?.message });
    }
}

