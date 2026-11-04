import fs from "node:fs";
import path from "node:path";
import { pgQuery } from "../server/pg";
import { clusterManager } from "../server/dbCluster";

const AVATAR_DIR = path.resolve(process.cwd(), "web/public/creator-avatars");

async function fetchSingleAvatar(cleanHandle: string): Promise<{ buf: Buffer; mime: string } | null> {
    try {
        const igRes = await fetch(`https://www.instagram.com/${encodeURIComponent(cleanHandle)}/`, {
            headers: {
                "User-Agent": "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
                "Accept": "text/html",
            },
            signal: AbortSignal.timeout(8000),
        });
        if (!igRes.ok) return null;
        const html = await igRes.text();
        const match =
            html.match(/property="og:image"\s+content="([^"]+)"/i) ||
            html.match(/content="([^"]+)"\s+property="og:image"/i);
        const imgUrl = match?.[1]?.replace(/&amp;/g, "&");
        if (!imgUrl) return null;

        const imgResp = await fetch(imgUrl, {
            headers: {
                "User-Agent": "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
            },
            signal: AbortSignal.timeout(8000),
        });
        if (!imgResp.ok) return null;
        const arrayBuf = await imgResp.arrayBuffer();
        const buf = Buffer.from(arrayBuf);
        if (buf.byteLength < 200) return null;
        const mime = imgResp.headers.get("content-type") || "image/jpeg";
        return { buf, mime };
    } catch {
        return null;
    }
}

async function main() {
    const limitArg = Number(process.argv[2] || "10000");
    fs.mkdirSync(AVATAR_DIR, { recursive: true });

    const rows = await pgQuery<{ id: string; handle: string; intakeStatus: string; followersCount: number }>(`
        SELECT id, handle, "intakeStatus", "followersCount"
        FROM "Creator"
        WHERE "avatarUrl" IS NULL OR NOT ("avatarUrl" LIKE 'data:image/%')
        ORDER BY
            CASE WHEN "intakeStatus" != 'SCRAPED_BASELINE' THEN 0 ELSE 1 END ASC,
            CASE WHEN "primaryEmail" IS NOT NULL OR "phone" IS NOT NULL OR "whatsappNumber" IS NOT NULL THEN 0 ELSE 1 END ASC,
            "followersCount" DESC
        LIMIT $1
    `, [limitArg]);

    console.log(`[AvatarSync] Fetching Instagram avatars locally for ${rows.length} remaining creators...`);

    const primaryPool = clusterManager.getPool("primary");
    const replica2Pool = clusterManager.getPool("replica2");
    const replica3Pool = clusterManager.getPool("replica3");

    let saved = 0;
    let skipped = 0;
    let processed = 0;

    const concurrency = 12;
    for (let i = 0; i < rows.length; i += concurrency) {
        const batch = rows.slice(i, i + concurrency);
        await Promise.all(
            batch.map(async (row) => {
                const cleanHandle = String(row.handle || "").replace(/^@/, "").trim().toLowerCase();
                if (!cleanHandle) {
                    skipped++;
                    processed++;
                    return;
                }

                // Check if already downloaded on disk
                const filePath = path.join(AVATAR_DIR, `${cleanHandle}.jpg`);
                let buf: Buffer | null = null;
                let mime = "image/jpeg";

                if (fs.existsSync(filePath)) {
                    try {
                        const existing = fs.readFileSync(filePath);
                        if (existing.byteLength >= 200) {
                            buf = existing;
                        }
                    } catch {}
                }

                if (!buf) {
                    const result = await fetchSingleAvatar(cleanHandle);
                    if (!result) {
                        skipped++;
                        processed++;
                        return;
                    }
                    buf = result.buf;
                    mime = result.mime;
                    fs.writeFileSync(filePath, buf);
                }

                const dataUri = `data:${mime};base64,${buf.toString("base64")}`;
                await Promise.allSettled([
                    primaryPool.query(`UPDATE "Creator" SET "avatarUrl" = $1 WHERE "id" = $2`, [dataUri, row.id]),
                    replica2Pool.query(`UPDATE "Creator" SET "avatarUrl" = $1 WHERE "id" = $2`, [dataUri, row.id]),
                    replica3Pool.query(`UPDATE "Creator" SET "avatarUrl" = $1 WHERE "id" = $2`, [dataUri, row.id]),
                ]);
                saved++;
                processed++;
            })
        );

        if (processed % 60 === 0 || processed === rows.length) {
            console.log(`[AvatarSync] Progress: ${processed}/${rows.length} (saved: ${saved}, skipped: ${skipped})`);
        }
    }

    console.log(`[AvatarSync] Complete! Saved ${saved} avatars (skipped: ${skipped}) to web/public/creator-avatars/ and PostgreSQL cluster.`);
    process.exit(0);
}

main();
