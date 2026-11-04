import fs from "node:fs";
import crypto from "node:crypto";
import csv from "../web/node_modules/papaparse";
import { getPool } from "../server/pg";

const CSV_PATH = "/Users/tbmmonkey/Downloads/Creator Scouting/TBM Master data set/TBM_all_creators.csv";
const WORKSPACE_ID = "org_troops_outreach";

function parseNum(val: any): number {
    if (!val) return 0;
    const s = String(val).trim().replace(/,/g, "");
    let multiplier = 1;
    let clean = s;
    if (s.endsWith("M") || s.endsWith("m")) {
        multiplier = 1_000_000;
        clean = s.slice(0, -1);
    } else if (s.endsWith("K") || s.endsWith("k")) {
        multiplier = 1_000;
        clean = s.slice(0, -1);
    }
    const n = parseFloat(clean);
    return isNaN(n) ? 0 : Math.round(n * multiplier);
}

function cleanEmail(email: any): string | null {
    if (!email) return null;
    let s = String(email).trim().toLowerCase();
    // Fix scraped artifacts like .watch
    s = s.replace(/\.watch$/i, "");
    if (!s.includes("@") || !s.includes(".")) return null;
    return s;
}

function cleanPhone(phone: any): string | null {
    if (!phone) return null;
    const s = String(phone).trim();
    return s.length >= 7 ? s : null;
}

function cleanHandle(handle: any): string {
    let s = String(handle || "").trim();
    if (!s) return "";
    if (!s.startsWith("@")) s = "@" + s;
    return s.toLowerCase();
}

function parseLanguages(langStr: any): string[] {
    if (!langStr) return ["Hindi", "English"];
    const s = String(langStr).trim();
    if (s.includes("/")) return s.split("/").map((x) => x.trim()).filter(Boolean);
    if (s.includes(",")) return s.split(",").map((x) => x.trim()).filter(Boolean);
    return [s];
}

interface MergedCreator {
    externalCreatorId: string;
    handle: string;
    fullName: string;
    profileUrl: string;
    followersRaw: string;
    followersCount: number;
    followingCount: number;
    postsCount: number;
    publicBio: string;
    category: string;
    subGenres: Set<string>;
    languages: Set<string>;
    primaryEmail: string | null;
    phone: string | null;
    brandAffinity: string | null;
    sampleReelUrl: string | null;
    matchedKeywords: Set<string>;
    discoveryKeyword: string | null;
    discoveryEngine: string | null;
    isVerified: boolean;
    indiaSignal: boolean;
    scrapedAt: string | null;
}

