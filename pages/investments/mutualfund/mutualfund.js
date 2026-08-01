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

  function renderChart(selectedYear = "2026") {
    const ctx = document.getElementById('mutualFundChart').getContext('2d');
    if (window.mfChart && typeof window.mfChart.destroy === 'function') {
      window.mfChart.destroy();
    }

    const months = ["Jul","Aug","Sep","Oct","Nov","Dec","Jan","Feb","Mar","Apr","May","Jun"];
    const combinedData = months.map(m => {
      const key = `${m}-${selectedYear}`;
      const monthData = monthlyData[key] || {};
      return (monthData.invested || 0) + (monthData.profit || 0);
    });

    window.mfChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: months,
        datasets: [
          { label: 'Combined Total', data: combinedData, backgroundColor: '#1abc9c' }
        ]
      },
      options: {
        responsive: true,
        plugins: { legend: { position: 'top' } },
        scales: { y: { beginAtZero: true } }
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
      if (e.category === "Mutual Fund") {
        if (e.notes?.includes("WhiteOak")) fundValues.WhiteOak += e.amount;
        if (e.notes?.includes("Bajaj")) fundValues.Bajaj += e.amount;
        if (e.notes?.includes("Wealth")) fundValues.WealthCo += e.amount;
        if (e.notes?.includes("Groww")) fundValues.Groww += e.amount;
        if (e.notes?.includes("JM")) fundValues.JM += e.amount;
        if (e.notes?.includes("Abakkus")) fundValues.Abakkus += e.amount;
        if (e.notes?.includes("Edelweiss")) fundValues.Edelweiss += e.amount;
        if (e.notes?.includes("360 ONE")) fundValues["360One"] += e.amount;
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
    const ctx = document.getElementById('portfolioChart').getContext('2d');
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
      if (e.category === 'Mutual Fund') {
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

  // Load existing entries from DB
  async function loadEntries() {
    const entries = await window.fetchEntries().catch(() => []);
    const mfEntries = entries.filter(e => e.type === 'investment' && e.category === 'Mutual Fund');

    const mutualFundSummary = window.getMutualFundSummary(mfEntries);
    totalInvested = mutualFundSummary.invested;
    totalGrowth = mutualFundSummary.growth;
    monthlyData = {};

    mfEntries.forEach(e => {
      const d = new Date(e.date);
      const month = d.toLocaleString('default',{month:'short'});
      const year = d.getFullYear();
      const key = `${month}-${year}`;
      monthlyData[key] = monthlyData[key] || { invested:0, profit:0, combined:0 };
      if (e.subtype === 'investment' || e.notes?.toLowerCase().includes('investment')) {
        monthlyData[key].invested += e.amount;
        monthlyData[key].combined += e.amount;
        totalInvested += e.amount;
      } else if (e.subtype === 'profit' || e.notes?.toLowerCase().includes('profit')) {
        monthlyData[key].profit += e.amount;
        monthlyData[key].combined += e.amount;
        totalGrowth += e.amount;
      }
    });

    updateCards();
    populateMonthYearDropdown();
    renderTable(monthYearSelect.value || null);
    renderChart("2026");
    // NEW: update portfolio section
    updatePortfolio(mfEntries);
    populatePortfolioMonthYear(mfEntries);
    renderPortfolioChart(mfEntries);
  }

  // Handle investment form
  document.getElementById('investmentForm').addEventListener('submit', async e => {
    e.preventDefault();
    const amt = parseFloat(document.getElementById('monthlyAmount').value);
    if (isNaN(amt) || amt <= 0) return;

    const d = new Date();
    const month = d.toLocaleString('default',{month:'short'});
    const year = d.getFullYear();
    const key = `${month}-${year}`;
    
    // Save entry to DB
    const fundName = document.getElementById('fundName').value;
    const entry = {
      type: 'investment',
      category: 'Mutual Fund',
      subtype: 'investment',
      amount: amt,
      currency: 'INR',
      date: d.toISOString(),
      notes: `${fundName} Mutual Fund investment for ${key}`
    };
    await window.addEntry(entry);
    await loadEntries(); // refresh portfolio and portfolio chart

    e.target.reset();
  });

  // Handle profit form
  document.getElementById('profitForm').addEventListener('submit', async e => {
    e.preventDefault();
    const profit = parseFloat(document.getElementById('monthlyProfit').value);
    if (isNaN(profit) || profit <= 0) return;

    const d = new Date();
    const month = d.toLocaleString('default',{month:'short'});
    const year = d.getFullYear();
    const key = `${month}-${year}`;
 
    // Save entry to DB
    const fundNameProfit = document.getElementById('fundNameProfit').value;
    const entry = {
      type: 'investment',
      category: 'Mutual Fund',
      subtype: 'profit',
      amount: profit,
      currency: 'INR',
      date: d.toISOString(),
      notes: `${fundNameProfit} Mutual Fund profit for ${key}`
    };
    await window.addEntry(entry);
    await loadEntries(); // refresh portfolio and portfolio chart

    e.target.reset();
  });

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
      const mfEntries = entries.filter(en => en.type === 'investment' && en.category === 'Mutual Fund');
      renderPortfolioChart(mfEntries, selected);
    });
  });


  // Initial load
  loadEntries();
});
