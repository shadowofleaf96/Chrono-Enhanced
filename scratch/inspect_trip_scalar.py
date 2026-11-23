import sys
import json
sys.path.insert(0, 'scratch')
from cdp_helper import eval_js

js = """
(async () => {
    const tripUrl = 'https://projectxeuapi.shipsy.io/api/retaildashboard/tripmanager/get';
    const tokens = JSON.parse(localStorage.getItem('chrono_api_tokens') || '{}');
    const today = new Date();
    const dateStr = today.toISOString().split('T')[0];
    const tripRes = await fetch(tripUrl, {
        method: 'POST',
        headers: Object.assign({}, tokens, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({
            from_date: dateStr,
            to_date: dateStr,
            hub_id: '2477050730750414061',
            bucket: 'retail_completed'
        })
    });
    const tripJson = await tripRes.json();
    const trips = tripJson.data?.page_data || [];
    if (trips.length === 0) return 'no trips';
    const t = trips[0];
    const matching = {};
    for (const k of Object.keys(t)) {
        const v = t[k];
        if (typeof v === 'number' || typeof v === 'string') {
            matching[k] = v;
        }
    }
    return matching;
})()
"""

res = eval_js(js)
print(json.dumps(res, indent=2))
