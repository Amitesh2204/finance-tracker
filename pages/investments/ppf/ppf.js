// ppf.js - PPF page with PouchDB + CouchDB sync, month/bank entry, and calendar filter
// NOTE: Requires db.js to be loaded first (finance-tracker/backend/database/js/db.js)

document.addEventListener('DOMContentLoaded', async () => {
  const investedCard = document.getElementById('ppfTotalInvested');
  const growthCard = document.getElementById('ppfTotalGrowth');
  const tableBody = document.querySelector('#ppfTable tbody');
  const monthYearFilter = document.getElementById('ppfMonthYearFilter');
  const clearFilterBtn = document.getElementById('ppfClearFilterBtn');
  const exportBtn = document.getElementById('ppfExportBtn');
  const importInput = document.getElementById('ppfImportInput');
  const ppfInvestmentForm = document.getElementById('ppfInvestmentForm');
  const investmentMonthInput = document.getElementById('ppfInvestmentMonth');
  const bankSelect = document.getElementById('ppfBank');
  const amountInput = document.getElementById('ppfAmount');

  let totalInvested = 0;
  let totalGrowth = 0;
  let monthlyData = {};
  let allEntries = [];

  function formatINR(amount) {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(amount || 0);
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, (ch) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[ch]));
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

  // Default the month picker to the current month for convenience.
  if (investmentMonthInput && !investmentMonthInput.value) {
    investmentMonthInput.value = new Date().toISOString().slice(0, 7);
  }

  function updateCards() {
    if (investedCard) investedCard.textContent = formatINR(totalInvested);
    if (growthCard) growthCard.textContent = formatINR(totalGrowth);
  }

  function resetInvestmentFormState() {
    if (ppfInvestmentForm) ppfInvestmentForm.reset();
    if (investmentMonthInput) investmentMonthInput.value = new Date().toISOString().slice(0, 7);
    if (bankSelect) bankSelect.value = 'ICICI';
    if (ppfInvestmentEditId) ppfInvestmentEditId.value = '';
    const submit = ppfInvestmentForm?.querySelector('button[type="submit"]');
    if (submit) submit.textContent = 'Add Investment';
  }

  function renderTable(filterMonthYear = '') {
    const keys = Object.keys(monthlyData);
    if (!tableBody) return;
    if (!keys.length) {
      tableBody.innerHTML = '<tr><td colspan="7">No data yet</td></tr>';
      return;
    }

    const filtered = (filterMonthYear
      ? keys.filter(k => monthlyData[k].monthYearValue === filterMonthYear)
      : keys
    ).sort((a, b) => monthlyData[b].sortKey - monthlyData[a].sortKey);

    if (!filtered.length) {
      tableBody.innerHTML = '<tr><td colspan="7">No data for the selected month</td></tr>';
      return;
    }

    tableBody.innerHTML = filtered.map(key => {
      const d = monthlyData[key];
      const invested = d.invested || 0;
      const profit = d.profit || 0;
      const growthPct = invested > 0 ? ((profit / invested) * 100).toFixed(2) : '0.00';
      return `<tr>
        <td>${escapeHtml(d.label)}</td>
        <td>PPF</td>
        <td>${escapeHtml(d.bank)}</td>
        <td>${formatINR(invested)}</td>
        <td>${formatINR(profit)}</td>
        <td>${growthPct}%</td>
        <td>
          <button type="button" class="edit-entry-btn" data-key="${escapeHtml(key)}">Edit</button>
          <button type="button" class="delete-entry-btn" data-key="${escapeHtml(key)}">Delete</button>
        </td>
      </tr>`;
    }).join('');

    tableBody.querySelectorAll('.delete-entry-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const key = btn.dataset.key;
        const ids = monthlyData[key]?.ids || [];
        if (!ids.length || !confirm('Delete this PPF entry?')) return;
        await window.deleteEntry(ids[0]);
        await loadEntries();
      });
    });

    tableBody.querySelectorAll('.edit-entry-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.key;
        const rowData = monthlyData[key];
        const docId = rowData?.ids?.[0];
        const doc = docId ? allEntries.find(e => e._id === docId) : null;
        if (!doc) return;
        if (amountInput) amountInput.value = doc.amount || '';
        if (bankSelect) bankSelect.value = doc.bank || 'ICICI';
        if (investmentMonthInput) investmentMonthInput.value = rowData.monthYearValue || '';
        if (ppfInvestmentEditId) ppfInvestmentEditId.value = doc._id || '';
        const submit = ppfInvestmentForm?.querySelector('button[type="submit"]');
        if (submit) submit.textContent = 'Update Investment';
      });
    });
  }

  // Yearly line graph: cumulative PPF investment growth, year over year.
  function renderChart() {
    const canvas = document.getElementById('ppfGrowthChart');
    if (!canvas || typeof Chart === 'undefined') return;
    if (window.ppfChart && typeof window.ppfChart.destroy === 'function') {
      window.ppfChart.destroy();
    }

    const currentYear = new Date().getFullYear();
    const dataYears = allEntries
      .map(e => new Date(e.date).getFullYear())
      .filter(y => !Number.isNaN(y));
    const startYear = dataYears.length ? Math.min(...dataYears) : currentYear;
    const endYear = Math.max(currentYear, ...(dataYears.length ? dataYears : [currentYear]));

    const labels = [];
    for (let y = startYear; y <= endYear; y++) labels.push(String(y));

    let running = 0;
    const data = labels.map(y => {
      const yearNum = Number(y);
      const yearInvested = allEntries
        .filter(e => e.subtype !== 'profit' && new Date(e.date).getFullYear() === yearNum)
        .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
      running += yearInvested;
      return running;
    });

    const accent = getComputedStyle(document.documentElement).getPropertyValue('--warning').trim() || '#e67e22';
    const muted = getComputedStyle(document.documentElement).getPropertyValue('--muted').trim() || '#6d7f79';

    window.ppfChart = new Chart(canvas.getContext('2d'), {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'Cumulative PPF Investment',
          data,
          borderColor: accent,
          backgroundColor: `${accent}33`,
          fill: true,
          tension: 0.3,
          pointRadius: 4,
          pointBackgroundColor: accent
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: true, position: 'bottom', labels: { color: muted } },
          tooltip: { callbacks: { label: ctx => formatINR(ctx.parsed.y) } }
        },
        scales: {
          x: { ticks: { color: muted } },
          y: { beginAtZero: true, ticks: { color: muted, callback: v => formatINR(v) } }
        }
      }
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
        const validation = window.validateExcelImportRows(rows, {
          dateAliases: ['TXN DATE', 'Txn Date', 'DATE', 'Date'],
          amountAliases: ['AMOUNT', 'Amount', 'Policy Amount', 'POLICY AMOUNT'],
          bankAliases: ['BANK', 'Bank']
        });

        if (validation.issues.length > 0) {
          alert(`PPF Excel import failed. ${validation.issues[0]}`);
          return;
        }

        for (const row of validation.validRows) {
          await window.addEntry({
            type: 'saving',
            category: 'PPF',
            subtype: 'investment',
            amount: row.amount,
            currency: 'INR',
            date: row.date,
            bank: String(row.bank || 'N/A'),
            notes: 'PPF imported from Excel'
          });
        }
        await loadEntries();
      } catch (err) {
        console.error('PPF import failed', err);
        alert('PPF Excel import failed. Please verify the file columns match TXN DATE, AMOUNT, and BANK.');
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
      if (Number.isNaN(d.getTime())) return;
      const bank = e.bank || 'N/A';
      const monthYearValue = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = `${d.toLocaleString('default', { month: 'short' })}-${d.getFullYear()}`;
      // Keyed by month + bank so each bank's contribution for a month shows
      // as its own row, per the new Bank column.
      const key = `${monthYearValue}::${bank}`;
      if (!monthlyData[key]) {
        monthlyData[key] = {
          invested: 0,
          profit: 0,
          bank,
          label,
          monthYearValue,
          sortKey: d.getFullYear() * 12 + d.getMonth(),
          ids: []
        };
      }
      monthlyData[key].ids.push(e._id);
      if (e.subtype === 'profit') {
        // Historical profit entries (from before the profit form was
        // removed) still count toward totals so past data isn't lost.
        monthlyData[key].profit += Number(e.amount) || 0;
        totalGrowth += Number(e.amount) || 0;
      } else {
        monthlyData[key].invested += Number(e.amount) || 0;
        totalInvested += Number(e.amount) || 0;
      }
    });

    updateCards();
    renderTable(monthYearFilter?.value || '');
    renderChart();
  }

  if (exportBtn) exportBtn.addEventListener('click', () => exportEntries(allEntries));
  if (importInput) importInput.addEventListener('change', e => { const file = e.target.files && e.target.files[0]; if (file) importEntries(file); e.target.value = ''; });

  if (ppfInvestmentForm) {
    ppfInvestmentForm.addEventListener('submit', async e => {
      e.preventDefault();
      const amt = parseFloat(amountInput?.value);
      if (Number.isNaN(amt) || amt <= 0) return;
      const monthValue = investmentMonthInput?.value; // "YYYY-MM"
      if (!monthValue) return;
      const bank = bankSelect?.value || 'ICICI';
      const docId = ppfInvestmentEditId?.value || '';
      const payload = {
        type: 'saving',
        category: 'PPF',
        subtype: 'investment',
        amount: amt,
        currency: 'INR',
        date: `${monthValue}-01`,
        notes: 'PPF investment',
        bank
      };
      if (docId) await window.updateEntry(docId, payload);
      else await window.addEntry(payload);
      resetInvestmentFormState();
      await loadEntries();
    });
  }

  if (monthYearFilter) monthYearFilter.addEventListener('change', () => renderTable(monthYearFilter.value || ''));
  if (clearFilterBtn) clearFilterBtn.addEventListener('click', () => { if (monthYearFilter) monthYearFilter.value = ''; renderTable(''); });

  await loadEntries();
});
