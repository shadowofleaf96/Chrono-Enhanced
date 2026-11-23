import sys
import json
sys.path.insert(0, 'scratch')
from cdp_helper import eval_js

js = """
(async () => {
    const tripUrl = "https://projectxeuapi.shipsy.io/api/retaildashboard/tripmanager/get";
    const reconUrl = "https://projectxeuapi.shipsy.io/api/Dashboard/riderReconciliation/getReconciliationData";
    const tokens = JSON.parse(localStorage.getItem('chrono_api_tokens') || '{}');
    
    // Test today's date
    const today = new Date();
    const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    
    // 1. Fetch trip manager
    const tripRes = await fetch(tripUrl, {
        method: "POST",
        headers: { ...tokens, "Content-Type": "application/json" },
        body: JSON.stringify({
            from_date: dateStr,
            to_date: dateStr,
            hub_id: "2477050730750414061",
            bucket: "retail_completed"
        })
    });
    const tripJson = await tripRes.json();
    const trips = tripJson.data?.page_data || tripJson.data?.pageData || [];

    // 2. Fetch recon data
    const reconRes = await fetch(reconUrl, {
        method: "POST",
        headers: { ...tokens, "Content-Type": "application/json" },
        body: JSON.stringify({
            startDate: null,
            endDate: null,
            hubList: ["2477050730750414061"],
            pageNo: 1,
            resultsPerPage: 20,
            cashSource: "ALL"
        })
    });
    const reconJson = await reconRes.json();
    const recons = reconJson.data?.reconciliationData || reconJson.data?.page_data || [];

    return {
        dateStr: dateStr,
        tripSample: trips.length > 0 ? trips[0] : null,
        tripKeys: trips.length > 0 ? Object.keys(trips[0]) : [],
        reconSample: recons.length > 0 ? recons[0] : null,
        reconKeys: recons.length > 0 ? Object.keys(recons[0]) : [],
        reconCreditTypes: Array.from(new Set(recons.map(r => r.credit_type)))
    };
})()
"""

res = eval_js(js)
print(json.dumps(res, indent=2))
