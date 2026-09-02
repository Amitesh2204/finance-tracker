// lic.js - LIC page with PouchDB + CouchDB sync and month-year filter
// NOTE: Requires db.js to be loaded first (finance-tracker/backend/database/js/db.js)

document.addEventListener('DOMContentLoaded', async () => {
  const investedCard = document.getElementById('licTotalInvested');
  const growthCard = document.getElementById('licTotalGrowth');
  const tableBody = document.querySelector('#licTable tbody');
  const monthYearSelect = document.getElementById('licMonthYearSelect');
  const yearSelect = document.getElementById('licYearSelect');
  const policyMonthYearSelect = document.getElementById('policyMonthYearSelect');
  const exportBtn = document.getElementById('licExportBtn');
  const importInput = document.getElementById('licImportInput');
  const licInvestmentForm = document.getElementById('licInvestmentForm');
  const licProfitForm = document.getElementById('licProfitForm');

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
  const licProfitEditId = ensureHiddenInput(licProfitForm, 'licProfitEditingId');

  function updateCards() {
    if (investedCard) investedCard.textContent = formatINR(totalInvested);
    if (growthCard) growthCard.textContent = formatINR(totalGrowth);
  }

  function populateMonthYearDropdown() {
    const months = Object.keys(monthlyData);
    if (!monthYearSelect) return;
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
    if (!tableBody) return;
    if (months.length === 0) {
      tableBody.innerHTML = '<tr><td colspan="6">No data yet</td></tr>';
      return;
    }
    const filtered = selectedMonthYear ? [selectedMonthYear] : months;
    tableBody.innerHTML = filtered.map(m => {
      const d = monthlyData[m];
      const invested = d.invested || 0;
      const profit = d.profit || 0;
      const growthPct = invested > 0 ? ((profit / invested) * 100).toFixed(2) : '0.00';
      return `<tr>
        <td>${m}</td>
        <td>LIC</td>
        <td>${formatINR(invested)}</td>
        <td>${formatINR(profit)}</td>
        <td>${growthPct}%</td>
        <td>
          <button type="button" class="edit-entry-btn" data-id="${m}">Edit</button>
          <button type="button" class="delete-entry-btn" data-id="${m}">Delete</button>
        </td>
      </tr>`;
    }).join('');

    tableBody.querySelectorAll('.delete-entry-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const key = btn.dataset.id;
        const doc = allEntries.find(e => `${new Date(e.date).toLocaleString('default', { month: 'short' })}-${new Date(e.date).getFullYear()}` === key);
        if (!doc || !confirm('Delete this LIC entry?')) return;
        await window.deleteEntry(doc._id);
        await loadEntries();
      });
    });

    tableBody.querySelectorAll('.edit-entry-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.id;
        const doc = allEntries.find(e => `${new Date(e.date).toLocaleString('default', { month: 'short' })}-${new Date(e.date).getFullYear()}` === key);
        if (!doc) return;
        if (doc.subtype === 'profit') {
          const field = document.getElementById('licProfitAmount');
          if (field) field.value = doc.amount || '';
          if (licProfitEditId) licProfitEditId.value = doc._id || '';
          const submit = licProfitForm?.querySelector('button[type="submit"]');
          if (submit) submit.textContent = 'Update Profit';
        } else {
          const policyField = document.getElementById('policyName');
          if (policyField) policyField.value = getPolicyName(doc);
          const amountField = document.getElementById('licAmount');
          if (amountField) amountField.value = doc.amount || '';
          if (licInvestmentEditId) licInvestmentEditId.value = doc._id || '';
          const submit = licInvestmentForm?.querySelector('button[type="submit"]');
          if (submit) submit.textContent = 'Update Investment';
        }
      });
    });
  }

  function renderChart(selectedYear = '2026') {
    const canvas = document.getElementById('licGrowthChart');
    if (!canvas || typeof Chart === 'undefined') return;
    const ctx = canvas.getContext('2d');
    if (window.licChart && typeof window.licChart.destroy === 'function') {
      window.licChart.destroy();
    }
    const months = ['Jul','Aug','Sep','Oct','Nov','Dec','Jan','Feb','Mar','Apr','May','Jun'];
    const investedData = months.map(m => {
      const key = `${m}-${selectedYear}`;
      return monthlyData[key]?.invested || 0;
    });
    window.licChart = new Chart(ctx, {
      type: 'bar',
      data: { labels: months, datasets: [{ label: 'Invested', data: investedData, backgroundColor: '#3498db' }] },
      options: { responsive: true, scales: { y: { beginAtZero: true } } }
    });
  }

  function populateLicYearDropdown(entries) {
    if (!yearSelect) return;
    const years = [...new Set(entries.map(e => new Date(e.date).getFullYear()))].filter(Boolean).sort((a, b) => a - b);
    yearSelect.innerHTML = '';
    if (years.length === 0) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = 'No data';
      yearSelect.appendChild(opt);
      return;
    }
    years.forEach(y => {
      const opt = document.createElement('option');
      opt.value = String(y);
      opt.textContent = String(y);
      yearSelect.appendChild(opt);
    });
    yearSelect.value = String(new Date().getFullYear());
    yearSelect.onchange = () => renderChart(yearSelect.value || new Date().getFullYear());
  }

  function updatePolicies(entries) {
    const policyValues = { 'Jeevan Lakshya': 0, 'New Jeevan Labh': 0 };
    entries.forEach(e => {
      if (e.category !== 'LIC') return;
      const notes = String(e.notes || '');
      if (notes.includes('Jeevan Lakshya')) policyValues['Jeevan Lakshya'] += Number(e.amount) || 0;
      if (notes.includes('New Jeevan Labh')) policyValues['New Jeevan Labh'] += Number(e.amount) || 0;
    });
    Object.keys(policyValues).forEach(key => {
      const span = document.querySelector(`.policy-value[data-policy="${key}"]`);
      if (span) span.textContent = policyValues[key] > 0 ? formatINR(policyValues[key]) : '₹0.00';
    });
  }

  function populatePolicyMonthYear(entries) {
    if (!policyMonthYearSelect) return;
    const months = [...new Set(entries.map(e => {
      const d = new Date(e.date);
      return `${d.toLocaleString('default', { month: 'short' })}-${d.getFullYear()}`;
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
    policyMonthYearSelect.onchange = () => renderPolicyChart(entries, policyMonthYearSelect.value || null);
  }

  function renderPolicyChart(entries, selectedMonthYear = null) {
    const canvas = document.getElementById('policyChart');
    if (!canvas || typeof Chart === 'undefined') return;
    const ctx = canvas.getContext('2d');
    if (window.policyChart && typeof window.policyChart.destroy === 'function') {
      window.policyChart.destroy();
    }
    const filtered = selectedMonthYear ? entries.filter(e => {
      const d = new Date(e.date);
      return `${d.toLocaleString('default', { month: 'short' })}-${d.getFullYear()}` === selectedMonthYear;
    }) : entries;
    const categories = { 'Jeevan Lakshya': 0, 'New Jeevan Labh': 0 };
    filtered.forEach(e => {
      if (e.category !== 'LIC') return;
      const notes = String(e.notes || '');
      if (notes.includes('Jeevan Lakshya')) categories['Jeevan Lakshya'] += Number(e.amount) || 0;
      if (notes.includes('New Jeevan Labh')) categories['New Jeevan Labh'] += Number(e.amount) || 0;
    });
    window.policyChart = new Chart(ctx, {
      type: 'bar',
      data: { labels: Object.keys(categories), datasets: [{ label: 'Invested', data: Object.values(categories), backgroundColor: '#3498db' }] },
      options: { responsive: true, scales: { y: { beginAtZero: true } } }
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
      monthlyData[key] = monthlyData[key] || { invested: 0, profit: 0 };
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
    renderTable(monthYearSelect?.value || null);
    populateLicYearDropdown(allEntries);
    renderChart(yearSelect?.value || new Date().getFullYear());
    updatePolicies(allEntries);
    populatePolicyMonthYear(allEntries);
    renderPolicyChart(allEntries, policyMonthYearSelect?.value || null);
  }

  if (exportBtn) exportBtn.addEventListener('click', () => exportEntries(allEntries));
  if (importInput) importInput.addEventListener('change', e => { const file = e.target.files && e.target.files[0]; if (file) importEntries(file); e.target.value = ''; });

  if (licInvestmentForm) {
    licInvestmentForm.addEventListener('submit', async e => {
      e.preventDefault();
      const amt = parseFloat(document.getElementById('licAmount').value);
      if (Number.isNaN(amt) || amt <= 0) return;
      const policyName = document.getElementById('policyName').value || 'Jeevan Lakshya';
      const docId = licInvestmentEditId?.value || '';
      const payload = {
        type: 'saving',
        category: 'LIC',
        subtype: 'investment',
        amount: amt,
        currency: 'INR',
        date: new Date().toISOString(),
        notes: `${policyName} LIC investment`,
        bank: 'N/A'
      };
      if (docId) await window.updateEntry(docId, payload);
      else await window.addEntry(payload);
      e.target.reset();
      if (licInvestmentEditId) licInvestmentEditId.value = '';
      const submit = licInvestmentForm.querySelector('button[type="submit"]');
      if (submit) submit.textContent = 'Add Investment';
      await loadEntries();
    });
  }

  if (licProfitForm) {
    licProfitForm.addEventListener('submit', async e => {
      e.preventDefault();
      const amt = parseFloat(document.getElementById('licProfitAmount').value);
      if (Number.isNaN(amt) || amt <= 0) return;
      const docId = licProfitEditId?.value || '';
      const payload = {
        type: 'saving',
        category: 'LIC',
        subtype: 'profit',
        amount: amt,
        currency: 'INR',
        date: new Date().toISOString(),
        notes: 'LIC yearly profit',
        bank: 'N/A'
      };
      if (docId) await window.updateEntry(docId, payload);
      else await window.addEntry(payload);
      e.target.reset();
      if (licProfitEditId) licProfitEditId.value = '';
      const submit = licProfitForm.querySelector('button[type="submit"]');
      if (submit) submit.textContent = 'Add Profit';
      await loadEntries();
    });
  }

  if (monthYearSelect) monthYearSelect.addEventListener('change', () => renderTable(monthYearSelect.value || null));

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

