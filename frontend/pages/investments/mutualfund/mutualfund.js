// mutualfund.js - Mutual Fund page with PouchDB + CouchDB sync and month-year filter
// NOTE: Requires db.js to be loaded first (finance-tracker/backend/database/js/db.js)

document.addEventListener('DOMContentLoaded', async () => {
  const investedCard = document.getElementById('totalInvested');
  const growthCard = document.getElementById('totalGrowth');
  const tableBody = document.querySelector('#mutualFundTable tbody');
  const monthYearSelect = document.getElementById('monthYearSelect');

  let totalInvested = 0;
  let totalGrowth = 0;
  let monthlyData = {}; // { "Jul-2026": { invested: X, profit: Y } }

  function formatINR(amount) {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(amount);
  }

  function updateCards() {
    investedCard.textContent = formatINR(totalInvested);
    growthCard.textContent = formatINR(totalGrowth);
  }

  function populateMonthYearDropdown() {
    const months = Object.keys(monthlyData);
    monthYearSelect.innerHTML = '';
    if (months.length === 0) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = 'No data';
      monthYearSelect.appendChild(opt);
      return;
    }
    months.forEach(m => {
      const opt = document.createElement('option');
      opt.value = m;
      opt.textContent = m;
      monthYearSelect.appendChild(opt);
    });
  }

  function renderTable(selectedMonthYear = null) {
    const months = Object.keys(monthlyData);
    if (months.length === 0) {
      tableBody.innerHTML = '<tr><td colspan="5">No data yet</td></tr>';
      return;
    }
    const filtered = selectedMonthYear ? [selectedMonthYear] : months;
    tableBody.innerHTML = filtered.map(m => {
      const d = monthlyData[m];
      const growthPct = d.profit && d.invested ? ((d.profit / d.invested) * 100).toFixed(2) : "0.00";
      return `<tr>
        <td>${m}</td>
        <td>Mutual Fund</td>
        <td>${formatINR(d.invested)}</td>
        <td>${formatINR(d.profit)}</td>
        <td>${growthPct}%</td>
      </tr>`;
    }).join('');
  }

  function renderChart(mfEntries) {
    const canvas = document.getElementById('mutualFundChart');
    if (!canvas || typeof Chart === 'undefined') {
      console.warn('Mutual fund chart canvas or Chart.js is unavailable.');
      return;
    }

    const ctx = canvas.getContext('2d');
    if (window.mfChart && typeof window.mfChart.destroy === 'function') {
      window.mfChart.destroy();
    }

    // Build a continuous year range from the earliest entry to the current
    // year, instead of a hardcoded year, so this reflects real data.
    const years = mfEntries
      .map(e => new Date(e.date).getFullYear())
      .filter(y => !Number.isNaN(y));
    const nowYear = new Date().getFullYear();
    const startYear = years.length ? Math.min(...years) : nowYear;
    const endYear = Math.max(nowYear, ...(years.length ? years : [nowYear]));
    const labels = [];
    for (let y = startYear; y <= endYear; y++) labels.push(String(y));

    function classify(e) {
      const notes = String(e.notes || '').toLowerCase();
      if (e.subtype === 'profit' || notes.includes('profit')) return 'profit';
      if (e.subtype === 'sell' || notes.includes(' sell') || notes.includes('sold')) return 'sell';
      return 'buy';
    }

    const investedByYear = labels.map(y => {
      const yearNum = Number(y);
      return mfEntries
        .filter(e => new Date(e.date).getFullYear() === yearNum && classify(e) !== 'profit')
        .reduce((s, e) => s + (classify(e) === 'sell' ? -1 : 1) * (Number(e.amount) || 0), 0);
    });
    const growthByYear = labels.map(y => {
      const yearNum = Number(y);
      return mfEntries
        .filter(e => new Date(e.date).getFullYear() === yearNum && classify(e) === 'profit')
        .reduce((s, e) => s + (Number(e.amount) || 0), 0);
    });

    window.mfChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label: 'Invested (year)', data: investedByYear, backgroundColor: '#1abc9c' },
          { label: 'Growth (year)', data: growthByYear, backgroundColor: '#3498db' }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'top' } },
        scales: {
          x: { ticks: { autoSkip: false, maxRotation: 0 } },
          y: { beginAtZero: true }
        }
      }
    });
  }
  
    // --- Portfolio rendering ---
  function updatePortfolio(entries) {
    const fundValues = {
      WhiteOak: 0, Bajaj: 0, WealthCo: 0, Groww: 0, JM: 0, Abakkus: 0,
      Edelweiss: 0, "360One": 0
    };

    entries.forEach(e => {
      if (typeof window.isMutualFundEntry === 'function' ? window.isMutualFundEntry(e) : (e?.type === 'investment' && String(e?.category || '').toLowerCase().includes('mutual'))) {
        const notes = String(e.notes || '').toLowerCase();
        const isSell = e.subtype === 'sell' || notes.includes(' sell') || notes.includes('sold');
        const signedAmount = (isSell ? -1 : 1) * (Number(e.amount) || 0);
        if (e.notes?.includes("WhiteOak")) fundValues.WhiteOak += signedAmount;
        if (e.notes?.includes("Bajaj")) fundValues.Bajaj += signedAmount;
        if (e.notes?.includes("Wealth")) fundValues.WealthCo += signedAmount;
        if (e.notes?.includes("Groww")) fundValues.Groww += signedAmount;
        if (e.notes?.includes("JM")) fundValues.JM += signedAmount;
        if (e.notes?.includes("Abakkus")) fundValues.Abakkus += signedAmount;
        if (e.notes?.includes("Edelweiss")) fundValues.Edelweiss += signedAmount;
        if (e.notes?.includes("360 ONE")) fundValues["360One"] += signedAmount;
      }
    });

    Object.keys(fundValues).forEach(key => {
      const span = document.querySelector(`.fund-value[data-fund="${key}"]`);
      if (span) span.textContent = fundValues[key] > 0 ? formatINR(fundValues[key]) : "₹0.00";
    });
  }

  // --- Portfolio chart rendering ---
  function populatePortfolioMonthYear(entries) {
    const select = document.getElementById('portfolioMonthYear');
    const months = [...new Set(entries.map(e => {
      const d = new Date(e.date);
      return `${d.toLocaleString('default',{month:'short'})}-${d.getFullYear()}`;
    }))];
    select.innerHTML = '';
    if (months.length === 0) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = 'No data';
      select.appendChild(opt);
      return;
    }
    months.forEach(m => {
      const opt = document.createElement('option');
      opt.value = m;
      opt.textContent = m;
      select.appendChild(opt);
    });
  }

  function renderPortfolioChart(entries, selectedMonthYear = null) {
    const canvas = document.getElementById('portfolioChart');
    if (!canvas || typeof Chart === 'undefined') {
      console.warn('Portfolio chart canvas or Chart.js is unavailable.');
      return;
    }

    const ctx = canvas.getContext('2d');
    if (window.portfolioChart && typeof window.portfolioChart.destroy === 'function') {
      window.portfolioChart.destroy();
    }

    const filtered = selectedMonthYear
      ? entries.filter(e => {
          const d = new Date(e.date);
          const key = `${d.toLocaleString('default',{month:'short'})}-${d.getFullYear()}`;
          return key === selectedMonthYear;
        })
      : entries;

    const categories = { Equity: { invested:0, profit:0 }, Hybrid: { invested:0, profit:0 } };
    filtered.forEach(e => {
      if (typeof window.isMutualFundEntry === 'function' ? window.isMutualFundEntry(e) : (e?.type === 'investment' && String(e?.category || '').toLowerCase().includes('mutual'))) {
        const equityFunds = ["WhiteOak","Bajaj","WealthCo","Groww","JM","Abakkus"];
        const hybridFunds = ["Edelweiss","360 ONE"];

        let cat = null;
        if (equityFunds.some(f => e.notes?.includes(f))) {
          cat = 'Equity';
        } else if (hybridFunds.some(f => e.notes?.includes(f))) {
          cat = 'Hybrid';
        }

        if (cat) {
          if (e.subtype === 'investment') categories[cat].invested += e.amount;
          if (e.subtype === 'profit') categories[cat].profit += e.amount;
        }
      }
    });

    window.portfolioChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: Object.keys(categories),
        datasets: [
          { label: 'Invested', data: Object.values(categories).map(c => c.invested), backgroundColor: '#3498db' },
          { label: 'Profit', data: Object.values(categories).map(c => c.profit), backgroundColor: '#1abc9c' }
        ]
      },
      options: {
        responsive: true,
        plugins: { legend: { position: 'top' } },
        scales: { y: { beginAtZero: true } }
      }
    });
  }

  function buildMutualFundSummary(entries) {
    const mfEntries = (entries || []).filter(entry => {
      if (!entry || entry.type !== 'investment') return false;
      const category = String(entry.category || '').toLowerCase();
      const notes = String(entry.notes || '').toLowerCase();
      return category === 'mutual fund' || category.includes('mutual') || notes.includes('mutual fund') || notes.includes('mutual');
    });

    const summary = { invested: 0, growth: 0, sold: 0, combined: 0, byYear: {} };
    mfEntries.forEach(entry => {
      const amount = Number(entry.amount) || 0;
      const notes = String(entry.notes || '').toLowerCase();
      const isProfit = entry.subtype === 'profit' || notes.includes('profit');
      const isSell = entry.subtype === 'sell' || notes.includes(' sell') || notes.includes('sold');

      if (isProfit) {
        summary.growth += amount;
      } else if (isSell) {
        summary.invested -= amount;
        summary.sold += amount;
      } else {
        summary.invested += amount;
      }

      const date = new Date(entry.date);
      if (Number.isNaN(date.getTime())) return;
      const year = date.getFullYear();
      if (!summary.byYear[year]) summary.byYear[year] = { invested: 0, growth: 0, sold: 0, combined: 0 };
      if (isProfit) {
        summary.byYear[year].growth += amount;
      } else if (isSell) {
        summary.byYear[year].invested -= amount;
        summary.byYear[year].sold += amount;
      } else {
        summary.byYear[year].invested += amount;
      }
      summary.byYear[year].combined = summary.byYear[year].invested + summary.byYear[year].growth;
    });

    summary.combined = summary.invested + summary.growth;
    return summary;
  }

  // Load existing entries from DB
  async function loadEntries() {
    const entries = await window.fetchEntries().catch(() => []);
    const mfEntries = (entries || []).filter(entry => {
      if (!entry || entry.type !== 'investment') return false;
      const category = String(entry.category || '').toLowerCase();
      const notes = String(entry.notes || '').toLowerCase();
      return category === 'mutual fund' || category.includes('mutual') || notes.includes('mutual fund') || notes.includes('mutual');
    });

    const mutualFundSummary = typeof window.getMutualFundSummary === 'function'
      ? window.getMutualFundSummary(entries)
      : buildMutualFundSummary(entries);

    totalInvested = mutualFundSummary.invested || 0;
    totalGrowth = mutualFundSummary.growth || 0;
    monthlyData = {};

    mfEntries.forEach(e => {
      const d = new Date(e.date);
      const month = d.toLocaleString('default',{month:'short'});
      const year = d.getFullYear();
      const key = `${month}-${year}`;
      monthlyData[key] = monthlyData[key] || { invested:0, profit:0, sold:0, combined:0 };
      const notes = String(e.notes || '').toLowerCase();
      const isProfit = e.subtype === 'profit' || notes.includes('profit');
      const isSell = e.subtype === 'sell' || notes.includes(' sell') || notes.includes('sold');
      if (isProfit) {
        monthlyData[key].profit += Number(e.amount) || 0;
        monthlyData[key].combined += Number(e.amount) || 0;
      } else if (isSell) {
        monthlyData[key].sold += Number(e.amount) || 0;
        monthlyData[key].invested -= Number(e.amount) || 0;
        monthlyData[key].combined -= Number(e.amount) || 0;
      } else {
        monthlyData[key].invested += Number(e.amount) || 0;
        monthlyData[key].combined += Number(e.amount) || 0;
      }
    });

    updateCards();
    populateMonthYearDropdown();
    renderTable(monthYearSelect.value || null);
    renderChart(mfEntries);
    updatePortfolio(mfEntries);
    populatePortfolioMonthYear(mfEntries);
    renderPortfolioChart(mfEntries);
  }

  // Note: the "Add Monthly Investment" and "Update Monthly Profit" forms were
  // removed from this page (data entry now happens on the History page, which
  // covers buy/sell/profit with more detail). If you ever re-add them, wire
  // their submit handlers back here — guarded with an `if (form)` check, since
  // an unguarded getElementById(...).addEventListener on a missing form throws
  // and silently stops the rest of this script from running.

  // Month-year dropdown change
  monthYearSelect.addEventListener('change', () => {
    const selected = monthYearSelect.value;
    renderTable(selected);
  });

  // Toggle expand/collapse for portfolio lists
  document.querySelectorAll(".toggle-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const target = document.getElementById(btn.dataset.target);
      if (target.style.display === "block") {
        target.style.display = "none";
        btn.textContent = btn.textContent.replace("▾", "▸");
      } else {
        target.style.display = "block";
        btn.textContent = btn.textContent.replace("▸", "▾");
      }
    });
  });

  document.getElementById('portfolioMonthYear').addEventListener('change', e => {
    const selected = e.target.value;
    window.fetchEntries().then(entries => {
      const mfEntries = entries.filter(entry => typeof window.isMutualFundEntry === 'function' ? window.isMutualFundEntry(entry) : (entry?.type === 'investment' && String(entry?.category || '').toLowerCase().includes('mutual')));
      renderPortfolioChart(mfEntries, selected);
    });
  });


  // Initial load
  loadEntries();
});
