const { getAccessToken, httpsPost } = require('./lib/tl-auth');

exports.handler = async () => {
  const p1 = process.env.TL_PIPELINE_1;
  const p2 = process.env.TL_PIPELINE_2;

  try {
    const token = await getAccessToken();
    const results = {};

    // Test 1: no status filter
    const r0 = await httpsPost('api.focus.teamleader.eu', '/deals.list',
      { filter: { pipeline_ids: [p1, p2] }, page: { size: 3, number: 1 } },
      { Authorization: `Bearer ${token}` });
    results.noFilter = {
      count: r0.data?.length,
      firstDeal: r0.data?.[0] ? {
        title: r0.data[0].title,
        status: r0.data[0].status,
        won_at: r0.data[0].won_at,
        lost_at: r0.data[0].lost_at,
        estimated_closing_date: r0.data[0].estimated_closing_date,
      } : null
    };

    // Test 2: status = ['won']
    try {
      const r1 = await httpsPost('api.focus.teamleader.eu', '/deals.list',
        { filter: { pipeline_ids: [p1, p2], status: ['won'] }, page: { size: 3, number: 1 } },
        { Authorization: `Bearer ${token}` });
      results.statusWon = { count: r1.data?.length, sample: r1.data?.[0]?.title };
    } catch (e) { results.statusWon = { error: e.message }; }

    // Test 3: status = ['open']
    try {
      const r2 = await httpsPost('api.focus.teamleader.eu', '/deals.list',
        { filter: { pipeline_ids: [p1, p2], status: ['open'] }, page: { size: 3, number: 1 } },
        { Authorization: `Bearer ${token}` });
      results.statusOpen = { count: r2.data?.length };
    } catch (e) { results.statusOpen = { error: e.message }; }

    // Test 4: status = ['open','won']
    try {
      const r3 = await httpsPost('api.focus.teamleader.eu', '/deals.list',
        { filter: { pipeline_ids: [p1, p2], status: ['open','won'] }, page: { size: 3, number: 1 } },
        { Authorization: `Bearer ${token}` });
      results.statusOpenWon = { count: r3.data?.length };
    } catch (e) { results.statusOpenWon = { error: e.message }; }

    // Test 5: no pipeline filter, just count
    const r4 = await httpsPost('api.focus.teamleader.eu', '/deals.list',
      { page: { size: 1, number: 1 } },
      { Authorization: `Bearer ${token}` });
    results.allDealsTotal = r4.meta?.count;

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(results, null, 2),
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
