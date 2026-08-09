// investments.js - dedicated logic for Investments page with year-wise aggregation
// Requires db.js and app.js (which expose window.fetchEntries, window.getMutualFundSummary, window.formatCurrency)

document.addEventListener('DOMContentLoaded', async () => {
  // DOM references (guarded)
  const investmentTableBody = document.querySelector('#investmentsTable tbody');
  const savedYearSelect = document.getElementById('savedYearSelect'); // optional year selector
  const mutualFundTotalEl = document.getElementById('mutualFundTotal');
  const licTotalEl = document.getElementById('licTotal');
  const ppfTotalEl = document.getElementById('ppfTotal');
  const sukanyaTotalEl = document.getElementById('sukanyaTotal');

  const mutualFundCanvas = document.getElementById('mutualFundGrowthChart');
  const licCanvas = document.getElementById('licGrowthChart');
  const ppfCanvas = document.getElementById('ppfGrowthChart');
  const sukanyaCanvas = document.getElementById('sukanyaGrowthChart');

  // Safe formatter
  function formatINR(amount) {
    try {
      return window.formatCurrency ? window.formatCurrency(amount) : new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(Number(amount) || 0);
    } catch {
      return `₹${(Number(amount) || 0).toFixed(2)}`;
    }
  }

  // Render investments table grouped by category and year
  function renderInvestmentsTable(entries = [], selectedYear = null) {
    if (!investmentTableBody) return;

    if (!entries || entries.length === 0) {
      investmentTableBody.innerHTML = '<tr><td colspan="3">No entries yet</td></tr>';
      return;
    }

    // Normalize entries: ensure date and amount
    const normalized = entries.map(e => ({
      category: e.category || e.type || 'Investment',
      amount: Number(e.amount) || 0,
      date: e.date ? new Date(e.date) : null
    })).filter(e => e.date && !Number.isNaN(e.date.getTime()));

    // Group by category -> year -> sum
    const grouped = {};
    normalized.forEach(e => {
      const year = e.date.getFullYear();
      const cat = e.category || 'Other';
      grouped[cat] = grouped[cat] || {};
      grouped[cat][year] = (grouped[cat][year] || 0) + e.amount;
    });

    // If a year is selected, show rows for that year only; otherwise show recent years
    const yearsToShow = selectedYear ? [Number(selectedYear)] : Array.from(new Set(normalized.map(e => e.date.getFullYear()))).sort((a,b) => b-a);

    // Build rows
    const rows = [];
    yearsToShow.forEach(y => {
      Object.keys(grouped).forEach(cat => {
        const val = grouped[cat][y] || 0;
        rows.push(`<tr><td>${cat}</td><td>${formatINR(val)}</td><td>${y}</td></tr>`);
      });
    });

    investmentTableBody.innerHTML = rows.length ? rows.join('') : '<tr><td colspan="3">No investments for selected year</td></tr>';
  }

  // Build year options for a select element
  function buildYearOptions(entries = [], selectEl) {
    if (!selectEl) return;
    const years = new Set();
    (entries || []).forEach(e => {
      const d = new Date(e.date);
      if (!Number.isNaN(d.getFullYear())) years.add(d.getFullYear());
    });
    const arr = Array.from(years).sort((a,b) => b - a);
    if (!arr.length) arr.push(new Date().getFullYear());
    selectEl.innerHTML = arr.map(y => `<option value="${y}">${y}</option>`).join('');
  }

  // Create or update a chart instance safely
  function createOrUpdateChart(instanceName, canvasEl, config) {
    if (!canvasEl) return null;
    try {
      if (window[instanceName]) {
        window[instanceName].destroy();
        window[instanceName] = null;
      }
      window[instanceName] = new Chart(canvasEl.getContext('2d'), config);
      return window[instanceName];
    } catch (err) {
      console.warn('Chart creation failed', err);
      return null;
    }
  }

  // Render summary totals and charts
  async function renderInvestments(entries = []) {
    // Filter only investment entries (robust check)
    const investments = (entries || []).filter(e => {
      const t = String(e.type || '').toLowerCase();
      const cat = String(e.category || '').toLowerCase();
      return t === 'investment' || cat === 'mutual fund' || cat === 'lic' || cat === 'ppf' || cat.includes('sukanya') || cat.includes('investment');
    });

    // If no investments found, still populate totals as zero
    const mutualFundSummary = window.getMutualFundSummary ? window.getMutualFundSummary(investments) : { invested:0, growth:0, combined:0, byYear:{} };

    // Totals by category (robust)
    const totals = { 'Mutual Fund':0, 'LIC':0, 'PPF':0, 'Sukanya Yojana':0 };
    investments.forEach(e => {
      const cat = String(e.category || '').trim();
      const amt = Number(e.amount) || 0;
      if (/mutual/i.test(cat)) totals['Mutual Fund'] += amt;
      else if (/lic/i.test(cat)) totals['LIC'] += amt;
      else if (/ppf/i.test(cat)) totals['PPF'] += amt;
      else if (/sukanya/i.test(cat)) totals['Sukanya Yojana'] += amt;
    });

    if (mutualFundTotalEl) mutualFundTotalEl.textContent = formatINR(mutualFundSummary.combined || totals['Mutual Fund']);
    if (licTotalEl) licTotalEl.textContent = formatINR(totals['LIC']);
    if (ppfTotalEl) ppfTotalEl.textContent = formatINR(totals['PPF']);
    if (sukanyaTotalEl) sukanyaTotalEl.textContent = formatINR(totals['Sukanya Yojana']);

    // Prepare years list for charts
    const years = Array.from(new Set(investments.map(i => {
      const d = new Date(i.date);
      return Number.isNaN(d.getFullYear()) ? null : d.getFullYear();
    }).filter(Boolean))).sort((a,b) => a - b);

    // Mutual Fund growth chart (year-wise)
    if (mutualFundCanvas) {
      const labels = years.length ? years : [new Date().getFullYear()];
      const data = labels.map(y => (mutualFundSummary.byYear && mutualFundSummary.byYear[y] ? mutualFundSummary.byYear[y].combined : 0));
      createOrUpdateChart('mutualFundGrowthChartInstance', mutualFundCanvas, {
        type: 'line',
        data: { labels, datasets: [{ label: 'Mutual Fund Growth', data, borderColor: '#1abc9c', backgroundColor: 'rgba(26,188,156,0.15)', fill: true, tension: 0.3 }] },
        options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true } } }
      });
    }

    // LIC chart
    if (licCanvas) {
      const labels = years.length ? years : [new Date().getFullYear()];
      const data = labels.map(y => investments.filter(e => /lic/i.test(e.category) && new Date(e.date).getFullYear() === y).reduce((s, it) => s + (Number(it.amount) || 0), 0));
      createOrUpdateChart('licGrowthChartInstance', licCanvas, {
        type: 'line',
        data: { labels, datasets: [{ label: 'LIC Growth', data, borderColor: '#3498db', backgroundColor: 'rgba(52,152,219,0.15)', fill: true, tension: 0.3 }] },
        options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true } } }
      });
    }

    // PPF chart
    if (ppfCanvas) {
      const labels = years.length ? years : [new Date().getFullYear()];
      const data = labels.map(y => investments.filter(e => /ppf/i.test(e.category) && new Date(e.date).getFullYear() === y).reduce((s, it) => s + (Number(it.amount) || 0), 0));
      createOrUpdateChart('ppfGrowthChartInstance', ppfCanvas, {
        type: 'line',
        data: { labels, datasets: [{ label: 'PPF Growth', data, borderColor: '#e67e22', backgroundColor: 'rgba(230,126,34,0.15)', fill: true, tension: 0.3 }] },
        options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true } } }
      });
    }

    // Sukanya chart
    if (sukanyaCanvas) {
      const labels = years.length ? years : [new Date().getFullYear()];
      const data = labels.map(y => investments.filter(e => /sukanya/i.test(e.category) && new Date(e.date).getFullYear() === y).reduce((s, it) => s + (Number(it.amount) || 0), 0));
      createOrUpdateChart('sukanyaGrowthChartInstance', sukanyaCanvas, {
        type: 'line',
        data: { labels, datasets: [{ label: 'Sukanya Yojana Growth', data, borderColor: '#9b59b6', backgroundColor: 'rgba(155,89,182,0.15)', fill: true, tension: 0.3 }] },
        options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true } } }
      });
    }
  }

  // Load investments and wire UI
  async function loadInvestments() {
    // Prefer cached window.__LAST_ENTRIES__ if available to avoid extra network call
    let entries = Array.isArray(window.__LAST_ENTRIES__) ? window.__LAST_ENTRIES__ : null;
    if (!entries) {
      try {
        entries = await (window.fetchEntries ? window.fetchEntries() : Promise.resolve([]));
      } catch (err) {
        console.warn('fetchEntries failed in investments page', err);
        entries = [];
      }
    }

    // Filter investment entries for table rendering
    const investments = (entries || []).filter(e => {
      const t = String(e.type || '').toLowerCase();
      const cat = String(e.category || '').toLowerCase();
      return t === 'investment' || cat.includes('mutual') || cat.includes('lic') || cat.includes('ppf') || cat.includes('sukanya');
    });

    // Populate year selector if present
    if (savedYearSelect) {
      buildYearOptions(investments, savedYearSelect);
      // ensure a default value
      if (!savedYearSelect.value) savedYearSelect.value = (new Date()).getFullYear();
    }

    // Render table (use selected year if available)
    const selectedYear = savedYearSelect ? savedYearSelect.value : null;
    renderInvestmentsTable(investments, selectedYear);

    // Render totals and charts
    await renderInvestments(investments);
  }

  // Wire savedYearSelect change to re-render table only
  if (savedYearSelect) {
    savedYearSelect.addEventListener('change', async () => {
      // Re-load entries from cache and re-render table for selected year
      const entries = Array.isArray(window.__LAST_ENTRIES__) ? window.__LAST_ENTRIES__ : await (window.fetchEntries ? window.fetchEntries() : []);
      const investments = (entries || []).filter(e => {
        const t = String(e.type || '').toLowerCase();
        const cat = String(e.category || '').toLowerCase();
        return t === 'investment' || cat.includes('mutual') || cat.includes('lic') || cat.includes('ppf') || cat.includes('sukanya');
      });
      renderInvestmentsTable(investments, savedYearSelect.value);
    });
  }

  // Initial load
  await loadInvestments();
});
