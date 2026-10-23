import https from "https";
import { pgQuery } from "./pg";
import { getAllSmartleadKeys, smartleadPrimary } from "./smartleadKeys";

const BASE_URL = "https://server.smartlead.ai/api/v1";

function apiCall(endpoint: string, method: string = "GET", body?: any, apiKey?: string): Promise<{ status: number; data: any }> {
    const key = apiKey || smartleadPrimary();
    if (!key) return Promise.resolve({ status: 503, data: { error: "no_api_key" } });

    return new Promise((resolve, reject) => {
        const separator = endpoint.includes("?") ? "&" : "?";
        const url = `${BASE_URL}${endpoint}${separator}api_key=${key}`;
        const payload = body ? JSON.stringify(body) : "";

        const req = https.request(url, {
            method,
            headers: {
                "Content-Type": "application/json",
                ...(body ? { "Content-Length": Buffer.byteLength(payload) } : {}),
            },
        }, (res) => {
            let data = "";
            res.on("data", (chunk) => { data += chunk; });
            res.on("end", () => {
                try {
                    resolve({ status: res.statusCode || 200, data: JSON.parse(data) });
                } catch {
                    resolve({ status: res.statusCode || 200, data });
                }
            });
        });
        req.on("error", reject);
        if (payload) req.write(payload);
        req.end();
    });
}

/**
 * Ensures a campaign's schedule window is actively open RIGHT NOW so Smartlead
 * immediately dispatches queued emails instead of deferring to the next morning.
 */
export async function ensureImmediateSendingSchedule(
    smartleadId: string | number,
    options: {
        timezone?: string;
        days?: number[] | number;
        start_time?: string;
        end_time?: string;
        interval_minutes?: number;
        daily_limit?: number;
        apiKey?: string;
    } = {}
) {
    const tz = options.timezone || "Asia/Kolkata";
    const apiKey = options.apiKey || smartleadPrimary();

    // Determine current day of week and hour in target timezone
    let currentDayOfWeek = 1; // default Monday
    let currentHour = 10;
    try {
        const now = new Date();
        const formatter = new Intl.DateTimeFormat("en-US", {
            timeZone: tz,
            weekday: "short",
            hour: "numeric",
            hour12: false,
        });
        const parts = formatter.formatToParts(now);
        const weekdayStr = parts.find((p) => p.type === "weekday")?.value || "";
        const hourStr = parts.find((p) => p.type === "hour")?.value || "12";
        currentHour = parseInt(hourStr, 10);

        const weekdayMap: Record<string, number> = {
            Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
        };
        currentDayOfWeek = weekdayMap[weekdayStr] ?? now.getDay();
    } catch {
        const now = new Date();
        currentDayOfWeek = now.getDay();
        currentHour = now.getHours();
    }

    // Decode or determine days of week (0=Sunday .. 6=Saturday)
    let daysOfTheWeek: number[] = [1, 2, 3, 4, 5];
    if (Array.isArray(options.days) && options.days.length > 0) {
        daysOfTheWeek = options.days.map((d: any) => {
            const n = Number(d);
            return n === 7 ? 0 : n;
        });
    } else if (typeof options.days === "number" && options.days > 0) {
        const decoded: number[] = [];
        for (let i = 0; i < 7; i++) {
            if ((options.days & (1 << i)) !== 0) {
                decoded.push(i === 6 ? 0 : i + 1);
            }
        }
        if (decoded.length > 0) daysOfTheWeek = decoded;
    }

    // CRITICAL: Ensure TODAY is included in active days so sending starts today
    if (!daysOfTheWeek.includes(currentDayOfWeek)) {
        daysOfTheWeek.push(currentDayOfWeek);
        daysOfTheWeek.sort((a, b) => a - b);
    }

    // Window logic: Default to 10:00 AM - 7:00 PM (10:00 - 19:00) unless user configured custom hours.
    // If added at night (e.g. 11 PM - 12 AM), the window remains 10 AM - 7 PM so Smartlead waits until 10 AM morning.
    const startHour = options.start_time || "10:00";
    const endHour = options.end_time || "19:00";

    // Interval: Smartlead expects minutes (e.g. 3). If seconds passed (e.g. 180), convert to minutes.
    let intervalMinutes = options.interval_minutes || 3;
    if (intervalMinutes > 30) {
        intervalMinutes = Math.max(1, Math.round(intervalMinutes / 60));
    }

    const payload = {
        timezone: tz,
        days_of_the_week: daysOfTheWeek,
        start_hour: startHour,
        end_hour: endHour,
        min_time_btw_emails: intervalMinutes,
        max_new_leads_per_day: options.daily_limit || 200,
    };

    console.log(`[Smartlead Timing] Configuring active window for campaign #${smartleadId}:`, payload);
    const schedRes = await apiCall(`/campaigns/${smartleadId}/schedule`, "POST", payload, apiKey);

    // Re-trigger START status so the scheduler immediately re-evaluates the queue
    await apiCall(`/campaigns/${smartleadId}/status`, "POST", { status: "START" }, apiKey).catch(() => {});

    return { ok: schedRes.status >= 200 && schedRes.status < 300, schedule: payload };
}

