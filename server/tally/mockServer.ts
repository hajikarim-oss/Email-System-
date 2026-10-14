// ==============================================================================
// Tally Prime Mock Server (Simulates Port 9000)
// For Continuous Integration and Zero-Desk Testing
// ==============================================================================

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

export interface MockServerOptions {
    port?: number;
    companyName?: string;
    companyGuid?: string;
    simulateError?: 'NONE' | 'LINE_ERROR' | 'TRUNCATED' | 'OFFLINE';
    simulatedLatencyMs?: number;
}

export class TallyMockServer {
    private server: http.Server | null = null;
    private options: Required<MockServerOptions>;
    private fixturesDir: string;

    constructor(options: MockServerOptions = {}) {
        this.options = {
            port: options.port ?? 9000,
            companyName: options.companyName ?? 'The Brand Master Pvt Ltd',
            companyGuid: options.companyGuid ?? 'TBM-MUMBAI-2025-001',
            simulateError: options.simulateError ?? 'NONE',
            simulatedLatencyMs: options.simulatedLatencyMs ?? 0,
        };
        this.fixturesDir = path.resolve(__dirname, 'fixtures');
    }

    public setSimulateError(err: 'NONE' | 'LINE_ERROR' | 'TRUNCATED' | 'OFFLINE') {
        this.options.simulateError = err;
    }

    public setCompanyName(name: string, guid: string) {
        this.options.companyName = name;
        this.options.companyGuid = guid;
    }

    public start(): Promise<number> {
        return new Promise((resolve, reject) => {
            this.server = http.createServer(async (req, res) => {
                if (this.options.simulatedLatencyMs > 0) {
                    await new Promise(r => setTimeout(r, this.options.simulatedLatencyMs));
                }

                if (this.options.simulateError === 'OFFLINE') {
                    req.destroy();
                    return;
                }

                // Health check probe
                if (req.method === 'GET' && req.url === '/ping') {
                    res.writeHead(200, { 'Content-Type': 'text/plain' });
                    res.end('PONG');
                    return;
                }

                if (req.method !== 'POST') {
                    res.writeHead(405, { 'Content-Type': 'text/plain' });
                    res.end('Method Not Allowed. Tally XML expects POST.');
                    return;
                }

                let body = '';
                req.on('data', chunk => {
                    body += chunk.toString();
                });

                req.on('end', () => {
                    this.handleTallyRequest(body, res);
                });
            });

            this.server.on('error', (err: any) => {
                if (err.code === 'EADDRINUSE') {
                    // Try fallback port if 9000 is occupied
                    this.options.port += 1;
                    this.server?.listen(this.options.port);
                } else {
                    reject(err);
                }
            });

            this.server.listen(this.options.port, () => {
                resolve(this.options.port);
            });
        });
    }

    public stop(): Promise<void> {
        return new Promise(resolve => {
            if (this.server) {
                this.server.close(() => {
                    this.server = null;
                    resolve();
                });
            } else {
                resolve();
            }
        });
    }

    public getPort(): number {
        return this.options.port;
    }

    private handleTallyRequest(reqXml: string, res: http.ServerResponse) {
        res.setHeader('Content-Type', 'text/xml; charset=utf-8');

        // Check simulated error modes
        if (this.options.simulateError === 'LINE_ERROR') {
            const errXml = fs.readFileSync(path.join(this.fixturesDir, 'error_response.xml'), 'utf-8');
            res.writeHead(200);
            res.end(errXml);
            return;
        }

        if (this.options.simulateError === 'TRUNCATED') {
            const truncXml = fs.readFileSync(path.join(this.fixturesDir, 'truncated_response.xml'), 'utf-8');
            res.writeHead(200);
            res.end(truncXml);
            return;
        }

        // Route by REPORTNAME
        if (reqXml.includes('<REPORTNAME>Company Details</REPORTNAME>')) {
            let detailsXml = fs.readFileSync(path.join(this.fixturesDir, 'company_details.xml'), 'utf-8');
            detailsXml = detailsXml.replace('The Brand Master Pvt Ltd', this.options.companyName);
            detailsXml = detailsXml.replace('TBM-MUMBAI-2025-001', this.options.companyGuid);
            res.writeHead(200);
            res.end(detailsXml);
            return;
        }

        if (reqXml.includes('<REPORTNAME>Voucher Register</REPORTNAME>')) {
            let combinedVouchers = '<ENVELOPE><HEADER><TALLYREQUEST>Export Data</TALLYREQUEST></HEADER><BODY><EXPORTDATA>';

            // Check if specific voucher type requested
            if (reqXml.includes('<VOUCHERTYPENAME>Sales</VOUCHERTYPENAME>')) {
                const sales = fs.readFileSync(path.join(this.fixturesDir, 'vouchers_sales.xml'), 'utf-8');
                const vchs = sales.match(/<VOUCHER[\s\S]*?<\/VOUCHER>/gi) || [];
                combinedVouchers += vchs.join('\n');
            } else if (reqXml.includes('<VOUCHERTYPENAME>Receipt</VOUCHERTYPENAME>')) {
                const receipts = fs.readFileSync(path.join(this.fixturesDir, 'vouchers_receipts.xml'), 'utf-8');
                const vchs = receipts.match(/<VOUCHER[\s\S]*?<\/VOUCHER>/gi) || [];
                combinedVouchers += vchs.join('\n');
            } else if (reqXml.includes('<VOUCHERTYPENAME>Payment</VOUCHERTYPENAME>')) {
                const payments = fs.readFileSync(path.join(this.fixturesDir, 'vouchers_payments.xml'), 'utf-8');
                const vchs = payments.match(/<VOUCHER[\s\S]*?<\/VOUCHER>/gi) || [];
                combinedVouchers += vchs.join('\n');
            } else {
                // Return all voucher fixtures combined
                const sales = fs.readFileSync(path.join(this.fixturesDir, 'vouchers_sales.xml'), 'utf-8');
                const receipts = fs.readFileSync(path.join(this.fixturesDir, 'vouchers_receipts.xml'), 'utf-8');
                const payments = fs.readFileSync(path.join(this.fixturesDir, 'vouchers_payments.xml'), 'utf-8');
                const all = [
                    ...(sales.match(/<VOUCHER[\s\S]*?<\/VOUCHER>/gi) || []),
                    ...(receipts.match(/<VOUCHER[\s\S]*?<\/VOUCHER>/gi) || []),
                    ...(payments.match(/<VOUCHER[\s\S]*?<\/VOUCHER>/gi) || [])
                ];
                combinedVouchers += all.join('\n');
            }

            combinedVouchers += '</EXPORTDATA></BODY></ENVELOPE>';
            res.writeHead(200);
            res.end(combinedVouchers);
            return;
        }

        if (reqXml.includes('<REPORTNAME>Trial Balance</REPORTNAME>')) {
            const tbXml = fs.readFileSync(path.join(this.fixturesDir, 'trial_balance.xml'), 'utf-8');
            res.writeHead(200);
            res.end(tbXml);
            return;
        }

        // Default response: empty valid envelope
        res.writeHead(200);
        res.end('<ENVELOPE><HEADER><TALLYREQUEST>Export Data</TALLYREQUEST></HEADER><BODY><DATA></DATA></BODY></ENVELOPE>');
    }
}
