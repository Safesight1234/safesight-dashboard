const https = require('https');
const { getAccessToken, httpsPost } = require('./lib/tl-auth');

// ─── HTTP helpers ──────────────────────────────────────────────────────────
function request(method, hostname, path, body, headers) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req  = https.request({
      hostname, port: 443, path, method,
      headers: {
        ...(data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}),
        ...headers,
      },
    }, res => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        try {
          const json = JSON.parse(raw);
          if (res.statusCode >= 400) reject(new Error(`${res.statusCode}: ${JSON.stringify(json).slice(0, 300)}`));
          else resolve({ json, status: res.statusCode, headers: res.headers });
        } catch {
          reject(new Error(`Non-JSON ${res.statusCode}: ${raw.slice(0, 200)}`));
        }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function tlPost(endpoint, body, token) {
  return httpsPost('api.focus.teamleader.eu', `/${endpoint}`, body, { Authorization: `Bearer ${token}` });
}

async function tlAll(endpoint, filterBody, token) {
  const items = [];
  let page = 1;
  while (true) {
    const res = await tlPost(endpoint, { ...filterBody, page: { size: 100, number: page } }, token);
    items.push(...(res.data || []));
    if ((res.data || []).length < 100) break;
    page++;
  }
  return items;
}

async function resolveNames(ids, endpoint, extract, token) {
  const map = {};
  const BATCH = 10;
  for (let i = 0; i < ids.length; i += BATCH) {
    await Promise.all(ids.slice(i, i + BATCH).map(async id => {
      try {
        const r = await tlPost(`${endpoint}.info`, { id }, token);
        map[id] = extract(r.data);
      } catch {}
    }));
  }
  return map;
}

function fieldValue(deal, fieldId) {
  if (!fieldId) return '';
  const f = (deal.custom_fields || []).find(f => f.definition?.id === fieldId);
  if (!f || f.value == null) return '';
  if (typeof f.value === 'object' && f.value.label) return f.value.label;
  return String(f.value);
}

// ─── GitHub API ────────────────────────────────────────────────────────────
async function githubGetFile(repo, filePath, ghToken) {
  const r = await request('GET', 'api.github.com',
    `/repos/${repo}/contents/${filePath}`,
    null,
    { Authorization: `Bearer ${ghToken}`, 'User-Agent': 'safesight-dashboard', Accept: 'application/vnd.github+json' }
  );
  return r.json; // { content (base64), sha }
}

async function githubUpdateFile(repo, filePath, content, sha, message, ghToken) {
  await request('PUT', 'api.github.com',
    `/repos/${repo}/contents/${filePath}`,
    { message, content: Buffer.from(content).toString('base64'), sha },
    { Authorization: `Bearer ${ghToken}`, 'User-Agent': 'safesight-dashboard', Accept: 'application/vnd.github+json' }
  );
}

