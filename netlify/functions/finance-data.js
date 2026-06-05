const https = require('https');

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SafeSight/1.0)', Accept: 'text/csv,*/*' }
    }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location)
        return fetchUrl(res.headers.location).then(resolve).catch(reject);
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => resolve(raw));
    });
    req.on('error', reject);
  });
}

function parseCSV(csv) {
  return csv.trim().split('\n').map(line => {
    const cols = []; let cur = '', inQ = false;
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
  let str = String(s).replace(/[€$\s]/g, '').trim();
  const neg = str.startsWith('-'); str = str.replace('-', '');
  // Dutch format: 1.500,00 — detect by comma+2digits at end
  if (/,\d{2}$/.test(str)) str = str.replace(/\./g, '').replace(',', '.');
  else str = str.replace(/,/g, '');
  return (neg ? -1 : 1) * (parseFloat(str) || 0);
}

exports.handler = async (event) => {
  const year = parseInt(event.queryStringParameters?.year) || new Date().getFullYear();

  const ARR_URL   = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSXNWmYIOdt1L9BptFGEZPIPrNumIzgm6Nc74P-fQtkwFOsIq89OLQe7NWNKDNK5TqBw9MdsaHMVL-K/pub?gid=1113282903&single=true&output=csv';
  const CHURN_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRYD9B-aMkkT6oTChWwHHBGTI4CvZrF2Whzjy53arQpq7M2VOAM-cQXDaWkCFvS54dPej1vJ4S47jUW/pub?gid=55911163&single=true&output=csv';

  try {
    const [arrCsv, churnCsv] = await Promise.all([fetchUrl(ARR_URL), fetchUrl(CHURN_URL)]);
    const arrRows   = parseCSV(arrCsv);
    const churnRows = parseCSV(churnCsv);

    // ARR sheet: find header row containing "ARR - Total", data is the next row
    let arrTotal = 0, total75 = 0, awaitingRenewal = 0;
    for (let i = 0; i < arrRows.length - 1; i++) {
      if (arrRows[i].some(c => c.includes('ARR - Total'))) {
        const data = arrRows[i + 1];
        const hdr  = arrRows[i];
        arrTotal = parseMoney(data[hdr.findIndex(c => c.includes('ARR - Total'))]);
        total75  = parseMoney(data[hdr.findIndex(c => c.includes('Total (75%)'))]);
        break;
      }
    }
    // Get "Awaiting contract renewal" from F6
    if (arrRows.length > 5 && arrRows[5]) {
      awaitingRenewal = parseMoney(arrRows[5][5]);
    }

    // Churn sheet: find year section, collect individual rows
    let churnTotal = 0, churnCount = 0, inYear = false;
    const churnRowsOut = [];
    const yearStr = String(year);
    for (const row of churnRows) {
      const label = (row[1] || '').trim();
      if (label === yearStr) { inYear = true; continue; }
      if (inYear) {
        if (/^\d{4}$/.test(label)) break;
        const rev = parseMoney(row[4]);
        if (label) {
          churnTotal += rev; churnCount++;
          // Get month from column G
          const when = (row[6] || '').trim();
          const churnEntry = {
            customer: label,
            industry: (row[2] || '').trim(),
            reason:   (row[3] || '').trim(),
            when,
            revenue:  rev,
          };
          churnRowsOut.push(churnEntry);
        }
      }
    }
    console.log(`Churn data for year ${year}: ${churnRowsOut.length} entries`);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ arrTotal, total75, awaitingRenewal, churnTotal, churnCount, churnRows: churnRowsOut, year }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: err.message }),
    };
  }
};
