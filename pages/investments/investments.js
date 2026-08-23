// investments.js - dedicated logic for Investments page with year-wise aggregation
// Requires db.js and app.js (which expose window.fetchEntries, window.getMutualFundSummary, window.formatCurrency)

document.addEventListener('DOMContentLoaded', async () => {
  // DOM references (guarded)
  const investmentTableBody = document.querySelector('#investmentsTable tbody');
  const savedYearSelect = document.getElementById('savedYearSelect'); // optional year selector
  const savedMonthSelect = document.getElementById('savedMonthSelect'); // optional month selector
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

  // Render investments table as individual entries (not summed), filtered by
  // year/month, each with a Delete action so a bad entry can be removed.
  function renderInvestmentsTable(entries = [], selectedYear = null, selectedMonth = null) {
    if (!investmentTableBody) return;

    const normalized = (entries || [])
      .map(e => ({
        id: e._id,
        category: e.category || e.type || 'Investment',
        fund: e.fund || '',
        amount: Number(e.amount) || 0,
        date: e.date ? new Date(e.date) : null,
      }))
      .filter(e => e.date && !Number.isNaN(e.date.getTime()));

    let filtered = normalized;
    if (selectedYear && selectedYear !== 'all') {
      filtered = filtered.filter(e => e.date.getFullYear() === Number(selectedYear));
    }
    if (selectedMonth && selectedMonth !== 'all') {
      filtered = filtered.filter(e => e.date.getMonth() === Number(selectedMonth));
    }
    filtered.sort((a, b) => b.date - a.date);

    if (!filtered.length) {
      investmentTableBody.innerHTML = '<tr><td colspan="4">No investments for the selected period</td></tr>';
      return;
    }

    investmentTableBody.innerHTML = filtered.map(e => {
      const label = e.fund ? `${e.category} — ${e.fund}` : e.category;
      const dateStr = e.date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
      return `
        <tr>
          <td>${label}</td>
          <td>${formatINR(e.amount)}</td>
          <td>${dateStr}</td>
          <td><button type="button" class="delete-entry-btn" data-id="${e.id}">Delete</button></td>
        </tr>`;
    }).join('');
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
    const previousValue = selectEl.value;
    selectEl.innerHTML = '<option value="all">All years</option>' +
      arr.map(y => `<option value="${y}">${y}</option>`).join('');
    if (previousValue && Array.from(selectEl.options).some(o => o.value === previousValue)) {
      selectEl.value = previousValue;
    }
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
    const byCategory = { 'Mutual Fund':[], 'LIC':[], 'PPF':[], 'Sukanya Yojana':[] };
    investments.forEach(e => {
      const cat = String(e.category || '').trim();
      const amt = Number(e.amount) || 0;
      if (/mutual/i.test(cat)) { totals['Mutual Fund'] += amt; byCategory['Mutual Fund'].push(e); }
      else if (/lic/i.test(cat)) { totals['LIC'] += amt; byCategory['LIC'].push(e); }
      else if (/ppf/i.test(cat)) { totals['PPF'] += amt; byCategory['PPF'].push(e); }
      else if (/sukanya/i.test(cat)) { totals['Sukanya Yojana'] += amt; byCategory['Sukanya Yojana'].push(e); }
    });

    if (mutualFundTotalEl) mutualFundTotalEl.textContent = formatINR(mutualFundSummary.combined || totals['Mutual Fund']);
    if (licTotalEl) licTotalEl.textContent = formatINR(totals['LIC']);
    if (ppfTotalEl) ppfTotalEl.textContent = formatINR(totals['PPF']);
    if (sukanyaTotalEl) sukanyaTotalEl.textContent = formatINR(totals['Sukanya Yojana']);

    // Each chart gets its own year range, derived only from that category's
    // own entries — not from a shared range across all investment types.
    function yearsFor(entriesForCategory) {
      const nowYear = new Date().getFullYear();
      const found = Array.from(new Set(entriesForCategory.map(i => {
        const d = new Date(i.date);
        return Number.isNaN(d.getFullYear()) ? null : d.getFullYear();
      }).filter(Boolean))).sort((a, b) => a - b);
      return found.length ? found : [nowYear];
    }

    // Mutual Fund growth chart (its own year range)
    if (mutualFundCanvas) {
      const labels = yearsFor(byCategory['Mutual Fund']);
      const data = labels.map(y => (mutualFundSummary.byYear && mutualFundSummary.byYear[y] ? mutualFundSummary.byYear[y].combined : 0));
      createOrUpdateChart('mutualFundGrowthChartInstance', mutualFundCanvas, {
        type: 'line',
        data: { labels, datasets: [{ label: 'Mutual Fund Growth', data, borderColor: '#1abc9c', backgroundColor: 'rgba(26,188,156,0.15)', fill: true, tension: 0.3 }] },
        options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true } } }
      });
    }

    // LIC chart (its own year range)
    if (licCanvas) {
      const labels = yearsFor(byCategory['LIC']);
      const data = labels.map(y => byCategory['LIC'].filter(e => new Date(e.date).getFullYear() === y).reduce((s, it) => s + (Number(it.amount) || 0), 0));
      createOrUpdateChart('licGrowthChartInstance', licCanvas, {
        type: 'line',
        data: { labels, datasets: [{ label: 'LIC Growth', data, borderColor: '#3498db', backgroundColor: 'rgba(52,152,219,0.15)', fill: true, tension: 0.3 }] },
        options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true } } }
      });
    }

    // PPF chart (its own year range)
    if (ppfCanvas) {
      const labels = yearsFor(byCategory['PPF']);
      const data = labels.map(y => byCategory['PPF'].filter(e => new Date(e.date).getFullYear() === y).reduce((s, it) => s + (Number(it.amount) || 0), 0));
      createOrUpdateChart('ppfGrowthChartInstance', ppfCanvas, {
        type: 'line',
        data: { labels, datasets: [{ label: 'PPF Growth', data, borderColor: '#e67e22', backgroundColor: 'rgba(230,126,34,0.15)', fill: true, tension: 0.3 }] },
        options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true } } }
      });
    }

    // Sukanya chart (its own year range)
    if (sukanyaCanvas) {
      const labels = yearsFor(byCategory['Sukanya Yojana']);
      const data = labels.map(y => byCategory['Sukanya Yojana'].filter(e => new Date(e.date).getFullYear() === y).reduce((s, it) => s + (Number(it.amount) || 0), 0));
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

    // Render table (use selected year + month if available)
    const selectedYear = savedYearSelect ? savedYearSelect.value : null;
    const selectedMonth = savedMonthSelect ? savedMonthSelect.value : null;
    renderInvestmentsTable(investments, selectedYear, selectedMonth);

    // Render totals and charts
    await renderInvestments(investments);
  }

  // Re-render just the table for the currently selected year/month, using
  // cached entries when available to avoid an extra fetch.
  async function refreshTableOnly() {
    const entries = Array.isArray(window.__LAST_ENTRIES__) ? window.__LAST_ENTRIES__ : await (window.fetchEntries ? window.fetchEntries() : []);
    const investments = (entries || []).filter(e => {
      const t = String(e.type || '').toLowerCase();
      const cat = String(e.category || '').toLowerCase();
      return t === 'investment' || cat.includes('mutual') || cat.includes('lic') || cat.includes('ppf') || cat.includes('sukanya');
    });
    renderInvestmentsTable(investments, savedYearSelect ? savedYearSelect.value : null, savedMonthSelect ? savedMonthSelect.value : null);
  }

  // Wire savedYearSelect / savedMonthSelect change to re-render table only
  if (savedYearSelect) {
    savedYearSelect.addEventListener('change', refreshTableOnly);
  }
  if (savedMonthSelect) {
    savedMonthSelect.addEventListener('change', refreshTableOnly);
  }

  // Delete an entry (event delegation so it keeps working after re-renders)
  if (investmentTableBody) {
    investmentTableBody.addEventListener('click', async (event) => {
      const btn = event.target.closest('.delete-entry-btn');
      if (!btn) return;
      const id = btn.getAttribute('data-id');
      if (!id) return;
      if (!confirm('Delete this investment entry? This cannot be undone.')) return;
      btn.disabled = true;
      btn.textContent = 'Deleting…';
      try {
        if (typeof window.deleteEntry === 'function') {
          await window.deleteEntry(id);
        } else {
          console.error('deleteEntry is not defined — is db.js loaded?');
        }
        await loadInvestments();
      } catch (err) {
        console.error('Failed to delete entry', err);
        btn.disabled = false;
        btn.textContent = 'Delete';
      }
    });
  }

  // Initial load
  await loadInvestments();
});
