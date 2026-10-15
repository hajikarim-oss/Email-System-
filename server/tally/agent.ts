// ==============================================================================
// Tally Prime On-Premises Desktop Sync Agent
// Continuous background sync worker with health probes & AlterID watermarking
// ==============================================================================

import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { TallyXmlBuilder } from './xmlBuilder';
import { TallyXmlParser } from './xmlParser';
import { TallyDbRepository } from './db';
import type {
    TallyAgentStatus,
    TallyParsedVoucher,
    TallyCompanyDetails,
} from './types';

export interface AgentConfig {
    agentId?: string;
    machineName?: string;
    tallyHost?: string;
    tallyPort?: number;
    targetCompanyName?: string;
    targetCompanyGuid?: string;
    pollIntervalMs?: number;
    cloudApiUrl?: string; // If cloud mode
    offlineBufferFile?: string;
    directDbMode?: boolean; // When running co-located with DB
}

export class TallySyncAgent {
    private config: Required<AgentConfig>;
    private status: TallyAgentStatus = 'OFFLINE';
    private activeCompany: TallyCompanyDetails | null = null;
    private timer: NodeJS.Timeout | null = null;
    private isSyncing = false;
    private lastSyncTime: Date | null = null;
    private lastAlterId = 0;
    private offlineBuffer: Array<{ timestamp: string; vouchers: TallyParsedVoucher[] }> = [];

    constructor(config: AgentConfig = {}) {
        const cloudUrl = config.cloudApiUrl ?? (process.env.CLOUD_API_URL || 'https://tbmoutreach.tech');
        this.config = {
            agentId: config.agentId ?? `agent-${os.hostname().toLowerCase()}`,
            machineName: config.machineName ?? os.hostname(),
            tallyHost: config.tallyHost ?? (process.env.TALLY_HOST || '127.0.0.1'),
            tallyPort: config.tallyPort ?? (process.env.TALLY_PORT ? parseInt(process.env.TALLY_PORT, 10) : 9000),
            targetCompanyName: config.targetCompanyName ?? (process.env.TALLY_COMPANY || 'any'),
            targetCompanyGuid: config.targetCompanyGuid ?? (process.env.TALLY_COMPANY_GUID || '9327a748-5d1b-47ad-b8a1-bd5ff78b4129'),
            pollIntervalMs: config.pollIntervalMs ?? 15000,
            cloudApiUrl: cloudUrl,
            offlineBufferFile: config.offlineBufferFile ?? path.resolve(process.cwd(), '.tally_offline_buffer.json'),
            directDbMode: config.directDbMode ?? (!cloudUrl),
        };

        this.loadOfflineBuffer();
    }

    public getStatus(): TallyAgentStatus {
        return this.status;
    }

    public getActiveCompany(): TallyCompanyDetails | null {
        return this.activeCompany;
    }

    public getLastSyncTime(): Date | null {
        return this.lastSyncTime;
    }

    public getLastAlterId(): number {
        return this.lastAlterId;
    }

    /**
     * Start the continuous sync agent loop
     */
    public async start(): Promise<void> {
        console.log(`[TallyAgent] Starting agent ${this.config.agentId} on ${this.config.machineName}`);
        console.log(`[TallyAgent] Target Company: "${this.config.targetCompanyName}"`);
        console.log(`[TallyAgent] Probing Tally on http://${this.config.tallyHost}:${this.config.tallyPort}`);

        // Run initial checkpoint restoration
        if (this.config.directDbMode) {
            try {
                this.lastAlterId = await TallyDbRepository.getCheckpoint(this.config.targetCompanyGuid, 'VOUCHERS');
                console.log(`[TallyAgent] Resumed AlterID watermark checkpoint: ${this.lastAlterId}`);
            } catch (err: any) {
                console.warn(`[TallyAgent] DB checkpoint read warning: ${err.message}. Starting from alter_id=0.`);
            }
        }

        // Run immediate initial check
        await this.syncCycle();

        // Schedule periodic sync
        this.timer = setInterval(async () => {
            if (!this.isSyncing) {
                await this.syncCycle();
            }
        }, this.config.pollIntervalMs);
    }

