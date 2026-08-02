// lic.js - LIC page with PouchDB + CouchDB sync and month-year filter
// NOTE: Requires db.js to be loaded first (finance-tracker/backend/database/js/db.js)

document.addEventListener('DOMContentLoaded', async () => {
  const investedCard = document.getElementById('licTotalInvested');
  const growthCard = document.getElementById('licTotalGrowth');
  const tableBody = document.querySelector('#licTable tbody');
  const monthYearSelect = document.getElementById('licMonthYearSelect');
  const yearSelect = document.getElementById('licYearSelect');
  const policyMonthYearSelect = document.getElementById('policyMonthYearSelect');


  let totalInvested = 0;
  let totalGrowth = 0;
  let monthlyData = {}; // { "Aug-2026": { invested: X } }

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
      const invested = d.invested || 0;
      const profit = d.profit || 0;
      const growthPct = invested > 0 ? ((profit / invested) * 100).toFixed(2) : "0.00";
      return `<tr>
        <td>${m}</td>
        <td>LIC</td>
        <td>${formatINR(invested)}</td>
        <td>${formatINR(profit)}</td>
        <td>${growthPct}%</td>
      </tr>`;
    }).join('');
  }


  function renderChart(selectedYear = "2026") {
    const canvas = document.getElementById('licGrowthChart');
    if (!canvas || typeof Chart === 'undefined') return;
    const ctx = canvas.getContext('2d');
    if (window.licChart && typeof window.licChart.destroy === 'function') {
      window.licChart.destroy();
    }

    const months = ["Jul","Aug","Sep","Oct","Nov","Dec","Jan","Feb","Mar","Apr","May","Jun"];
    const investedData = months.map(m => {
      const key = `${m}-${selectedYear}`;
      return monthlyData[key]?.invested || 0;
    });

    window.licChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: months,
        datasets: [
          { label: 'Invested', data: investedData, backgroundColor: '#3498db' }
        ]
      },
      options: { responsive: true, scales: { y: { beginAtZero: true } } }
    });
  }

    // Populate year selector for LIC Growth
    function populateLicYearDropdown(entries) {
    const years = [...new Set(entries.map(e => new Date(e.date).getFullYear()))];
    yearSelect.innerHTML = '';
    if (years.length === 0) {
        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = 'No data';
        yearSelect.appendChild(opt);
        return;
    }
    years.sort().forEach(y => {
        const opt = document.createElement('option');
        opt.value = y;
        opt.textContent = y;
        yearSelect.appendChild(opt);
    });
    yearSelect.addEventListener('change', () => renderChart(yearSelect.value));
    }

  function updatePolicies(entries) {
    const policyValues = { "Jeevan Lakshya": 0, "New Jeevan Labh": 0 };
    entries.forEach(e => {
      if (e.category === "LIC") {
        if (e.notes?.includes("Jeevan Lakshya")) policyValues["Jeevan Lakshya"] += e.amount;
        if (e.notes?.includes("New Jeevan Labh")) policyValues["New Jeevan Labh"] += e.amount;
      }
    });
    Object.keys(policyValues).forEach(key => {
      const span = document.querySelector(`.policy-value[data-policy="${key}"]`);
      if (span) span.textContent = policyValues[key] > 0 ? formatINR(policyValues[key]) : "₹0.00";
    });
  }
  
  // Populate month-year selector for Policy Chart
  function populatePolicyMonthYear(entries) {
    const months = [...new Set(entries.map(e => {
        const d = new Date(e.date);
        return `${d.toLocaleString('default',{month:'short'})}-${d.getFullYear()}`;
    }))];
    policyMonthYearSelect.innerHTML = '';
    if (months.length === 0) {
        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = 'No data';
        policyMonthYearSelect.appendChild(opt);
        return;
    }
    months.sort().forEach(m => {
        const opt = document.createElement('option');
        opt.value = m;
        opt.textContent = m;
        policyMonthYearSelect.appendChild(opt);
    });
    policyMonthYearSelect.addEventListener('change', () => {
        renderPolicyChart(entries, policyMonthYearSelect.value);
    });
  }

  function renderPolicyChart(entries, selectedMonthYear = null) {
    const canvas = document.getElementById('policyChart');
    if (!canvas || typeof Chart === 'undefined') return;
    const ctx = canvas.getContext('2d');
    if (window.policyChart && typeof window.policyChart.destroy === 'function') {
        window.policyChart.destroy();
    }

    const filtered = selectedMonthYear
        ? entries.filter(e => {
            const d = new Date(e.date);
            const key = `${d.toLocaleString('default',{month:'short'})}-${d.getFullYear()}`;
            return key === selectedMonthYear;
        })
        : entries;

    const categories = { "Jeevan Lakshya": 0, "New Jeevan Labh": 0 };
    filtered.forEach(e => {
        if (e.category === 'LIC') {
        if (e.notes?.includes("Jeevan Lakshya")) categories["Jeevan Lakshya"] += e.amount;
        if (e.notes?.includes("New Jeevan Labh")) categories["New Jeevan Labh"] += e.amount;
        }
    });

    window.policyChart = new Chart(ctx, {
        type: 'bar',
        data: {
        labels: Object.keys(categories),
        datasets: [
            { label: 'Invested', data: Object.values(categories), backgroundColor: '#3498db' }
        ]
        },
        options: { responsive: true, scales: { y: { beginAtZero: true } } }
    });
  }

  async function loadEntries() {
    const entries = await window.fetchEntries().catch(() => []);
    const licEntries = entries.filter(e => e.type === 'investment' && e.category === 'LIC');

    totalInvested = 0;
    totalGrowth = 0;
    monthlyData = {};

    licEntries.forEach(e => {
      const d = new Date(e.date);
      const month = d.toLocaleString('default',{month:'short'});
      const year = d.getFullYear();
      const key = `${month}-${year}`;
      monthlyData[key] = monthlyData[key] || { invested:0, profit:0 };
      
      if (e.subtype === 'profit') {
        monthlyData[key].profit += Number(e.amount) || 0;
        totalGrowth += Number(e.amount) || 0;
      } else {
        monthlyData[key].invested += Number(e.amount) || 0;
        totalInvested += Number(e.amount) || 0;
      }
    });

    updateCards();
    populateMonthYearDropdown();
    renderTable(monthYearSelect.value || null);
    
    populateLicYearDropdown(licEntries);
    renderChart(yearSelect.value || new Date().getFullYear());

    renderChart("2026");
    updatePolicies(licEntries);
    renderPolicyChart(licEntries);

    populatePolicyMonthYear(licEntries);
    renderPolicyChart(licEntries, policyMonthYearSelect.value || null);
  }

  // Handle investment form
  document.getElementById('licInvestmentForm').addEventListener('submit', async e => {
    e.preventDefault();
    const amt = parseFloat(document.getElementById('licAmount').value);
    if (isNaN(amt) || amt <= 0) return;

    const d = new Date();
    const month = d.toLocaleString('default',{month:'short'});
    const year = d.getFullYear();
    const key = `${month}-${year}`;

    const policyName = document.getElementById('policyName').value;
    const entry = {
      type: 'investment',
      category: 'LIC',
      subtype: 'investment',
      amount: amt,
      currency: 'INR',
      date: d.toISOString(),
      notes: `${policyName} LIC investment for ${key}`
    };
    await window.addEntry(entry);
    await loadEntries();

    e.target.reset();
  });

  // Handle profit form
  document.getElementById('licProfitForm').addEventListener('submit', async e => {
    e.preventDefault();
    const amt = parseFloat(document.getElementById('licProfitAmount').value);
    if (isNaN(amt) || amt <= 0) return;

    const d = new Date();
    const year = d.getFullYear();
    const entry = {
      type: 'investment',
      category: 'LIC',
      subtype: 'profit',
      amount: amt,
      currency: 'INR',
      date: d.toISOString(),
      notes: `LIC yearly profit for ${year}`
    };
    await window.addEntry(entry);
    await loadEntries();

    e.target.reset();
  }
  );

  // Month-year dropdown change
  monthYearSelect.addEventListener('change', () => {
    const selected = monthYearSelect.value;
    renderTable(selected);
  });

  // Toggle expand/collapse for policy list
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

  // Initial load
  loadEntries();
});

