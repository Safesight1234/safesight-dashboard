const https = require('https');
const { createGistWithToken, writeRefreshToken } = require('./lib/token-store');

function post(url, body) {
    return new Promise((resolve, reject) => {
          const data = JSON.stringify(body);
          const u = new URL(url);
          const req = https.request({
                  hostname: u.hostname, port: 443, path: u.pathname, method: 'POST',
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

const page = (title, color, body) => `<!DOCTYPE html>
<html><head><title>${title}</title>
<style>
body{font-family:system-ui;max-width:600px;margin:80px auto;padding:20px;background:#0e1116;color:#edf1f6}
h1{color:${color}} p{color:#aeb7c4;line-height:1.6} a{color:#60a5fa}
.box{background:#141921;border-radius:10px;padding:18px;margin:14px 0;border-left:3px solid #34d399}
code{background:#0e1116;padding:3px 8px;border-radius:4px;font-size:13px;color:#34d399;word-break:break-all}
b{color:#edf1f6}
</style></head><body>${body}</body></html>`;

exports.handler = async (event) => {
    const { code, error } = event.queryStringParameters || {};
    const redirectUri = 'https://safesightnumbers.netlify.app/.netlify/functions/auth-callback';

    if (error) return { statusCode: 400, headers: { 'Content-Type': 'text/html' },
                           body: page('Error', '#f87171', `<h1>Connection failed</h1><p>${error}</p>`) };
    if (!code) return { statusCode: 400, headers: { 'Content-Type': 'text/html' },
                           body: page('Error', '#f87171', `<h1>No code received</h1><p>Try connecting again.</p>`) };

    try {
          const tokens = await post('https://focus.teamleader.eu/oauth2/access_token', {
                  grant_type: 'authorization_code',
                  client_id: process.env.TL_CLIENT_ID,
                  client_secret: process.env.TL_CLIENT_SECRET,
                  code,
                  redirect_uri: redirectUri,
          });

      if (tokens.error) throw new Error(`Teamleader error: ${tokens.error_description || tokens.error}`);
          if (!tokens.refresh_token) throw new Error(`No refresh token returned. Response: ${JSON.stringify(tokens).slice(0, 200)}`);

      const refreshToken = tokens.refresh_token;
          const ghToken = (process.env.GH_PAT || '').trim();

      // Automatically persist the new refresh token to the Gist so future calls work.
      let saveStatus = '';
          try {
                  const gistId = process.env.TL_TOKEN_GIST_ID;
                  if (gistId) {
                            await writeRefreshToken(ghToken, refreshToken);
                            saveStatus = `<div class="box"><b>✓ Refresh token saved to Gist automatically.</b><br><small>Your Teamleader sync will work without any manual steps.</small></div>`;
                  } else {
                            await createGistWithToken(ghToken, refreshToken);
                            saveStatus = `<div class="box"><b>✓ New Gist created and token saved.</b><br><small>Add <code>TL_TOKEN_GIST_ID</code> to your Netlify env vars with the Gist ID above for future reference.</small></div>`;
                  }
          } catch (saveErr) {
                  // Saving to Gist failed — show the token manually as fallback
            saveStatus = `<div class="box"><b>Could not auto-save to Gist:</b> ${saveErr.message}<br><br>
                    <b>Manual fallback — copy this token into Netlify:</b><br><br>
                            Key: <code>TL_REFRESH_TOKEN</code><br>
                                    Value: <code style="word-break: break-all;">${refreshToken}</code>
                                          </div>`;
          }

      return { statusCode: 200, headers: { 'Content-Type': 'text/html' },
                    body: page('Connected!', '#34d399', `<h1>✓ Connected to Teamleader!</h1>${saveStatus}`) };

    } catch (err) {
          return { statusCode: 500, headers: { 'Content-Type': 'text/html' },
                        body: page('Error', '#f87171', `<h1>Connection failed</h1><p>${err.message}</p>`) };
    }
};
