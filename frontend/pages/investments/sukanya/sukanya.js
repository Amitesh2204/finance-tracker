// sukanya.js - Sukanya Yojana page with PouchDB + CouchDB sync, month/bank/type entry, calendar filter
// NOTE: Requires db.js to be loaded first

document.addEventListener('DOMContentLoaded', async () => {
  const investedCard = document.getElementById('sukanyaTotalInvested');
  const growthCard = document.getElementById('sukanyaTotalGrowth');
  const tableBody = document.querySelector('#sukanyaTable tbody');
  const monthYearFilter = document.getElementById('sukanyaMonthYearFilter');
  const clearFilterBtn = document.getElementById('sukanyaClearFilterBtn');
  const exportBtn = document.getElementById('sukanyaExportBtn');
  const importInput = document.getElementById('sukanyaImportInput');
  const sukanyaInvestmentForm = document.getElementById('sukanyaInvestmentForm');
  const monthInput = document.getElementById('sukanyaMonth');
  const monthWrapper = document.getElementById('sukanyaMonthWrapper');
  const yearWrapper = document.getElementById('sukanyaYearWrapper');
  const profitYearSelect = document.getElementById('sukanyaProfitYear');
  const profitHint = document.getElementById('sukanyaProfitHint');
  const bankSelect = document.getElementById('sukanyaBank');
  const entryTypeSelect = document.getElementById('sukanyaEntryType');
  const amountInput = document.getElementById('sukanyaAmount');

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

  const sukanyaEditId = ensureHiddenInput(sukanyaInvestmentForm, 'sukanyaEntryEditingId');

  // Default the month picker to the current month for convenience.
  if (monthInput && !monthInput.value) {
    monthInput.value = new Date().toISOString().slice(0, 7);
  }

  // Populate the year-only picker used for whole-year Profit entries.
  if (profitYearSelect) {
    const currentYear = new Date().getFullYear();
    const startYear = 2015; // Sukanya Samriddhi Yojana launch year
    const years = [];
    for (let y = currentYear + 1; y >= startYear; y--) years.push(y);
    profitYearSelect.innerHTML = years.map(y => `<option value="${y}">${y}</option>`).join('');
    profitYearSelect.value = String(currentYear);
  }

  // Switch the form between the Month & Year picker (Investment) and the
  // Year-only picker (Profit — recorded once for the whole year).
  function updateEntryTypeUI() {
    const isProfit = entryTypeSelect?.value === 'profit';
    if (monthWrapper) monthWrapper.style.display = isProfit ? 'none' : '';
    if (yearWrapper) yearWrapper.style.display = isProfit ? '' : 'none';
    if (profitHint) profitHint.style.display = isProfit ? '' : 'none';
    if (monthInput) monthInput.required = !isProfit;
    if (profitYearSelect) profitYearSelect.required = isProfit;
  }
  if (entryTypeSelect) {
    entryTypeSelect.addEventListener('change', updateEntryTypeUI);
    updateEntryTypeUI();
  }

  function updateCards() {
    if (investedCard) investedCard.textContent = formatINR(totalInvested);
    if (growthCard) growthCard.textContent = formatINR(totalGrowth);
  }

  function resetFormState() {
    if (sukanyaInvestmentForm) sukanyaInvestmentForm.reset();
    if (monthInput) monthInput.value = new Date().toISOString().slice(0, 7);
    if (bankSelect) bankSelect.value = 'ICICI';
    if (entryTypeSelect) entryTypeSelect.value = 'investment';
    if (profitYearSelect) profitYearSelect.value = String(new Date().getFullYear());
    updateEntryTypeUI();
    if (sukanyaEditId) sukanyaEditId.value = '';
    const submit = sukanyaInvestmentForm?.querySelector('button[type="submit"]');
    if (submit) submit.textContent = 'Add Entry';
  }

  function renderTable(filterMonthYear = '') {
    const keys = Object.keys(monthlyData);
    if (!tableBody) return;
    if (!keys.length) {
      tableBody.innerHTML = '<tr><td colspan="5">No data yet</td></tr>';
      return;
    }

    const filtered = (filterMonthYear
      ? keys.filter(k => monthlyData[k].monthYearValue === filterMonthYear)
      : keys
    ).sort((a, b) => monthlyData[b].sortKey - monthlyData[a].sortKey);

    if (!filtered.length) {
      tableBody.innerHTML = '<tr><td colspan="5">No data for the selected month</td></tr>';
      return;
    }

    tableBody.innerHTML = filtered.map(key => {
      const d = monthlyData[key];
      const invested = d.invested || 0;
      return `<tr>
        <td>${escapeHtml(d.label)}</td>
        <td>Sukanya Yojana</td>
        <td>${escapeHtml(d.bank)}</td>
        <td>${formatINR(invested)}</td>
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
        if (!ids.length || !confirm('Delete this Sukanya entry?')) return;
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
        const isProfit = doc.subtype === 'profit';
        if (amountInput) amountInput.value = doc.amount || '';
        if (bankSelect) bankSelect.value = doc.bank || 'ICICI';
        if (entryTypeSelect) entryTypeSelect.value = isProfit ? 'profit' : 'investment';
        updateEntryTypeUI();
        if (isProfit) {
          if (profitYearSelect) profitYearSelect.value = (rowData.monthYearValue || '').split('-')[0] || String(new Date().getFullYear());
        } else if (monthInput) {
          monthInput.value = rowData.monthYearValue || '';
        }
        if (sukanyaEditId) sukanyaEditId.value = doc._id || '';
        const submit = sukanyaInvestmentForm?.querySelector('button[type="submit"]');
        if (submit) submit.textContent = 'Update Entry';
      });
    });
  }

  // Yearly line graph: cumulative Sukanya investment growth, year over year.
  function renderChart() {
    const canvas = document.getElementById('sukanyaGrowthChart');
    if (!canvas || typeof Chart === 'undefined') return;
    if (window.sukanyaChart && typeof window.sukanyaChart.destroy === 'function') {
      window.sukanyaChart.destroy();
    }

    const currentYear = new Date().getFullYear();
    const dataYears = allEntries
      .map(e => new Date(e.date).getFullYear())
      .filter(y => !Number.isNaN(y));
    const startYear = dataYears.length ? Math.min(...dataYears) : currentYear;
    const endYear = Math.max(currentYear, ...(dataYears.length ? dataYears : [currentYear]));

    const labels = [];
    for (let y = startYear; y <= endYear; y++) labels.push(String(y));

    let runningInvested = 0;
    const investedData = labels.map(y => {
      const yearNum = Number(y);
      const yearInvested = allEntries
        .filter(e => e.subtype !== 'profit' && new Date(e.date).getFullYear() === yearNum)
        .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
      runningInvested += yearInvested;
      return runningInvested;
    });

    let runningProfit = 0;
    const profitData = labels.map(y => {
      const yearNum = Number(y);
      const yearProfit = allEntries
        .filter(e => e.subtype === 'profit' && new Date(e.date).getFullYear() === yearNum)
        .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
      runningProfit += yearProfit;
      return runningProfit;
    });

    const investmentColor = getComputedStyle(document.documentElement).getPropertyValue('--purple').trim() || '#9b59b6';
    // Profit uses the app's positive/growth accent color so it reads as
    // "gains" next to the investment line, consistent with how it's styled
    // on the PPF page.
    const profitColor = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#1abc9c';
    const muted = getComputedStyle(document.documentElement).getPropertyValue('--muted').trim() || '#6d7f79';

    window.sukanyaChart = new Chart(canvas.getContext('2d'), {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Cumulative Sukanya Investment',
            data: investedData,
            borderColor: investmentColor,
            backgroundColor: `${investmentColor}33`,
            fill: true,
            tension: 0.3,
            pointRadius: 4,
            pointBackgroundColor: investmentColor
          },
          {
            label: 'Cumulative Sukanya Profit',
            data: profitData,
            borderColor: profitColor,
            backgroundColor: `${profitColor}33`,
            fill: true,
            tension: 0.3,
            pointRadius: 4,
            pointBackgroundColor: profitColor
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: true, position: 'bottom', labels: { color: muted } },
          tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${formatINR(ctx.parsed.y)}` } }
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
    window.XLSX.utils.book_append_sheet(wb, ws, 'Sukanya');
    window.XLSX.writeFile(wb, 'sukanya-transactions.xlsx');
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
          alert(`Sukanya Excel import failed. ${validation.issues[0]}`);
          return;
        }

        for (const row of validation.validRows) {
          await window.addEntry({
            type: 'saving',
            category: 'Sukanya Yojana',
            subtype: 'investment',
            amount: row.amount,
            currency: 'INR',
            date: row.date,
            bank: String(row.bank || 'N/A'),
            notes: 'Sukanya imported from Excel'
          });
        }
        await loadEntries();
      } catch (err) {
        console.error('Sukanya import failed', err);
        alert('Sukanya Excel import failed. Please verify the file columns match TXN DATE, AMOUNT, and BANK.');
      }
    };
    reader.readAsArrayBuffer(file);
  }

  async function loadEntries() {
    const entries = await window.fetchEntries().catch(() => []);
    allEntries = entries.filter(e => (e.type === 'investment' || e.type === 'saving') && e.category === 'Sukanya Yojana');

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

  // Single consolidated form: the Investment Type selector decides whether
  // this entry counts as an investment or a profit update, replacing the
  // old separate "Update Yearly Profit" form entirely.
  if (sukanyaInvestmentForm) {
    sukanyaInvestmentForm.addEventListener('submit', async e => {
      e.preventDefault();
      const amt = parseFloat(amountInput?.value);
      if (Number.isNaN(amt) || amt <= 0) return;
      const bank = bankSelect?.value || 'ICICI';
      const subtype = entryTypeSelect?.value === 'profit' ? 'profit' : 'investment';

      let dateVal;
      if (subtype === 'profit') {
        const yr = profitYearSelect?.value;
        if (!yr) return;
        dateVal = `${yr}-01-01`;
      } else {
        const monthValue = monthInput?.value; // "YYYY-MM"
        if (!monthValue) return;
        dateVal = `${monthValue}-01`;
      }

      const docId = sukanyaEditId?.value || '';
      const payload = {
        type: 'saving',
        category: 'Sukanya Yojana',
        subtype,
        amount: amt,
        currency: 'INR',
        date: dateVal,
        notes: subtype === 'profit' ? 'Sukanya Yojana yearly profit' : 'Sukanya Yojana investment',
        bank
      };
      if (docId) await window.updateEntry(docId, payload);
      else await window.addEntry(payload);
      resetFormState();
      await loadEntries();
    });
  }

  if (monthYearFilter) monthYearFilter.addEventListener('change', () => renderTable(monthYearFilter.value || ''));
  if (clearFilterBtn) clearFilterBtn.addEventListener('click', () => { if (monthYearFilter) monthYearFilter.value = ''; renderTable(''); });

  await loadEntries();
});
