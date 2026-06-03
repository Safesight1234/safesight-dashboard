const https = require('https');

async function tlPost(endpoint, body, token) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req  = https.request({
      hostname: 'api.focus.teamleader.eu', port: 443, path: `/${endpoint}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        'Authorization': `Bearer ${token}`,
      },
    }, res => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        const json = JSON.parse(raw);
        if (res.statusCode >= 400) reject(new Error(JSON.stringify(json)));
        else resolve(json);
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function refreshAccessToken() {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      grant_type:    'refresh_token',
      client_id:     process.env.TL_CLIENT_ID,
      client_secret: process.env.TL_CLIENT_SECRET,
      refresh_token: process.env.TL_REFRESH_TOKEN,
    });
    const req = https.request({
      hostname: 'focus.teamleader.eu', port: 443, path: '/oauth2/access_token',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }, res => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        const json = JSON.parse(raw);
        if (json.error || !json.access_token) reject(new Error(`Token refresh failed: ${json.error_description || json.error || raw}`));
        else resolve(json.access_token);
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

exports.handler = async () => {
  if (!process.env.TL_REFRESH_TOKEN) {
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'text/html' },
      body: `<p style="font-family:system-ui;padding:40px;color:#aeb7c4;background:#0e1116">
        TL_REFRESH_TOKEN is not set yet.
        <a href="/.netlify/functions/auth-connect" style="color:#34d399">Connect Teamleader first →</a>
      </p>`,
    };
  }

  try {
    const token = await refreshAccessToken();

    const [pipelines, fields, users] = await Promise.all([
      tlPost('dealPipelines.list', {}, token),
      tlPost('customFieldDefinitions.list', { page: { size: 100 } }, token),
      tlPost('users.list', { page: { size: 100 } }, token),
    ]);

    const pipeRows  = (pipelines.data || []).map(p => `<tr><td><code>${p.id}</code></td><td>${p.name}</td></tr>`).join('');
    const fieldRows = (fields.data || []).map(f => `<tr><td><code>${f.id}</code></td><td>${f.label}</td><td>${f.type}</td></tr>`).join('');
    const userRows  = (users.data || []).map(u => `<tr><td><code>${u.id}</code></td><td>${u.first_name} ${u.last_name}</td></tr>`).join('');

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'text/html' },
      body: `<!DOCTYPE html>
<html>
<head><title>Teamleader Setup</title>
<style>
  body { font-family: system-ui; max-width: 900px; margin: 40px auto; padding: 20px; background: #0e1116; color: #edf1f6; }
  h1 { color: #34d399; } h2 { color: #60a5fa; margin-top: 32px; }
  table { width: 100%; border-collapse: collapse; margin: 12px 0; }
  th { text-align: left; color: #6b7585; font-size: 12px; text-transform: uppercase; padding: 8px 12px; }
  td { padding: 8px 12px; border-top: 1px solid #1e2530; }
  code { background: #1e2530; padding: 2px 6px; border-radius: 4px; font-size: 12px; color: #34d399; }
  .tip { background: #141921; border-left: 3px solid #34d399; padding: 12px 16px; margin: 16px 0; color: #aeb7c4; font-size: 14px; }
</style>
</head>
<body>
<h1>Teamleader Setup Helper</h1>
<p style="color:#aeb7c4">Copy these IDs into your Netlify environment variables.</p>

<h2>Pipelines</h2>
<div class="tip">Set <code>TL_PIPELINE_1</code> = your New Logo's pipeline ID, <code>TL_PIPELINE_2</code> = Customer Growth</div>
<table><tr><th>ID (copy this)</th><th>Name</th></tr>${pipeRows}</table>

<h2>Custom Fields (Deal)</h2>
<div class="tip">Match each field label to the right env var: TL_FIELD_NL, TL_FIELD_US, TL_FIELD_VL, TL_FIELD_TYPE, TL_FIELD_COUNTRY, TL_FIELD_CUSTTYPE</div>
<table><tr><th>ID (copy this)</th><th>Label</th><th>Type</th></tr>${fieldRows}</table>

<h2>Users</h2>
<table><tr><th>ID</th><th>Name</th></tr>${userRows}</table>
</body>
</html>`,
    };
  } catch (err) {
    return { statusCode: 500, body: `Error: ${err.message}` };
  }
};
