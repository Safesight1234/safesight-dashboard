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

async function getAccessToken() {
  const refreshToken = (process.env.TL_REFRESH_TOKEN || '').trim();
  if (!refreshToken) throw new Error('TL_REFRESH_TOKEN not set in environment variables');

  const result = await httpsPost('focus.teamleader.eu', '/oauth2/access_token', {
    grant_type:    'refresh_token',
    client_id:     process.env.TL_CLIENT_ID,
    client_secret: process.env.TL_CLIENT_SECRET,
    refresh_token: refreshToken,
  });

  if (result.error || !result.access_token) {
    throw new Error(`Token refresh failed: ${JSON.stringify(result)}`);
  }

  return result.access_token;
}

module.exports = { getAccessToken, httpsPost };
