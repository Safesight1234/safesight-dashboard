const https = require('https');
const { persistRefreshToken } = require('./lib/tl-auth');

function post(url, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const u    = new URL(url);
    const req  = https.request({
      hostname: u.hostname, port: 443, path: u.pathname,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
    }, res => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => resolve(JSON.parse(raw)));
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

const html = (title, color, body) => `<!DOCTYPE html>
<html><head><title>${title}</title>
<style>
  body{font-family:system-ui;max-width:560px;margin:80px auto;padding:20px;background:#0e1116;color:#edf1f6}
  h1{color:${color}} p{color:#aeb7c4;line-height:1.6}
  a{color:#60a5fa} .box{background:#141921;border-radius:10px;padding:20px;margin:16px 0}
</style></head><body>${body}</body></html>`;

exports.handler = async (event) => {
  const { code, error } = event.queryStringParameters || {};
  const siteUrl     = process.env.URL;
  const redirectUri = `${siteUrl}/.netlify/functions/auth-callback`;

  if (error) {
    return { statusCode: 400, headers: { 'Content-Type': 'text/html' },
      body: html('Error', '#f87171', `<h1>Connection failed</h1><p>${error}</p>`) };
  }
  if (!code) {
    return { statusCode: 400, headers: { 'Content-Type': 'text/html' },
      body: html('Error', '#f87171', `<h1>No code received</h1><p>Try connecting again.</p>`) };
  }

  try {
    const tokens = await post('https://focus.teamleader.eu/oauth2/access_token', {
      grant_type:    'authorization_code',
      client_id:     process.env.TL_CLIENT_ID,
      client_secret: process.env.TL_CLIENT_SECRET,
      code,
      redirect_uri:  redirectUri,
    });

    if (!tokens.refresh_token) throw new Error('No refresh token in response');

    // Auto-save refresh token to Netlify env vars + trigger redeploy
    await persistRefreshToken(tokens.refresh_token);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'text/html' },
      body: html('Connected!', '#34d399', `
        <h1>✓ Connected to Teamleader!</h1>
        <p>The refresh token has been saved automatically. A new deploy has been triggered (~1 minute).</p>
        <div class="box">
          Once the deploy finishes, visit
          <a href="/.netlify/functions/setup">/.netlify/functions/setup</a>
          to find your pipeline and field IDs.
        </div>
      `),
    };
  } catch (err) {
    return { statusCode: 500, headers: { 'Content-Type': 'text/html' },
      body: html('Error', '#f87171', `<h1>Connection failed</h1><p>${err.message}</p>`) };
  }
};
