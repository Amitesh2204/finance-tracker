// investments.js - dedicated logic for Investments page with year-wise aggregation
// Requires db.js and app.js (which expose window.fetchEntries, window.getMutualFundSummary, window.formatCurrency)

document.addEventListener('DOMContentLoaded', async () => {
  // DOM references (guarded)
  const investmentTableBody = document.querySelector('#investmentsTable tbody');
  const savedYearSelect = document.getElementById('savedYearSelect'); // optional year selector
  const savedMonthSelect = document.getElementById('savedMonthSelect'); // optional month selector
  const savedTypeSelect = document.getElementById('savedTypeSelect'); // optional investment-type selector
  const mutualFundTotalEl = document.getElementById('mutualFundTotal');
  const licTotalEl = document.getElementById('licTotal');
  const ppfTotalEl = document.getElementById('ppfTotal');
  const sukanyaTotalEl = document.getElementById('sukanyaTotal');

  const investmentGrowthCanvas = document.getElementById('investmentGrowthChart');

  // Safe formatter
  function formatINR(amount) {
    try {
      return window.formatCurrency ? window.formatCurrency(amount) : new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(Number(amount) || 0);
    } catch {
      return `₹${(Number(amount) || 0).toFixed(2)}`;
    }
  }

  // Which of the four investment types a category string belongs to.
  function matchesInvestmentType(category, type) {
    if (!type || type === 'all') return true;
    const cat = String(category || '').toLowerCase();
    if (type === 'mutualfund') return cat.includes('mutual');
    if (type === 'lic') return cat.includes('lic');
    if (type === 'ppf') return cat.includes('ppf');
    if (type === 'sukanya') return cat.includes('sukanya');
    return true;
  }

  // Render investments table as individual entries (not summed), filtered by
  // type/year/month, each with a Delete action so a bad entry can be removed.
  function renderInvestmentsTable(entries = [], selectedYear = null, selectedMonth = null, selectedType = null) {
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
    if (selectedType && selectedType !== 'all') {
      filtered = filtered.filter(e => matchesInvestmentType(e.category, selectedType));
    }
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
      return t === 'investment' || t === 'saving' || cat === 'mutual fund' || cat === 'lic' || cat === 'ppf' || cat.includes('sukanya') || cat.includes('investment');
    });

    // If no investments found, still populate totals as zero
    const mutualFundSummary = window.getMutualFundSummary
      ? window.getMutualFundSummary(investments)
      : investments.reduce((summary, entry) => {
        const amount = Number(entry.amount) || 0;
        const subtype = String(entry.subtype || '').toLowerCase();
        const notes = String(entry.notes || '').toLowerCase();
        const isProfit = subtype === 'profit' || (!subtype && notes.includes('profit'));
        const isSell = subtype === 'sell' || (!subtype && (notes.includes(' sell') || notes.includes('sold')));
        if (isProfit) summary.growth += amount;
        else if (!isSell) summary.bought += amount;
        return summary;
      }, { bought: 0, growth: 0 });

    // Totals by category (robust)
    const totals = { 'Mutual Fund':0, 'LIC':0, 'PPF':0, 'Sukanya Yojana':0 };
    investments.forEach(e => {
      const cat = String(e.category || '').trim();
      const amt = Number(e.amount) || 0;
      if (/mutual/i.test(cat)) { totals['Mutual Fund'] += amt; }
      else if (/lic/i.test(cat)) { totals['LIC'] += amt; }
      else if (/ppf/i.test(cat)) { totals['PPF'] += amt; }
      else if (/sukanya/i.test(cat)) { totals['Sukanya Yojana'] += amt; }
    });

    if (mutualFundTotalEl) mutualFundTotalEl.textContent = formatINR(mutualFundSummary.bought + mutualFundSummary.growth);
    if (licTotalEl) licTotalEl.textContent = formatINR(totals['LIC']);
    if (ppfTotalEl) ppfTotalEl.textContent = formatINR(totals['PPF']);
    if (sukanyaTotalEl) sukanyaTotalEl.textContent = formatINR(totals['Sukanya Yojana']);

    // Each investment counts toward the "Total Investment Amount" line unless
    // it's a profit/growth entry; sells subtract from the running total.
    function investedAmountOnly(entry) {
      const amount = Number(entry.amount) || 0;
      const subtype = String(entry.subtype || '').toLowerCase();
      const notes = String(entry.notes || '').toLowerCase();
      const isProfit = subtype === 'profit' || notes.includes('profit');
      const isSell = subtype === 'sell' || notes.includes(' sell') || notes.includes('sold');
      if (isProfit) return 0;
      return isSell ? -amount : amount;
    }

    // Merged growth chart: the portfolio's Total Investment and Total Growth
    // across all four investment types combined, each accumulated year over
    // year (so every year's figure includes everything from prior years
    // too), plus their sum as a third "Total Amount" line — a single,
    // simplified view instead of one line per investment type.
    if (investmentGrowthCanvas) {
      const allYears = Array.from(new Set((investments || []).map(e => {
        const d = new Date(e.date);
        return Number.isNaN(d.getFullYear()) ? null : d.getFullYear();
      }).filter(Boolean))).sort((a, b) => a - b);
      const startYear = allYears.length ? Math.min(...allYears) : new Date().getFullYear();
      const endYear = Math.max(new Date().getFullYear(), ...(allYears.length ? allYears : [new Date().getFullYear()]));
      const labels = [];
      for (let y = startYear; y <= endYear; y++) labels.push(String(y));

      let runningInvested = 0;
      let runningGrowth = 0;
      const investedData = [];
      const growthData = [];
      const totalData = [];
      labels.forEach(y => {
        const year = Number(y);
        (investments || []).forEach(entry => {
          if (new Date(entry.date).getFullYear() !== year) return;
          const amount = Number(entry.amount) || 0;
          const subtype = String(entry.subtype || '').toLowerCase();
          const notes = String(entry.notes || '').toLowerCase();
          const isProfit = subtype === 'profit' || notes.includes('profit');
          if (isProfit) {
            runningGrowth += amount;
          } else {
            runningInvested += investedAmountOnly(entry);
          }
        });
        investedData.push(runningInvested);
        growthData.push(runningGrowth);
        totalData.push(runningInvested + runningGrowth);
      });

      createOrUpdateChart('investmentGrowthChartInstance', investmentGrowthCanvas, {
        type: 'line',
        data: {
          labels,
          datasets: [
            { label: 'Total Investment', data: investedData, borderColor: '#1abc9c', backgroundColor: 'transparent', fill: false, tension: 0.3, borderWidth: 2 },
            { label: 'Total Growth', data: growthData, borderColor: '#3498db', backgroundColor: 'transparent', fill: false, tension: 0.3, borderWidth: 2 },
            { label: 'Total Amount', data: totalData, borderColor: '#9b59b6', backgroundColor: 'transparent', fill: false, tension: 0.3, borderWidth: 3 }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { position: 'top' } },
          scales: { y: { beginAtZero: true } }
        }
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

    // Render table (use selected type/year/month if available)
    const selectedType = savedTypeSelect ? savedTypeSelect.value : null;
    const selectedYear = savedYearSelect ? savedYearSelect.value : null;
    const selectedMonth = savedMonthSelect ? savedMonthSelect.value : null;
    renderInvestmentsTable(investments, selectedYear, selectedMonth, selectedType);

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
    renderInvestmentsTable(investments, savedYearSelect ? savedYearSelect.value : null, savedMonthSelect ? savedMonthSelect.value : null, savedTypeSelect ? savedTypeSelect.value : null);
  }

  // Wire savedYearSelect / savedMonthSelect / savedTypeSelect change to
  // re-render the table only
  if (savedYearSelect) {
    savedYearSelect.addEventListener('change', refreshTableOnly);
  }
  if (savedMonthSelect) {
    savedMonthSelect.addEventListener('change', refreshTableOnly);
  }
  if (savedTypeSelect) {
    savedTypeSelect.addEventListener('change', refreshTableOnly);
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
