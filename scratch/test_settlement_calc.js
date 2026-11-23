// Test settlement calculations logic
const mockTrips = [
  {
    "id": "2618932549900046214",
    "organisation_reference_number": "MOH01001115",
    "status": "completed",
    "worker_name": "Abd Assamad Krim",
    "credits": 0,
    "worker_credits": 0
  },
  {
    "id": "2618932549900046215",
    "organisation_reference_number": "MOH01001116",
    "status": "completed",
    "worker_name": "ANAS HACHIMI",
    "credits": 0
  }
];

const mockRecon = [
  {
    "id": "2618969995152985626",
    "amount": 229,
    "created_at": "23/11/2026 11:45",
    "credit_type": "cod",
    "worker_code": "AHA01",
    "worker_name": "ANAS HACHIMI",
    "reference_number": "CD2702330830",
    "employee_name": "N. A."
  },
  {
    "id": "2618969995152985627",
    "amount": 1250,
    "created_at": "23/11/2026 12:10",
    "credit_type": "cod",
    "worker_code": "AHA01",
    "worker_name": "ANAS HACHIMI",
    "reference_number": "CD2702330831",
    "employee_name": "N. A."
  },
  {
    "id": "2618969995152985628",
    "amount": 472,
    "created_at": "23/11/2026 12:30",
    "credit_type": "cod",
    "worker_code": "AHA01",
    "worker_name": "ANAS HACHIMI",
    "reference_number": "CD2702330832",
    "employee_name": "N. A."
  },
  {
    "id": "2618969995152985629",
    "amount": -500,
    "created_at": "23/11/2026 12:45",
    "credit_type": "settlement",
    "worker_code": "ASK01",
    "worker_name": "Abd Assamad Krim",
    "reference_number": "SETTLE-01",
    "employee_name": "Zakaria Bamiss"
  }
];

function getCanonicalName(raw) {
  return (raw || '').toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
}

const riderMap = {};

mockTrips.forEach(t => {
  const driverName = (t.worker_name || 'Livreur').trim();
  const tripRef = t.organisation_reference_number || '';
  const key = getCanonicalName(driverName) || tripRef.toLowerCase();

  if (!riderMap[key]) {
    riderMap[key] = {
      name: driverName,
      code: tripRef,
      tripRefs: tripRef ? [tripRef] : [],
      deliveredCount: 0,
      undeliveredCount: 0,
      totalCount: 0,
      status: t.status || 'completed',
      tripCredits: 0,
      collectedAmount: 0,
      settledAmount: 0,
      amount: 0,
      cashier: null,
      parcels: [],
      detailsLoaded: false
    };
  }
});

mockRecon.forEach(item => {
  const riderName = (item.worker_name || 'Inconnu').trim();
  const code = (item.worker_code || '').trim();
  const positiveAmt = Math.abs(parseFloat(item.amount) || 0);
  const creditType = (item.credit_type || '').toLowerCase();
  const key = getCanonicalName(riderName) || (code ? code.toLowerCase() : 'unknown');

  if (!riderMap[key]) {
    riderMap[key] = {
      name: riderName,
      code: code || 'RECON',
      tripRefs: [],
      deliveredCount: 0,
      undeliveredCount: 0,
      totalCount: 0,
      status: 'completed',
      tripCredits: 0,
      collectedAmount: 0,
      settledAmount: 0,
      amount: 0,
      cashier: null,
      parcels: [],
      detailsLoaded: false
    };
  }

  if (code && (!riderMap[key].code || riderMap[key].code === 'RECON')) {
    riderMap[key].code = code;
  }

  if (creditType === 'settlement') {
    riderMap[key].settledAmount += positiveAmt;
    if (item.employee_name && item.employee_name !== 'N. A.') {
      riderMap[key].cashier = item.employee_name;
    }
  } else {
    riderMap[key].collectedAmount += positiveAmt;
    riderMap[key].parcels.push({
      id: item.id,
      reference_number: item.reference_number,
      amount: positiveAmt,
      created_at: item.created_at,
      employee_name: item.employee_name,
      isDelivered: true
    });
  }
});

Object.values(riderMap).forEach(r => {
  const settled = r.settledAmount || 0;
  const collected = r.collectedAmount || 0;
  const credits = r.tripCredits || 0;
  r.amount = settled > 0 ? settled : (collected > 0 ? collected : credits);

  if ((!r.deliveredCount || r.deliveredCount === 0) && r.parcels.length > 0) {
    r.deliveredCount = r.parcels.length;
    r.totalCount = Math.max(r.totalCount || 0, r.parcels.length);
  }
  r.count = r.deliveredCount || r.parcels.length || 0;
  r.totalCount = r.totalCount || r.count;
});

const riders = Object.values(riderMap);
console.log(JSON.stringify(riders, null, 2));