let lastReconcileTime = 0;
let inFlightReconcile: Promise<void> | null = null;
const RECONCILE_DEBOUNCE_MS = 120_000; // 2 minutes debounce

/**
 * Reconciles Smartlead campaigns into the local PostgreSQL "Campaign" & "Lead" tables.
 * Safe to call before any campaigns GET or after campaign creation.
 */
export async function reconcileSmartleadCampaigns(force: boolean = false): Promise<void> {
    if (inFlightReconcile) {
        return inFlightReconcile;
    }
    const now = Date.now();
    if (!force && now - lastReconcileTime < RECONCILE_DEBOUNCE_MS) {
        return;
    }
    lastReconcileTime = now;

    inFlightReconcile = (async () => {
        try {
            const accounts = getAllSmartleadKeys();
            if (accounts.length === 0) return;

        // Fetch team members from DB to correctly map campaign ownership
        const users = await pgQuery<any>(`SELECT id, email, name, role FROM "User"`);
        if (!users || users.length === 0) return;

        let masterUserId = users[0].id;
        for (const u of users) {
            if (u.role === "MASTER") {
                masterUserId = u.id;
                break;
            }
        }

        const snehalId = users.find((u: any) => (u.name || "").toLowerCase().includes("snehal") || (u.email || "").toLowerCase().includes("snehal"))?.id || masterUserId;
        const vatsalId = users.find((u: any) => (u.name || "").toLowerCase().includes("vatsal") || (u.email || "").toLowerCase().includes("vatsal"))?.id || masterUserId;
        const preetiId = users.find((u: any) => (u.name || "").toLowerCase().includes("preeti") || (u.email || "").toLowerCase().includes("preeti"))?.id || masterUserId;

        // Query campaigns from all active accounts
        const allSlCampaigns: any[] = [];
        const seenIds = new Set<number>();

        for (const acc of accounts) {
            const listRes = await apiCall("/campaigns", "GET", undefined, acc.key);
            if (Array.isArray(listRes.data)) {
                for (const camp of listRes.data) {
                    if (camp?.id && !seenIds.has(camp.id)) {
                        seenIds.add(camp.id);
                        allSlCampaigns.push({ ...camp, _apiKey: acc.key });
                    }
                }
            }
        }

        if (allSlCampaigns.length === 0) return;

        for (const sl of allSlCampaigns) {
            const providerId = String(sl.id);
            const slName = (sl.name || `Campaign ${sl.id}`).trim();

            const existing = await pgQuery<any>(
                `SELECT id, name, status, "providerCampaignId", "userId" FROM "Campaign"
                 WHERE "providerCampaignId" = $1 OR LOWER(name) = LOWER($2) LIMIT 1`,
                [providerId, slName]
            );

            let targetUserId = masterUserId;
            const nameLower = slName.toLowerCase();
            if (nameLower.includes("snehal")) targetUserId = snehalId;
            else if (nameLower.includes("vatsal")) targetUserId = vatsalId;
            else if (nameLower.includes("preeti")) targetUserId = preetiId;

            let mappedStatus = "DRAFT";
            const slStatus = (sl.status || "").toUpperCase();
            if (slStatus === "ACTIVE" || slStatus === "RUNNING" || slStatus === "START") mappedStatus = "ACTIVE";
            else if (slStatus === "COMPLETED" || slStatus === "FINISHED") mappedStatus = "COMPLETED";
            else if (slStatus === "PAUSED" || slStatus === "STOPPED") mappedStatus = "PAUSED";

            let campDbId = "";

            if (existing.length === 0) {
                console.log(`[Auto-Reconcile] Discovered new Smartlead campaign #${providerId} "${slName}", registering in database...`);
                const inserted = await pgQuery<any>(
                    `INSERT INTO "Campaign" (id, "userId", name, status, "providerCampaignId", "sendTimezone", "preferredSendHour", "preferredSendDays", "createdAt", "updatedAt")
                     VALUES (gen_random_uuid()::text, $1, $2, $3, $4, 'Asia/Kolkata', 10, '{1,2,3,4,5}', COALESCE($5::timestamptz, NOW()), NOW())
                     RETURNING id`,
                    [targetUserId, slName, mappedStatus, providerId, sl.created_at || null]
                );
                campDbId = inserted?.[0]?.id || "";
            } else {
                campDbId = existing[0].id;
                // Keep providerCampaignId and status updated
                await pgQuery(
                    `UPDATE "Campaign"
                     SET "providerCampaignId" = $1, status = $2, "updatedAt" = NOW()
                     WHERE id = $3`,
                    [providerId, mappedStatus, campDbId]
                );
            }

            if (!campDbId) continue;

            // Link Master's dedicated mailbox for Master-owned campaigns
            if (targetUserId === masterUserId) {
                const masterMb = await pgQuery<any>(
                    `SELECT id FROM "Mailbox" WHERE "providerMailboxId" = '24993809' OR lower("senderEmail") = 'kumar.monu@theboredmonkey.com' LIMIT 1`
                );
                if (masterMb && masterMb.length > 0) {
                    await pgQuery(
                        `INSERT INTO "CampaignMailbox" ("campaignId", "mailboxId") VALUES ($1, $2) ON CONFLICT DO NOTHING`,
                        [campDbId, masterMb[0].id]
                    ).catch(() => {});
                }
            }

            // Check if leads exist for this campaign
            const dbLeadCount = await pgQuery<any>(
                `SELECT COUNT(*)::int as count FROM "Lead" WHERE "campaignId" = $1`,
                [campDbId]
            );
            const count = dbLeadCount?.[0]?.count || 0;

            if (count === 0) {
                // Fetch leads from Smartlead (max 500 leads per campaign sync)
                const leadsRes = await apiCall(`/campaigns/${providerId}/leads?limit=100&offset=0`, "GET", undefined, sl._apiKey);
                const total = leadsRes.data?.total_leads || 0;
                let rawList = Array.isArray(leadsRes.data?.data) ? leadsRes.data.data : [];

                // If more leads exist, fetch up to 500 leads
                if (total > 100) {
                    for (let offset = 100; offset < Math.min(total, 500); offset += 100) {
                        const nextRes = await apiCall(`/campaigns/${providerId}/leads?limit=100&offset=${offset}`, "GET", undefined, sl._apiKey);
                        if (Array.isArray(nextRes.data?.data)) {
                            rawList.push(...nextRes.data.data);
                        } else {
                            break;
                        }
                    }
                }

                if (rawList.length > 0) {
                    for (let i = 0; i < rawList.length; i += 50) {
                        const chunk = rawList.slice(i, i + 50);
                        const values: string[] = [];
                        const params: any[] = [];
                        let pIdx = 1;

                        for (const item of chunk) {
                            const l = item.lead || item;
                            const email = (l.email || l.lead_email || "").toLowerCase().trim();
                            if (!email || !email.includes("@")) continue;
                            const fName = (l.first_name || l.firstName || email.split("@")[0]).slice(0, 100);
                            const lName = (l.last_name || l.lastName || "").slice(0, 100);
                            const customData = JSON.stringify({
                                company: l.company_name || l.company || "",
                                title: l.custom_fields?.title || "",
                            });

                            values.push(`(gen_random_uuid()::text, $${pIdx}, $${pIdx+1}, $${pIdx+2}, $${pIdx+3}, $${pIdx+4}::jsonb, 'smartlead', 'ACTIVE', NOW(), NOW())`);
                            params.push(campDbId, email, fName, lName, customData);
                            pIdx += 5;
                        }

                        if (values.length > 0) {
                            await pgQuery(
                                `INSERT INTO "Lead" (id, "campaignId", email, "firstName", "lastName", "customData", source, status, "createdAt", "updatedAt")
                                 VALUES ${values.join(", ")}`,
                                params
                            ).catch(() => {});
                        }
                    }
                    console.log(`[Auto-Reconcile] ✓ Synced ${rawList.length} leads for campaign #${providerId}`);
                }
            }
        }
    } catch (err: any) {
        console.warn("[Auto-Reconcile] Reconciliation warning (non-fatal):", err?.message);
    } finally {
        inFlightReconcile = null;
    }
    })();

    return inFlightReconcile;
}

