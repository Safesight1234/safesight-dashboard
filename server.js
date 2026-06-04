/**
 * SafeSight Dashboard — Teamleader sync server
 * Run: node server.js
 * Then open: http://localhost:3000
 */
require('dotenv').config();
const http  = require('http');
const https = require('https');
const fs    = require('fs');
const path  = require('path');
const url   = require('url');
const crypto = require('crypto');

const PORT        = parseInt(process.env.PORT || '3000', 10);
const PROJECT_DIR = path.join(__dirname, 'project');
const TOKENS_FILE = path.join(__dirname, '.tokens.json');

// ─── Token helpers ──────────────────────────────────────────────────────────
function loadTokens() {
  try { return JSON.parse(fs.readFileSync(TOKENS_FILE, 'utf8')); }
  catch { return {}; }
}
function saveTokens(patch) {
  fs.writeFileSync(TOKENS_FILE, JSON.stringify({ ...loadTokens(), ...patch }, null, 2));
}

// ─── HTTPS POST helper (no extra dependencies) ──────────────────────────────
function httpsPost(endpoint, body, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const u    = new URL(endpoint);
    const opts = {
      hostname: u.hostname,
      port: 443,
      path: u.pathname + u.search,
      method: 'POST',
      headers: {
        'Content-Type':   'application/json',
        'Content-Length': Buffer.byteLength(data),
        ...extraHeaders,
      },
    };
    const req = https.request(opts, res => {
      let raw = '';
      res.on('data', c => (raw += c));
      res.on('end', () => {
        try {
          const json = JSON.parse(raw);
          if (res.statusCode >= 400) {
            const msg = json?.errors?.[0]?.message || json?.error_description || JSON.stringify(json);
            reject(new Error(`TL API ${res.statusCode}: ${msg}`));
          } else {
            resolve(json);
          }
        } catch {
          reject(new Error(`Non-JSON response (${res.statusCode}): ${raw.slice(0, 300)}`));
        }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

// ─── Teamleader API ──────────────────────────────────────────────────────────
async function refreshToken() {
  const t = loadTokens();
  if (!t.refresh_token) throw new Error('NOT_CONNECTED');
  const result = await httpsPost('https://focus.teamleader.eu/oauth2/access_token', {
    grant_type:    'refresh_token',
    client_id:     process.env.TL_CLIENT_ID,
    client_secret: process.env.TL_CLIENT_SECRET,
    refresh_token: t.refresh_token,
  });
  saveTokens(result);
  return result.access_token;
}

async function tlApi(endpoint, body) {
  const token = await refreshToken();
  return httpsPost(`https://api.focus.teamleader.eu/${endpoint}`, body, {
    Authorization: `Bearer ${token}`,
  });
}

// Fetch ALL pages of an endpoint
async function tlAll(endpoint, filterBody) {
  const items = [];
  let page = 1;
  while (true) {
    const res = await tlApi(endpoint, { ...filterBody, page: { size: 100, number: page } });
    items.push(...(res.data || []));
    if ((res.data || []).length < 100) break;
    page++;
  }
  return items;
}

// Resolve company/contact IDs → names (batched, 10 parallel)
async function resolveNames(ids, apiEndpoint, extractName) {
  const map = {};
  const BATCH = 10;
  for (let i = 0; i < ids.length; i += BATCH) {
    const results = await Promise.allSettled(
      ids.slice(i, i + BATCH).map(id => tlApi(apiEndpoint, { id }))
    );
    ids.slice(i, i + BATCH).forEach((id, j) => {
      if (results[j].status === 'fulfilled') {
        map[id] = extractName(results[j].value.data);
      }
    });
  }
  return map;
}

// Read a custom field value from a deal
function fieldValue(deal, fieldId) {
  if (!fieldId) return '';
  const f = (deal.custom_fields || []).find(f => f.definition?.id === fieldId);
  if (!f || f.value == null) return '';
  if (typeof f.value === 'object' && f.value.label) return f.value.label;
  return String(f.value);
}

// ─── Sync logic ─────────────────────────────────────────────────────────────
async function runSync() {
  const cfg = {
    p1:      process.env.TL_PIPELINE_1,
    p2:      process.env.TL_PIPELINE_2,
    fNL:     process.env.TL_FIELD_NL,
    fUS:     process.env.TL_FIELD_US,
    fVL:     process.env.TL_FIELD_VL,
    fType:   process.env.TL_FIELD_TYPE,
    fCo:     process.env.TL_FIELD_COUNTRY,
    fCustTy: process.env.TL_FIELD_CUSTTYPE,
  };

  if (!cfg.p1 || !cfg.p2) throw new Error('TL_PIPELINE_1 and TL_PIPELINE_2 must be set in your .env file');

  // Fetch users for responsible-person lookup
  const usersResp = await tlApi('users.list', { page: { size: 100 } });
  const userMap   = {};
  (usersResp.data || []).forEach(u => { userMap[u.id] = `${u.first_name} ${u.last_name}`.trim(); });

  // Fetch won deals from both pipelines
  const wonDeals = await tlAll('deals.list', {
    filter:   { pipeline_ids: [cfg.p1, cfg.p2], status: 'won' },
    includes: 'custom_fields',
  });

  // Fetch open/forecast deals from both pipelines (for pipeline tab)
  const openDeals = await tlAll('deals.list', {
    filter:   { pipeline_ids: [cfg.p1, cfg.p2], status: 'open' },
    includes: 'custom_fields',
  });

  const allDeals = [
    ...wonDeals.map(d => ({ ...d, _dateField: d.won_at })),
    ...openDeals.map(d => ({ ...d, _dateField: d.estimated_closing_date })),
  ].filter(d => d._dateField);

  // Resolve company names
  const companyIds = [...new Set(allDeals.filter(d => d.lead?.customer?.type === 'company').map(d => d.lead.customer.id))];
  const contactIds = [...new Set(allDeals.filter(d => d.lead?.customer?.type === 'contact').map(d => d.lead.customer.id))];

  const companyMap = await resolveNames(companyIds, 'companies.info', d => d.name || '');
  const contactMap = await resolveNames(contactIds, 'contacts.info',  d => `${d.first_name || ''} ${d.last_name || ''}`.trim());

  const getCustomerName = d => {
    const c = d.lead?.customer;
    if (!c) return '';
    return c.type === 'company' ? (companyMap[c.id] || '') : (contactMap[c.id] || '');
  };

  const getPipelineName = d => {
    if (d.pipeline?.id === cfg.p1) return "New logo's";
    if (d.pipeline?.id === cfg.p2) return "Customer Growth";
    return d.pipeline?.id || '';
  };

  const mapped = allDeals.map(d => ({
    t:  d.title || '',
    c:  getCustomerName(d),
    d:  d._dateField.slice(0, 10),
    nl: Math.round(parseFloat(fieldValue(d, cfg.fNL)) || 0),
    us: Math.round(parseFloat(fieldValue(d, cfg.fUS)) || 0),
    vl: Math.round(parseFloat(fieldValue(d, cfg.fVL)) || 0),
    rep: userMap[d.responsible_user?.id] || '',
    ct: fieldValue(d, cfg.fCustTy),
    ty: fieldValue(d, cfg.fType),
    co: fieldValue(d, cfg.fCo),
    pi: getPipelineName(d),
  }));

  const today   = new Date().toISOString().slice(0, 10);
  const dataset = { generated: today, deals: mapped };

  // Preserve existing goals
  const dataFile = path.join(PROJECT_DIR, 'dashboard', 'embedded-data.js');
  let goalsLine  = 'window.SAFESIGHT_DEFAULT_GOALS = {};';
  try {
    const existing = fs.readFileSync(dataFile, 'utf8');
    const m = existing.match(/window\.SAFESIGHT_DEFAULT_GOALS\s*=\s*(\{[\s\S]*?\});/);
    if (m) goalsLine = `window.SAFESIGHT_DEFAULT_GOALS = ${m[1]};`;
  } catch {}

  const output = `// Synced from Teamleader on ${today}\nwindow.SAFESIGHT_DEFAULT = ${JSON.stringify(dataset)};\n${goalsLine}\n`;
  fs.writeFileSync(dataFile, output);
  saveTokens({ last_sync: new Date().toISOString() });

  return { count: mapped.length, generated: today };
}

// ─── Serve static files ──────────────────────────────────────────────────────
const MIME = {
  '.html': 'text/html',
  '.css':  'text/css',
  '.js':   'application/javascript',
  '.json': 'application/json',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

function serveFile(filePath, res) {
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

// ─── HTTP server ─────────────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  const parsed  = url.parse(req.url, true);
  const pathname = parsed.pathname;

  // ── JSON response helper ──
  const json = (statusCode, obj) => {
    res.writeHead(statusCode, {
      'Content-Type':  'application/json',
      'Cache-Control': 'no-cache',
      'Access-Control-Allow-Origin': '*',
    });
    res.end(JSON.stringify(obj));
  };

  // ── OAuth2: redirect to Teamleader ──
  if (pathname === '/auth/connect') {
    if (!process.env.TL_CLIENT_ID) { res.writeHead(500); res.end('TL_CLIENT_ID not set in .env'); return; }
    const state = crypto.randomBytes(16).toString('hex');
    saveTokens({ oauth_state: state });
    const params = new URLSearchParams({
      client_id:     process.env.TL_CLIENT_ID,
      response_type: 'code',
      redirect_uri:  `http://localhost:${PORT}/auth/callback`,
      state,
    });
    res.writeHead(302, { Location: `https://focus.teamleader.eu/oauth2/authorize?${params}` });
    res.end();
    return;
  }

  // ── OAuth2: callback from Teamleader ──
  if (pathname === '/auth/callback') {
    const { code, state, error } = parsed.query;
    if (error) {
      res.writeHead(302, { Location: `/?error=${encodeURIComponent(error)}` });
      res.end(); return;
    }
    const stored = loadTokens();
    if (state !== stored.oauth_state) {
      res.writeHead(400); res.end('OAuth state mismatch — please try connecting again.');
      return;
    }
    try {
      const tokens = await httpsPost('https://focus.teamleader.eu/oauth2/access_token', {
        grant_type:    'authorization_code',
        client_id:     process.env.TL_CLIENT_ID,
        client_secret: process.env.TL_CLIENT_SECRET,
        code,
        redirect_uri:  `http://localhost:${PORT}/auth/callback`,
      });
      saveTokens(tokens);
      res.writeHead(302, { Location: '/?connected=1' });
    } catch (err) {
      res.writeHead(302, { Location: `/?error=${encodeURIComponent(err.message)}` });
    }
    res.end();
    return;
  }

  // ── API: status ──
  if (pathname === '/api/status') {
    const t = loadTokens();
    json(200, { connected: !!t.refresh_token, last_sync: t.last_sync || null });
    return;
  }

  // ── API: sync ──
  if (pathname === '/api/sync') {
    try {
      const result = await runSync();
      json(200, { success: true, ...result });
    } catch (err) {
      const code = err.message === 'NOT_CONNECTED' ? 401 : 500;
      json(code, { error: err.message });
    }
    return;
  }

  // ── API: setup helper — lists pipelines, custom fields, users ──
  if (pathname === '/api/setup') {
    try {
      const [pipeResp, fieldResp, userResp] = await Promise.all([
        tlAll('dealPipelines.list', {}),
        tlAll('customFieldDefinitions.list', { filter: { context: 'deal' } }),
        tlApi('users.list', { page: { size: 100 } }),
      ]);
      json(200, {
        pipelines: pipeResp.map(p => ({ id: p.id, name: p.name })),
        custom_fields: fieldResp.map(f => ({ id: f.id, label: f.label, type: f.type })),
        users: (userResp.data || []).map(u => ({ id: u.id, name: `${u.first_name} ${u.last_name}`.trim() })),
        instructions: 'Copy the IDs into your .env file, then restart the server.',
      });
    } catch (err) {
      const code = err.message === 'NOT_CONNECTED' ? 401 : 500;
      json(code, { error: err.message });
    }
    return;
  }

  // ── Static files ──
  let filePath = path.join(PROJECT_DIR, pathname === '/' ? 'index.html' : pathname);
  // Prevent directory traversal
  if (!filePath.startsWith(PROJECT_DIR)) { res.writeHead(403); res.end(); return; }

  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      // Try with .html extension
      const withHtml = filePath + '.html';
      fs.stat(withHtml, (e2, s2) => {
        if (!e2 && s2.isFile()) { serveFile(withHtml, res); }
        else { res.writeHead(404); res.end('Not found'); }
      });
      return;
    }
    serveFile(filePath, res);
  });
});

server.listen(PORT, () => {
  console.log('');
  console.log('┌─────────────────────────────────────────────────┐');
  console.log('│  SafeSight Dashboard — Teamleader sync server   │');
  console.log('├─────────────────────────────────────────────────┤');
  console.log(`│  Dashboard:  http://localhost:${PORT}               │`);
  console.log(`│  Connect TL: http://localhost:${PORT}/auth/connect  │`);
  console.log(`│  Setup help: http://localhost:${PORT}/api/setup     │`);
  console.log('└─────────────────────────────────────────────────┘');
  console.log('');
  if (!process.env.TL_CLIENT_ID) {
    console.log('⚠  TL_CLIENT_ID is not set. Copy .env.example → .env and fill in your credentials.');
  }
});