// ─── Main handler ──────────────────────────────────────────────────────────
exports.handler = async () => {
  const cfg = {
    p1:       process.env.TL_PIPELINE_1,
    p2:       process.env.TL_PIPELINE_2,
    fNL_ARR:  process.env.TL_FIELD_NL_ARR,
    fNL_OO:   process.env.TL_FIELD_NL_ONEOFF,
    fNL_OB:   process.env.TL_FIELD_NL_ONBOARDING,
    fUS_ARR:  process.env.TL_FIELD_US_ARR,
    fUS_OO:   process.env.TL_FIELD_US_ONEOFF,
    fUS_OB:   process.env.TL_FIELD_US_ONBOARDING,
    fVL:      process.env.TL_FIELD_VL,
    fType:    process.env.TL_FIELD_TYPE,
    fCo:      process.env.TL_FIELD_COUNTRY,
    fCustTy:  process.env.TL_FIELD_CUSTTYPE,
  };

  const ghToken = process.env.GH_PAT;
  const ghRepo  = process.env.GITHUB_REPO || 'Safesight1234/safesight-dashboard';

  const missing = [];
  if (!process.env.TL_REFRESH_TOKEN) missing.push('TL_REFRESH_TOKEN');
  if (!cfg.p1 || !cfg.p2)            missing.push('TL_PIPELINE_1 / TL_PIPELINE_2');
  if (!ghToken)                      missing.push('GH_PAT');
  if (missing.length) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: `Missing environment variables: ${missing.join(', ')}` }),
    };
  }

  try {
    const token = await getAccessToken();

    // Fetch users
    const usersResp = await tlPost('users.list', { page: { size: 100 } }, token);
    const userMap   = {};
    (usersResp.data || []).forEach(u => { userMap[u.id] = `${u.first_name} ${u.last_name}`.trim(); });

    // Fetch won + open deals from both pipelines
    const [wonDeals, openDeals] = await Promise.all([
      tlAll('deals.list', { filter: { pipeline_ids: [cfg.p1, cfg.p2], status: 'won'  }, includes: 'custom_fields' }, token),
      tlAll('deals.list', { filter: { pipeline_ids: [cfg.p1, cfg.p2], status: 'open' }, includes: 'custom_fields' }, token),
    ]);

    const allDeals = [
      ...wonDeals.map(d  => ({ ...d, _date: d.won_at })),
      ...openDeals.map(d => ({ ...d, _date: d.estimated_closing_date })),
    ].filter(d => d._date);

    // Resolve company/contact names
    const companyIds = [...new Set(allDeals.filter(d => d.lead?.customer?.type === 'company').map(d => d.lead.customer.id))];
    const contactIds = [...new Set(allDeals.filter(d => d.lead?.customer?.type === 'contact').map(d => d.lead.customer.id))];

    const [companyMap, contactMap] = await Promise.all([
      resolveNames(companyIds, 'companies', d => d.name || '', token),
      resolveNames(contactIds, 'contacts',  d => `${d.first_name || ''} ${d.last_name || ''}`.trim(), token),
    ]);

    const getName = d => {
      const c = d.lead?.customer;
      if (!c) return '';
      return c.type === 'company' ? (companyMap[c.id] || '') : (contactMap[c.id] || '');
    };

    const getPipeline = d => {
      if (d.pipeline?.id === cfg.p1) return "New logo's";
      if (d.pipeline?.id === cfg.p2) return 'Customer Growth';
      return '';
    };

    const deals = allDeals.map(d => ({
      t:   d.title || '',
      c:   getName(d),
      d:   d._date.slice(0, 10),
      nl:  Math.round((parseFloat(fieldValue(d, cfg.fNL_ARR)) || 0) + (parseFloat(fieldValue(d, cfg.fNL_OO)) || 0) + (parseFloat(fieldValue(d, cfg.fNL_OB)) || 0)),
      us:  Math.round((parseFloat(fieldValue(d, cfg.fUS_ARR)) || 0) + (parseFloat(fieldValue(d, cfg.fUS_OO)) || 0) + (parseFloat(fieldValue(d, cfg.fUS_OB)) || 0)),
      vl:  Math.round(parseFloat(fieldValue(d, cfg.fVL))     || 0),
      rep: userMap[d.responsible_user?.id] || '',
      ct:  fieldValue(d, cfg.fCustTy),
      ty:  fieldValue(d, cfg.fType),
      co:  fieldValue(d, cfg.fCo),
      pi:  getPipeline(d),
    }));

    const today   = new Date().toISOString().slice(0, 10);
    const dataset = { generated: today, deals };

    // Get current file from GitHub to preserve goals + get SHA
    const currentFile = await githubGetFile(ghRepo, 'project/dashboard/embedded-data.js', ghToken);
    const currentJs   = Buffer.from(currentFile.content, 'base64').toString('utf8');
    const goalsMatch  = currentJs.match(/window\.SAFESIGHT_DEFAULT_GOALS\s*=\s*(\{[\s\S]*?\});/);
    const goalsLine   = goalsMatch ? `window.SAFESIGHT_DEFAULT_GOALS = ${goalsMatch[1]};` : 'window.SAFESIGHT_DEFAULT_GOALS = {};';

    const newContent = `// Synced from Teamleader on ${today}\nwindow.SAFESIGHT_DEFAULT = ${JSON.stringify(dataset)};\n${goalsLine}\n`;

    await githubUpdateFile(
      ghRepo,
      'project/dashboard/embedded-data.js',
      newContent,
      currentFile.sha,
      `Sync Teamleader data — ${today} (${deals.length} deals)`,
      ghToken
    );

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ success: true, count: deals.length, generated: today }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: err.message }),
    };
  }
};
