import sys
import json
sys.path.insert(0, 'scratch')
from cdp_helper import eval_js

js = """
(async () => {
    const reconUrl = "https://projectxeuapi.shipsy.io/api/Dashboard/riderReconciliation/getReconciliationData";
    const tokens = JSON.parse(localStorage.getItem('chrono_api_tokens') || '{}');
    const reconRes = await fetch(reconUrl, {
        method: "POST",
        headers: Object.assign({}, tokens, { "Content-Type": "application/json" }),
        body: JSON.stringify({
            startDate: null,
            endDate: null,
            hubList: ["2477050730750414061"],
            pageNo: 1,
            resultsPerPage: 50,
            cashSource: "ALL"
        })
    });
    const reconJson = await reconRes.json();
    const list = reconJson.data?.reconciliationData || [];
    return list.map(item => ({
        id: item.id,
        worker_code: item.worker_code,
        worker_name: item.worker_name,
        credit_type: item.credit_type,
        amount: item.amount,
        created_at: item.created_at,
        reference_number: item.reference_number,
        employee_name: item.employee_name
    }));
})()
"""

res = eval_js(js)
print(json.dumps(res, indent=2))
