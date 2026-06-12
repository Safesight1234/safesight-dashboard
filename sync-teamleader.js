require('dotenv').config();
const https = require('https');
const fs = require('fs');

function httpsGet(hostname, path, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname, port: 443, path, method: 'GET',
      headers: { 'User-Agent': 'safesight', ...headers },
    }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          if (res.statusCode >= 400) reject(new Error(`${res.statusCode}: ${data.slice(0, 200)}`));
          else resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`Parse error: ${data.slice(0, 100)}`));
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

function httpsPost(hostname, path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = https.request({
      hostname, port: 443, path, method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        'User-Agent': 'safesight',
        ...headers,
      },
    }, res => {
      let raw = '';
      res.on('data', chunk => raw += chunk);
      res.on('end', () => {
        try {
          if (res.statusCode >= 400) reject(new Error(`${res.statusCode}: ${raw.slice(0, 200)}`));
          else resolve(JSON.parse(raw));
        } catch (e) {
          reject(new Error(`Parse error: ${raw.slice(0, 100)}`));
        }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function getAccessToken() {
  const refreshToken = process.env.TL_REFRESH_TOKEN;
  if (!refreshToken) throw new Error('TL_REFRESH_TOKEN not set');

  const result = await httpsPost('focus.teamleader.eu', '/oauth2/access_token', {
    grant_type: 'refresh_token',
    client_id: process.env.TL_CLIENT_ID,
    client_secret: process.env.TL_CLIENT_SECRET,
    refresh_token: refreshToken,
  });

  if (result.error) throw new Error(`Token error: ${result.error}`);
  return result.access_token;
}

async function fetchDeals(token) {
  const deals = [];
  let page = 1;

  while (true) {
    const res = await httpsPost('api.focus.teamleader.eu', '/deals.list', {
      filter: { pipeline_ids: [process.env.TL_PIPELINE_1, process.env.TL_PIPELINE_2] },
      page: { size: 100, number: page },
      includes: 'custom_fields,pipeline_stage',
    }, { Authorization: `Bearer ${token}` });

    if (!res.data) break;
    deals.push(...res.data);

    if (res.data.length < 100) break;
    page++;
  }

  return deals;
}

async function fetchCompanies(token) {
  const companies = [];
  let page = 1;

  while (true) {
    const res = await httpsPost('api.focus.teamleader.eu', '/companies.list', {
      page: { size: 100, number: page },
      includes: 'custom_fields',
    }, { Authorization: `Bearer ${token}` });

    if (!res.data) break;
    companies.push(...res.data);

    if (res.data.length < 100) break;
    page++;
  }

  return companies;
}

async function sync() {
  try {
    console.log('🔄 Syncing Teamleader...');

    const token = await getAccessToken();
    console.log('✅ Got access token');

    const deals = await fetchDeals(token);
    console.log(`✅ Fetched ${deals.length} deals`);

    const companies = await fetchCompanies(token);
    console.log(`✅ Fetched ${companies.length} companies`);

    // Extract customer contracts
    const currentCustomers = {};
    const contractField = process.env.TL_FIELD_CONTRACT_END || '1be6a084-9641-0845-895e-f61f97164e06';

    companies.forEach(company => {
      const field = (company.custom_fields || []).find(f => f.definition?.id === contractField);
      if (field?.value) {
        let endDate = String(field.value);
        const parts = endDate.split('/');
        if (parts.length === 3) {
          endDate = `${parts[2]}-${parts[1]}-${parts[0]}`;
        }
        if (endDate >= '2026-01-01') {
          currentCustomers[company.name] = { start: '2020-01-01', end: endDate };
        }
      }
    });

    console.log(`✅ Extracted ${Object.keys(currentCustomers).length} active contracts`);

    // Save data
    const output = {
      generated: new Date().toISOString().slice(0, 10),
      deals,
      currentCustomers,
    };

    fs.writeFileSync('/home/claude/repo/project/dashboard/data.json', JSON.stringify(output, null, 2));
    console.log('✅ Data saved to data.json');

    return { success: true, deals: deals.length, customers: Object.keys(currentCustomers).length };
  } catch (err) {
    console.error('❌ Sync failed:', err.message);
    throw err;
  }
}

// Run sync
sync().then(result => {
  console.log('\n✅ Sync complete:', result);
  process.exit(0);
}).catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
