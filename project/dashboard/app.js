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
  // Embedded data (from Teamleader sync) is always the source of truth.
  // Excel uploads override for the current session only (not persisted).
  let DATA = window.SAFESIGHT_DEFAULT;
  try { localStorage.removeItem(LS.data); } catch (e) {}

  let GOALS = {};
  try { GOALS = JSON.parse(localStorage.getItem(LS.goals)) || {}; } catch (e) {}
  const SEED = window.SAFESIGHT_DEFAULT_GOALS || {};
  for (const y in SEED) if (!GOALS[y]) GOALS[y] = { nl: SEED[y].nl.slice(), us: SEED[y].us.slice() };

  const state = Object.assign(
    { tab: 'overview', year: null, gran: 'quarter', quarter: 'all', compare: 'none', rep: 'all', currency: 'eur', theme: 'dark' },
    (() => { try { return JSON.parse(localStorage.getItem(LS.state)) || {}; } catch (e) { return {}; } })()
  );

  // ---------- helpers ----------
  const yearOf  = d => +d.slice(0, 4);
  const monthOf = d => +d.slice(5, 7) - 1;
  const quarterOf = d => Math.floor(monthOf(d) / 3);
  function years() {
    const currYear = new Date().getFullYear();
    return [...new Set(DATA.deals.map(d => yearOf(d.d)))].sort().filter(y => y <= currYear + 1);
  }

  function goalsFor(y) {
    if (GOALS[y]) return GOALS[y];
    const prevNL = DATA.deals.filter(d => yearOf(d.d) === y - 1 && isWon(d)).reduce((s, d) => s + d.nl, 0);
    const prevUS = DATA.deals.filter(d => yearOf(d.d) === y - 1 && isWon(d)).reduce((s, d) => s + d.us, 0);
    const nl = Math.round(prevNL * 1.2 / 4 / 1000) * 1000 || 75000;
    const us = Math.round(prevUS * 1.2 / 4 / 1000) * 1000 || 15000;
    return { nl: [nl, nl, nl, nl], us: [us, us, us, us], _derived: true };
  }
  const annual = (g, k) => g[k].reduce((a, b) => a + b, 0);

  const TODAY = new Date().toISOString().slice(0, 10);
  // legacy data has no status — treat past-dated deals as won, future-dated as open
  const isWon  = d => d.status === 'won'  || (!d.status && d.d <= TODAY);
  const isOpen = d => d.status === 'open' || (!d.status && d.d >  TODAY);

  function fmtMoney(n) {
    const rate = (window.SAFESIGHT_DEFAULT?.exchangeRate || 1.08);
    const val = state.currency === 'usd' ? n * rate : n;
    const sym = state.currency === 'usd' ? '$' : '€';
    const a = Math.abs(val);
    if (a >= 1e6) return sym + (val / 1e6).toFixed(a >= 1e7 ? 1 : 2).replace(/\.?0+$/, '') + 'M';
    if (a >= 1000) return sym + Math.round(val / 1000) + 'k';
    return sym + Math.round(val);
  }
  function fmtFull(n) {
    const rate = (window.SAFESIGHT_DEFAULT?.exchangeRate || 1.08);
    const val = state.currency === 'usd' ? n * rate : n;
    const sym = state.currency === 'usd' ? '$' : '€';
    return sym + Math.round(val).toLocaleString('en-US');
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }

  function applyFilters(arr) {
    return arr.filter(d =>
      (state.rep === 'all' || d.rep === state.rep));
  }
  function wonDealsForYear(y)  { return applyFilters(DATA.deals.filter(d => yearOf(d.d) === y && isWon(d))); }
  function openDealsForYear(y) { return applyFilters(DATA.deals.filter(d => yearOf(d.d) === y && isOpen(d))); }
  function dealsForYear(y)     { return applyFilters(DATA.deals.filter(d => yearOf(d.d) === y)); }

  // asOfMonth based on won deals so YTD label reflects last closed deal
  function asOfMonth(y) { const ms = wonDealsForYear(y).map(d => monthOf(d.d)); return ms.length ? Math.max(...ms) : 11; }

  // series of WON deals (bars in charts = won only, pipeline separate)
  function series(y, gran) {
    const n = gran === 'month' ? 12 : 4;
    const arr = Array.from({ length: n }, () => ({ nl: 0, us: 0, vl: 0, count: 0 }));
    wonDealsForYear(y).forEach(d => {
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

  // same as scope() but won deals only — used for goal progress
  function scopeWon(y) {
    const g = goalsFor(y);
    if (state.quarter !== 'all') {
      const q = +state.quarter;
      const arr = wonDealsForYear(y).filter(d => quarterOf(d.d) === q);
      return { nl: sum(arr, 'nl'), us: sum(arr, 'us'), vl: sum(arr, 'vl'), n: arr.length,
               gNL: g.nl[q], gUS: g.us[q], gComb: g.nl[q] + g.us[q] };
    }
    const m = asOfMonth(y);
    const arr = wonDealsForYear(y).filter(d => monthOf(d.d) <= m);
    return { nl: sum(arr, 'nl'), us: sum(arr, 'us'), vl: sum(arr, 'vl'), n: arr.length,
             gNL: annual(g, 'nl'), gUS: annual(g, 'us'), gComb: annual(g, 'nl') + annual(g, 'us') };
  }

  // ---------- top-level render ----------
  function render() {
    if (!DATA || !DATA.deals || !DATA.deals.length) {
      document.body.innerHTML = '<div style="padding:60px;text-align:center;color:#fff;font-family:sans-serif"><h2>No data loaded</h2><p>Click Sync Teamleader to load data.</p></div>';
      return;
    }
    const ys = years();
    const currYear = new Date().getFullYear();
    if (!state.year || !ys.includes(state.year)) {
      state.year = ys.filter(y => y <= currYear).pop() || ys[ys.length - 1];
    }
    if (state.compare !== 'none' && (!ys.includes(+state.compare) || +state.compare === state.year)) state.compare = 'none';
    persist();
    renderControls(ys);
    $('#tab-overview').classList.toggle('hidden', state.tab !== 'overview');
    $('#tab-pipeline').classList.toggle('hidden', state.tab !== 'pipeline');
    const finEl = $('#tab-financials');
    if (finEl) finEl.classList.toggle('hidden', state.tab !== 'financials');
    $$('.tabbtn').forEach(b => b.classList.toggle('active', b.dataset.tab === state.tab));
    if (state.tab === 'overview') renderOverview();
    else if (state.tab === 'pipeline') renderPipeline();
    else if (state.tab === 'financials') renderFinancials();
    $('#updated').innerHTML = 'Data as of <b>' + (DATA.generated || '—') + '</b>';
  }

  function renderControls(ys) {
    $('#yearSel').innerHTML = ys.map(y => `<option value="${y}" ${y === state.year ? 'selected' : ''}>${y}</option>`).join('');
    $$('#currencySeg button').forEach(b => b.classList.toggle('active', b.dataset.cur === state.currency));
    $$('#granSeg button').forEach(b => b.classList.toggle('active', b.dataset.g === state.gran));
    $$('#qSeg button').forEach(b => b.classList.toggle('active', b.dataset.q === String(state.quarter)));
    $('#cmpSel').innerHTML = '<option value="none">No comparison</option>' +
      ys.filter(y => y !== state.year).map(y => `<option value="${y}" ${String(y) === state.compare ? 'selected' : ''}>Compare vs ${y}</option>`).join('');
    const reps = ['all', ...[...new Set(DATA.deals.map(d => d.rep).filter(Boolean))].sort()];
    $('#repSel').innerHTML = reps.map(r => `<option value="${r}" ${r === state.rep ? 'selected' : ''}>${r === 'all' ? 'All reps' : r}</option>`).join('');
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

    const scWon = scopeWon(y);
    const wonSales = scWon.nl + scWon.us;
    const pipeNL = sc.nl - scWon.nl, pipeUS = sc.us - scWon.us;
    const pr = progressBlock(wonSales, scWon.gComb);
    $('#kpiSales').textContent = fmtMoney(wonSales);
    $('#ytdLabel').textContent = sc.label + (sc.isQ ? '' : ' · YTD');
    $('#scopeNote').textContent = sc.isQ ? 'Quarter goal' : 'Annual goal';
    $('#pfill').style.width = Math.min(100, pr.pct) + '%';
    $('#ppct').textContent = pr.pctTxt;
    $('#goalAmt').textContent = fmtMoney(scWon.gComb);
    $('#pGoalNote').textContent = fmtMoney(wonSales) + ' won';
    $('#dealCount').textContent = scWon.n + ' won · ' + (sc.n - scWon.n) + ' open';
    $('#kpiSalesMeta').innerHTML = cmp ? deltaHTML(wonSales, scC.nl + scC.us, cmp) : '';

    fillKPI('NL', scWon.nl, pipeNL, scWon.gNL, cmp ? scC.nl : null, cmp);
    fillKPI('US', scWon.us, pipeUS, scWon.gUS, cmp ? scC.us : null, cmp);
    $('#kpiVL').textContent = fmtMoney(scWon.vl);
    $('#kpiVLMeta').innerHTML = cmp ? deltaHTML(scWon.vl, scC.vl, cmp) : '<span class="submeta">no goal set</span>';

    // count badges
    const arr = wonDealsForYear(y).filter(d => state.quarter === 'all' || quarterOf(d.d) === +state.quarter);
    const nlEl = $('#kpiNLCount'), usEl = $('#kpiUSCount');
    if (nlEl) nlEl.textContent = arr.filter(d => d.nl > 0).length || '';
    if (usEl) usEl.textContent = arr.filter(d => d.us > 0).length || '';

    // churn KPI — loaded async from Google Sheets
    const chEl = $('#kpiChurn'); if (chEl) chEl.textContent = '…';
    const chMeta = $('#kpiChurnMeta'); if (chMeta) chMeta.textContent = 'loading…';

    renderMainChart(y, cmp);
    renderStreamChart('nl', '#nlChart', '#nlTotal');
    renderStreamChart('us', '#usChart', '#usTotal');
    renderBreakdown(sc);
    renderLeaderboard(y);
    renderTable(y);
    renderWonList(y);
    renderOpenList(y);
    renderLostDeals(y);
    renderChurn(y);
  }

  function scopeFor(yr, like) {
    if (like.isQ) {
      const arr = dealsForYear(yr).filter(d => quarterOf(d.d) === like.q);
      return { nl: sum(arr, 'nl'), us: sum(arr, 'us'), vl: sum(arr, 'vl'), n: arr.length };
    }
    const arr = dealsForYear(yr).filter(d => monthOf(d.d) <= like.asOf);
    return { nl: sum(arr, 'nl'), us: sum(arr, 'us'), vl: sum(arr, 'vl'), n: arr.length };
  }

  function fillKPI(id, won, pipeline, goal, prev, cmp) {
    $('#kpi' + id).textContent = fmtMoney(won);
    const pct = goal > 0 ? (won / goal) * 100 : 0;
    $('#p' + id + 'fill').style.width = Math.min(100, pct) + '%';
    $('#kpi' + id + 'Meta').innerHTML =
      `<span class="goalpct">${pct.toFixed(0)}% of ${fmtMoney(goal)}</span>` +
      (pipeline > 0 ? ` <span class="submeta">+${fmtMoney(pipeline)} pipeline</span>` : '') +
      (cmp ? ' ' + deltaHTML(won, prev, cmp) : '');
  }

  function visibleIndices() {
    if (state.quarter === 'all') return null;
    const q = +state.quarter;
    return state.gran === 'month' ? [q * 3, q * 3 + 1, q * 3 + 2] : [q];
  }

  // ── Tooltip ──────────────────────────────────────────────────────────────
  let _tip = null;
  function getTip() {
    if (!_tip) {
      _tip = document.createElement('div');
      _tip.style.cssText = 'position:fixed;background:#1e293b;border:1px solid #334155;border-radius:8px;padding:10px 14px;font-size:12px;color:#e2e8f0;pointer-events:none;z-index:9999;display:none;max-width:280px;box-shadow:0 8px 24px rgba(0,0,0,.5);line-height:1.6';
      document.body.appendChild(_tip);
    }
    return _tip;
  }
  function showTip(e, html) {
    const t = getTip(); t.innerHTML = html; t.style.display = 'block'; moveTip(e);
  }
  function moveTip(e) {
    const t = getTip();
    t.style.left = Math.min(e.clientX + 14, window.innerWidth - t.offsetWidth - 10) + 'px';
    t.style.top  = Math.min(e.clientY + 14, window.innerHeight - t.offsetHeight - 10) + 'px';
  }
  function hideTip() { getTip().style.display = 'none'; }

  const _barDeals = {};

  function renderMainChart(y, cmp) {
    const gran = state.gran;
    const data = series(y, gran);
    const g = goalsFor(y);
    const labs = gran === 'month' ? MONTHS : QS;
    const perGoal = i => gran === 'month' ? (g.nl[Math.floor(i / 3)] + g.us[Math.floor(i / 3)]) / 3 : (g.nl[i] + g.us[i]);
    const vis = visibleIndices();
    const idxs = vis || data.map((_, i) => i);
    const cmpData = cmp ? series(cmp, gran) : null;

    // pre-index won deals per period for hover tooltips
    const allWon = wonDealsForYear(y);
    idxs.forEach(i => {
      const key = `${y}-${gran}-${i}`;
      _barDeals[key] = allWon.filter(d => (gran === 'month' ? monthOf(d.d) : quarterOf(d.d)) === i);
    });

    const totals = idxs.map(i => data[i].nl + data[i].us);
    const cmpTot = cmp ? idxs.map(i => cmpData[i].nl + cmpData[i].us) : [];
    const goalsArr = idxs.map(perGoal);
    const max = Math.max(1, ...totals, ...cmpTot, ...goalsArr) * 1.08;
    const H = 300;

    const cols = idxs.map((i) => {
      const d = data[i];
      const total = d.nl + d.us;
      const goal = perGoal(i);
      let inner;
      if (cmp) {
        const ctot = cmpData[i].nl + cmpData[i].us;
        inner = `<div class="grp">
          <div class="gbar cur" style="height:${(total / max) * (H - 22)}px"></div>
          <div class="gbar cmp" style="height:${(ctot / max) * (H - 22)}px"></div>
        </div>`;
      } else {
        const segs = [['nl', d.nl], ['us', d.us]];
        inner = `<div class="bar-stack" style="height:${Math.max((total / max) * (H - 22), total > 0 ? 3 : 0)}px">` +
          segs.filter(s => s[1] > 0).map(([k, v]) => `<div class="bar-seg ${k}" style="height:${(v / total) * 100}%"></div>`).join('') + `</div>`;
      }
      return `<div class="bar-col" data-bkey="${y}-${gran}-${i}">
        <div class="vlab">${fmtMoney(total)}${cmp ? ' / ' + fmtMoney(cmpData[i].nl + cmpData[i].us) : ''}</div>
        <div class="goal-tick" style="bottom:${(goal / max) * (H - 22) + 22}px"></div>
        ${inner}
        <div class="xlab">${labs[i]}</div>
      </div>`;
    }).join('');

    const wrap = $('#mainChart');
    wrap.innerHTML = `<div class="bars-wrap"><div class="bars" style="height:${H}px">${cols}</div></div>`;

    // hover tooltips showing won deals for that period
    wrap.onmousemove = e => {
      const col = e.target.closest('[data-bkey]'); if (!col) { hideTip(); return; }
      moveTip(e);
      const deals = _barDeals[col.dataset.bkey] || [];
      if (!deals.length) { hideTip(); return; }
      const label = col.querySelector('.xlab')?.textContent || '';
      const topDeals = deals.slice().sort((a, b) => (b.nl + b.us) - (a.nl + a.us)).slice(0, 10);
      const rows = topDeals.map(d => `<div style="display:flex;justify-content:space-between;gap:16px"><span>${esc(d.t || d.c)}</span><span style="color:#94a3b8">${fmtMoney(d.nl + d.us)}</span></div>`).join('');
      const total = deals.reduce((s, d) => s + d.nl + d.us, 0);
      showTip(e, `<div style="font-weight:700;margin-bottom:6px;color:#38bdf8">${label} · ${deals.length} won · ${fmtMoney(total)}</div>${rows}${deals.length > 10 ? `<div style="color:#64748b;margin-top:4px">+${deals.length - 10} more</div>` : ''}`);
    };
    wrap.onmouseleave = hideTip;

    $('#mainTitle').textContent = `Sales by ${gran === 'month' ? 'month' : 'quarter'} · ${y}` + (cmp ? ` vs ${cmp}` : '');
    $('#vlLegend').classList.toggle('hidden', true); // VL not in main chart
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

    // Pre-index deals for stream chart hover
    const allWon = wonDealsForYear(y);
    const streamDeals = {};
    idxs.forEach(i => {
      const key2 = `${y}-${gran}-${i}-${key}`;
      streamDeals[key2] = allWon.filter(d => {
        const idx = gran === 'month' ? monthOf(d.d) : quarterOf(d.d);
        return idx === i && d[key] > 0;
      });
    });

    const wrap = $(sel);
    wrap.innerHTML = `<div class="bars" style="height:${H}px">` + idxs.map(i => {
      const v = data[i][key], goal = perGoal(i);
      return `<div class="bar-col" data-skey="${y}-${gran}-${i}-${key}">
        <div class="vlab">${fmtMoney(v)}</div>
        <div class="goal-tick" style="bottom:${(goal / max) * (H - 20) + 20}px"></div>
        <div class="bar-stack" style="height:${Math.max((v / max) * (H - 20), v > 0 ? 3 : 0)}px"><div class="bar-seg ${key}" style="height:100%"></div></div>
        <div class="xlab">${labs[i]}</div>
      </div>`;
    }).join('') + `</div>`;

    // Hover tooltips for stream charts
    wrap.onmousemove = e => {
      const col = e.target.closest('[data-skey]'); if (!col) { hideTip(); return; }
      moveTip(e);
      const deals = streamDeals[col.dataset.skey] || [];
      if (!deals.length) { hideTip(); return; }
      const label = col.querySelector('.xlab')?.textContent || '';
      const topDeals = deals.slice().sort((a, b) => b[key] - a[key]).slice(0, 10);
      const rows = topDeals.map(d => `<div style="display:flex;justify-content:space-between;gap:16px"><span>${esc(d.t || d.c)}</span><span style="color:#94a3b8">${fmtMoney(d[key])}</span></div>`).join('');
      const total = deals.reduce((s, d) => s + d[key], 0);
      showTip(e, `<div style="font-weight:700;margin-bottom:6px;color:#38bdf8">${label} · ${deals.length} deals · ${fmtMoney(total)}</div>${rows}${deals.length > 10 ? `<div style="color:#64748b;margin-top:4px">+${deals.length - 10} more</div>` : ''}`);
    };
    wrap.onmouseleave = hideTip;

    const total = vals.reduce((a, b) => a + b, 0);
    const goalTotal = goalsArr.reduce((a, b) => a + b, 0);
    $(totalSel).innerHTML = `${fmtMoney(total)} <span class="ofgoal">/ ${fmtMoney(goalTotal)}</span>`;
  }

  function renderBreakdown(sc) {
    const donutEl = $('#donut'); if (!donutEl) return;
    const scWon = scopeWon(state.year);
    const parts = [['New logo', scWon.nl, 'var(--newlogo)'], ['Upsell', scWon.us, 'var(--upsell)'], ['Renewal', scWon.vl, 'var(--renewal)']];
    const salesTotal = scWon.nl + scWon.us; // NL+US only, no renewal
    const ringTotal = parts.reduce((s, p) => s + p[1], 0) || 1;
    let acc = 0; const R = 62, C = 2 * Math.PI * R;
    const rings = parts.map(([nm, v, col]) => {
      const frac = v / ringTotal, len = frac * C, off = acc * C; acc += frac;
      return `<circle r="${R}" cx="80" cy="80" fill="none" stroke="${col}" stroke-width="22" stroke-dasharray="${len} ${C - len}" stroke-dashoffset="${-off}" transform="rotate(-90 80 80)"></circle>`;
    }).join('');
    donutEl.innerHTML = `<svg class="donut" width="160" height="160" viewBox="0 0 160 160">
      <circle r="62" cx="80" cy="80" fill="none" stroke="rgba(255,255,255,.05)" stroke-width="22"></circle>${rings}
      <text x="80" y="74" text-anchor="middle" fill="var(--ink)" font-size="20" font-weight="800">${fmtMoney(salesTotal)}</text>
      <text x="80" y="94" text-anchor="middle" fill="var(--ink-faint)" font-size="11" font-weight="600">${sc.isQ ? sc.label : 'YTD won'}</text></svg>`;
    const legEl = $('#donutLegend');
    if (legEl) legEl.innerHTML = parts.map(([nm, v, col]) =>
      `<div class="row"><span class="dot" style="background:${col}"></span><span class="nm">${nm}</span><span class="vl2">${fmtMoney(v)}</span><span class="submeta" style="width:38px;text-align:right">${Math.round(v / ringTotal * 100)}%</span></div>`).join('');
  }

  function renderLeaderboard(y) {
    const map = {};
    let arr = wonDealsForYear(y);
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
    const body = $('#dealsBody'); if (!body) return;
    let arr = dealsForYear(y);
    if (state.quarter !== 'all') arr = arr.filter(d => quarterOf(d.d) === +state.quarter);
    const rows = arr.slice().sort((a, b) => b.d.localeCompare(a.d)).slice(0, 8);
    body.innerHTML = rows.length ? rows.map(d => {
      const amt = d.nl + d.us;
      return `<tr><td class="name">${esc(d.t || d.c)}</td><td>${esc(d.c)}</td><td>${typePill(d)}</td><td>${esc(d.rep || '—')}</td><td>${d.d}</td><td class="amt">${fmtFull(amt)}</td></tr>`;
    }).join('') : '<tr><td colspan="6" class="empty">No deals in selection</td></tr>';
  }

  function renderLostDeals(y) {
    const body = $('#lostBody'); if (!body) return;
    const isLost = d => d.status === 'lost';
    let arr = applyFilters(DATA.deals.filter(d => yearOf(d.d) === y && isLost(d)));
    if (state.quarter !== 'all') arr = arr.filter(d => quarterOf(d.d) === +state.quarter);
    arr = arr.slice().sort((a, b) => b.d.localeCompare(a.d));
    const sub = $('#lostSub'), tot = $('#lostTot');
    const total = arr.reduce((s, d) => s + d.nl + d.us, 0);
    if (sub) sub.textContent = arr.length + ' deals';
    if (tot) tot.textContent = fmtMoney(total);
    body.innerHTML = arr.length ? arr.slice(0, 30).map(d => {
      const amt = d.nl + d.us;
      return `<tr><td class="name">${esc(d.t || d.c)}</td><td>${esc(d.c)}</td><td>${typePill(d)}</td><td>${esc(d.rep || '—')}</td><td>${d.lostAt || d.d}</td><td class="amt">${fmtFull(amt)}</td></tr>`;
    }).join('') : '<tr><td colspan="6" class="empty">No lost deals in selection</td></tr>';
  }

  function renderWonList(y) {
    const wonEl = $('#wonList'); if (!wonEl) return;
    let arr = wonDealsForYear(y);
    if (state.quarter !== 'all') arr = arr.filter(d => quarterOf(d.d) === +state.quarter);
    arr = arr.slice().sort((a, b) => (b.nl + b.us) - (a.nl + a.us));
    const max = arr.reduce((m, d) => Math.max(m, d.nl + d.us), 1);
    const total = arr.reduce((s, d) => s + d.nl + d.us, 0);
    const sub = $('#wonSub'), tot = $('#wonTot');
    if (sub) sub.textContent = arr.length + ' deals';
    if (tot) tot.textContent = fmtMoney(total);
    wonEl.innerHTML = arr.length ? arr.slice(0, 30).map((d, i) => {
      const v = d.nl + d.us;
      return `<div class="wrow">
        <span class="rank">${i + 1}</span>
        <div class="wrow-main">
          <div class="wrow-top"><span class="who">${esc(d.t || d.c)}</span>${typePill(d)}<span class="amt">${fmtMoney(v)}</span></div>
          <div class="barline"><i style="width:${(v / max) * 100}%"></i></div>
        </div>
      </div>`;
    }).join('') : '<div class="empty">No won deals in selection</div>';
  }

  function renderOpenList(y) {
    const openEl = $('#openList'); if (!openEl) return;
    let arr = openDealsForYear(y);
    if (state.quarter !== 'all') arr = arr.filter(d => quarterOf(d.d) === +state.quarter);
    arr = arr.slice().sort((a, b) => (b.nl + b.us) - (a.nl + a.us));
    const max = arr.reduce((m, d) => Math.max(m, d.nl + d.us), 1);
    const total = arr.reduce((s, d) => s + d.nl + d.us, 0);
    const sub = $('#openSub'), tot = $('#openTot');
    if (sub) sub.textContent = arr.length + ' deals';
    if (tot) tot.textContent = fmtMoney(total);
    openEl.innerHTML = arr.length ? arr.slice(0, 30).map((d, i) => {
      const v = d.nl + d.us;
      return `<div class="wrow">
        <span class="rank">${i + 1}</span>
        <div class="wrow-main">
          <div class="wrow-top"><span class="who">${esc(d.t || d.c)}</span>${pipePill(d.pi)}<span class="amt">${fmtMoney(v)}</span></div>
          <div class="barline"><i style="width:${(v / max) * 100}%"></i></div>
        </div>
      </div>`;
    }).join('') : '<div class="empty">No open deals in selection</div>';
  }

  // ---------- PIPELINE TAB ----------
  function renderPipeline() {
    const y = state.year;
    const allOpen = openDealsForYear(y);
    const scoped = state.quarter === 'all' ? allOpen : allOpen.filter(d => quarterOf(d.d) === +state.quarter);
    const today = new Date();

    const nlDeals  = scoped.filter(d => d.pi === "New logo's");
    const usDeals  = scoped.filter(d => d.pi === 'Customer Growth');
    const vlDeals  = scoped.filter(d => d.vl > 0);
    const nlTotal  = nlDeals.reduce((s, d) => s + d.nl, 0);
    const usTotal  = usDeals.reduce((s, d) => s + d.us, 0);
    const vlTotal  = vlDeals.reduce((s, d) => s + d.vl, 0);
    const pipeTotal = nlTotal + usTotal;

    // Pipeline cards (NL + US only, no VL)
    const nlWt = nlDeals.reduce((s, d) => s + (d.nl || 0) * (d.prob || 0), 0);
    const usWt = usDeals.reduce((s, d) => s + (d.us || 0) * (d.prob || 0), 0);
    const vlWt = vlDeals.reduce((s, d) => s + (d.vl || 0) * (d.prob || 0), 0);

    $('#pipeCards').innerHTML = [
      { label: 'OPEN PIPELINE', v: pipeTotal, wv: nlWt + usWt, n: scoped.length, col: 'var(--ink)' },
      { label: 'NEW LOGO',      v: nlTotal,  wv: nlWt, n: nlDeals.length, col: 'var(--newlogo)' },
      { label: 'UPSELL',        v: usTotal,  wv: usWt, n: usDeals.length, col: 'var(--upsell)' },
      { label: 'RENEWALS DUE',  v: vlTotal,  wv: vlWt, n: vlDeals.length, col: 'var(--renewal)' },
    ].map(({ label, v, wv, n, col }) => `<div class="panel pq">
      <div class="ptitle" style="color:${col}">${label}</div>
      <div class="big">${fmtMoney(v)}</div>
      <div class="submeta">${n} deals · ${fmtMoney(wv)} weighted</div>
    </div>`).join('');

    // Helper: days until close / total days in quarter
    const pctClose = (dStr) => {
      const daysUntil = Math.max(0, (new Date(dStr) - today) / 86400000);
      const daysInQtr = 90;
      const pct = Math.min(100, Math.max(0, (1 - daysUntil / daysInQtr) * 100));
      return Math.round(pct);
    };

    // New Logo column
    const nlSorted = nlDeals.slice().sort((a, b) => b.nl - a.nl);
    const nlMax = nlSorted.length ? nlSorted[0].nl : 1;
    const nlEl = $('#pipeTop');
    if (nlEl) {
      const sub = $('#pipeOpenSub'), tot = $('#pipeTopTot');
      if (sub) sub.textContent = nlSorted.length + ' deals';
      if (tot) tot.textContent = fmtMoney(nlTotal);
      nlEl.innerHTML = nlSorted.length ? nlSorted.map((d, i) => {
        const close = pctClose(d.d);
        return `<div class="wrow">
          <span class="rank">${i + 1}</span>
          <div class="wrow-main">
            <div class="wrow-top"><span class="who">${esc(d.t || d.c)}</span><span class="amt">${fmtMoney(d.nl)}</span></div>
            <div class="submeta">${esc(d.rep || '')} · ${close}% close</div>
            <div class="barline"><i style="width:${(d.nl / nlMax) * 100}%;background:var(--newlogo)"></i></div>
          </div>
        </div>`;
      }).join('') : '<div class="empty">No new logo deals</div>';
    }

    // Upsell column
    const usSorted = usDeals.slice().sort((a, b) => b.us - a.us);
    const usMax = usSorted.length ? usSorted[0].us : 1;
    const usEl = $('#pipeReps');
    if (usEl) {
      const tot = $('#pipeRepsTot');
      if (tot) tot.textContent = fmtMoney(usTotal);
      usEl.innerHTML = usSorted.length ? usSorted.map((d, i) => {
        const close = pctClose(d.d);
        return `<div class="wrow">
          <span class="rank">${i + 1}</span>
          <div class="wrow-main">
            <div class="wrow-top"><span class="who">${esc(d.t || d.c)}</span><span class="amt">${fmtMoney(d.us)}</span></div>
            <div class="submeta">${esc(d.rep || '')} · ${close}% close</div>
            <div class="barline"><i style="width:${(d.us / usMax) * 100}%;background:var(--upsell)"></i></div>
          </div>
        </div>`;
      }).join('') : '<div class="empty">No upsell deals</div>';
    }

    // Renewals column
    const vlSorted = vlDeals.slice().sort((a, b) => b.vl - a.vl);
    const vlMax = vlSorted.length ? vlSorted[0].vl : 1;
    const renewEl = $('#renewalList');
    if (renewEl) {
      const sub = $('#renewalSub'), tot = $('#renewalTot');
      if (sub) sub.textContent = vlSorted.length + ' deals';
      if (tot) tot.textContent = fmtMoney(vlTotal);
      renewEl.innerHTML = vlSorted.length ? vlSorted.map((d, i) => {
        const close = pctClose(d.d);
        return `<div class="wrow">
          <span class="rank">${i + 1}</span>
          <div class="wrow-main">
            <div class="wrow-top"><span class="who">${esc(d.t || d.c)}</span><span class="amt">${fmtMoney(d.vl)}</span></div>
            <div class="submeta">${esc(d.rep || '')} · ${close}% close</div>
            <div class="barline"><i style="width:${(d.vl / vlMax) * 100}%;background:var(--renewal)"></i></div>
          </div>
        </div>`;
      }).join('') : '<div class="empty">No renewals</div>';
    }

    // Remove old sections
    $$('#funnel, #funnelDetail, #pipeTableWrap').forEach(el => { if (el) el.innerHTML = ''; });
  }

  async function renderChurn(y) {
    const body = $('#churnBody'); if (!body) return;
    const sub = $('#churnSub'), tot = $('#churnTot');
    body.innerHTML = '<tr><td colspan="5" class="empty">Loading…</td></tr>';
    try {
      const r = await fetch(`/.netlify/functions/finance-data?year=${y}`);
      const d = await r.json();
      if (d.error) throw new Error(d.error);
      if (sub) sub.textContent = (d.churnCount || 0) + ' in YTD ' + y;
      if (tot) tot.textContent = fmtMoney(d.churnTotal) + ' churned';
      const rows = d.churnRows || [];
      body.innerHTML = rows.length ? rows.map(r =>
        `<tr><td class="name">${esc(r.customer)}</td><td>${esc(r.industry)}</td><td>${esc(r.reason)}</td><td>${esc(r.when)}</td><td class="amt">${fmtFull(r.revenue)}</td></tr>`
      ).join('') : '<tr><td colspan="5" class="empty">No churn data for ' + y + '</td></tr>';
      // Also update Churn KPI
      const chEl = $('#kpiChurn'); if (chEl) chEl.textContent = fmtMoney(d.churnTotal);
      const chMeta = $('#kpiChurnMeta'); if (chMeta) chMeta.textContent = (d.churnCount || 0) + ' customers · ' + y + ' lost ARR';
    } catch (e) {
      body.innerHTML = '<tr><td colspan="5" class="empty">Churn data unavailable</td></tr>';
    }
  }

  function pipePill(p) {
    if (p === "New logo's") return '<span class="pill nl">New logo\'s</span>';
    if (p === 'Customer Growth') return '<span class="pill us">Customer Growth</span>';
    return `<span class="pill mix">${esc(p) || '—'}</span>`;
  }

  // ---------- FINANCIALS TAB ----------
  async function renderFinancials() {
    const y = state.year;

    // Sales from won deals
    const won = wonDealsForYear(y);
    const nl  = sum(won, 'nl'), us = sum(won, 'us'), vl = sum(won, 'vl');
    const sc  = scopeWon(y);
    const pr  = sc.gComb > 0 ? (nl + us) / sc.gComb * 100 : 0;

    const set = (id, v) => { const el = $(id); if (el) el.textContent = v; };
    set('#finYear',  y);
    set('#finSales', fmtFull(nl + us));
    set('#finNL',    fmtFull(nl));
    set('#finUS',    fmtFull(us));
    set('#finVL',    fmtFull(vl));
    set('#finDeals', won.length + ' deals won');
    set('#finNLMeta', Math.round(nl / (sc.gNL || 1) * 100) + '% of ' + fmtMoney(sc.gNL) + ' goal');
    set('#finUSMeta', Math.round(us / (sc.gUS || 1) * 100) + '% of ' + fmtMoney(sc.gUS) + ' goal');

    const pf = $('#finPfill'); if (pf) pf.style.width = Math.min(100, pr) + '%';
    set('#finPct',      Math.round(pr) + '%');
    set('#finGoalNote', 'of ' + fmtMoney(sc.gComb) + ' goal');

    // Fetch ARR + Churn from Google Sheets via proxy
    set('#finARR',        '…');
    set('#finTotal75',    '…');
    set('#finChurnTotal', '…');

    try {
      const r = await fetch(`/.netlify/functions/finance-data?year=${y}`);
      const d = await r.json();
      if (d.error) throw new Error(d.error);

      set('#finARR',        fmtFull(d.arrTotal));
      set('#finTotal75',    fmtFull(d.total75));
      set('#finChurnTotal', fmtMoney(d.churnTotal));
      const churnMeta = $('#finChurnTotalMeta');
      if (churnMeta) churnMeta.textContent = d.churnCount + ' customers · ' + y + ' lost ARR';
      const asOf = $('#finAsOf'); if (asOf) asOf.textContent = '';
    } catch (e) {
      set('#finARR', 'unavailable');
      set('#finTotal75', 'unavailable');
      set('#finChurnTotal', 'unavailable');
    }
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

  function applyTheme() {
    const root = document.documentElement;
    if (state.theme === 'light') {
      root.style.setProperty('--bg', '#fafafa');
      root.style.setProperty('--bg-2', '#f5f5f5');
      root.style.setProperty('--panel', '#fff');
      root.style.setProperty('--panel-2', '#f9f9f9');
      root.style.setProperty('--ink', '#1a1a1a');
      root.style.setProperty('--ink-dim', '#505050');
      root.style.setProperty('--ink-faint', '#888');
      root.style.setProperty('--line', '#c0c0c0');
      root.style.setProperty('--line-strong', '#909090');
    } else {
      root.style.setProperty('--bg', '#0f1419');
      root.style.setProperty('--bg-2', '#1a202c');
      root.style.setProperty('--panel', '#1e293b');
      root.style.setProperty('--panel-2', '#2a3a52');
      root.style.setProperty('--ink', '#e2e8f0');
      root.style.setProperty('--ink-dim', '#cbd5e1');
      root.style.setProperty('--ink-faint', '#94a3b8');
      root.style.setProperty('--line', '#334155');
      root.style.setProperty('--line-strong', '#475569');
    }
  }

  async function exportFinance() {
    try {
      console.log('Export Finance clicked');
      const y = state.year;
      const deals = wonDealsForYear(y).filter(d => !d.status || d.status === 'won');
      console.log('Found deals:', deals.length);

      if (!deals.length) { toast('No won deals to export for ' + y); return; }

      // Create CSV for bookings
      let bookingsCSV = 'Title\tCustomer Name\tDate Closed\tItem Name\tAmount (Euros)\tSales Rep\tIndustry\tBookings Type\tCountry\tPipeline\n';
      deals.forEach(d => {
        const items = [
          { name: 'NL ARR', val: d.nl_arr },
          { name: 'NL OO', val: d.nl_oo },
          { name: 'NL OB', val: d.nl_ob },
          { name: 'US ARR', val: d.us_arr },
          { name: 'US OO', val: d.us_oo },
          { name: 'US OB', val: d.us_ob },
          { name: 'VL REC', val: d.vl_rec },
          { name: 'VL OO', val: d.vl_oo },
          { name: 'VL IMPL', val: d.vl_impl },
        ].filter(i => i.val > 0);

        items.forEach(item => {
          bookingsCSV += `${esc(d.t)}\t${esc(d.c)}\t${d.d}\t${item.name}\t${item.val}\t${esc(d.rep || '')}\t${esc(d.ct || '')}\t${esc(d.ty || '')}\t${esc(d.co || '')}\t${esc(d.pi || '')}\n`;
        });
      });

      // Download
      const blob = new Blob([bookingsCSV], { type: 'text/tab-separated-values' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `safesight-bookings-${y}.tsv`;
      a.click();
      URL.revokeObjectURL(url);
      toast(`Exported ${deals.length} bookings for ${y}`);
    } catch (e) {
      toast('Export failed: ' + e.message);
    }
  }

  function bind() {
    $$('.tabbtn').forEach(b => b.addEventListener('click', () => { state.tab = b.dataset.tab; render(); }));
    $('#yearSel').addEventListener('change', e => { state.year = +e.target.value; render(); });
    $('#cmpSel').addEventListener('change', e => { state.compare = e.target.value; render(); });
    $('#repSel').addEventListener('change', e => { state.rep = e.target.value; render(); });
    $$('#granSeg button').forEach(b => b.addEventListener('click', () => { state.gran = b.dataset.g; render(); }));
    $$('#qSeg button').forEach(b => b.addEventListener('click', () => { state.quarter = b.dataset.q === 'all' ? 'all' : +b.dataset.q; render(); }));
    $$('#currencySeg button').forEach(b => b.addEventListener('click', () => { state.currency = b.dataset.cur; render(); }));
    $('#themeToggle').addEventListener('click', () => { state.theme = state.theme === 'dark' ? 'light' : 'dark'; persist(); applyTheme(); });

    $('#goalLink').addEventListener('click', openGoals);
    $('#goalsBtn').addEventListener('click', openGoals);
    $('#goalsSave').addEventListener('click', saveGoals);
    $('#goalsClose').addEventListener('click', () => $('#goalsModal').classList.remove('show'));
    $('#goalsModal').addEventListener('click', e => { if (e.target.id === 'goalsModal') $('#goalsModal').classList.remove('show'); });

    const fi = $('#fileInput');
    if (fi) {
      fi.addEventListener('change', e => { if (e.target.files[0]) loadFile(e.target.files[0]); });
    }
    const uploadBtn = $('#uploadBtn');
    if (uploadBtn) {
      uploadBtn.addEventListener('click', () => fi?.click());
    }
    const expBtn = $('#finExportBtn');
    if (expBtn) {
      expBtn.addEventListener('click', exportFinance);
    }

    const drop = $('#drop'); let dc = 0;
    if (drop) {
      window.addEventListener('dragenter', e => { e.preventDefault(); dc++; drop.classList.add('show'); });
      window.addEventListener('dragover', e => e.preventDefault());
      window.addEventListener('dragleave', e => { dc--; if (dc <= 0) drop.classList.remove('show'); });
      window.addEventListener('drop', e => { e.preventDefault(); dc = 0; drop.classList.remove('show'); const f = e.dataTransfer.files[0]; if (f) loadFile(f); });
    }
  }

  async function loadFile(file) {
    if (!/\.xlsx$/i.test(file.name)) { toast('Please drop the .xlsx export', true); return; }
    try {
      const parsed = await window.SafeSightParser.parseWorkbook(await file.arrayBuffer());
      if (!parsed.deals.length) throw new Error('No dated deals found');
      DATA = parsed; state.year = null; render();
      toast(`Updated · ${parsed.deals.length} deals loaded`);
    } catch (err) { console.error(err); toast('Could not read file: ' + err.message, true); }
  }

  let toastT;
  function toast(msg, isErr) {
    const t = $('#toast'); t.textContent = msg; t.className = 'toast show' + (isErr ? ' err' : '');
    clearTimeout(toastT); toastT = setTimeout(() => t.className = 'toast' + (isErr ? ' err' : ''), 3200);
  }

  document.addEventListener('DOMContentLoaded', () => { applyTheme(); bind(); render(); });
})();
