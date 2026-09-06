// lic.js - LIC page with PouchDB + CouchDB sync and month-year filter
// NOTE: Requires db.js to be loaded first (finance-tracker/backend/database/js/db.js)

document.addEventListener('DOMContentLoaded', async () => {
  const investedCard = document.getElementById('licTotalInvested');
  const growthCard = document.getElementById('licTotalGrowth');
  const tableBody = document.querySelector('#licTable tbody');
  const summaryYearSelect = document.getElementById('licSummaryYear');
  const summaryMonthSelect = document.getElementById('licSummaryMonth');
  const policyYearSelect = document.getElementById('policyYearSelect');
  const policyMonthSelect = document.getElementById('policyMonthSelect');
  const entryYearSelect = document.getElementById('licEntryYear');
  const entryMonthSelect = document.getElementById('licEntryMonth');
  const categorySelect = document.getElementById('licCategory');
  const exportBtn = document.getElementById('licExportBtn');
  const importInput = document.getElementById('licImportInput');
  const licInvestmentForm = document.getElementById('licInvestmentForm');

  let totalInvested = 0;
  let totalGrowth = 0;
  let monthlyData = {};
  let allEntries = [];

  function formatINR(amount) {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(amount || 0);
  }

  function getPolicyName(entry) {
    const notes = String(entry.notes || entry.fund || '');
    if (notes.includes('Jeevan Lakshya')) return 'Jeevan Lakshya';
    if (notes.includes('New Jeevan Labh')) return 'New Jeevan Labh';
    return 'Jeevan Lakshya';
  }

  function ensureHiddenInput(form, id) {
    if (!form) return null;
    let input = form.querySelector(`#${id}`);
    if (!input) {
      input = document.createElement('input');
      input.type = 'hidden';
      input.id = id;
      input.name = id;
      form.appendChild(input);
    }
    return input;
  }

  const licInvestmentEditId = ensureHiddenInput(licInvestmentForm, 'licInvestmentEditingId');

  const monthNames = Array.from({ length: 12 }, (_, month) => new Date(2020, month, 1).toLocaleString('default', { month: 'long' }));

  function populateMonthSelect(select) {
    if (!select) return;
    select.innerHTML = monthNames.map((name, month) => `<option value="${month}">${name}</option>`).join('');
  }

  function populateYearSelect(select, years) {
    if (!select) return;
    const currentYear = new Date().getFullYear();
    const values = [...new Set([2022, currentYear, ...years])].filter(Number.isFinite).sort((a, b) => a - b);
    select.innerHTML = values.map(year => `<option value="${year}">${year}</option>`).join('');
    select.value = String(values.includes(currentYear) ? currentYear : values[values.length - 1]);
  }

  function selectedPeriod(yearSelect, monthSelect) {
    const year = Number(yearSelect?.value || new Date().getFullYear());
    const month = Number(monthSelect?.value || new Date().getMonth());
    return { year, month, start: new Date(year, month, 1), end: new Date(year, month + 1, 1) };
  }

  function isBeforePeriodEnd(entry, period) {
    const date = new Date(entry.date);
    return !Number.isNaN(date.getTime()) && date < period.end;
  }

  function periodKey(period) {
    return `${new Date(2020, period.month, 1).toLocaleString('default', { month: 'short' })}-${period.year}`;
  }

  function updateCards() {
    if (investedCard) investedCard.textContent = formatINR(totalInvested);
    if (growthCard) growthCard.textContent = formatINR(totalGrowth);
  }

  function renderTable(period = selectedPeriod(summaryYearSelect, summaryMonthSelect)) {
    if (!tableBody) return;
    const key = periodKey(period);
    const data = monthlyData[key] || { policies: {} };
    const policies = ['Jeevan Lakshya', 'New Jeevan Labh'];
    tableBody.innerHTML = policies.map(policy => {
      const policyData = data.policies?.[policy] || { invested: 0, profit: 0 };
      const growthPct = policyData.invested > 0 ? ((policyData.profit / policyData.invested) * 100).toFixed(2) : '0.00';
      return `<tr>
        <td>${key}</td>
        <td>LIC ${policy === 'New Jeevan Labh' ? 'New Jeevan Labh Plan' : 'Jeevan Lakshya'}</td>
        <td>${formatINR(policyData.invested)}</td>
        <td>${formatINR(policyData.profit)}</td>
        <td>${growthPct}%</td>
        <td>
          <button type="button" class="edit-entry-btn" data-id="${key}" data-policy="${policy}">Edit</button>
          <button type="button" class="delete-entry-btn" data-id="${key}" data-policy="${policy}">Delete</button>
        </td>
      </tr>`;
    }).join('');

    tableBody.querySelectorAll('.delete-entry-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const key = btn.dataset.id;
        const doc = allEntries.find(e => `${new Date(e.date).toLocaleString('default', { month: 'short' })}-${new Date(e.date).getFullYear()}` === key && getPolicyName(e) === btn.dataset.policy);
        if (!doc || !confirm('Delete this LIC entry?')) return;
        await window.deleteEntry(doc._id);
        await loadEntries();
      });
    });

    tableBody.querySelectorAll('.edit-entry-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.id;
        const doc = allEntries.find(e => `${new Date(e.date).toLocaleString('default', { month: 'short' })}-${new Date(e.date).getFullYear()}` === key && getPolicyName(e) === btn.dataset.policy);
        if (!doc) return;
        const policyField = document.getElementById('policyName');
        const amountField = document.getElementById('licAmount');
        if (policyField) policyField.value = getPolicyName(doc);
        if (amountField) amountField.value = doc.amount || '';
        if (categorySelect) categorySelect.value = doc.subtype === 'profit' ? 'profit' : 'investment';
        const date = new Date(doc.date);
        if (entryYearSelect) entryYearSelect.value = String(date.getFullYear());
        if (entryMonthSelect) entryMonthSelect.value = String(date.getMonth());
        if (licInvestmentEditId) licInvestmentEditId.value = doc._id || '';
        const submit = licInvestmentForm?.querySelector('button[type="submit"]');
        if (submit) submit.textContent = 'Update Entry';
      });
    });
  }

  function renderChart() {
    const canvas = document.getElementById('licGrowthChart');
    if (!canvas || typeof Chart === 'undefined') return;
    const ctx = canvas.getContext('2d');
    if (window.licChart && typeof window.licChart.destroy === 'function') {
      window.licChart.destroy();
    }
    const currentYear = new Date().getFullYear();
    const years = Array.from({ length: Math.max(1, currentYear - 2022 + 1) }, (_, index) => 2022 + index);
    let investedTotal = 0;
    let growthTotal = 0;
    const investedData = years.map(year => {
      Object.entries(monthlyData).forEach(([key, value]) => {
        if (Number(key.split('-')[1]) !== year) return;
        investedTotal += value.invested || 0;
        growthTotal += value.profit || 0;
      });
      return investedTotal;
    });
    const growthData = years.map(year => {
      let total = 0;
      Object.entries(monthlyData).forEach(([key, value]) => {
        if (Number(key.split('-')[1]) <= year) total += value.profit || 0;
      });
      return total;
    });
    window.licChart = new Chart(ctx, {
      type: 'line',
      data: { labels: years, datasets: [
        { label: 'Total Invested', data: investedData, borderColor: '#3498db', backgroundColor: 'rgba(52,152,219,0.12)', tension: 0.25, fill: false, pointRadius: 3 },
        { label: 'Total Growth', data: growthData, borderColor: '#1abc9c', backgroundColor: 'rgba(26,188,156,0.12)', tension: 0.25, fill: false, pointRadius: 3 }
      ] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { tooltip: { callbacks: { label: context => formatINR(context.parsed.y) } } }, scales: { y: { beginAtZero: true, ticks: { callback: value => formatINR(value) } } } }
    });
  }

  function updatePolicies(entries, period = selectedPeriod(policyYearSelect, policyMonthSelect)) {
    const policyValues = { 'Jeevan Lakshya': 0, 'New Jeevan Labh': 0 };
    entries.forEach(e => {
      if (e.category !== 'LIC') return;
      if (!isBeforePeriodEnd(e, period)) return;
      const notes = String(e.notes || '');
      const amount = Number(e.amount) || 0;
      const signed = e.subtype === 'profit' ? 0 : amount;
      if (notes.includes('Jeevan Lakshya')) policyValues['Jeevan Lakshya'] += signed;
      if (notes.includes('New Jeevan Labh')) policyValues['New Jeevan Labh'] += signed;
    });
    Object.keys(policyValues).forEach(key => {
      const span = document.querySelector(`.policy-value[data-policy="${key}"]`);
      if (span) span.textContent = policyValues[key] > 0 ? formatINR(policyValues[key]) : '₹0.00';
    });
  }

  function renderPolicyChart(entries) {
    const canvas = document.getElementById('policyChart');
    if (!canvas || typeof Chart === 'undefined') return;
    const ctx = canvas.getContext('2d');
    if (window.policyChart && typeof window.policyChart.destroy === 'function') {
      window.policyChart.destroy();
    }
    const years = [...new Set(Object.keys(monthlyData).map(key => Number(key.split('-')[1])).filter(Number.isFinite))].sort((a, b) => a - b);
    const startYear = years[0] || 2022;
    const endYear = new Date().getFullYear();
    const labels = Array.from({ length: endYear - startYear + 1 }, (_, index) => startYear + index);
    const totals = { 'Jeevan Lakshya': 0, 'New Jeevan Labh': 0 };
    const data = labels.map(year => {
      Object.entries(monthlyData).forEach(([key, monthData]) => {
        if (Number(key.split('-')[1]) !== year) return;
        Object.keys(totals).forEach(policy => {
          totals[policy] += monthData.policies?.[policy]?.invested || 0;
        });
      });
      return { lakshya: totals['Jeevan Lakshya'], labh: totals['New Jeevan Labh'] };
    });
    window.policyChart = new Chart(ctx, {
      type: 'line',
      data: { labels, datasets: [
        { label: 'LIC Jeevan Lakshya', data: data.map(item => item.lakshya), borderColor: '#3498db', backgroundColor: 'rgba(52,152,219,0.12)', tension: 0.25, fill: false, pointRadius: 3 },
        { label: 'LIC New Jeevan Labh Plan', data: data.map(item => item.labh), borderColor: '#1abc9c', backgroundColor: 'rgba(26,188,156,0.12)', tension: 0.25, fill: false, pointRadius: 3 }
      ] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { tooltip: { callbacks: { label: context => formatINR(context.parsed.y) } } }, scales: { y: { beginAtZero: true, ticks: { callback: value => formatINR(value) } } } }
    });
  }

  function exportEntries(rows) {
    if (!window.XLSX) {
      alert('Excel export library is not loaded.');
      return;
    }
    const sheetRows = rows.map(e => ({
      'TXN DATE': new Date(e.date).toISOString().slice(0, 10),
      'AMOUNT': Number(e.amount) || 0,
      'BANK': e.bank || 'N/A'
    }));
    const ws = window.XLSX.utils.json_to_sheet(sheetRows);
    const wb = window.XLSX.utils.book_new();
    window.XLSX.utils.book_append_sheet(wb, ws, 'LIC');
    window.XLSX.writeFile(wb, 'lic-transactions.xlsx');
  }

  function importEntries(file) {
    if (!file || !window.XLSX) return;
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const wb = window.XLSX.read(new Uint8Array(evt.target.result), { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = window.XLSX.utils.sheet_to_json(ws, { raw: false, defval: '' });
        const validation = window.validateExcelImportRows(rows, {
          dateAliases: ['TXN DATE', 'Txn Date', 'DATE', 'Date'],
          amountAliases: ['AMOUNT', 'Amount', 'Policy Amount', 'POLICY AMOUNT'],
          bankAliases: ['BANK', 'Bank']
        });

        if (validation.issues.length > 0) {
          alert(`LIC Excel import failed. ${validation.issues[0]}`);
          return;
        }

        for (const row of validation.validRows) {
          const entry = {
            type: 'saving',
            category: 'LIC',
            subtype: 'investment',
            amount: row.amount,
            currency: 'INR',
            date: row.date,
            bank: String(row.bank || 'N/A'),
            notes: `${getPolicyName({ notes: row.raw['SCHEME NAME'] || row.raw['Scheme Name'] || 'Jeevan Lakshya' })} LIC import`
          };
          await window.addEntry(entry);
        }
        await loadEntries();
      } catch (err) {
        console.error('LIC import failed', err);
        alert('LIC Excel import failed. Please verify the file columns match TXN DATE, AMOUNT, and BANK.');
      }
    };
    reader.readAsArrayBuffer(file);
  }

  async function loadEntries() {
    const entries = await window.fetchEntries().catch(() => []);
    allEntries = entries.filter(e => (e.type === 'investment' || e.type === 'saving') && e.category === 'LIC');

    totalInvested = 0;
    totalGrowth = 0;
    monthlyData = {};

    allEntries.forEach(e => {
      const d = new Date(e.date);
      const month = d.toLocaleString('default', { month: 'short' });
      const year = d.getFullYear();
      const key = `${month}-${year}`;
      monthlyData[key] = monthlyData[key] || { invested: 0, profit: 0, policies: {
        'Jeevan Lakshya': { invested: 0, profit: 0 },
        'New Jeevan Labh': { invested: 0, profit: 0 }
      } };
      const policy = getPolicyName(e);
      const policyData = monthlyData[key].policies[policy];
      if (e.subtype === 'profit') {
        monthlyData[key].profit += Number(e.amount) || 0;
        totalGrowth += Number(e.amount) || 0;
        if (policyData) policyData.profit += Number(e.amount) || 0;
      } else {
        monthlyData[key].invested += Number(e.amount) || 0;
        totalInvested += Number(e.amount) || 0;
        if (policyData) policyData.invested += Number(e.amount) || 0;
      }
    });

    updateCards();
    const years = allEntries.map(entry => new Date(entry.date).getFullYear()).filter(Number.isFinite);
    populateYearSelect(entryYearSelect, years);
    populateYearSelect(summaryYearSelect, years);
    populateYearSelect(policyYearSelect, years);
    populateMonthSelect(entryMonthSelect);
    populateMonthSelect(summaryMonthSelect);
    populateMonthSelect(policyMonthSelect);
    const currentMonth = new Date().getMonth();
    [entryMonthSelect, summaryMonthSelect, policyMonthSelect].forEach(select => { if (select) select.value = String(currentMonth); });
    renderTable();
    renderChart();
    updatePolicies(allEntries);
    renderPolicyChart(allEntries);
  }

  if (exportBtn) exportBtn.addEventListener('click', () => exportEntries(allEntries));
  if (importInput) importInput.addEventListener('change', e => { const file = e.target.files && e.target.files[0]; if (file) importEntries(file); e.target.value = ''; });

  if (licInvestmentForm) {
    licInvestmentForm.addEventListener('submit', async e => {
      e.preventDefault();
      const amt = parseFloat(document.getElementById('licAmount').value);
      if (Number.isNaN(amt) || amt <= 0) return;
      const policyName = document.getElementById('policyName').value || 'Jeevan Lakshya';
      const category = categorySelect?.value || 'investment';
      const year = Number(entryYearSelect?.value || new Date().getFullYear());
      const month = Number(entryMonthSelect?.value || new Date().getMonth());
      const docId = licInvestmentEditId?.value || '';
      const payload = {
        type: 'saving',
        category: 'LIC',
        subtype: category,
        amount: amt,
        currency: 'INR',
        date: new Date(year, month, 15).toISOString(),
        notes: `${policyName} LIC ${category}`,
        bank: 'N/A'
      };
      if (docId) await window.updateEntry(docId, payload);
      else await window.addEntry(payload);
      e.target.reset();
      if (licInvestmentEditId) licInvestmentEditId.value = '';
      const submit = licInvestmentForm.querySelector('button[type="submit"]');
      if (submit) submit.textContent = 'Add Entry';
      await loadEntries();
    });
  }

  function refreshSelectedViews() {
    renderTable();
    updatePolicies(allEntries);
    renderPolicyChart(allEntries);
  }

  [summaryYearSelect, summaryMonthSelect, policyYearSelect, policyMonthSelect].forEach(select => {
    if (select) select.addEventListener('change', refreshSelectedViews);
  });

  document.querySelectorAll('.toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = document.getElementById(btn.dataset.target);
      if (!target) return;
      if (target.style.display === 'block') {
        target.style.display = 'none';
        btn.textContent = btn.textContent.replace('▾', '▸');
      } else {
        target.style.display = 'block';
        btn.textContent = btn.textContent.replace('▸', '▾');
      }
    });
  });

  await loadEntries();
});

