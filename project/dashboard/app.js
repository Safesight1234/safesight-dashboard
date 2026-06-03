/* SafeSight Sales Dashboard — view logic (v3)
   Data: { generated, deals:[{t,c,d,nl,us,vl,rep,ct,ty,co,pi,status,prob}] } */
(function () {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const LS = { data: 'safesight.data', goals: 'safesight.goals', state: 'safesight.state' };
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const QS = ['Q1', 'Q2', 'Q3', 'Q4'];
  const PIPES = ["New logo's", "Customer Growth"];

  // ---------- load ----------
  let DATA = null;
  try { const s = localStorage.getItem(LS.data); if (s) DATA = JSON.parse(s); } catch (e) {}
  if (!DATA || !DATA.deals || !DATA.deals.length) DATA = window.SAFESIGHT_DEFAULT;

  let GOALS = {};
  try { GOALS = JSON.parse(localStorage.getItem(LS.goals)) || {}; } catch (e) {}
  const SEED = window.SAFESIGHT_DEFAULT_GOALS || {};
  for (const y in SEED) if (!GOALS[y]) GOALS[y] = { nl: SEED[y].nl.slice(), us: SEED[y].us.slice() };

  const state = Object.assign(
    { tab: 'overview', year: null, gran: 'quarter', quarter: 'all', compare: 'none', includeVL: false, rep: 'all', country: 'all' },
    (() => { try { return JSON.parse(localStorage.getItem(LS.state)) || {}; } catch (e) { return {}; } })()
  );

  // ---------- helpers ----------
  const yearOf  = d => +d.slice(0, 4);
  const monthOf = d => +d.slice(5, 7) - 1;
  const quarterOf = d => Math.floor(monthOf(d) / 3);
  function years() { return [...new Set(DATA.deals.map(d => yearOf(d.d)))].sort(); }

  function goalsFor(y) {
    if (GOALS[y]) return GOALS[y];
    const prevNL = DATA.deals.filter(d => yearOf(d.d) === y - 1 && isWon(d)).reduce((s, d) => s + d.nl, 0);
    const prevUS = DATA.deals.filter(d => yearOf(d.d) === y - 1 && isWon(d)).reduce((s, d) => s + d.us, 0);
    const nl = Math.round(prevNL * 1.2 / 4 / 1000) * 1000 || 75000;
    const us = Math.round(prevUS * 1.2 / 4 / 1000) * 1000 || 15000;
    return { nl: [nl, nl, nl, nl], us: [us, us, us, us], _derived: true };
  }
  const annual = (g, k) => g[k].reduce((a, b) => a + b, 0);

  // deals without status field are treated as won (legacy data)
  const isWon  = d => !d.status || d.status === 'won';
  const isOpen = d => d.status === 'open';

  function fmtMoney(n) {
    const a = Math.abs(n);
    if (a >= 1e6) return '€' + (n / 1e6).toFixed(a >= 1e7 ? 1 : 2).replace(/\.?0+$/, '') + 'M';
    if (a >= 1000) return '€' + Math.round(n / 1000) + 'k';
    return '€' + Math.round(n);
  }
  function fmtFull(n) { return '€' + Math.round(n).toLocaleString('en-US'); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }

  function applyFilters(arr) {
    return arr.filter(d =>
      (state.rep === 'all' || d.rep === state.rep) &&
      (state.country === 'all' || d.co === state.country));
  }
  function wonDealsForYear(y)  { return applyFilters(DATA.deals.filter(d => yearOf(d.d) === y && isWon(d))); }
  function openDealsForYear(y) { return applyFilters(DATA.deals.filter(d => yearOf(d.d) === y && isOpen(d))); }
  // legacy alias used by scope/series
  function dealsForYear(y) { return wonDealsForYear(y); }

  function asOfMonth(y) { const ms = dealsForYear(y).map(d => monthOf(d.d)); return ms.length ? Math.max(...ms) : 11; }

  function series(y, gran) {
    const n = gran === 'month' ? 12 : 4;
    const arr = Array.from({ length: n }, () => ({ nl: 0, us: 0, vl: 0, count: 0 }));
    dealsForYear(y).forEach(d => {
      const i = gran === 'month' ? monthOf(d.d) : quarterOf(d.d);
      arr[i].nl += d.nl; arr[i].us += d.us; arr[i].vl += d.vl; arr[i].count++;
    });
    return arr;
  }

  function scope(y) {
    const g = goalsFor(y);
    if (state.quarter !== 'all') {
      const q = +state.quarter;
      const arr = dealsForYear(y).filter(d => quarterOf(d.d) === q);
      return {
        label: QS[q] + ' ' + y, isQ: true, q,
        nl: sum(arr, 'nl'), us: sum(arr, 'us'), vl: sum(arr, 'vl'), n: arr.length,
        gNL: g.nl[q], gUS: g.us[q], gComb: g.nl[q] + g.us[q],
      };
    }
    const m = asOfMonth(y);
    const arr = dealsForYear(y).filter(d => monthOf(d.d) <= m);
    return {
      label: 'Jan–' + MONTHS[m] + ' ' + y, isQ: false, asOf: m,
      nl: sum(arr, 'nl'), us: sum(arr, 'us'), vl: sum(arr, 'vl'), n: arr.length,
      gNL: annual(g, 'nl'), gUS: annual(g, 'us'), gComb: annual(g, 'nl') + annual(g, 'us'),
    };
  }
  function sum(arr, k) { return arr.reduce((s, d) => s + d[k], 0); }

  // ---------- top-level render ----------
  function render() {
    const ys = years();
    if (!state.year || !ys.includes(state.year)) state.year = ys[ys.length - 1];
    if (state.compare !== 'none' && (!ys.includes(+state.compare) || +state.compare === state.year)) state.compare = 'none';
    persist();
    renderControls(ys);
    $('#tab-overview').classList.toggle('hidden', state.tab !== 'overview');
    $('#tab-pipeline').classList.toggle('hidden', state.tab !== 'pipeline');
    $$('.tabbtn').forEach(b => b.classList.toggle('active', b.dataset.tab === state.tab));
    if (state.tab === 'overview') renderOverview();
    else if (state.tab === 'pipeline') renderPipeline();
    $('#updated').innerHTML = 'Data as of <b>' + (DATA.generated || '—') + '</b>';
  }

  function renderControls(ys) {
    $('#yearSel').innerHTML = ys.map(y => `<option value="${y}" ${y === state.year ? 'selected' : ''}>${y}</option>`).join('');
    $$('#granSeg button').forEach(b => b.classList.toggle('active', b.dataset.g === state.gran));
    $$('#qSeg button').forEach(b => b.classList.toggle('active', b.dataset.q === String(state.quarter)));
    $('#vlToggle').classList.toggle('active', state.includeVL);
    $('#cmpSel').innerHTML = '<option value="none">No comparison</option>' +
      ys.filter(y => y !== state.year).map(y => `<option value="${y}" ${String(y) === state.compare ? 'selected' : ''}>Compare vs ${y}</option>`).join('');
    const reps = ['all', ...[...new Set(DATA.deals.map(d => d.rep).filter(Boolean))].sort()];
    $('#repSel').innerHTML = reps.map(r => `<option value="${r}" ${r === state.rep ? 'selected' : ''}>${r === 'all' ? 'All reps' : r}</option>`).join('');
    const cos = ['all', ...[...new Set(DATA.deals.map(d => d.co).filter(Boolean))].sort()];
    $('#coSel').innerHTML = cos.map(c => `<option value="${c}" ${c === state.country ? 'selected' : ''}>${c === 'all' ? 'All countries' : c}</option>`).join('');
  }

  function progressBlock(actual, goal) {
    const pct = goal > 0 ? (actual / goal) * 100 : 0;
    return { pct, pctTxt: pct.toFixed(0) + '%', remain: Math.max(0, goal - actual) };
  }
  function deltaHTML(cur, prev, cmpYear) {
    if (state.compare === 'none') return '';
    if (!prev) return `<span class="submeta">no ${cmpYear} data</span>`;
    const pct = ((cur - prev) / prev) * 100, up = pct >= 0;
    return `<span class="delta ${up ? 'up' : 'down'}">${up ? '▲' : '▼'} ${Math.abs(pct).toFixed(0)}%</span><span class="submeta">vs ${cmpYear}</span>`;
  }

  // ---------- OVERVIEW ----------
  function renderOverview() {
    const y = state.year;
    const sc = scope(y);
    const cmp = state.compare !== 'none' ? +state.compare : null;
    const scC = cmp ? scopeFor(cmp, sc) : null;

    const sales = sc.nl + sc.us;
    const pr = progressBlock(sales, sc.gComb);
    $('#kpiSales').textContent = fmtMoney(sales);
    $('#ytdLabel').textContent = sc.label + (sc.isQ ? '' : ' · YTD');
    $('#scopeNote').textContent = sc.isQ ? 'Quarter goal' : 'Annual goal';
    $('#pfill').style.width = Math.min(100, pr.pct) + '%';
    $('#ppct').textContent = pr.pctTxt;
    $('#goalAmt').textContent = fmtMoney(sc.gComb);
    $('#pGoalNote').textContent = 'of ' + fmtMoney(sc.gComb) + ' goal · ' + fmtMoney(pr.remain) + ' to go';
    $('#dealCount').textContent = sc.n + ' deals won';
    $('#kpiSalesMeta').innerHTML = cmp ? deltaHTML(sales, scC.nl + scC.us, cmp) : '';

    fillKPI('NL', sc.nl, sc.gNL, cmp ? scC.nl : null, cmp);
    fillKPI('US', sc.us, sc.gUS, cmp ? scC.us : null, cmp);
    $('#kpiVL').textContent = fmtMoney(sc.vl);
    $('#kpiVLMeta').innerHTML = cmp ? deltaHTML(sc.vl, scC.vl, cmp) : '<span class="submeta">no goal set</span>';

    // count badges
    const arr = wonDealsForYear(y).filter(d => state.quarter === 'all' || quarterOf(d.d) === +state.quarter);
    const nlEl = $('#kpiNLCount'), usEl = $('#kpiUSCount');
    if (nlEl) nlEl.textContent = arr.filter(d => d.nl > 0).length || '';
    if (usEl) usEl.textContent = arr.filter(d => d.us > 0).length || '';

    // churn KPI — placeholder (no churn data from TL)
    const chEl = $('#kpiChurn'); if (chEl) chEl.textContent = '—';
    const chMeta = $('#kpiChurnMeta'); if (chMeta) chMeta.textContent = 'no churn data';

    renderMainChart(y, cmp);
    renderStreamChart('nl', '#nlChart', '#nlTotal');
    renderStreamChart('us', '#usChart', '#usTotal');
    renderBreakdown(sc);
    renderLeaderboard(y);
    renderTable(y);
    renderWonList(y);
  }

  function scopeFor(yr, like) {
    if (like.isQ) {
      const arr = dealsForYear(yr).filter(d => quarterOf(d.d) === like.q);
      return { nl: sum(arr, 'nl'), us: sum(arr, 'us'), vl: sum(arr, 'vl'), n: arr.length };
    }
    const arr = dealsForYear(yr).filter(d => monthOf(d.d) <= like.asOf);
    return { nl: sum(arr, 'nl'), us: sum(arr, 'us'), vl: sum(arr, 'vl'), n: arr.length };
  }

  function fillKPI(id, actual, goal, prev, cmp) {
    $('#kpi' + id).textContent = fmtMoney(actual);
    const pct = goal > 0 ? (actual / goal) * 100 : 0;
    $('#p' + id + 'fill').style.width = Math.min(100, pct) + '%';
    $('#kpi' + id + 'Meta').innerHTML =
      `<span class="goalpct">${pct.toFixed(0)}% of ${fmtMoney(goal)}</span>` + (cmp ? ' ' + deltaHTML(actual, prev, cmp) : '');
  }

  function visibleIndices() {
    if (state.quarter === 'all') return null;
    const q = +state.quarter;
    return state.gran === 'month' ? [q * 3, q * 3 + 1, q * 3 + 2] : [q];
  }

  function renderMainChart(y, cmp) {
    const gran = state.gran;
    const data = series(y, gran);
    const g = goalsFor(y);
    const labs = gran === 'month' ? MONTHS : QS;
    const perGoal = i => gran === 'month' ? (g.nl[Math.floor(i / 3)] + g.us[Math.floor(i / 3)]) / 3 : (g.nl[i] + g.us[i]);
    const vis = visibleIndices();
    const idxs = vis || data.map((_, i) => i);
    const cmpData = cmp ? series(cmp, gran) : null;

    const totals = idxs.map(i => data[i].nl + data[i].us + (state.includeVL ? data[i].vl : 0));
    const cmpTot = cmp ? idxs.map(i => cmpData[i].nl + cmpData[i].us + (state.includeVL ? cmpData[i].vl : 0)) : [];
    const goalsArr = idxs.map(perGoal);
    const max = Math.max(1, ...totals, ...cmpTot, ...goalsArr) * 1.08;
    const H = 300;

    const cols = idxs.map((i) => {
      const d = data[i];
      const total = d.nl + d.us + (state.includeVL ? d.vl : 0);
      const goal = perGoal(i);
      let inner;
      if (cmp) {
        const ctot = cmpData[i].nl + cmpData[i].us + (state.includeVL ? cmpData[i].vl : 0);
        inner = `<div class="grp">
          <div class="gbar cur" style="height:${(total / max) * (H - 22)}px" title="${y}: ${fmtFull(total)}"></div>
          <div class="gbar cmp" style="height:${(ctot / max) * (H - 22)}px" title="${cmp}: ${fmtFull(ctot)}"></div>
        </div>`;
      } else {
        const segs = [['nl', d.nl], ['us', d.us]]; if (state.includeVL) segs.push(['vl', d.vl]);
        inner = `<div class="bar-stack" style="height:${Math.max((total / max) * (H - 22), total > 0 ? 3 : 0)}px">` +
          segs.filter(s => s[1] > 0).map(([k, v]) => `<div class="bar-seg ${k}" style="height:${(v / total) * 100}%"></div>`).join('') + `</div>`;
      }
      return `<div class="bar-col">
        <div class="vlab">${fmtMoney(total)}${cmp ? ' / ' + fmtMoney(cmpData[i].nl + cmpData[i].us + (state.includeVL ? cmpData[i].vl : 0)) : ''}</div>
        <div class="goal-tick" style="bottom:${(goal / max) * (H - 22) + 22}px" title="Goal ${fmtFull(goal)}"></div>
        ${inner}
        <div class="xlab">${labs[i]}</div>
      </div>`;
    }).join('');

    $('#mainChart').innerHTML = `<div class="bars-wrap"><div class="bars" style="height:${H}px">${cols}</div></div>`;
    $('#mainTitle').textContent = `Sales by ${gran === 'month' ? 'month' : 'quarter'} · ${y}` + (cmp ? ` vs ${cmp}` : '');
    $('#vlLegend').classList.toggle('hidden', !state.includeVL);
    $('#cmpLegend').classList.toggle('hidden', !cmp);
    $('#cmpLegYear').textContent = cmp || '';
    $('#curLegYear').textContent = y;
    $('#stackLegend').classList.toggle('hidden', !!cmp);
    $('#goalLegend').classList.remove('hidden');
  }

  function renderStreamChart(key, sel, totalSel) {
    const y = state.year, gran = state.gran;
    const data = series(y, gran);
    const g = goalsFor(y);
    const labs = gran === 'month' ? MONTHS : QS;
    const perGoal = i => gran === 'month' ? g[key][Math.floor(i / 3)] / 3 : g[key][i];
    const vis = visibleIndices();
    const idxs = vis || data.map((_, i) => i);
    const vals = idxs.map(i => data[i][key]);
    const goalsArr = idxs.map(perGoal);
    const max = Math.max(1, ...vals, ...goalsArr) * 1.1;
    const H = 150;
    $(sel).innerHTML = `<div class="bars" style="height:${H}px">` + idxs.map(i => {
      const v = data[i][key], goal = perGoal(i);
      return `<div class="bar-col">
        <div class="vlab">${fmtMoney(v)}</div>
        <div class="goal-tick" style="bottom:${(goal / max) * (H - 20) + 20}px" title="Goal ${fmtFull(goal)}"></div>
        <div class="bar-stack" style="height:${Math.max((v / max) * (H - 20), v > 0 ? 3 : 0)}px"><div class="bar-seg ${key}" style="height:100%"></div></div>
        <div class="xlab">${labs[i]}</div>
      </div>`;
    }).join('') + `</div>`;
    const total = vals.reduce((a, b) => a + b, 0);
    const goalTotal = goalsArr.reduce((a, b) => a + b, 0);
    $(totalSel).innerHTML = `${fmtMoney(total)} <span class="ofgoal">/ ${fmtMoney(goalTotal)}</span>`;
  }

  function renderBreakdown(sc) {
    const parts = [['New logo', sc.nl, 'var(--newlogo)'], ['Upsell', sc.us, 'var(--upsell)'], ['Renewal', sc.vl, 'var(--renewal)']];
    const total = parts.reduce((s, p) => s + p[1], 0) || 1;
    let acc = 0; const R = 62, C = 2 * Math.PI * R;
    const rings = parts.map(([nm, v, col]) => {
      const frac = v / total, len = frac * C, off = acc * C; acc += frac;
      return `<circle r="${R}" cx="80" cy="80" fill="none" stroke="${col}" stroke-width="22" stroke-dasharray="${len} ${C - len}" stroke-dashoffset="${-off}" transform="rotate(-90 80 80)"></circle>`;
    }).join('');
    $('#donut').innerHTML = `<svg class="donut" width="160" height="160" viewBox="0 0 160 160">
      <circle r="62" cx="80" cy="80" fill="none" stroke="rgba(255,255,255,.05)" stroke-width="22"></circle>${rings}
      <text x="80" y="74" text-anchor="middle" fill="var(--ink)" font-size="20" font-weight="800">${fmtMoney(total)}</text>
      <text x="80" y="94" text-anchor="middle" fill="var(--ink-faint)" font-size="11" font-weight="600">${sc.isQ ? sc.label : 'YTD total'}</text></svg>`;
    $('#donutLegend').innerHTML = parts.map(([nm, v, col]) =>
      `<div class="row"><span class="dot" style="background:${col}"></span><span class="nm">${nm}</span><span class="vl2">${fmtMoney(v)}</span><span class="submeta" style="width:38px;text-align:right">${Math.round(v / total * 100)}%</span></div>`).join('');
  }

  function renderLeaderboard(y) {
    const map = {};
    let arr = dealsForYear(y);
    if (state.quarter !== 'all') arr = arr.filter(d => quarterOf(d.d) === +state.quarter);
    arr.forEach(d => { if (d.rep) map[d.rep] = (map[d.rep] || 0) + d.nl + d.us; });
    const rows = Object.entries(map).sort((a, b) => b[1] - a[1]);
    const max = rows.length ? rows[0][1] : 1;
    $('#lb').innerHTML = rows.length ? rows.map(([nm, v], i) =>
      `<div class="row"><span class="rank">${i + 1}</span><span class="who">${esc(nm)}</span><span class="amt">${fmtMoney(v)}</span><span class="barline"><i style="width:${(v / max) * 100}%"></i></span></div>`).join('')
      : '<div class="empty">No reps in selection</div>';
  }

  function typePill(d) {
    const ty = (d.ty || '').toLowerCase();
    if (ty.includes('new logo')) return '<span class="pill nl">New logo</span>';
    if (ty === 'upsell') return '<span class="pill us">Upsell</span>';
    if (ty === 'renewal') return '<span class="pill vl">Renewal</span>';
    if (ty.includes('renewal')) return '<span class="pill mix">Renewal+</span>';
    return `<span class="pill mix">${esc(d.ty) || '—'}</span>`;
  }

  function renderTable(y) {
    let arr = dealsForYear(y);
    if (state.quarter !== 'all') arr = arr.filter(d => quarterOf(d.d) === +state.quarter);
    const rows = arr.slice().sort((a, b) => b.d.localeCompare(a.d)).slice(0, 8);
    $('#dealsBody').innerHTML = rows.length ? rows.map(d => {
      const amt = d.nl + d.us + d.vl;
      return `<tr><td class="name">${esc(d.t || d.c)}</td><td>${esc(d.c)}</td><td>${typePill(d)}</td><td>${esc(d.rep || '—')}</td><td>${d.d}</td><td class="amt">${fmtFull(amt)}</td></tr>`;
    }).join('') : '<tr><td colspan="6" class="empty">No deals in selection</td></tr>';
  }

  function renderWonList(y) {
    const wonEl = $('#wonList'); if (!wonEl) return;
    let arr = dealsForYear(y);
    if (state.quarter !== 'all') arr = arr.filter(d => quarterOf(d.d) === +state.quarter);
    arr = arr.slice().sort((a, b) => b.d.localeCompare(a.d)).slice(0, 20);
    const total = arr.reduce((s, d) => s + d.nl + d.us + d.vl, 0);
    const sub = $('#wonSub'), tot = $('#wonTot');
    if (sub) sub.textContent = arr.length + ' deals';
    if (tot) tot.textContent = fmtMoney(total);
    wonEl.innerHTML = arr.length ? arr.map(d => {
      const v = d.nl + d.us + d.vl;
      const max = arr.reduce((m, x) => Math.max(m, x.nl + x.us + x.vl), 1);
      return `<div class="row"><span class="who">${esc(d.t || d.c)}</span><span class="submeta">${d.d}</span><span class="amt">${fmtMoney(v)}</span><span class="barline"><i style="width:${(v / max) * 100}%"></i></span></div>`;
    }).join('') : '<div class="empty">No won deals in selection</div>';
  }

  // ---------- PIPELINE TAB ----------
  function renderPipeline() {
    const y = state.year;
    const open = openDealsForYear(y);

    // filter by quarter/month if focused
    const scoped = state.quarter === 'all'
      ? open
      : open.filter(d => quarterOf(d.d) === +state.quarter);

    // quarter cards (open pipeline value by quarter)
    const q = Array.from({ length: 4 }, () => { const o = { total: 0, n: 0 }; PIPES.forEach(p => o[p] = 0); return o; });
    open.forEach(d => {
      const i = quarterOf(d.d);
      const v = d.nl + d.us + d.vl;
      q[i][d.pi] = (q[i][d.pi] || 0) + v;
      q[i].total += v;
      q[i].n++;
    });

    $('#pipeCards').innerHTML = QS.map((ql, i) => {
      const c = q[i]; const nlp = c["New logo's"] || 0, cgp = c["Customer Growth"] || 0;
      const t = c.total || 1;
      return `<div class="panel pq">
        <div class="ptitle">${ql} ${y}</div>
        <div class="big">${fmtMoney(c.total)}</div>
        <div class="submeta" style="margin:6px 0 14px">${c.n} deals</div>
        <div class="splitbar"><i class="s-nl" style="width:${nlp / t * 100}%"></i><i class="s-cg" style="width:${cgp / t * 100}%"></i></div>
        <div class="splitleg"><span><span class="dot" style="background:var(--newlogo)"></span>New logo's ${fmtMoney(nlp)}</span><span><span class="dot" style="background:var(--upsell)"></span>Customer Growth ${fmtMoney(cgp)}</span></div>
      </div>`;
    }).join('');

    // open deals list
    const topEl = $('#pipeTop');
    if (topEl) {
      const sorted = scoped.slice().sort((a, b) => (b.nl + b.us + b.vl) - (a.nl + a.us + a.vl));
      const maxV = sorted.length ? sorted[0].nl + sorted[0].us + sorted[0].vl : 1;
      const sub = $('#pipeOpenSub'), tot = $('#pipeTopTot');
      if (sub) sub.textContent = sorted.length + ' deals';
      if (tot) tot.textContent = fmtMoney(sorted.reduce((s, d) => s + d.nl + d.us + d.vl, 0));
      topEl.innerHTML = sorted.length ? sorted.slice(0, 20).map(d => {
        const v = d.nl + d.us + d.vl;
        const prob = d.prob != null ? ` · ${Math.round(d.prob)}%` : '';
        return `<div class="row"><span class="who">${esc(d.t || d.c)}</span><span class="submeta">${esc(d.rep || '')}${prob}</span><span class="amt">${fmtMoney(v)}</span><span class="barline"><i style="width:${(v / maxV) * 100}%"></i></span></div>`;
      }).join('') : '<div class="empty">No open deals</div>';
    }

    // pipeline per person
    const repsEl = $('#pipeReps');
    if (repsEl) {
      const map = {};
      scoped.forEach(d => { if (d.rep) map[d.rep] = (map[d.rep] || 0) + d.nl + d.us + d.vl; });
      const rows = Object.entries(map).sort((a, b) => b[1] - a[1]);
      const maxR = rows.length ? rows[0][1] : 1;
      const tot = $('#pipeRepsTot');
      if (tot) tot.textContent = fmtMoney(rows.reduce((s, r) => s + r[1], 0));
      repsEl.innerHTML = rows.length ? rows.map(([nm, v], i) =>
        `<div class="row"><span class="rank">${i + 1}</span><span class="who">${esc(nm)}</span><span class="amt">${fmtMoney(v)}</span><span class="barline"><i style="width:${(v / maxR) * 100}%"></i></span></div>`).join('')
        : '<div class="empty">No open deals</div>';
    }

    // funnel — group by pipeline
    const funnelEl = $('#funnel');
    if (funnelEl) {
      const nlDeals = scoped.filter(d => d.pi === "New logo's");
      const nlTotal = nlDeals.reduce((s, d) => s + d.nl + d.us + d.vl, 0);
      const fTot = $('#funnelTot'), fDet = $('#funnelDetail');
      if (fTot) fTot.textContent = fmtMoney(nlTotal);
      funnelEl.innerHTML = nlDeals.length
        ? `<div class="lb">` + nlDeals.slice().sort((a, b) => (b.nl + b.us + b.vl) - (a.nl + a.us + a.vl)).slice(0, 10).map(d => {
            const v = d.nl + d.us + d.vl;
            return `<div class="row"><span class="who">${esc(d.t || d.c)}</span><span class="submeta">${d.d}</span><span class="amt">${fmtMoney(v)}</span></div>`;
          }).join('') + `</div>`
        : '<div class="empty">No new logo deals in pipeline</div>';
      if (fDet) fDet.innerHTML = '';
    }

    // upcoming renewals — open deals with vl > 0
    const renewEl = $('#renewalList');
    if (renewEl) {
      const renewals = open.filter(d => d.vl > 0).sort((a, b) => a.d.localeCompare(b.d));
      const sub = $('#renewalSub'), tot = $('#renewalTot');
      if (sub) sub.textContent = renewals.length + ' deals';
      if (tot) tot.textContent = fmtMoney(renewals.reduce((s, d) => s + d.vl, 0));
      renewEl.innerHTML = renewals.length ? renewals.slice(0, 20).map(d =>
        `<div class="row"><span class="who">${esc(d.t || d.c)}</span><span class="submeta">${d.d} · ${esc(d.rep || '')}</span><span class="amt">${fmtMoney(d.vl)}</span></div>`
      ).join('') : '<div class="empty">No upcoming renewals</div>';
    }

    // deal table grouped by quarter
    const byq = [[], [], [], []]; open.forEach(d => byq[quarterOf(d.d)].push(d));
    $('#pipeTableWrap').innerHTML = QS.map((ql, i) => {
      const rows = byq[i].sort((a, b) => (b.nl + b.us + b.vl) - (a.nl + a.us + a.vl));
      if (!rows.length) return `<div class="qgroup"><h3>${ql} ${y}</h3><div class="empty">No open deals</div></div>`;
      return `<div class="qgroup"><h3>${ql} ${y} · ${rows.length} deals · ${fmtMoney(rows.reduce((s, d) => s + d.nl + d.us + d.vl, 0))}</h3>
        <table class="deals"><thead><tr><th>Deal</th><th>Customer</th><th>Pipeline</th><th>Owner</th><th>Close date</th><th style="text-align:right">Value</th></tr></thead><tbody>` +
        rows.map(d => `<tr><td class="name">${esc(d.t || d.c)}</td><td>${esc(d.c)}</td><td>${pipePill(d.pi)}</td><td>${esc(d.rep || '—')}</td><td>${d.d}</td><td class="amt">${fmtFull(d.nl + d.us + d.vl)}</td></tr>`).join('') +
        `</tbody></table></div>`;
    }).join('');

    const py = $('#pipeYear'); if (py) py.textContent = y;
  }

  function pipePill(p) {
    if (p === "New logo's") return '<span class="pill nl">New logo\'s</span>';
    if (p === 'Customer Growth') return '<span class="pill us">Customer Growth</span>';
    return `<span class="pill mix">${esc(p) || '—'}</span>`;
  }

  // ---------- goals modal ----------
  function openGoals() {
    const y = state.year, g = goalsFor(y);
    const rows = QS.map((ql, i) =>
      `<tr><td>${ql}</td>
        <td><input data-k="nl" data-i="${i}" class="ginp" value="${g.nl[i]}"></td>
        <td><input data-k="us" data-i="${i}" class="ginp" value="${g.us[i]}"></td>
        <td class="gsum" data-i="${i}">${fmtFull(g.nl[i] + g.us[i])}</td></tr>`).join('');
    $('#goalsBody').innerHTML = rows;
    $('#goalsYear').textContent = y;
    updateGoalTotals();
    $('#goalsModal').classList.add('show');
    $$('#goalsBody .ginp').forEach(inp => inp.addEventListener('input', () => {
      const r = inp.closest('tr'); const i = inp.dataset.i;
      const nl = +r.querySelector('[data-k=nl]').value.replace(/[^\d.]/g, '') || 0;
      const us = +r.querySelector('[data-k=us]').value.replace(/[^\d.]/g, '') || 0;
      r.querySelector('.gsum').textContent = fmtFull(nl + us);
      updateGoalTotals();
    }));
  }
  function updateGoalTotals() {
    let tnl = 0, tus = 0;
    $$('#goalsBody tr').forEach(r => {
      tnl += +r.querySelector('[data-k=nl]').value.replace(/[^\d.]/g, '') || 0;
      tus += +r.querySelector('[data-k=us]').value.replace(/[^\d.]/g, '') || 0;
    });
    $('#gTotNL').textContent = fmtFull(tnl); $('#gTotUS').textContent = fmtFull(tus); $('#gTotAll').textContent = fmtFull(tnl + tus);
  }
  function saveGoals() {
    const nl = [], us = [];
    $$('#goalsBody tr').forEach(r => {
      nl.push(+r.querySelector('[data-k=nl]').value.replace(/[^\d.]/g, '') || 0);
      us.push(+r.querySelector('[data-k=us]').value.replace(/[^\d.]/g, '') || 0);
    });
    GOALS[state.year] = { nl, us };
    persist(); $('#goalsModal').classList.remove('show'); render(); toast('Goals saved for ' + state.year);
  }

  // ---------- persistence + events ----------
  function persist() { try { localStorage.setItem(LS.state, JSON.stringify(state)); localStorage.setItem(LS.goals, JSON.stringify(GOALS)); } catch (e) {} }
  function saveData() { try { localStorage.setItem(LS.data, JSON.stringify(DATA)); } catch (e) {} }

  function bind() {
    $$('.tabbtn').forEach(b => b.addEventListener('click', () => { state.tab = b.dataset.tab; render(); }));
    $('#yearSel').addEventListener('change', e => { state.year = +e.target.value; render(); });
    $('#cmpSel').addEventListener('change', e => { state.compare = e.target.value; render(); });
    $('#repSel').addEventListener('change', e => { state.rep = e.target.value; render(); });
    $('#coSel').addEventListener('change', e => { state.country = e.target.value; render(); });
    $$('#granSeg button').forEach(b => b.addEventListener('click', () => { state.gran = b.dataset.g; render(); }));
    $$('#qSeg button').forEach(b => b.addEventListener('click', () => { state.quarter = b.dataset.q === 'all' ? 'all' : +b.dataset.q; render(); }));
    $('#vlToggle').addEventListener('click', () => { state.includeVL = !state.includeVL; render(); });

    $('#goalLink').addEventListener('click', openGoals);
    $('#goalsBtn').addEventListener('click', openGoals);
    $('#goalsSave').addEventListener('click', saveGoals);
    $('#goalsClose').addEventListener('click', () => $('#goalsModal').classList.remove('show'));
    $('#goalsModal').addEventListener('click', e => { if (e.target.id === 'goalsModal') $('#goalsModal').classList.remove('show'); });

    const fi = $('#fileInput');
    $('#uploadBtn').addEventListener('click', () => fi.click());
    fi.addEventListener('change', e => { if (e.target.files[0]) loadFile(e.target.files[0]); });
    $('#resetBtn').addEventListener('click', () => { localStorage.removeItem(LS.data); DATA = window.SAFESIGHT_DEFAULT; render(); toast('Reverted to original snapshot'); });

    const drop = $('#drop'); let dc = 0;
    window.addEventListener('dragenter', e => { e.preventDefault(); dc++; drop.classList.add('show'); });
    window.addEventListener('dragover', e => e.preventDefault());
    window.addEventListener('dragleave', e => { dc--; if (dc <= 0) drop.classList.remove('show'); });
    window.addEventListener('drop', e => { e.preventDefault(); dc = 0; drop.classList.remove('show'); const f = e.dataTransfer.files[0]; if (f) loadFile(f); });
  }

  async function loadFile(file) {
    if (!/\.xlsx$/i.test(file.name)) { toast('Please drop the .xlsx export', true); return; }
    try {
      const parsed = await window.SafeSightParser.parseWorkbook(await file.arrayBuffer());
      if (!parsed.deals.length) throw new Error('No dated deals found');
      DATA = parsed; saveData(); state.year = null; render();
      toast(`Updated · ${parsed.deals.length} deals loaded`);
    } catch (err) { console.error(err); toast('Could not read file: ' + err.message, true); }
  }

  let toastT;
  function toast(msg, isErr) {
    const t = $('#toast'); t.textContent = msg; t.className = 'toast show' + (isErr ? ' err' : '');
    clearTimeout(toastT); toastT = setTimeout(() => t.className = 'toast' + (isErr ? ' err' : ''), 3200);
  }

  document.addEventListener('DOMContentLoaded', () => { bind(); render(); });
})();
