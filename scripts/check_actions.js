const https = require('https');

function get(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'NodeJS' } }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error('JSON parse error: ' + data.slice(0, 100)));
        }
      });
    }).on('error', reject);
  });
}

(async () => {
  console.log('Fetching latest GitHub Actions runs...');
  const data = await get('https://api.github.com/repos/hajikarim-oss/Email-System-/actions/runs');
  const run = data.workflow_runs?.[0];
  if (!run) {
    console.log('No runs found.');
    return;
  }
  console.log('ID:', run.id);
  console.log('Name:', run.name);
  console.log('Status:', run.status);
  console.log('Conclusion:', run.conclusion);
  console.log('Commit SHA:', run.head_sha);
  console.log('Commit Msg:', run.head_commit?.message);
  console.log('URL:', run.html_url);
})();
