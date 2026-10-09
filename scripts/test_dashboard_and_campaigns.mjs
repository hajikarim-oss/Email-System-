import https from 'node:https';
import http from 'node:http';

async function postJson(url, data) {
    const isHttps = url.startsWith('https:');
    const u = new URL(url);
    const bodyStr = JSON.stringify(data);
    const mod = isHttps ? https : http;

    return new Promise((resolve, reject) => {
        const req = mod.request({
            hostname: u.hostname,
            port: u.port || (isHttps ? 443 : 80),
            path: u.pathname + u.search,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(bodyStr)
            }
        }, (res) => {
            let out = '';
            res.on('data', d => out += d);
            res.on('end', () => {
                try {
                    resolve({ status: res.statusCode, data: JSON.parse(out) });
                } catch {
                    resolve({ status: res.statusCode, raw: out });
                }
            });
        });
        req.on('error', reject);
        req.write(bodyStr);
        req.end();
    });
}

async function getJson(url, token) {
    const isHttps = url.startsWith('https:');
    const u = new URL(url);
    const mod = isHttps ? https : http;

    return new Promise((resolve, reject) => {
        const req = mod.request({
            hostname: u.hostname,
            port: u.port || (isHttps ? 443 : 80),
            path: u.pathname + u.search,
            method: 'GET',
            headers: {
                ...(token ? { 'Authorization': `Bearer ${token}` } : {})
            }
        }, (res) => {
            let out = '';
            res.on('data', d => out += d);
            res.on('end', () => {
                try {
                    resolve({ status: res.statusCode, data: JSON.parse(out) });
                } catch {
                    resolve({ status: res.statusCode, raw: out });
                }
            });
        });
        req.on('error', reject);
        req.end();
    });
}

async function run() {
    const baseUrl = 'http://localhost:5173';
    console.log('Logging in as Snehal...');
    const loginRes = await postJson(`${baseUrl}/api/auth/login`, {
        email: 'snehal.maurya@theboredmonkey.com',
        password: '9538564601Aa'
    });
    console.log('Login result status:', loginRes.status);
    console.log('Login response keys:', Object.keys(loginRes.data || {}));
    const token = loginRes.data?.session?.access_token || loginRes.data?.token?.access_token || loginRes.data?.token || loginRes.data?.access_token;
    console.log('Token received:', typeof token === 'string' ? token.slice(0, 20) + '...' : JSON.stringify(token));

    if (!token) {
        console.error('Login failed:', loginRes);
        return;
    }

    console.log('\n--- 1. Testing GET /api/intelligence/campaigns ---');
    const campRes = await getJson(`${baseUrl}/api/intelligence/campaigns`, token);
    console.log('Status:', campRes.status);
    console.log('Campaigns count:', Array.isArray(campRes.data) ? campRes.data.length : 'not array');
    if (Array.isArray(campRes.data)) {
        console.log('Campaigns:', campRes.data.map(c => ({ id: c.id, name: c.name, userId: c.userId, user_id: c.user_id, status: c.status, total_leads: c.total_leads })));
    }

    console.log('\n--- 2. Testing GET /api/campaigns/stats ---');
    const statsRes = await getJson(`${baseUrl}/api/campaigns/stats`, token);
    console.log('Status:', statsRes.status);
    console.log('Stats:', statsRes.data);

    console.log('\n--- 3. Testing GET /api/analytics/dashboard?period=7d ---');
    const dashRes = await getJson(`${baseUrl}/api/analytics/dashboard?period=7d`, token);
    console.log('Dashboard status:', dashRes.status);
    console.log('Dashboard overall_stats:', dashRes.data?.overall_stats);

    console.log('\n--- 4. Testing GET /api/analytics/report ---');
    const repRes = await getJson(`${baseUrl}/api/analytics/report`, token);
    console.log('Report status:', repRes.status);
    console.log('Report lifetime:', repRes.data?.lifetime);
}

run().catch(console.error);
