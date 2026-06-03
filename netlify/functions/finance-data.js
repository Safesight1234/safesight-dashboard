const https = require('https');

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; SafeSight/1.0)',
        'Accept': 'text/csv,text/html,*/*',
      }
    }, res => {
      // Follow redirects
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchUrl(res.headers.location).then(resolve).catch(reject);
      }
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => resolve({ status: res.statusCode, body: raw }));
    });
    req.on('error', reject);
  });
}

function parseCSV(csv) {
  return csv.trim().split('\n').map(line => {
    const cols = [];
    let cur = '', inQ = false;
    for (const ch of line) {
      if (ch === '"') { inQ = !inQ; }
      else if (ch === ',' && !inQ) { cols.push(cur.trim()); cur = ''; }
      else cur += ch;
    }
    cols.push(cur.trim());
    return cols;
  });
}

function parseMoney(s) {
  if (!s) return 0;
  return parseFloat(String(s).replace(/[€$,\s]/g, '').replace(/\./g, (m, o, str) => {
    const dots = str.split('.').length - 1;
    return dots > 1 ? '' : m;
  })) || 0;
}

exports.handler = async (event) => {
  const year = parseInt(event.queryStringParameters?.year) || new Date().getFullYear();

  const ARR_URL   = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSXNWmYIOdt1L9BptFGEZPIPrNumIzgm6Nc74P-fQtkwFOsIq89OLQe7NWNKDNK5TqBw9MdsaHMVL-K/pub?gid=1113282903&single=true&output=csv';
  const CHURN_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRYD9B-aMkkT6oTChWwHHBGTI4CvZrF2Whzjy53arQpq7M2VOAM-cQXDaWkCFvS54dPej1vJ4S47jUW/pub?gid=55911163&single=true&output=csv';

  try {
    const [arrResp, churnResp] = await Promise.all([fetchUrl(ARR_URL), fetchUrl(CHURN_URL)]);

    // Return raw CSVs so we can inspect structure
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({
        arr: {
          status: arrResp.status,
          rows: parseCSV(arrResp.body).slice(0, 10),
          rawPreview: arrResp.body.slice(0, 500),
        },
        churn: {
          status: churnResp.status,
          rows: parseCSV(churnResp.body).slice(0, 10),
          rawPreview: churnResp.body.slice(0, 500),
        },
      }, null, 2),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: err.message }),
    };
  }
};
