import http from 'node:http';

async function sendTally(xml: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const req = http.request({
            hostname: '127.0.0.1',
            port: 9000,
            path: '/',
            method: 'POST',
            headers: {
                'Content-Type': 'text/xml; charset=utf-8',
                'Content-Length': Buffer.byteLength(xml),
            },
            timeout: 20000,
        }, (res) => {
            let data = '';
            res.on('data', chunk => { data += chunk; });
            res.on('end', () => resolve(data));
        });
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
        req.write(xml);
        req.end();
    });
}

async function run() {
    console.log('--- 1. Testing Standard TDL Collection Export for Ledgers ---');
    const collectionLedgersXml = `<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Export</TALLYREQUEST>
    <TYPE>Collection</TYPE>
    <ID>SyncLedgers</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
      </STATICVARIABLES>
      <TDL>
        <TDLMESSAGE>
          <COLLECTION NAME="SyncLedgers">
            <TYPE>Ledger</TYPE>
            <FETCH>Name, Parent, OpeningBalance, ClosingBalance, AlterId, TaxType</FETCH>
          </COLLECTION>
        </TDLMESSAGE>
      </TDL>
    </DESC>
  </BODY>
</ENVELOPE>`;

    try {
        const res = await sendTally(collectionLedgersXml);
        console.log(`Received: ${res.length} bytes`);

        // Check if XML has LEDGER elements
        const matches = [...res.matchAll(/<LEDGER\s+NAME="([^"]+)"[^>]*>([\s\S]*?)<\/LEDGER>/gi)];
        console.log(`Found ${matches.length} Ledgers via Collection Export!`);

        if (matches.length > 0) {
            console.log('\nSample of 20 Discovered Ledgers:');
            matches.slice(0, 20).forEach((m, idx) => {
                const name = m[1];
                const parent = m[2].match(/<PARENT[^>]*>([^<]+)<\/PARENT>/i)?.[1] || 'Primary';
                const closing = m[2].match(/<CLOSINGBALANCE[^>]*>([^<]+)<\/CLOSINGBALANCE>/i)?.[1] || '0';
                const alterId = m[2].match(/<ALTERID[^>]*>([^<]+)<\/ALTERID>/i)?.[1] || 'N/A';
                console.log(`   [#${idx + 1}] "${name}" | Group: "${parent}" | Balance: ${closing} | AlterID: ${alterId}`);
            });

            // Group summary
            const groups: Record<string, number> = {};
            matches.forEach(m => {
                const parent = m[2].match(/<PARENT[^>]*>([^<]+)<\/PARENT>/i)?.[1] || 'Primary';
                groups[parent] = (groups[parent] || 0) + 1;
            });

            console.log('\n📊 LEDGER GROUP HIERARCHY:');
            Object.entries(groups).sort((a, b) => b[1] - a[1]).slice(0, 15).forEach(([grp, count]) => {
                console.log(`   • ${grp.padEnd(30)}: ${count} ledgers`);
            });
        } else {
            console.log('First 1000 chars of response:');
            console.log(res.slice(0, 1000));
        }

    } catch (err: any) {
        console.error('Collection export error:', err.message);
    }

    console.log('\n--- 2. Testing Standard TDL Collection Export for Vouchers ---');
    const collectionVouchersXml = `<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Export</TALLYREQUEST>
    <TYPE>Collection</TYPE>
    <ID>SyncVouchers</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
      </STATICVARIABLES>
      <TDL>
        <TDLMESSAGE>
          <COLLECTION NAME="SyncVouchers">
            <TYPE>Voucher</TYPE>
            <FETCH>Date, VoucherNumber, VoucherTypeName, PartyLedgerName, Amount, AlterId, Narration</FETCH>
          </COLLECTION>
        </TDLMESSAGE>
      </TDL>
    </DESC>
  </BODY>
</ENVELOPE>`;

    try {
        const vRes = await sendTally(collectionVouchersXml);
        console.log(`Voucher response length: ${vRes.length} bytes`);
        const vMatches = [...vRes.matchAll(/<VOUCHER\s+[^>]*>([\s\S]*?)<\/VOUCHER>/gi)];
        console.log(`Found ${vMatches.length} Vouchers!`);

        if (vMatches.length > 0) {
            console.log('\nSample of 10 Vouchers:');
            let maxAlterId = 0;
            vMatches.slice(0, 10).forEach(m => {
                const b = m[1];
                const date = b.match(/<DATE[^>]*>([^<]+)<\/DATE>/i)?.[1] || '';
                const vNum = b.match(/<VOUCHERNUMBER[^>]*>([^<]+)<\/VOUCHERNUMBER>/i)?.[1] || 'N/A';
                const vType = b.match(/<VOUCHERTYPENAME[^>]*>([^<]+)<\/VOUCHERTYPENAME>/i)?.[1] || '';
                const party = b.match(/<PARTYLEDGERNAME[^>]*>([^<]+)<\/PARTYLEDGERNAME>/i)?.[1] || '';
                const amt = b.match(/<AMOUNT[^>]*>([^<]+)<\/AMOUNT>/i)?.[1] || '0';
                const alterId = parseInt(b.match(/<ALTERID[^>]*>([^<]+)<\/ALTERID>/i)?.[1] || '0', 10);
                if (alterId > maxAlterId) maxAlterId = alterId;
                console.log(`   • [${vType}] #${vNum} (${date}) | Party: "${party}" | ₹${amt} | AlterID: ${alterId}`);
            });

            for (const m of vMatches) {
                const alterId = parseInt(m[1].match(/<ALTERID[^>]*>([^<]+)<\/ALTERID>/i)?.[1] || '0', 10);
                if (alterId > maxAlterId) maxAlterId = alterId;
            }
            console.log(`\n🌊 HIGHEST ALTERID WATERMARK IN TALLY: #${maxAlterId}`);
        } else {
            console.log('First 1000 chars of voucher response:');
            console.log(vRes.slice(0, 1000));
        }
    } catch (err: any) {
        console.error('Voucher collection export error:', err.message);
    }
}

run();
