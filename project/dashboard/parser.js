/* SafeSight xlsx parser — runs fully in the browser.
   Reads the "Salesdashboard YTD" export, maps columns BY HEADER NAME
   (so column reordering on a weekly re-upload won't break anything),
   and returns the same compact shape as the embedded default dataset. */
(function () {
  function u16(dv, o) { return dv.getUint16(o, true); }
  function u32(dv, o) { return dv.getUint32(o, true); }

  async function inflate(comp, data) {
    if (comp === 0) return data;
    const ds = new DecompressionStream('deflate-raw');
    const buf = await new Response(new Blob([data]).stream().pipeThrough(ds)).arrayBuffer();
    return new Uint8Array(buf);
  }

  async function unzip(arrayBuffer) {
    const buf = new Uint8Array(arrayBuffer);
    const dv = new DataView(buf.buffer);
    let eocd = -1;
    for (let i = buf.length - 22; i >= 0; i--) { if (u32(dv, i) === 0x06054b50) { eocd = i; break; } }
    if (eocd < 0) throw new Error('Not a valid .xlsx (no zip end record found)');
    const cdOffset = u32(dv, eocd + 16), cdCount = u16(dv, eocd + 10);
    let p = cdOffset; const entries = {};
    for (let i = 0; i < cdCount; i++) {
      const comp = u16(dv, p + 10), csize = u32(dv, p + 20);
      const nameLen = u16(dv, p + 28), extraLen = u16(dv, p + 30), commentLen = u16(dv, p + 32);
      const lho = u32(dv, p + 42);
      const name = new TextDecoder().decode(buf.slice(p + 46, p + 46 + nameLen));
      entries[name] = { comp, csize, lho };
      p += 46 + nameLen + extraLen + commentLen;
    }
    const out = {};
    for (const name in entries) {
      const e = entries[name];
      const lnameLen = u16(dv, e.lho + 26), lextraLen = u16(dv, e.lho + 28);
      const start = e.lho + 30 + lnameLen + lextraLen;
      const data = buf.slice(start, start + e.csize);
      out[name] = new TextDecoder().decode(await inflate(e.comp, data));
    }
    return out;
  }

  function parseSharedStrings(xml) {
    if (!xml) return [];
    const out = []; const siRe = /<si>([\s\S]*?)<\/si>/g; let m;
    while ((m = siRe.exec(xml))) {
      let txt = ''; const tRe = /<t[^>]*>([\s\S]*?)<\/t>/g; let tm;
      while ((tm = tRe.exec(m[1]))) txt += tm[1];
      out.push(decodeEnt(txt));
    }
    return out;
  }
  function decodeEnt(s) {
    return s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'");
  }
  function colToNum(ref) {
    const m = ref.match(/^([A-Z]+)(\d+)$/); let c = 0;
    for (const ch of m[1]) c = c * 26 + (ch.charCodeAt(0) - 64);
    return { col: c - 1, row: +m[2] };
  }
  function parseSheet(xml, strings) {
    const grid = {}; let maxRow = 0, maxCol = 0;
    const rowRe = /<row[^>]*r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g; let rm;
    while ((rm = rowRe.exec(xml))) {
      const cells = rm[2];
      const cRe = /<c r="([A-Z]+\d+)"(?:[^>]*?t="([^"]*)")?[^>]*>(?:<v>([\s\S]*?)<\/v>|<is><t[^>]*>([\s\S]*?)<\/t><\/is>)?<\/c>/g; let cm;
      while ((cm = cRe.exec(cells))) {
        const { col, row } = colToNum(cm[1]); const t = cm[2]; const v = cm[3];
        let val = null;
        if (cm[4] != null) val = decodeEnt(cm[4]);
        else if (v != null) { val = (t === 's') ? strings[+v] : v; }
        grid[row + ',' + col] = val;
        if (row > maxRow) maxRow = row; if (col > maxCol) maxCol = col;
      }
    }
    return { grid, maxRow, maxCol };
  }

  function serialToISO(s) {
    if (s == null || s === '') return null;
    const n = +s; if (isNaN(n)) return null;
    const d = new Date(Date.UTC(1899, 11, 30) + n * 86400000);
    return d.toISOString().slice(0, 10);
  }
  function num(v) { if (v == null || v === '') return 0; const n = parseFloat(v); return isNaN(n) ? 0 : n; }
  function norm(s) { return String(s || '').trim().toLowerCase().replace(/\s+/g, ' '); }

  // Header keywords -> logical field. Renewal=VL, Upsell=US.
  function buildColumnMap(grid, maxCol, headerRow) {
    const find = (preds) => {
      for (let c = 0; c <= maxCol; c++) {
        const h = norm(grid[headerRow + ',' + c]);
        if (!h) continue;
        if (preds.some(fn => fn(h))) return c;
      }
      return -1;
    };
    const findAll = (fn) => {
      const cols = [];
      for (let c = 0; c <= maxCol; c++) { const h = norm(grid[headerRow + ',' + c]); if (h && fn(h)) cols.push(c); }
      return cols;
    };
    return {
      title: find([h => h === 'title']),
      customer: find([h => h === 'customer']),
      dAcc: find([h => h.includes('date accepted')]),
      dRef: find([h => h.includes('date refused')]),
      newLogo: findAll(h => h.startsWith('new logo')),
      upsell: findAll(h => h.startsWith('us ') || h.startsWith('us-') || h.startsWith('us  ') || /^us\b/.test(h) || h.startsWith('upsell')),
      renewal: findAll(h => h.startsWith('vl ') || h.startsWith('vl-') || h.startsWith('vl  ') || /^vl\b/.test(h) || h.startsWith('renewal')),
      rep: find([h => h.includes('responsib')]),
      prob: find([h => h.includes('probability')]),
      custType: find([h => h.includes('customer type')]),
      type: find([h => h === 'type']),
      country: find([h => h.includes('country')]),
      pipeline: find([h => h === 'pipeline']),
    };
  }

  function findHeaderRow(grid, maxRow, maxCol) {
    for (let r = 1; r <= Math.min(maxRow, 8); r++) {
      for (let c = 0; c <= maxCol; c++) {
        if (norm(grid[r + ',' + c]) === 'title') return r;
      }
    }
    return 1;
  }

  async function parseWorkbook(arrayBuffer) {
    const files = await unzip(arrayBuffer);
    // locate first worksheet via workbook rels (fallback to sheet1)
    let sheetPath = 'xl/worksheets/sheet1.xml';
    const wb = files['xl/workbook.xml'];
    const rels = files['xl/_rels/workbook.xml.rels'];
    if (wb && rels) {
      const sm = wb.match(/<sheet[^>]*r:id="([^"]+)"/);
      if (sm) {
        const rid = sm[1];
        const re = new RegExp('Id="' + rid + '"[^>]*Target="([^"]+)"');
        const tm = rels.match(re) || rels.match(/Target="(worksheets\/[^"]+)"/);
        if (tm) sheetPath = tm[1].replace(/^\/?xl\//, '').replace(/^\//, '');
        if (!sheetPath.startsWith('xl/')) sheetPath = 'xl/' + sheetPath.replace(/^xl\//, '');
      }
    }
    const sheetXml = files[sheetPath] || files['xl/worksheets/sheet1.xml'];
    if (!sheetXml) throw new Error('Could not find a worksheet inside the file.');
    const strings = parseSharedStrings(files['xl/sharedStrings.xml']);
    const { grid, maxRow, maxCol } = parseSheet(sheetXml, strings);
    const headerRow = findHeaderRow(grid, maxRow, maxCol);
    const map = buildColumnMap(grid, maxCol, headerRow);
    if (map.title < 0 && map.customer < 0)
      throw new Error('Could not find the expected columns (Title / Customer). Is this the right tab?');

    const sumCols = (r, cols) => cols.reduce((s, c) => s + num(grid[r + ',' + c]), 0);
    const deals = [];
    for (let r = headerRow + 1; r <= maxRow; r++) {
      const t = map.title >= 0 ? grid[r + ',' + map.title] : null;
      const c = map.customer >= 0 ? grid[r + ',' + map.customer] : null;
      if (t == null && c == null) continue;
      const dAcc = map.dAcc >= 0 ? serialToISO(grid[r + ',' + map.dAcc]) : null;
      deals.push({
        t: t || '', c: c || '', d: dAcc,
        nl: Math.round(sumCols(r, map.newLogo)),
        us: Math.round(sumCols(r, map.upsell)),
        vl: Math.round(sumCols(r, map.renewal)),
        rep: (map.rep >= 0 ? grid[r + ',' + map.rep] : '') || '',
        ct: (map.custType >= 0 ? grid[r + ',' + map.custType] : '') || '',
        ty: (map.type >= 0 ? grid[r + ',' + map.type] : '') || '',
        co: (map.country >= 0 ? grid[r + ',' + map.country] : '') || '',
        pi: (map.pipeline >= 0 ? grid[r + ',' + map.pipeline] : '') || '',
      });
    }
    return { generated: new Date().toISOString().slice(0, 10), deals: deals.filter(d => d.d) };
  }

  window.SafeSightParser = { parseWorkbook };
})();
