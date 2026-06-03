const https = require('https');

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

exports.handler = async (event) => {
  const { code, error } = event.queryStringParameters || {};
  const siteUrl    = process.env.URL;
  const redirectUri = `${siteUrl}/.netlify/functions/auth-callback`;

  if (error) {
    return { statusCode: 400, body: `Teamleader returned an error: ${error}` };
  }
  if (!code) {
    return { statusCode: 400, body: 'No authorization code received.' };
  }

  try {
    const tokens = await post('https://focus.teamleader.eu/oauth2/access_token', {
      grant_type:    'authorization_code',
      client_id:     process.env.TL_CLIENT_ID,
      client_secret: process.env.TL_CLIENT_SECRET,
      code,
      redirect_uri:  redirectUri,
    });

    const refresh = tokens.refresh_token;

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'text/html' },
      body: `<!DOCTYPE html>
<html>
<head><title>Connected!</title>
<style>
  body { font-family: system-ui; max-width: 640px; margin: 60px auto; padding: 20px; background: #0e1116; color: #edf1f6; }
  h1 { color: #34d399; }
  .token { background: #1e2530; border: 1px solid #34d399; border-radius: 8px; padding: 16px; word-break: break-all; font-family: monospace; font-size: 14px; margin: 16px 0; }
  .step { background: #141921; border-radius: 8px; padding: 16px; margin: 12px 0; }
  .step b { color: #34d399; }
  p { color: #aeb7c4; line-height: 1.6; }
</style>
</head>
<body>
<h1>✓ Connected to Teamleader!</h1>
<p>Copy the refresh token below and add it to your Netlify environment variables.</p>
<div class="token">${refresh}</div>

<div class="step">
  <b>Step 1:</b> Go to your <a href="https://app.netlify.com" style="color:#60a5fa">Netlify dashboard</a>
  → your site → <b>Site configuration → Environment variables</b>
</div>
<div class="step">
  <b>Step 2:</b> Add a new variable:<br>
  Key: <code>TL_REFRESH_TOKEN</code><br>
  Value: (paste the token above)
</div>
<div class="step">
  <b>Step 3:</b> Click <b>Save</b>, then go to <b>Deploys → Trigger deploy</b> to redeploy with the new variable.
</div>
<div class="step">
  <b>Step 4:</b> After redeploying, visit <a href="/.netlify/functions/setup" style="color:#60a5fa">/.netlify/functions/setup</a>
  to find your pipeline and field IDs.
</div>
</body>
</html>`,
    };
  } catch (err) {
    return { statusCode: 500, body: `Token exchange failed: ${err.message}` };
  }
};
