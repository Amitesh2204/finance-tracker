// ppf.js - PPF page with PouchDB + CouchDB sync and month-year filter
// NOTE: Requires db.js to be loaded first (finance-tracker/backend/database/js/db.js)

document.addEventListener('DOMContentLoaded', async () => {
  const investedCard = document.getElementById('ppfTotalInvested');
  const growthCard = document.getElementById('ppfTotalGrowth');
  const tableBody = document.querySelector('#ppfTable tbody');
  const monthYearSelect = document.getElementById('ppfMonthYearSelect');
  const yearSelect = document.getElementById('ppfYearSelect');
  const exportBtn = document.getElementById('ppfExportBtn');
  const importInput = document.getElementById('ppfImportInput');
  const ppfInvestmentForm = document.getElementById('ppfInvestmentForm');
  const ppfProfitForm = document.getElementById('ppfProfitForm');

  let totalInvested = 0;
  let totalGrowth = 0;
  let monthlyData = {};
  let allEntries = [];

  function formatINR(amount) {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(amount || 0);
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

  const ppfInvestmentEditId = ensureHiddenInput(ppfInvestmentForm, 'ppfInvestmentEditingId');
  const ppfProfitEditId = ensureHiddenInput(ppfProfitForm, 'ppfProfitEditingId');

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
        <td>PPF</td>
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
        if (!doc || !confirm('Delete this PPF entry?')) return;
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
          const field = document.getElementById('ppfProfitAmount');
          if (field) field.value = doc.amount || '';
          if (ppfProfitEditId) ppfProfitEditId.value = doc._id || '';
          const submit = ppfProfitForm?.querySelector('button[type="submit"]');
          if (submit) submit.textContent = 'Update Profit';
        } else {
          const field = document.getElementById('ppfAmount');
          if (field) field.value = doc.amount || '';
          if (ppfInvestmentEditId) ppfInvestmentEditId.value = doc._id || '';
          const submit = ppfInvestmentForm?.querySelector('button[type="submit"]');
          if (submit) submit.textContent = 'Update Investment';
        }
      });
    });
  }

  function renderChart(selectedYear) {
    const canvas = document.getElementById('ppfGrowthChart');
    if (!canvas || typeof Chart === 'undefined') return;
    const ctx = canvas.getContext('2d');
    if (window.ppfChart && typeof window.ppfChart.destroy === 'function') {
      window.ppfChart.destroy();
    }
    const months = ['Jul','Aug','Sep','Oct','Nov','Dec','Jan','Feb','Mar','Apr','May','Jun'];
    const investedData = months.map(m => {
      const key = `${m}-${selectedYear}`;
      return monthlyData[key]?.invested || 0;
    });
    window.ppfChart = new Chart(ctx, {
      type: 'bar',
      data: { labels: months, datasets: [{ label: 'Invested', data: investedData, backgroundColor: '#e67e22' }] },
      options: { responsive: true, scales: { y: { beginAtZero: true } } }
    });
  }

  function populatePpfYearDropdown(entries) {
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
    window.XLSX.utils.book_append_sheet(wb, ws, 'PPF');
    window.XLSX.writeFile(wb, 'ppf-transactions.xlsx');
  }

  function importEntries(file) {
    if (!file || !window.XLSX) return;
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const wb = window.XLSX.read(new Uint8Array(evt.target.result), { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = window.XLSX.utils.sheet_to_json(ws, { raw: false, defval: '' });
        for (const row of rows) {
          const dateVal = row['TXN DATE'] || row['Txn Date'] || row['DATE'] || row['Date'];
          const amount = Number(String(row['AMOUNT'] || row['Amount'] || 0).replace(/[^0-9.-]/g, ''));
          if (!dateVal || Number.isNaN(amount)) continue;
          await window.addEntry({
            type: 'saving',
            category: 'PPF',
            subtype: 'investment',
            amount: Math.abs(amount),
            currency: 'INR',
            date: new Date(dateVal).toISOString(),
            bank: String(row['BANK'] || row['Bank'] || 'N/A'),
            notes: 'PPF imported from Excel'
          });
        }
        await loadEntries();
      } catch (err) {
        console.error('PPF import failed', err);
        alert('Excel import failed. Please use columns TXN DATE, AMOUNT, BANK.');
      }
    };
    reader.readAsArrayBuffer(file);
  }

  async function loadEntries() {
    const entries = await window.fetchEntries().catch(() => []);
    allEntries = entries.filter(e => (e.type === 'investment' || e.type === 'saving') && e.category === 'PPF');

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
    populatePpfYearDropdown(allEntries);
    renderChart(yearSelect?.value || new Date().getFullYear());
  }

  if (exportBtn) exportBtn.addEventListener('click', () => exportEntries(allEntries));
  if (importInput) importInput.addEventListener('change', e => { const file = e.target.files && e.target.files[0]; if (file) importEntries(file); e.target.value = ''; });

  if (ppfInvestmentForm) {
    ppfInvestmentForm.addEventListener('submit', async e => {
      e.preventDefault();
      const amt = parseFloat(document.getElementById('ppfAmount').value);
      if (Number.isNaN(amt) || amt <= 0) return;
      const docId = ppfInvestmentEditId?.value || '';
      const payload = {
        type: 'saving',
        category: 'PPF',
        subtype: 'investment',
        amount: amt,
        currency: 'INR',
        date: new Date().toISOString(),
        notes: 'PPF investment',
        bank: 'N/A'
      };
      if (docId) await window.updateEntry(docId, payload);
      else await window.addEntry(payload);
      e.target.reset();
      if (ppfInvestmentEditId) ppfInvestmentEditId.value = '';
      const submit = ppfInvestmentForm.querySelector('button[type="submit"]');
      if (submit) submit.textContent = 'Add Investment';
      await loadEntries();
    });
  }

  if (ppfProfitForm) {
    ppfProfitForm.addEventListener('submit', async e => {
      e.preventDefault();
      const amt = parseFloat(document.getElementById('ppfProfitAmount').value);
      if (Number.isNaN(amt) || amt <= 0) return;
      const docId = ppfProfitEditId?.value || '';
      const payload = {
        type: 'saving',
        category: 'PPF',
        subtype: 'profit',
        amount: amt,
        currency: 'INR',
        date: new Date().toISOString(),
        notes: 'PPF yearly profit',
        bank: 'N/A'
      };
      if (docId) await window.updateEntry(docId, payload);
      else await window.addEntry(payload);
      e.target.reset();
      if (ppfProfitEditId) ppfProfitEditId.value = '';
      const submit = ppfProfitForm.querySelector('button[type="submit"]');
      if (submit) submit.textContent = 'Add Profit';
      await loadEntries();
    });
  }

  if (monthYearSelect) monthYearSelect.addEventListener('change', () => renderTable(monthYearSelect.value || null));

  await loadEntries();
});
