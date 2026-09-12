// mutualfund.js - Mutual Fund page with PouchDB + CouchDB sync and month-year filter
// NOTE: Requires db.js to be loaded first (finance-tracker/backend/database/js/db.js)

document.addEventListener('DOMContentLoaded', async () => {
  const investedCard = document.getElementById('totalInvested');
  const growthCard = document.getElementById('totalGrowth');
  const tableBody = document.querySelector('#mutualFundTable tbody');
  const monthYearSelect = document.getElementById('monthYearSelect');
  const summaryYearSelect = document.getElementById('summaryYearSelect');
  const summaryMonthSelect = document.getElementById('summaryMonthSelect');
  const portfolioYearSelect = document.getElementById('portfolioYearSelect');
  const portfolioMonthSelect = document.getElementById('portfolioMonthSelect');
  const historyFundDetails = document.getElementById('historyFundDetails');
  const portfolioPeriodStatus = document.getElementById('portfolioPeriodStatus');
  const portfolioChartTitle = document.getElementById('portfolioChartTitle');

  let totalInvested = 0;
  let totalGrowth = 0;
  let monthlyData = {}; // { "Jul-2026": { invested: X, profit: Y } }

  const fundAliases = [
    ['Abakkus Small Cap Fund (G)', ['abakkus small cap fund', 'abakkus']],
    ['Edelweiss Aggressive Hybrid Fund (G)', ['edelweiss aggressive hybrid fund', 'edelweiss']],
    ['Groww Multi Cap Fund Reg (G)', ['groww multi cap fund', 'groww']],
    ['The Wealth Company Flexi Cap Fund Reg (G)', ['the wealth company flexi cap fund', 'wealthco', 'wealth company']],
    ['WhiteOak Capital Large & Mid Cap Fund Reg (G)', ['whiteoak capital large', 'whiteoak']],
    ['Canara Robeco Equity Taxsaver Fund Reg (G)', ['canara robeco equity taxsaver']],
    ['Sundaram Tax Savings Fund Reg (G)', ['sundaram tax savings fund']],
    ['Bajaj Finserv Small Cap Fund (G)', ['bajaj finserv small cap fund', 'bajaj']],
    ['JM Large & Mid Cap Fund Reg (G)', ['jm large', 'jm']],
    ['360 ONE Multi Asset Allocation Fund (G)', ['360 one', '360one']]
  ];

  function formatINR(amount) {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(amount);
  }

  function escapeHtml(value) {
    return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }

  function updateCards() {
    investedCard.textContent = formatINR(totalInvested);
    growthCard.textContent = formatINR(totalGrowth);
  }

  // Classify a mutual fund entry as 'buy' | 'sell' | 'profit' | 'yearly-total'.
  //
  // Bug fix: previously this OR'd the explicit `subtype` field together with
  // a notes-text keyword scan (e.g. `subtype === 'sell' || notes.includes('sold')`).
  // That meant a deliberately-tagged buy (subtype: 'investment') could still get
  // reclassified as a sell/profit purely because its free-text Notes happened to
  // mention a word like "sold" — quietly pulling real buy amounts out of Total
  // Invested/Total Bought. An explicit subtype is now trusted completely; the
  // notes scan only runs as a fallback for older entries that predate it.
  function classify(entry) {
    const subtype = entry.subtype;
    if (subtype) {
      if (subtype === 'profit') return 'profit';
      if (subtype === 'sell') return 'sell';
      if (subtype === 'yearly-total') return 'yearly-total';
      return 'buy';
    }
    const notes = String(entry.notes || '').toLowerCase();
    if (notes.includes('profit')) return 'profit';
    if (notes.includes(' sell') || notes.includes('sold')) return 'sell';
    if (notes.includes('yearly total') || notes.includes('year total')) return 'yearly-total';
    return 'buy';
  }

  function getFundName(entry) {
    if (String(entry.fund || '').startsWith('Yearly Total')) return 'Mutual Fund';
    const source = `${entry.fund || ''} ${entry.notes || ''}`.toLowerCase();
    const match = fundAliases.find(([, aliases]) => aliases.some(alias => source.includes(alias)));
    return match ? match[0] : String(entry.fund || 'Mutual Fund');
  }

  function selectedPortfolioPeriod() {
    const year = portfolioYearSelect ? Number(portfolioYearSelect.value) : new Date().getFullYear();
    const month = portfolioMonthSelect ? Number(portfolioMonthSelect.value) : new Date().getMonth();
    return {
      start: new Date(year, month, 1),
      end: new Date(year, month + 1, 1)
    };
  }

  function isBeforePeriodEnd(entry, selectedPeriod) {
    const entryDate = new Date(entry.date);
    return !Number.isNaN(entryDate.getTime()) && entryDate < selectedPeriod.end;
  }

  function timeline() {
    const start = new Date(2017, 6, 1);
    const now = new Date();
    const end = new Date(now.getFullYear(), now.getMonth(), 1);
    const months = [];
    for (let cursor = new Date(start); cursor <= end; cursor.setMonth(cursor.getMonth() + 1)) months.push(new Date(cursor));
    return months;
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

    const months = timeline();
    const labels = months.map(date => date.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }));
    let investedTotal = 0;
    let growthTotal = 0;
    const totals = months.map(month => {
      mfEntries.forEach(entry => {
        const date = new Date(entry.date);
        if (date.getFullYear() !== month.getFullYear() || date.getMonth() !== month.getMonth()) return;
        const amount = Number(entry.amount) || 0;
        const kind = classify(entry);
        if (kind === 'profit') growthTotal += amount;
        else if (kind === 'sell') investedTotal -= amount;
        else investedTotal += amount;
      });
      return { invested: investedTotal, growth: growthTotal };
    });

    window.mfChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [
          { label: 'Total Invested', data: totals.map(item => item.invested), borderColor: '#1abc9c', backgroundColor: 'rgba(26,188,156,0.15)', fill: false, tension: 0.25, pointRadius: 0, pointHitRadius: 12 },
          { label: 'Total Growth', data: totals.map(item => item.growth), borderColor: '#3498db', backgroundColor: 'rgba(52,152,219,0.15)', fill: false, tension: 0.25, pointRadius: 0, pointHitRadius: 12 }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'top' } },
        scales: {
          x: { ticks: { autoSkip: true, maxTicksLimit: 12, maxRotation: 0 } },
          y: { beginAtZero: true }
        }
      }
    });
  }
  
    // --- Portfolio rendering ---
  function updatePortfolio(entries, selectedPeriod = selectedPortfolioPeriod()) {
    const fundValues = {};

    if (portfolioPeriodStatus) {
      const periodLabel = selectedPeriod.start.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
      portfolioPeriodStatus.textContent = `Portfolio values through ${periodLabel}`;
    }
    if (portfolioChartTitle) {
      const periodLabel = selectedPeriod.start.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
      portfolioChartTitle.textContent = `Portfolio Growth - ${periodLabel}`;
    }

    entries.forEach(e => {
      if (typeof window.isMutualFundEntry === 'function' ? window.isMutualFundEntry(e) : (e?.type === 'investment' && String(e?.category || '').toLowerCase().includes('mutual'))) {
        if (!isBeforePeriodEnd(e, selectedPeriod) || classify(e) === 'yearly-total') return;
        const key = getFundName(e);
        if (key === 'Mutual Fund') return;
        const kind = classify(e);
        if (!fundValues[key]) fundValues[key] = { invested: 0, growth: 0 };
        const amount = Number(e.amount) || 0;
        if (kind === 'sell') fundValues[key].invested -= amount;
        else if (kind !== 'profit') fundValues[key].invested += amount;
        if (kind === 'profit') fundValues[key].growth += amount;
      }
    });

    entries.forEach(e => {
      if (!isBeforePeriodEnd(e, selectedPeriod) || classify(e) === 'yearly-total') return;
      const name = getFundName(e);
      if (!name || name === 'Mutual Fund') return;
      if (fundValues[name] === undefined) fundValues[name] = { invested: 0, growth: 0 };
    });
    if (historyFundDetails) {
      historyFundDetails.innerHTML = Object.entries(fundValues)
        .filter(([, values]) => values.invested !== 0 || values.growth !== 0)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([name, values]) => `<li><span>${escapeHtml(name)}</span><span class="fund-value">${formatINR(values.invested)}<small> invested</small><br>${formatINR(values.growth)}<small> growth</small></span></li>`)
        .join('') || '<li>No fund holdings recorded through this month</li>';
    }

  }

  // --- Portfolio chart rendering ---
  function populatePortfolioPeriod(entries) {
    if (!portfolioYearSelect || !portfolioMonthSelect) return;
    const years = [...new Set(entries.map(e => new Date(e.date).getFullYear()).filter(Number.isFinite))].sort((a, b) => b - a);
    const currentYear = new Date().getFullYear();
    portfolioYearSelect.innerHTML = years.map(year => `<option value="${year}">${year}</option>`).join('') || `<option value="${currentYear}">${currentYear}</option>`;
    portfolioYearSelect.value = String(years.includes(currentYear) ? currentYear : (years[0] || currentYear));
    portfolioMonthSelect.value = String(new Date().getMonth());
  }

  function renderPortfolioChart(entries, selectedPeriod = selectedPortfolioPeriod()) {
    const canvas = document.getElementById('portfolioChart');
    if (!canvas || typeof Chart === 'undefined') {
      console.warn('Portfolio chart canvas or Chart.js is unavailable.');
      return;
    }

    const ctx = canvas.getContext('2d');
    if (window.portfolioChart && typeof window.portfolioChart.destroy === 'function') {
      window.portfolioChart.destroy();
    }

    const totalsByFund = {};
    (entries || []).forEach(e => {
      const kind = classify(e);
      if (!isBeforePeriodEnd(e, selectedPeriod) || kind === 'yearly-total') return;
      const fund = getFundName(e);
      if (fund === 'Mutual Fund') return;
      if (!totalsByFund[fund]) totalsByFund[fund] = { invested: 0, growth: 0 };
      const amount = Number(e.amount) || 0;
      if (kind === 'profit') totalsByFund[fund].growth += amount;
      else if (kind === 'sell') totalsByFund[fund].invested -= amount;
      else totalsByFund[fund].invested += amount;
    });
    const fundNames = Object.keys(totalsByFund).sort();

    window.portfolioChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: fundNames.length ? fundNames : ['No transactions'],
        datasets: [
          { label: 'Invested', data: fundNames.length ? fundNames.map(name => totalsByFund[name].invested) : [0], borderColor: '#3498db', backgroundColor: 'rgba(52,152,219,0.15)', fill: false, tension: 0.25, pointRadius: 3, pointHitRadius: 12 },
          { label: 'Growth', data: fundNames.length ? fundNames.map(name => totalsByFund[name].growth) : [0], borderColor: '#1abc9c', backgroundColor: 'rgba(26,188,156,0.15)', fill: false, tension: 0.25, pointRadius: 3, pointHitRadius: 12 }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'top' } },
        scales: { x: { ticks: { autoSkip: false, maxRotation: 45, minRotation: 0 } }, y: { beginAtZero: true } }
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

    const summary = { bought: 0, invested: 0, growth: 0, sold: 0, combined: 0, byYear: {} };
    mfEntries.forEach(entry => {
      const amount = Number(entry.amount) || 0;
      const kind = classify(entry);
      const isProfit = kind === 'profit';
      const isSell = kind === 'sell';

      if (isProfit) {
        summary.growth += amount;
      } else if (isSell) {
        summary.invested -= amount;
        summary.sold += amount;
      } else {
        summary.bought += amount;
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

    totalInvested = mutualFundSummary.bought ?? mutualFundSummary.invested ?? 0;
    totalGrowth = mutualFundSummary.growth || 0;
    monthlyData = {};
    const yearsWithDetailedTransactions = new Set(mfEntries
      .filter(entry => classify(entry) !== 'yearly-total')
      .map(entry => new Date(entry.date).getFullYear())
      .filter(Number.isFinite));

    mfEntries.forEach(e => {
      const d = new Date(e.date);
      const month = d.toLocaleString('default',{month:'short'});
      const year = d.getFullYear();
      const key = `${month}-${year}`;
      const kind = classify(e);
      if (kind === 'yearly-total' && yearsWithDetailedTransactions.has(year)) return;
      monthlyData[key] = monthlyData[key] || { invested:0, profit:0, sold:0, combined:0 };
      const isProfit = kind === 'profit';
      const isSell = kind === 'sell';
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
    populatePortfolioPeriod(mfEntries);
    updatePortfolio(mfEntries);
    renderPortfolioChart(mfEntries);
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
      if (!target) return;
      if (target.style.display === "block") {
        target.style.display = "none";
        btn.textContent = btn.textContent.replace("▾", "▸");
      } else {
        target.style.display = "block";
        btn.textContent = btn.textContent.replace("▸", "▾");
      }
    });
  });

  function refreshPortfolio() {
    window.fetchEntries().then(entries => {
      const mfEntries = entries.filter(entry => typeof window.isMutualFundEntry === 'function' ? window.isMutualFundEntry(entry) : (entry?.type === 'investment' && String(entry?.category || '').toLowerCase().includes('mutual')));
      updatePortfolio(mfEntries);
      renderPortfolioChart(mfEntries);
    });
  }

  if (portfolioYearSelect) {
    portfolioYearSelect.addEventListener('change', refreshPortfolio);
  }
  if (portfolioMonthSelect) {
    portfolioMonthSelect.addEventListener('change', refreshPortfolio);
  }

  // Initial load
  loadEntries();
});