    /**
     * Stop the agent loop cleanly
     */
    public async stop(): Promise<void> {
        console.log(`[TallyAgent] Stopping agent ${this.config.agentId}...`);
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
        this.status = 'DRAINING';
        this.saveOfflineBuffer();
        this.status = 'OFFLINE';
        console.log(`[TallyAgent] Agent stopped.`);
    }

    /**
     * Core sync cycle: probe -> state evaluate -> incremental pull -> persist
     */
    public async syncCycle(): Promise<{ status: TallyAgentStatus; recordsSynced: number }> {
        this.isSyncing = true;
        let recordsSynced = 0;

        try {
            // 1. Probe Tally readiness
            const probeResult = await this.probeTallyReadiness();
            this.status = probeResult.status;
            this.activeCompany = probeResult.company;

            // Report heartbeat
            await this.reportHeartbeat();

            // 2. Health-Gated Dispatch check
            if (this.status !== 'ONLINE_READY') {
                return { status: this.status, recordsSynced: 0 };
            }

            // 3. Flush offline buffer if any pending from prior network downtime
            await this.flushOfflineBuffer();

            // 4. Perform incremental sync using AlterID watermark
            const syncResult = await this.pullIncrementalVouchers(this.lastAlterId);
            if (syncResult.success && syncResult.vouchers.length > 0) {
                recordsSynced = syncResult.vouchers.length;
                console.log(`[TallyAgent] Pulled ${recordsSynced} new/altered vouchers from Tally.`);

                // Determine maximum AlterID in batch
                let maxAlterId = this.lastAlterId;
                for (const v of syncResult.vouchers) {
                    if (v.alterId > maxAlterId) maxAlterId = v.alterId;
                }

                // Persist vouchers
                await this.persistVouchers(syncResult.vouchers);

                // Advance checkpoint
                this.lastAlterId = maxAlterId;
                if (this.config.directDbMode) {
                    await TallyDbRepository.updateCheckpoint(this.config.targetCompanyGuid, 'VOUCHERS', this.lastAlterId);
                }

                this.lastSyncTime = new Date();
                console.log(`[TallyAgent] Synced successfully. Watermark advanced to AlterID=${this.lastAlterId}`);
            }
        } catch (err: any) {
            console.error(`[TallyAgent] Sync cycle error: ${err.message}`);
        } finally {
            this.isSyncing = false;
        }

        return { status: this.status, recordsSynced };
    }

    /**
     * Lightweight probe to detect Tally state and loaded company
     */
    public async probeTallyReadiness(): Promise<{
        status: TallyAgentStatus;
        company: TallyCompanyDetails | null;
    }> {
        const reqXml = TallyXmlBuilder.buildCompanyDetailsRequest();

        try {
            const resXml = await this.sendHttpXml(reqXml);
            const validation = TallyXmlParser.validateEnvelope(resXml);
            if (!validation.isValid) {
                return { status: 'TALLY_OFFLINE', company: null };
            }

            const company = TallyXmlParser.parseCompanyDetails(resXml);
            if (!company || !company.companyName) {
                return { status: 'COMPANY_CLOSED', company: null };
            }

            // Compare loaded company against target
            const targetNorm = this.config.targetCompanyName.toLowerCase().trim();
            const loadedNorm = company.companyName.toLowerCase().trim();

            if (targetNorm !== '*' && targetNorm !== 'any' && targetNorm !== 'auto' && targetNorm !== 'the brand master pvt ltd') {
                if (targetNorm !== loadedNorm && !loadedNorm.includes(targetNorm)) {
                    console.warn(`[TallyAgent] COMPANY MISMATCH! Target: "${this.config.targetCompanyName}", Loaded: "${company.companyName}"`);
                    return { status: 'COMPANY_MISMATCH', company };
                }
            } else {
                // Adopt active company
                this.config.targetCompanyName = company.companyName;
                if (company.companyGuid) {
                    this.config.targetCompanyGuid = company.companyGuid;
                }
            }

            return { status: 'ONLINE_READY', company };
        } catch (err: any) {
            // ECONNREFUSED or timeout
            return { status: 'TALLY_OFFLINE', company: null };
        }
    }

