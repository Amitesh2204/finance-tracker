// mutualfund.js - Mutual Fund page with PouchDB + CouchDB sync and month-year filter
// NOTE: Requires db.js to be loaded first (finance-tracker/backend/database/js/db.js)

document.addEventListener('DOMContentLoaded', async () => {
  const investedCard = document.getElementById('totalInvested');
  const growthCard = document.getElementById('totalGrowth');
  const tableBody = document.querySelector('#mutualFundTable tbody');
  const monthYearSelect = document.getElementById('monthYearSelect');
  const summaryYearSelect = document.getElementById('summaryYearSelect');
  const summaryMonthSelect = document.getElementById('summaryMonthSelect');
  const oldFundSelect = document.getElementById('oldFundSelect');

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
    if (monthYearSelect) {
      monthYearSelect.innerHTML = '';
      if (months.length === 0) {
        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = 'No data';
        monthYearSelect.appendChild(opt);
      } else {
        months.forEach(m => {
          const opt = document.createElement('option');
          opt.value = m;
          opt.textContent = m;
          monthYearSelect.appendChild(opt);
        });
      }
    }

    const years = [...new Set(Object.keys(monthlyData).map(key => key.split('-').pop()))].sort((a, b) => Number(b) - Number(a));
    if (summaryYearSelect) {
      summaryYearSelect.innerHTML = '<option value="all">All years</option>' + years.map(y => `<option value="${y}">${y}</option>`).join('');
      if (!years.length) summaryYearSelect.value = 'all';
      else summaryYearSelect.value = String(new Date().getFullYear());
    }
  }

  function renderTable(selectedMonthYear = null, selectedYear = 'all', selectedMonth = 'all') {
    const months = Object.keys(monthlyData);
    if (months.length === 0) {
      tableBody.innerHTML = '<tr><td colspan="5">No data yet</td></tr>';
      return;
    }

    const filtered = months.filter(m => {
      const [monthLabel, yearValue] = m.split('-');
      if (selectedYear !== 'all' && String(yearValue) !== String(selectedYear)) return false;
      if (selectedMonth !== 'all') {
        const monthIndex = new Date(`${monthLabel} 1, ${yearValue}`).getMonth();
        if (String(monthIndex) !== String(selectedMonth)) return false;
      }
      if (selectedMonthYear && m !== selectedMonthYear) return false;
      return true;
    });

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
    }).join('') || '<tr><td colspan="5">No data for the chosen filters</td></tr>';
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
      if (e.subtype === 'yearly-total' || notes.includes('yearly total') || notes.includes('year total')) return 'yearly-total';
      return 'buy';
    }

    const investedByYear = labels.map(y => {
      const yearNum = Number(y);
      return mfEntries
        .filter(e => new Date(e.date).getFullYear() === yearNum)
        .reduce((sum, e) => {
          const kind = classify(e);
          if (kind === 'profit') return sum;
          const amount = Number(e.amount) || 0;
          if (kind === 'sell') return sum - amount;
          return sum + amount;
        }, 0);
    });

    const growthByYear = labels.map(y => {
      const yearNum = Number(y);
      return mfEntries
        .filter(e => new Date(e.date).getFullYear() === yearNum)
        .reduce((sum, e) => {
          const kind = classify(e);
          return kind === 'profit' ? sum + (Number(e.amount) || 0) : sum;
        }, 0);
    });

    window.mfChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [
          { label: 'Total Investment', data: investedByYear, borderColor: '#1abc9c', backgroundColor: 'rgba(26,188,156,0.15)', fill: false, tension: 0.3 },
          { label: 'Profit', data: growthByYear, borderColor: '#3498db', backgroundColor: 'rgba(52,152,219,0.15)', fill: false, tension: 0.3 }
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

    if (oldFundSelect) {
      const oldNames = [...new Set(Object.keys(fundValues).filter(key => fundValues[key] !== 0 || key === 'WhiteOak' || key === 'Bajaj' || key === 'WealthCo' || key === 'Groww' || key === 'JM' || key === 'Abakkus' || key === 'Edelweiss' || key === '360One'))];
      const currentValue = oldFundSelect.value || 'all';
      oldFundSelect.innerHTML = '<option value="all">All old funds</option>' + oldNames.map(name => `<option value="${name}">${name}</option>`).join('');
      if (currentValue !== 'all' && Array.from(oldFundSelect.options).some(opt => opt.value === currentValue)) oldFundSelect.value = currentValue;
      else oldFundSelect.value = 'all';
    }

    Object.keys(fundValues).forEach(key => {
      const span = document.querySelector(`.fund-value[data-fund="${key}"]`);
      if (span) span.textContent = fundValues[key] > 0 ? formatINR(fundValues[key]) : "₹0.00";
    });
  }

  // --- Portfolio chart rendering ---
  function populatePortfolioMonthYear(entries) {
    const select = document.getElementById('portfolioMonthYear');
    if (!select) return;
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

  function renderPortfolioChart(entries, selectedMonthYear = null, selectedFund = 'all') {
    const canvas = document.getElementById('portfolioChart');
    if (!canvas || typeof Chart === 'undefined') {
      console.warn('Portfolio chart canvas or Chart.js is unavailable.');
      return;
    }

    const ctx = canvas.getContext('2d');
    if (window.portfolioChart && typeof window.portfolioChart.destroy === 'function') {
      window.portfolioChart.destroy();
    }

    const filtered = (entries || []).filter(e => {
      if (selectedMonthYear) {
        const d = new Date(e.date);
        const key = `${d.toLocaleString('default',{month:'short'})}-${d.getFullYear()}`;
        if (key !== selectedMonthYear) return false;
      }
      if (selectedFund !== 'all') {
        const fundName = String(e.fund || e.notes || '').toLowerCase();
        const productName = String(e.notes || '').toLowerCase();
        if (!fundName.includes(selectedFund.toLowerCase()) && !productName.includes(selectedFund.toLowerCase())) return false;
      }
      return true;
    });

    const categories = { Equity: { invested:0, profit:0 }, Hybrid: { invested:0, profit:0 } };
    filtered.forEach(e => {
      if (typeof window.isMutualFundEntry === 'function' ? window.isMutualFundEntry(e) : (e?.type === 'investment' && String(e?.category || '').toLowerCase().includes('mutual'))) {
        const equityFunds = ["WhiteOak","Bajaj","WealthCo","Groww","JM","Abakkus"];
        const hybridFunds = ["Edelweiss","360 ONE"];

        let cat = null;
        if (equityFunds.some(f => String(e.notes || '').includes(f))) {
          cat = 'Equity';
        } else if (hybridFunds.some(f => String(e.notes || '').includes(f))) {
          cat = 'Hybrid';
        }

        if (cat) {
          if (e.subtype === 'investment') categories[cat].invested += Number(e.amount) || 0;
          if (e.subtype === 'profit') categories[cat].profit += Number(e.amount) || 0;
        }
      }
    });

    window.portfolioChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: Object.keys(categories),
        datasets: [
          { label: 'Invested', data: Object.values(categories).map(c => c.invested), borderColor: '#3498db', backgroundColor: 'rgba(52,152,219,0.15)', fill: false, tension: 0.3 },
          { label: 'Profit', data: Object.values(categories).map(c => c.profit), borderColor: '#1abc9c', backgroundColor: 'rgba(26,188,156,0.15)', fill: false, tension: 0.3 }
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

  function buildMutualFundSummary(entries) {
    const mfEntries = (entries || []).filter(entry => {
      if (!entry) return false;
      const type = String(entry.type || '').toLowerCase();
      if (type !== 'investment' && type !== 'saving') return false;
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
      if (!entry) return false;
      const type = String(entry.type || '').toLowerCase();
      if (type !== 'investment' && type !== 'saving') return false;
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
    const selectedYear = summaryYearSelect && summaryYearSelect.value ? summaryYearSelect.value : 'all';
    const selectedMonth = summaryMonthSelect && summaryMonthSelect.value ? summaryMonthSelect.value : 'all';
    renderTable(monthYearSelect && monthYearSelect.value ? monthYearSelect.value : null, selectedYear, selectedMonth);
    renderChart(mfEntries);
    updatePortfolio(mfEntries);
    populatePortfolioMonthYear(mfEntries);
    renderPortfolioChart(mfEntries, document.getElementById('portfolioMonthYear')?.value || null, oldFundSelect ? oldFundSelect.value || 'all' : 'all');
  }

  // Note: the "Add Monthly Investment" and "Update Monthly Profit" forms were
  // removed from this page (data entry now happens on the History page, which
  // covers buy/sell/profit with more detail). If you ever re-add them, wire
  // their submit handlers back here — guarded with an `if (form)` check, since
  // an unguarded getElementById(...).addEventListener on a missing form throws
  // and silently stops the rest of this script from running.

  if (summaryYearSelect) {
    summaryYearSelect.addEventListener('change', () => {
      const selectedYear = summaryYearSelect.value;
      const selectedMonth = summaryMonthSelect ? summaryMonthSelect.value : 'all';
      renderTable(monthYearSelect && monthYearSelect.value ? monthYearSelect.value : null, selectedYear, selectedMonth);
    });
  }

  if (summaryMonthSelect) {
    summaryMonthSelect.addEventListener('change', () => {
      const selectedYear = summaryYearSelect ? summaryYearSelect.value : 'all';
      renderTable(monthYearSelect && monthYearSelect.value ? monthYearSelect.value : null, selectedYear, summaryMonthSelect.value);
    });
  }

  // Month-year dropdown change
  if (monthYearSelect) {
    monthYearSelect.addEventListener('change', () => {
      const selected = monthYearSelect.value;
      renderTable(selected, summaryYearSelect ? summaryYearSelect.value : 'all', summaryMonthSelect ? summaryMonthSelect.value : 'all');
    });
  }

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

  const portfolioMonthYear = document.getElementById('portfolioMonthYear');
  if (portfolioMonthYear) {
    portfolioMonthYear.addEventListener('change', e => {
      const selected = e.target.value;
      window.fetchEntries().then(entries => {
        const mfEntries = entries.filter(entry => typeof window.isMutualFundEntry === 'function' ? window.isMutualFundEntry(entry) : (entry?.type === 'investment' && String(entry?.category || '').toLowerCase().includes('mutual')));
        renderPortfolioChart(mfEntries, selected, oldFundSelect ? oldFundSelect.value || 'all' : 'all');
      });
    });
  }

  if (oldFundSelect) {
    oldFundSelect.addEventListener('change', () => {
      window.fetchEntries().then(entries => {
        const mfEntries = entries.filter(entry => typeof window.isMutualFundEntry === 'function' ? window.isMutualFundEntry(entry) : (entry?.type === 'investment' && String(entry?.category || '').toLowerCase().includes('mutual')));
        renderPortfolioChart(mfEntries, portfolioMonthYear ? portfolioMonthYear.value : null, oldFundSelect.value || 'all');
      });
    });
  }

  // Initial load
  loadEntries();
});
