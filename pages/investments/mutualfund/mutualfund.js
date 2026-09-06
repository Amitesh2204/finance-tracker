// mutualfund.js - Mutual Fund page with PouchDB + CouchDB sync and month-year filter
// NOTE: Requires db.js to be loaded first (finance-tracker/backend/database/js/db.js)

document.addEventListener('DOMContentLoaded', async () => {
  const investedCard = document.getElementById('totalInvested');
  const growthCard = document.getElementById('totalGrowth');
  const tableBody = document.querySelector('#mutualFundTable tbody');
  const monthYearSelect = document.getElementById('monthYearSelect');
  const summaryYearSelect = document.getElementById('summaryYearSelect');
  const summaryMonthSelect = document.getElementById('summaryMonthSelect');
  const portfolioFundSelect = document.getElementById('portfolioFundSelect');
  const portfolioYearSelect = document.getElementById('portfolioYearSelect');
  const portfolioMonthSelect = document.getElementById('portfolioMonthSelect');
  const historyFundDetails = document.getElementById('historyFundDetails');

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

  function classify(entry) {
    const notes = String(entry.notes || '').toLowerCase();
    if (entry.subtype === 'profit' || notes.includes('profit')) return 'profit';
    if (entry.subtype === 'sell' || notes.includes(' sell') || notes.includes('sold')) return 'sell';
    if (entry.subtype === 'yearly-total' || notes.includes('yearly total') || notes.includes('year total')) return 'yearly-total';
    return 'buy';
  }

  function getFundName(entry) {
    if (String(entry.fund || '').startsWith('Yearly Total')) return 'Mutual Fund';
    const source = `${entry.fund || ''} ${entry.notes || ''}`.toLowerCase();
    const match = fundAliases.find(([, aliases]) => aliases.some(alias => source.includes(alias)));
    return match ? match[0] : String(entry.fund || 'Mutual Fund');
  }

  function monthStart(year, month) {
    return new Date(Number(year), Number(month), 1);
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
  function updatePortfolio(entries, selectedDate = new Date()) {
    const fundValues = {};

    entries.forEach(e => {
      if (typeof window.isMutualFundEntry === 'function' ? window.isMutualFundEntry(e) : (e?.type === 'investment' && String(e?.category || '').toLowerCase().includes('mutual'))) {
        if (new Date(e.date) > selectedDate || classify(e) === 'profit' || classify(e) === 'yearly-total') return;
        const key = getFundName(e);
        if (key === 'Mutual Fund') return;
        const signedAmount = (classify(e) === 'sell' ? -1 : 1) * (Number(e.amount) || 0);
        fundValues[key] = (fundValues[key] || 0) + signedAmount;
      }
    });

    entries.forEach(e => {
      if (classify(e) === 'profit' || classify(e) === 'yearly-total' || new Date(e.date) > selectedDate) return;
      const name = getFundName(e);
      if (!name || name === 'Mutual Fund') return;
      if (fundValues[name] === undefined) fundValues[name] = 0;
    });
    if (historyFundDetails) {
      historyFundDetails.innerHTML = Object.entries(fundValues)
        .filter(([, amount]) => amount !== 0)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([name, amount]) => `<li><span>${escapeHtml(name)}</span><span class="fund-value">${formatINR(amount)}</span></li>`)
        .join('') || '<li>No fund transactions for this period</li>';
    }

    if (portfolioFundSelect) {
      const currentValue = portfolioFundSelect.value || 'all';
      const names = [...new Set(Object.keys(fundValues).concat(fundAliases.map(([name]) => name)))].sort();
      portfolioFundSelect.innerHTML = '<option value="all">All funds</option>' + names.map(name => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join('');
      portfolioFundSelect.value = names.includes(currentValue) ? currentValue : 'all';
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

  function selectedPortfolioDate() {
    const year = portfolioYearSelect ? portfolioYearSelect.value : new Date().getFullYear();
    const month = portfolioMonthSelect ? portfolioMonthSelect.value : new Date().getMonth();
    return monthStart(year, month + 1);
  }

  function renderPortfolioChart(entries, selectedDate = new Date(), selectedFund = 'all') {
    const canvas = document.getElementById('portfolioChart');
    if (!canvas || typeof Chart === 'undefined') {
      console.warn('Portfolio chart canvas or Chart.js is unavailable.');
      return;
    }

    const ctx = canvas.getContext('2d');
    if (window.portfolioChart && typeof window.portfolioChart.destroy === 'function') {
      window.portfolioChart.destroy();
    }

    const months = timeline();
    let investedTotal = 0;
    let growthTotal = 0;
    const totals = months.map(month => {
      (entries || []).forEach(e => {
        const date = new Date(e.date);
        if (date.getFullYear() !== month.getFullYear() || date.getMonth() !== month.getMonth()) return;
        if (selectedFund !== 'all' && !getFundName(e).toLowerCase().includes(selectedFund.toLowerCase())) return;
        const amount = Number(e.amount) || 0;
        if (classify(e) === 'profit') growthTotal += amount;
        else if (classify(e) === 'sell') investedTotal -= amount;
        else if (classify(e) !== 'yearly-total') investedTotal += amount;
      });
      return { invested: investedTotal, growth: growthTotal };
    });

    window.portfolioChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: months.map(date => date.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })),
        datasets: [
          { label: 'Invested', data: totals.map(item => item.invested), borderColor: '#3498db', backgroundColor: 'rgba(52,152,219,0.15)', fill: false, tension: 0.25, pointRadius: 0, pointHitRadius: 12 },
          { label: 'Growth', data: totals.map(item => item.growth), borderColor: '#1abc9c', backgroundColor: 'rgba(26,188,156,0.15)', fill: false, tension: 0.25, pointRadius: 0, pointHitRadius: 12 }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'top' } },
        scales: { x: { ticks: { autoSkip: true, maxTicksLimit: 12, maxRotation: 0 } }, y: { beginAtZero: true } }
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
    populatePortfolioPeriod(mfEntries);
    updatePortfolio(mfEntries, selectedPortfolioDate());
    renderPortfolioChart(mfEntries, selectedPortfolioDate(), portfolioFundSelect ? portfolioFundSelect.value || 'all' : 'all');
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

  function refreshPortfolio() {
    const selectedDate = selectedPortfolioDate();
    window.fetchEntries().then(entries => {
      const mfEntries = entries.filter(entry => typeof window.isMutualFundEntry === 'function' ? window.isMutualFundEntry(entry) : (entry?.type === 'investment' && String(entry?.category || '').toLowerCase().includes('mutual')));
      updatePortfolio(mfEntries, selectedDate);
      renderPortfolioChart(mfEntries, selectedDate, portfolioFundSelect ? portfolioFundSelect.value || 'all' : 'all');
    });
  }

  if (portfolioYearSelect) {
    portfolioYearSelect.addEventListener('change', refreshPortfolio);
  }
  if (portfolioMonthSelect) {
    portfolioMonthSelect.addEventListener('change', refreshPortfolio);
  }

  if (portfolioFundSelect) {
    portfolioFundSelect.addEventListener('change', () => {
      window.fetchEntries().then(entries => {
        const mfEntries = entries.filter(entry => typeof window.isMutualFundEntry === 'function' ? window.isMutualFundEntry(entry) : (entry?.type === 'investment' && String(entry?.category || '').toLowerCase().includes('mutual')));
        updatePortfolio(mfEntries, selectedPortfolioDate());
        renderPortfolioChart(mfEntries, selectedPortfolioDate(), portfolioFundSelect.value || 'all');
      });
    });
  }

  // Initial load
  loadEntries();
});