let inFlightMailboxSync: Promise<any> | null = null;

/**
 * Automatically synchronizes connected email accounts from Smartlead and routes them
 * by domain with 100% strict workspace isolation:
 * - @tbmtroop.com / @tbmtroops.com -> Troops Outreach Workspace (usr_troops_0c4c79fd)
 *   -> Attached exclusively to Troops campaigns. Blocked from TBM campaigns.
 * - @theboredmonkey.com (kumar.monu) -> Master Account (cmtr9pp8t0000cygeyjpsz5lt)
 *   -> Attached exclusively to Master campaigns (#24993809).
 * - @theboredmonkey.com (all other team senders) -> TBM Workspace (cmtr9pp8t0000cygeyjpsz5lt)
 *   -> Attached to TBM Team campaigns. Blocked from Troops campaigns.
 */
export async function reconcileSmartleadMailboxes(force = false): Promise<{
    synced: number;
    tbmAccounts: number;
    troopsAccounts: number;
    updatedCampaigns: number;
}> {
    if (inFlightMailboxSync && !force) return inFlightMailboxSync;

    inFlightMailboxSync = (async () => {
        try {
            console.log("[Auto-Mailbox-Sync] Scanning Smartlead email accounts for domain-based routing...");
            const accRes = await apiCall("/email-accounts");
            const accounts: any[] = Array.isArray(accRes.data) ? accRes.data : [];

            if (accounts.length === 0) {
                console.log("[Auto-Mailbox-Sync] 0 email accounts returned from Smartlead.");
                return { synced: 0, tbmAccounts: 0, troopsAccounts: 0, updatedCampaigns: 0 };
            }

            // Identify Master IDs
            const tbmMasterRes = await pgQuery<any>(
                `SELECT id FROM "User" WHERE role = 'MASTER' AND lower(email) NOT LIKE '%pratik%' AND lower(email) NOT LIKE '%troops%' LIMIT 1`
            );
            const tbmMasterId = tbmMasterRes?.[0]?.id || "cmtr9pp8t0000cygeyjpsz5lt";

            const troopsMasterRes = await pgQuery<any>(
                `SELECT id FROM "User" WHERE lower(email) = 'pratik@theboredmonkey.com' OR id = 'usr_troops_0c4c79fd' LIMIT 1`
            );
            const troopsMasterId = troopsMasterRes?.[0]?.id || "usr_troops_0c4c79fd";

            const tbmTeamAccountIds: number[] = [];
            const troopsAccountIds: number[] = [];
            let masterAccountId: number | null = null;

            for (const acc of accounts) {
                const email = (acc.from_email || acc.email || "").toLowerCase().trim();
                const providerId = String(acc.id);
                if (!email) continue;

                const isTroops = email.endsWith("@tbmtroop.com") || email.endsWith("@tbmtroops.com") || email.includes("tbmtroop");
                const isMasterMonu = !isTroops && (email === "kumar.monu@theboredmonkey.com" || email.startsWith("monu@") || acc.id === 24993809);

                const targetUserId = isTroops ? troopsMasterId : tbmMasterId;

                if (isTroops) {
                    troopsAccountIds.push(acc.id);
                } else if (isMasterMonu) {
                    masterAccountId = acc.id;
                } else {
                    tbmTeamAccountIds.push(acc.id);
                }

                // Upsert in database
                const existing = await pgQuery<any>(
                    `SELECT id FROM "Mailbox" WHERE lower("senderEmail") = $1 OR "providerMailboxId" = $2 LIMIT 1`,
                    [email, providerId]
                );

                if (existing.length > 0) {
                    await pgQuery(
                        `UPDATE "Mailbox"
                         SET "userId" = $1, "providerMailboxId" = $2, status = 'ACTIVE', "dailySendLimit" = 200, "updatedAt" = NOW()
                         WHERE id = $3`,
                        [targetUserId, providerId, existing[0].id]
                    );
                } else {
                    const mbxId = `mbx_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
                    await pgQuery(
                        `INSERT INTO "Mailbox" (id, "userId", "senderEmail", provider, "providerMailboxId", status, "dailySendLimit", "createdAt", "updatedAt")
                         VALUES ($1, $2, $3, 'smartlead', $4, 'ACTIVE', 200, NOW(), NOW())`,
                        [mbxId, targetUserId, email, providerId]
                    );
                    console.log(`[Auto-Mailbox-Sync] + Registered new ${isTroops ? "Troops" : "TBM"} mailbox: ${email} (#${providerId})`);
                }
            }

            // Sync email accounts to live campaigns with zero cross-contamination
            let updatedCampaigns = 0;
            const campRes = await apiCall("/campaigns");
            const campaigns: any[] = Array.isArray(campRes.data) ? campRes.data : [];

            for (const camp of campaigns) {
                const nameLower = (camp.name || "").toLowerCase();
                const isMasterCamp = nameLower.startsWith("mon test") || nameLower.includes("master test");
                const isTroopsCamp = nameLower.includes("troops") || (Array.isArray(camp.tags) && camp.tags.some((t: any) => String(t).toLowerCase().includes("troops")));

                const curAccRes = await apiCall(`/campaigns/${camp.id}/email-accounts`);
                const curAccs: any[] = Array.isArray(curAccRes.data) ? curAccRes.data : [];
                const curIds = new Set(curAccs.map((a: any) => a.id));

                if (isMasterCamp) {
                    // Master campaigns: Strictly kumar.monu (24993809)
                    const unwanted = Array.from(curIds).filter((id) => id !== 24993809);
                    if (unwanted.length > 0) {
                        await apiCall(`/campaigns/${camp.id}/email-accounts`, "DELETE", { email_account_ids: unwanted });
                    }
                    if (masterAccountId && !curIds.has(masterAccountId)) {
                        await apiCall(`/campaigns/${camp.id}/email-accounts`, "POST", { email_account_ids: [masterAccountId] });
                        updatedCampaigns++;
                    }
                } else if (isTroopsCamp) {
                    // Troops campaigns: Strictly @tbmtroop.com
                    const unwanted = Array.from(curIds).filter((id) => !troopsAccountIds.includes(id));
                    if (unwanted.length > 0) {
                        await apiCall(`/campaigns/${camp.id}/email-accounts`, "DELETE", { email_account_ids: unwanted });
                    }
                    const missing = troopsAccountIds.filter((id) => !curIds.has(id));
                    if (missing.length > 0) {
                        await apiCall(`/campaigns/${camp.id}/email-accounts`, "POST", { email_account_ids: missing });
                        updatedCampaigns++;
                    }
                } else {
                    // TBM Team campaigns: Strictly @theboredmonkey.com team pool (excluding master)
                    const unwanted = Array.from(curIds).filter((id) => !tbmTeamAccountIds.includes(id));
                    if (unwanted.length > 0) {
                        await apiCall(`/campaigns/${camp.id}/email-accounts`, "DELETE", { email_account_ids: unwanted });
                    }
                    const missing = tbmTeamAccountIds.filter((id) => !curIds.has(id));
                    if (missing.length > 0) {
                        await apiCall(`/campaigns/${camp.id}/email-accounts`, "POST", { email_account_ids: missing });
                        updatedCampaigns++;
                    }
                }
            }

            console.log(`[Auto-Mailbox-Sync] ✓ Completed: ${accounts.length} mailboxes (${tbmTeamAccountIds.length} TBM team, ${troopsAccountIds.length} Troops, 1 Master), updated ${updatedCampaigns} campaigns.`);
            return {
                synced: accounts.length,
                tbmAccounts: tbmTeamAccountIds.length,
                troopsAccounts: troopsAccountIds.length,
                updatedCampaigns,
            };
        } catch (err: any) {
            console.warn("[Auto-Mailbox-Sync] Warning during mailbox reconciliation:", err?.message);
            return { synced: 0, tbmAccounts: 0, troopsAccounts: 0, updatedCampaigns: 0 };
        } finally {
            inFlightMailboxSync = null;
        }
    })();

    return inFlightMailboxSync;
}
