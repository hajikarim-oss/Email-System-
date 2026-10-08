const http = require('http');

function makeRequest(method, path, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({
            status: res.statusCode,
            data: data ? JSON.parse(data) : null,
            headers: res.headers
          });
        } catch (e) {
          resolve({ status: res.statusCode, data: data, headers: res.headers });
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function testFlow() {
  try {
    console.log('=== Testing Campaign API Flow ===\n');
    
    // Step 1: Check health
    console.log('1. Checking backend health...');
    const health = await makeRequest('GET', '/api/health');
    console.log(`   Status: ${health.status}`);
    console.log(`   Database: ${health.data?.data?.services?.database || 'unknown'}\n`);
    
    // Step 2: Try to get campaigns without auth
    console.log('2. GET /api/intelligence/campaigns (no auth):');
    const noAuth = await makeRequest('GET', '/api/intelligence/campaigns');
    console.log(`   Status: ${noAuth.status}`);
    if (noAuth.status === 401) {
      console.log('   ✓ Correctly rejected (requires auth)\n');
    }
    
    // Step 3: Check what token format is needed
    console.log('3. Checking /api/auth/me with invalid token:');
    const invalidToken = await makeRequest('GET', '/api/auth/me', null, {
      'Authorization': 'Bearer invalid_token_12345'
    });
    console.log(`   Status: ${invalidToken.status}`);
    console.log(`   This shows the auth system is listening\n`);
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

testFlow();
