const https = require('https');

function httpsPost(hostname, path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req  = https.request({
      hostname, port: 443, path, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data), ...headers },
    }, res => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        try {
          const json = JSON.parse(raw);
          if (res.statusCode >= 400) reject(new Error(`${res.statusCode}: ${JSON.stringify(json).slice(0, 300)}`));
          else resolve(json);
        } catch { reject(new Error(`Non-JSON ${res.statusCode}: ${raw.slice(0, 200)}`)); }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

// Save a new refresh token to Netlify env vars + trigger redeploy
async function persistRefreshToken(newToken) {
  const siteId     = process.env.SITE_ID;
  const netlifyTok = process.env.NETLIFY_TOKEN;
  if (!siteId || !netlifyTok) {
    console.warn('NETLIFY_TOKEN or SITE_ID not set — cannot persist rotated refresh token');
    return;
  }

  const body = JSON.stringify({ key: 'TL_REFRESH_TOKEN', values: [{ value: newToken, context: 'all' }] });

  await new Promise(resolve => {
    const req = https.request({
      hostname: 'api.netlify.com', port: 443,
      path: `/api/v1/sites/${siteId}/env/TL_REFRESH_TOKEN`,
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body), 'Authorization': `Bearer ${netlifyTok}` },
    }, res => { res.resume(); res.on('end', resolve); });
    req.on('error', resolve); // silent fail
    req.write(body);
    req.end();
  });

  // Trigger a new deploy so the updated env var is active
  await new Promise(resolve => {
    const req = https.request({
      hostname: 'api.netlify.com', port: 443,
      path: `/api/v1/sites/${siteId}/builds`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': 2, 'Authorization': `Bearer ${netlifyTok}` },
    }, res => { res.resume(); res.on('end', resolve); });
    req.on('error', resolve);
    req.write('{}');
    req.end();
  });
}

async function getAccessToken() {
  const result = await httpsPost('focus.teamleader.eu', '/oauth2/access_token', {
    grant_type:    'refresh_token',
    client_id:     process.env.TL_CLIENT_ID,
    client_secret: process.env.TL_CLIENT_SECRET,
    refresh_token: process.env.TL_REFRESH_TOKEN,
  });

  if (result.error || !result.access_token) {
    throw new Error(`Token refresh failed: ${JSON.stringify(result)}`);
  }

  // Teamleader rotates refresh tokens — persist the new one
  if (result.refresh_token && result.refresh_token !== process.env.TL_REFRESH_TOKEN) {
    process.env.TL_REFRESH_TOKEN = result.refresh_token; // update in-memory for this invocation
    await persistRefreshToken(result.refresh_token);
  }

  return result.access_token;
}

module.exports = { getAccessToken, persistRefreshToken, httpsPost };