    /**
     * Pulls vouchers with $ALTERID > lastAlterId
     */
    public async pullIncrementalVouchers(lastAlterId: number): Promise<{
        success: boolean;
        vouchers: TallyParsedVoucher[];
        rawTruncated?: boolean;
    }> {
        const reqXml = TallyXmlBuilder.buildIncrementalVouchersRequest({ lastAlterId });
        const resXml = await this.sendHttpXml(reqXml);
        const parsed = TallyXmlParser.parseVouchers(resXml);

        if (!parsed.success) {
            console.error(`[TallyAgent] Voucher parsing issues:`, parsed.errors);
            if (parsed.rawTruncated) {
                console.warn(`[TallyAgent] Stream truncated. Isolated payload.`);
            }
        }

        return {
            success: parsed.success,
            vouchers: parsed.data,
            rawTruncated: parsed.rawTruncated,
        };
    }

    /**
     * Persists vouchers to database or buffers locally during network outages
     */
    public async persistVouchers(vouchers: TallyParsedVoucher[]): Promise<void> {
        if (!vouchers.length) return;

        let sentToCloud = false;
        if (this.config.cloudApiUrl) {
            try {
                await this.postVouchersToCloud(vouchers);
                sentToCloud = true;
                console.log(`[TallyAgent] Successfully streamed ${vouchers.length} vouchers to ${this.config.cloudApiUrl}`);
            } catch (netErr: any) {
                console.warn(`[TallyAgent] Cloud post failed (${netErr.message}). Buffering locally.`);
                this.bufferLocally(vouchers);
            }
        }

        if (this.config.directDbMode) {
            try {
                await TallyDbRepository.upsertVouchers(this.config.targetCompanyGuid, vouchers);
            } catch (dbErr: any) {
                if (!sentToCloud && !this.config.cloudApiUrl) {
                    console.warn(`[TallyAgent] Database write failed (${dbErr.message}). Buffering to local storage.`);
                    this.bufferLocally(vouchers);
                }
            }
        }
    }

    private bufferLocally(vouchers: TallyParsedVoucher[]) {
        this.offlineBuffer.push({
            timestamp: new Date().toISOString(),
            vouchers,
        });
        this.saveOfflineBuffer();
    }

    private async flushOfflineBuffer(): Promise<void> {
        if (this.offlineBuffer.length === 0) return;

        console.log(`[TallyAgent] Flushing ${this.offlineBuffer.length} offline buffered batches...`);
        const remaining: typeof this.offlineBuffer = [];

        for (const item of this.offlineBuffer) {
            try {
                if (this.config.cloudApiUrl) {
                    await this.postVouchersToCloud(item.vouchers);
                } else if (this.config.directDbMode) {
                    await TallyDbRepository.upsertVouchers(this.config.targetCompanyGuid, item.vouchers);
                }
            } catch {
                remaining.push(item);
            }
        }

        this.offlineBuffer = remaining;
        this.saveOfflineBuffer();
    }

    private loadOfflineBuffer() {
        try {
            if (fs.existsSync(this.config.offlineBufferFile)) {
                const data = fs.readFileSync(this.config.offlineBufferFile, 'utf-8');
                this.offlineBuffer = JSON.parse(data);
                console.log(`[TallyAgent] Loaded ${this.offlineBuffer.length} buffered items from local file.`);
            }
        } catch {
            this.offlineBuffer = [];
        }
    }

    private saveOfflineBuffer() {
        try {
            fs.writeFileSync(this.config.offlineBufferFile, JSON.stringify(this.offlineBuffer, null, 2), 'utf-8');
        } catch (err: any) {
            console.error(`[TallyAgent] Failed to save offline buffer: ${err.message}`);
        }
    }

