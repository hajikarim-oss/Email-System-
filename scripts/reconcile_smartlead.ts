import { pgQuery } from '../server/pg';
import { smartleadPrimary, smartleadSecondary } from '../server/smartleadKeys';
import https from 'https';

const PRIMARY_KEY = smartleadPrimary();
const SECONDARY_KEY = smartleadSecondary();

function apiCall(endpoint: string, method: string = 'GET', body?: any, apiKey: string = PRIMARY_KEY): Promise<{ status: number; data: any }> {
    return new Promise((resolve, reject) => {
        const separator = endpoint.includes('?') ? '&' : '?';
        const url = `https://server.smartlead.ai/api/v1${endpoint}${separator}api_key=${apiKey}`;
        const payload = body ? JSON.stringify(body) : '';
        const req = https.request(url, {
            method,
            headers: {
                'Content-Type': 'application/json',
                ...(body ? { 'Content-Length': Buffer.byteLength(payload) } : {})
            }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve({ status: res.statusCode || 200, data: JSON.parse(data) });
                } catch {
                    resolve({ status: res.statusCode || 200, data });
                }
            });
        });
        req.on('error', reject);
        if (payload) req.write(payload);
        req.end();
    });
}

export async function fetchAllSmartleadLeads(providerId: string): Promise<any[]> {
    const allLeads: any[] = [];
    let offset = 0;
    const limit = 100;
    while (true) {
        const res = await apiCall(`/campaigns/${providerId}/leads?limit=${limit}&offset=${offset}`);
        if (res.status !== 200 || !res.data) break;
        const total = res.data.total_leads || 0;
        const batch = Array.isArray(res.data.data) ? res.data.data : [];
        if (batch.length === 0) break;
        allLeads.push(...batch);
        offset += limit;
        if (offset >= total || batch.length < limit) break;
    }
    return allLeads;
}

export async function reconcileSmartlead() {
    console.log('[Reconcile] Starting Smartlead -> DB reconciliation...');

    const users = await pgQuery<any>(`SELECT id, email, name, role FROM "User"`);
    let masterUserId = '';
    for (const u of users) {
        if (u.role === 'MASTER' || !masterUserId) masterUserId = u.id;
    }

    const snehalId = users.find((u: any) => u.name?.toLowerCase().includes('snehal') || u.email?.toLowerCase().includes('snehal'))?.id || masterUserId;
    const vatsalId = users.find((u: any) => u.name?.toLowerCase().includes('vatsal') || u.email?.toLowerCase().includes('vatsal'))?.id || masterUserId;
    const preetiId = users.find((u: any) => u.name?.toLowerCase().includes('preeti') || u.email?.toLowerCase().includes('preeti'))?.id || masterUserId;

    const res = await apiCall('/campaigns');
    if (!Array.isArray(res.data)) {
        console.warn('[Reconcile] Could not fetch campaigns from Smartlead:', res.data);
        return;
    }

    const slCampaigns = res.data;
    console.log(`[Reconcile] Found ${slCampaigns.length} campaigns on Smartlead.`);

    for (const sl of slCampaigns) {
        const providerId = String(sl.id);
        const slName = (sl.name || `Campaign ${sl.id}`).trim();

        const existing = await pgQuery<any>(
            `SELECT id, name, status, "providerCampaignId", "userId" FROM "Campaign"
             WHERE "providerCampaignId" = $1 OR LOWER(name) = LOWER($2) LIMIT 1`,
            [providerId, slName]
        );

        let targetUserId = masterUserId;
        const nameLower = slName.toLowerCase();
        if (nameLower.includes('snehal')) targetUserId = snehalId;
        else if (nameLower.includes('vatsal')) targetUserId = vatsalId;
        else if (nameLower.includes('preeti')) targetUserId = preetiId;

        let mappedStatus = 'DRAFT';
        const slStatus = (sl.status || '').toUpperCase();
        if (slStatus === 'ACTIVE' || slStatus === 'RUNNING' || slStatus === 'START') mappedStatus = 'ACTIVE';
        else if (slStatus === 'COMPLETED' || slStatus === 'FINISHED') mappedStatus = 'COMPLETED';
        else if (slStatus === 'PAUSED' || slStatus === 'STOPPED') mappedStatus = 'PAUSED';

        let campDbId = '';

        if (existing.length === 0) {
            console.log(`[Reconcile] Inserting missing campaign: "${slName}" (Smartlead #${providerId})`);
            const inserted = await pgQuery<any>(
                `INSERT INTO "Campaign" (id, "userId", name, status, "providerCampaignId", "sendTimezone", "preferredSendHour", "preferredSendDays", "createdAt", "updatedAt")
                 VALUES (gen_random_uuid()::text, $1, $2, $3, $4, 'Asia/Kolkata', 10, '{1,2,3,4,5}', COALESCE($5::timestamptz, NOW()), NOW())
                 RETURNING id`,
                [targetUserId, slName, mappedStatus, providerId, sl.created_at || null]
            );
            campDbId = inserted?.[0]?.id;
        } else {
            campDbId = existing[0].id;
            await pgQuery(
                `UPDATE "Campaign"
                 SET "providerCampaignId" = $1, status = $2, "updatedAt" = NOW()
                 WHERE id = $3`,
                [providerId, mappedStatus, campDbId]
            );
        }

        // Fetch leads for this campaign from Smartlead if count is 0
        const dbLeadCount = await pgQuery<any>(
            `SELECT COUNT(*)::int as count FROM "Lead" WHERE "campaignId" = $1`,
            [campDbId]
        );
        const count = dbLeadCount?.[0]?.count || 0;

        if (count === 0 && providerId) {
            console.log(`[Reconcile] Fetching leads for campaign #${providerId}...`);
            const leadsList = await fetchAllSmartleadLeads(providerId);
            if (leadsList.length > 0) {
                console.log(`[Reconcile] Inserting ${leadsList.length} leads for campaign "${slName}"...`);
                for (const item of leadsList) {
                    const l = item.lead || item;
                    const email = (l.email || l.lead_email || '').toLowerCase().trim();
                    if (!email || !email.includes('@')) continue;
                    const fName = (l.first_name || l.firstName || email.split('@')[0]).slice(0, 100);
                    const lName = (l.last_name || l.lastName || '').slice(0, 100);
                    const company = (l.company_name || l.company || '').slice(0, 100);
                    await pgQuery(
                        `INSERT INTO "Lead" (id, "campaignId", email, "firstName", "lastName", company, source, status, "createdAt", "updatedAt")
                         VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, 'smartlead', 'ACTIVE', NOW(), NOW())
                         ON CONFLICT (email, "campaignId") DO NOTHING`,
                        [campDbId, email, fName, lName, company]
                    ).catch(() => {});
                }
                console.log(`[Reconcile] ✓ ${leadsList.length} leads populated for "${slName}".`);
            }
        }
    }

    console.log('[Reconcile] Done! All Smartlead campaigns reconciled into PostgreSQL.');
}

if (process.argv[1]?.includes('reconcile_smartlead')) {
    reconcileSmartlead().then(() => process.exit(0)).catch((err) => {
        console.error(err);
        process.exit(1);
    });
}
