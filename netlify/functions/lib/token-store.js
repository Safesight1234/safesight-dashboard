const https = require('https');

const FILENAME = 'safesight-tl-tokens.json';

function ghRequest(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req  = https.request({
      hostname: 'api.github.com', port: 443, path, method,
      headers: {
        Authorization: `Bearer ${token}`,
        'User-Agent': 'safesight-dashboard',
        Accept: 'application/vnd.github+json',
        ...(data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}),
      },
    }, res => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        try {
          const json = JSON.parse(raw);
          if (res.statusCode >= 400) reject(new Error(`GitHub ${res.statusCode}: ${JSON.stringify(json).slice(0, 200)}`));
          else resolve(json);
        } catch { reject(new Error(`GitHub non-JSON: ${raw.slice(0, 100)}`)); }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function readRefreshToken(_ghToken) {
  const ghToken = (_ghToken || '').trim();
  const gistId = process.env.TL_TOKEN_GIST_ID;
  if (!gistId) throw new Error('TL_TOKEN_GIST_ID is not set in Netlify environment variables');
  const gist    = await ghRequest('GET', `/gists/${gistId}`, null, ghToken);
  const content = gist.files[FILENAME]?.content;
  if (!content) throw new Error('Token file missing from Gist');
  return JSON.parse(content).refresh_token;
}

async function writeRefreshToken(_ghToken, refreshToken) {
  const ghToken = (_ghToken || '').trim();
  const gistId = process.env.TL_TOKEN_GIST_ID;
  if (!gistId) return; // can't save without gist ID — non-fatal
  await ghRequest('PATCH', `/gists/${gistId}`, {
    files: { [FILENAME]: { content: JSON.stringify({ refresh_token: refreshToken, updated: new Date().toISOString() }) } }
  }, ghToken);
}

async function createGistWithToken(_ghToken, refreshToken) {
  const ghToken = (_ghToken || '').trim();
  const gist = await ghRequest('POST', '/gists', {
    description: 'SafeSight dashboard — TL tokens (do not delete)',
    public: false,
    files: { [FILENAME]: { content: JSON.stringify({ refresh_token: refreshToken, updated: new Date().toISOString() }) } }
  }, ghToken);
  return gist.id;
}

module.exports = { readRefreshToken, writeRefreshToken, createGistWithToken };