    private async reportHeartbeat(): Promise<void> {
        if (this.config.directDbMode) {
            try {
                await TallyDbRepository.recordAgentHeartbeat({
                    agentId: this.config.agentId,
                    machineName: this.config.machineName,
                    status: this.status,
                    companyName: this.activeCompany?.companyName,
                    companyGuid: this.activeCompany?.companyGuid,
                    tallyPort: this.config.tallyPort,
                });
            } catch {
                // Ignore heartbeat DB transient errors
            }
        }

        if (this.config.cloudApiUrl) {
            try {
                await this.postHeartbeatToCloud();
            } catch (err: any) {
                console.warn(`[TallyAgent] Cloud heartbeat warning: ${err.message}`);
            }
        }
    }

    private async postHeartbeatToCloud(): Promise<void> {
        return new Promise((resolve, reject) => {
            const postData = JSON.stringify({
                agentId: this.config.agentId,
                machineName: this.config.machineName,
                status: this.status,
                companyName: this.activeCompany?.companyName || this.config.targetCompanyName,
                companyGuid: this.activeCompany?.companyGuid || this.config.targetCompanyGuid,
                tallyVersion: `TallyPrime (Desktop Port ${this.config.tallyPort})`,
                tallyPort: this.config.tallyPort,
            });

            const url = new URL(`${this.config.cloudApiUrl}/api/tally/agent/heartbeat`);
            const client = url.protocol === 'https:' ? https : http;

            const req = client.request(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(postData),
                },
                timeout: 5000,
            }, (res) => {
                if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
                    resolve();
                } else {
                    reject(new Error(`Cloud Heartbeat HTTP ${res.statusCode}`));
                }
            });

            req.on('error', reject);
            req.on('timeout', () => { req.destroy(new Error('Cloud heartbeat timeout')); });
            req.write(postData);
            req.end();
        });
    }

    private async postVouchersToCloud(vouchers: TallyParsedVoucher[]): Promise<void> {
        if (!vouchers.length) return;
        const BATCH_SIZE = 50;
        for (let i = 0; i < vouchers.length; i += BATCH_SIZE) {
            const chunk = vouchers.slice(i, i + BATCH_SIZE);
            await this.sendSingleCloudBatch(chunk);
            console.log(`[TallyAgent] Streamed batch ${Math.min(i + BATCH_SIZE, vouchers.length)}/${vouchers.length} vouchers to cloud.`);
        }
    }

    private sendSingleCloudBatch(vouchers: TallyParsedVoucher[]): Promise<void> {
        return new Promise((resolve, reject) => {
            const postData = JSON.stringify({
                agentId: this.config.agentId,
                companyGuid: this.config.targetCompanyGuid,
                vouchers,
            });

            const url = new URL(`${this.config.cloudApiUrl}/api/tally/agent/vouchers`);
            const client = url.protocol === 'https:' ? https : http;

            const req = client.request(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(postData),
                },
                timeout: 30000,
            }, (res) => {
                if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
                    resolve();
                } else {
                    reject(new Error(`Cloud HTTP Error ${res.statusCode}`));
                }
            });

            req.on('error', reject);
            req.on('timeout', () => { req.destroy(new Error('Cloud request timeout')); });
            req.write(postData);
            req.end();
        });
    }

    /**
     * Executes HTTP POST against Tally Prime local port
     */
    private sendHttpXml(xmlBody: string): Promise<string> {
        return new Promise((resolve, reject) => {
            const req = http.request({
                hostname: this.config.tallyHost,
                port: this.config.tallyPort,
                path: '/',
                method: 'POST',
                headers: {
                    'Content-Type': 'text/xml; charset=utf-8',
                    'Content-Length': Buffer.byteLength(xmlBody),
                },
                timeout: 60000,
            }, (res) => {
                let data = '';
                res.on('data', chunk => { data += chunk; });
                res.on('end', () => resolve(data));
            });

            req.on('error', reject);
            req.on('timeout', () => {
                req.destroy(new Error('Tally XML request timeout'));
            });

            req.write(xmlBody);
            req.end();
        });
    }
}

// Standalone CLI runner when executed directly via `npx tsx server/tally/agent.ts`
if (require.main === module) {
    const agent = new TallySyncAgent();
    agent.start().catch(err => {
        console.error('Fatal agent startup error:', err);
    });

    process.on('SIGINT', async () => {
        console.log('\nReceived SIGINT. Shutting down agent...');
        await agent.stop();
        process.exit(0);
    });
}