async function main() {
    console.log(`[Ingest] Reading CSV file from ${CSV_PATH}...`);
    const fileContent = fs.readFileSync(CSV_PATH, "utf8");

    const parsed = csv.parse<Record<string, string>>(fileContent, {
        header: true,
        skipEmptyLines: true,
    });

    console.log(`[Ingest] Total rows parsed from CSV: ${parsed.data.length}`);

    // Map & Deduplicate by handle
    const creatorsMap = new Map<string, MergedCreator>();

    for (const row of parsed.data) {
        const handle = cleanHandle(row["Handle"]);
        if (!handle) continue;

        const email = cleanEmail(row["Primary Email"]);
        const phone = cleanPhone(row["Phone / WhatsApp"]);
        const followersRaw = (row["Followers"] || "").trim();
        const followersCount = parseNum(followersRaw);
        const followingCount = parseNum(row["Following"]);
        const postsCount = parseNum(row["Posts"]);
        const category = (row["Category"] || "Lifestyle").trim();
        const kw = (row["Keyword (+ format)"] || "").trim();
        const brand = (row["Brand"] || "").trim() || null;
        const reelUrl = (row["Reel / Post URL"] || "").trim() || null;
        const languages = parseLanguages(row["Language"]);

        if (creatorsMap.has(handle)) {
            const existing = creatorsMap.get(handle)!;
            // Merge emails/phones if missing
            if (!existing.primaryEmail && email) existing.primaryEmail = email;
            if (!existing.phone && phone) existing.phone = phone;
            if (followersCount > existing.followersCount) {
                existing.followersCount = followersCount;
                existing.followersRaw = followersRaw;
            }
            if (postsCount > existing.postsCount) existing.postsCount = postsCount;
            if (category && category !== existing.category) existing.subGenres.add(category);
            if (kw) existing.matchedKeywords.add(kw);
            if (!existing.brandAffinity && brand) existing.brandAffinity = brand;
            if (!existing.sampleReelUrl && reelUrl) existing.sampleReelUrl = reelUrl;
            for (const l of languages) existing.languages.add(l);
        } else {
            const subGenres = new Set<string>();
            const matchedKeywords = new Set<string>();
            if (kw) matchedKeywords.add(kw);

            creatorsMap.set(handle, {
                externalCreatorId: (row["Creator ID"] || "").trim(),
                handle,
                fullName: (row["Full Name"] || "").trim() || handle.replace("@", ""),
                profileUrl: (row["Profile URL"] || `https://www.instagram.com/${handle.replace("@", "")}/`).trim(),
                followersRaw,
                followersCount,
                followingCount,
                postsCount,
                publicBio: (row["Bio (public)"] || "").trim(),
                category,
                subGenres,
                languages: new Set(languages),
                primaryEmail: email,
                phone,
                brandAffinity: brand,
                sampleReelUrl: reelUrl,
                matchedKeywords,
                discoveryKeyword: (row["Query Used"] || kw).trim() || null,
                discoveryEngine: (row["Discovery Engine"] || "").trim() || null,
                isVerified: (row["Profile Verified"] || "").toLowerCase() === "yes",
                indiaSignal: (row["India Signal"] || "").toLowerCase() === "yes",
                scrapedAt: (row["Scraped At"] || "").trim() || null,
            });
        }
    }

    console.log(`[Ingest] Consolidated ${parsed.data.length} rows into ${creatorsMap.size} unique creators.`);

    // Batch insert into PostgreSQL
    const pool = getPool();
    const creatorsList = Array.from(creatorsMap.values());
    const BATCH_SIZE = 250;
    let insertedCount = 0;

    console.log(`[Ingest] Beginning batch insert of ${creatorsList.length} creators (${BATCH_SIZE} per batch)...`);

    for (let i = 0; i < creatorsList.length; i += BATCH_SIZE) {
        const batch = creatorsList.slice(i, i + BATCH_SIZE);
        const values: any[] = [];
        const placeholders: string[] = [];

        batch.forEach((c, idx) => {
            const offset = idx * 24;
            placeholders.push(`(
                $${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5},
                $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9}, $${offset + 10},
                $${offset + 11}, $${offset + 12}, $${offset + 13}, $${offset + 14}, $${offset + 15},
                $${offset + 16}, $${offset + 17}, $${offset + 18}, $${offset + 19}, $${offset + 20},
                $${offset + 21}, $${offset + 22}, $${offset + 23}, $${offset + 24}
            )`);

            const id = `crt_${crypto.randomBytes(8).toString("hex")}`;
            const intakeToken = crypto.randomBytes(16).toString("hex");

            values.push(
                id,
                WORKSPACE_ID,
                c.externalCreatorId,
                c.handle,
                c.fullName,
                c.profileUrl,
                c.primaryEmail,
                c.phone,
                c.followersRaw,
                c.followersCount,
                c.followingCount,
                c.postsCount,
                c.publicBio,
                c.category,
                Array.from(c.subGenres),
                Array.from(c.languages),
                c.brandAffinity,
                c.sampleReelUrl,
                Array.from(c.matchedKeywords),
                c.discoveryKeyword,
                c.discoveryEngine,
                c.isVerified,
                c.indiaSignal,
                intakeToken
            );
        });

        const query = `
            INSERT INTO "Creator" (
                "id", "workspaceId", "externalCreatorId", "handle", "fullName",
                "profileUrl", "primaryEmail", "phone", "followersRaw", "followersCount",
                "followingCount", "postsCount", "publicBio", "category", "subGenres",
                "languages", "brandAffinity", "sampleReelUrl", "matchedKeywords", "discoveryKeyword",
                "discoveryEngine", "isVerified", "indiaSignal", "intakeToken"
            )
            VALUES ${placeholders.join(",\n")}
            ON CONFLICT ("workspaceId", "handle") DO UPDATE SET
                "primaryEmail" = COALESCE("Creator"."primaryEmail", EXCLUDED."primaryEmail"),
                "phone" = COALESCE("Creator"."phone", EXCLUDED."phone"),
                "followersCount" = GREATEST("Creator"."followersCount", EXCLUDED."followersCount"),
                "followersRaw" = EXCLUDED."followersRaw",
                "sampleReelUrl" = COALESCE(EXCLUDED."sampleReelUrl", "Creator"."sampleReelUrl"),
                "subGenres" = ARRAY(SELECT DISTINCT unnest("Creator"."subGenres" || EXCLUDED."subGenres")),
                "matchedKeywords" = ARRAY(SELECT DISTINCT unnest("Creator"."matchedKeywords" || EXCLUDED."matchedKeywords")),
                "updatedAt" = NOW();
        `;

        await pool.query(query, values);
        insertedCount += batch.length;
        if (insertedCount % 1000 === 0 || insertedCount === creatorsList.length) {
            console.log(`[Ingest] Ingested ${insertedCount} / ${creatorsList.length} creators...`);
        }
    }

    console.log(`[Ingest] ✓ Completed! Successfully stored ${insertedCount} unique creators in PostgreSQL database.`);
}

main()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error("[Ingest] ❌ Error:", err);
        process.exit(1);
    });
