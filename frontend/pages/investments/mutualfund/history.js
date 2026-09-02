// history.js - Mutual Fund old-data / history sub-page (final fixes)
// - Ensures the Yearly Growth chart shows each year on the x-axis
// - Displays side-by-side bars per year for Total Invested and Total Growth
// - Clarifies yearly-total behavior: yearly total = invested amount only (profit recorded separately)

document.addEventListener('DOMContentLoaded', async () => {
  const boughtEl = document.getElementById('historyTotalBought');
  const soldEl = document.getElementById('historyTotalSold');
  const netEl = document.getElementById('historyNetInvested');
  const growthEl = document.getElementById('historyTotalGrowth');
  const tableBody = document.querySelector('#historyTable tbody');
  const yearFilter = document.getElementById('historyYearFilter');
  const form = document.getElementById('historyForm');
  const exportBtn = document.getElementById('historyExportBtn');
  const importInput = document.getElementById('historyImportInput');
  const cancelEditBtn = document.getElementById('historyCancelEdit');
  const editingIdInput = document.getElementById('historyEditingId');
  const submitBtn = document.getElementById('historySubmitBtn');

  // Elements for custom fund support and yearly controls
  const fundSelect = document.getElementById('historyFund');
  const customFundInput = document.getElementById('customFundInput');
  const yearlyToggle = document.getElementById('historyYearlyToggle');
  const yearInput = document.getElementById('historyYearInput');
  const yearAmountInput = document.getElementById('historyYearAmount');
  const bulkTextarea = document.getElementById('historyYearlyBulk');

  function formatINR(amount) {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(Number(amount) || 0);
  }

  function isMutualFundEntry(e) {
    if (typeof window.isMutualFundEntry === 'function') return window.isMutualFundEntry(e);
    if (!e) return false;
    const type = String(e.type || '').toLowerCase();
    if (type !== 'investment' && type !== 'saving') return false;
    const category = String(e.category || '').toLowerCase();
    const notes = String(e.notes || '').toLowerCase();
    return category === 'mutual fund' || category.includes('mutual') || notes.includes('mutual fund') || notes.includes('mutual');
  }

  // Classify a mutual fund entry as 'buy' | 'sell' | 'profit' | 'yearly-total'
  function classify(e) {
    const notes = String(e.notes || '').toLowerCase();
    if (e.subtype === 'profit' || notes.includes('profit')) return 'profit';
    if (e.subtype === 'sell' || notes.includes(' sell') || notes.includes('sold')) return 'sell';
    if (e.subtype === 'yearly-total' || notes.includes('yearly total') || notes.includes('year total')) return 'yearly-total';
    return 'buy';
  }

  let allEntries = [];

  function renderSummary(entries) {
    let bought = 0, sold = 0, growth = 0;
    entries.forEach(e => {
      const amt = Number(e.amount) || 0;
      const kind = classify(e);
      if (kind === 'profit') growth += amt;
      else if (kind === 'sell') sold += amt;
      else bought += amt; // includes yearly-total treated as invested amount
    });
    if (boughtEl) boughtEl.textContent = formatINR(bought);
    if (soldEl) soldEl.textContent = formatINR(sold);
    if (netEl) netEl.textContent = formatINR(bought - sold);
    if (growthEl) growthEl.textContent = formatINR(growth);
  }

  function populateYearFilter(entries) {
    const years = [...new Set(entries.map(e => {
      const d = new Date(e.date);
      return Number.isNaN(d.getFullYear()) ? null : d.getFullYear();
    }).filter(Boolean))].sort((a, b) => b - a);

    const currentYear = new Date().getFullYear();
    const opts = ['<option value="all">All years</option>']
      .concat(years.map(y => `<option value="${y}">${y}</option>`))
      .join('');
    if (yearFilter) yearFilter.innerHTML = opts;
    if (yearFilter) yearFilter.value = years.includes(currentYear) ? String(currentYear) : 'all';
  }

  function renderTable(entries, selectedYear) {
    let filtered = entries.slice().sort((a, b) => new Date(b.date) - new Date(a.date));
    if (selectedYear && selectedYear !== 'all') {
      filtered = filtered.filter(e => new Date(e.date).getFullYear() === Number(selectedYear));
    }

    if (!tableBody) return;

    if (filtered.length === 0) {
      tableBody.innerHTML = '<tr><td colspan="6">No transactions yet</td></tr>';
      return;
    }

    tableBody.innerHTML = filtered.map(e => {
      const kind = classify(e);
      const label = kind === 'profit' ? 'Profit' : kind === 'sell' ? 'Sell' : kind === 'yearly-total' ? 'Yearly Total' : 'Buy';
      const fund = e.fund || (e.notes && e.notes.split(' —')[0].replace(/\s(buy|sell|profit)$/i, '')) || e.category || 'Mutual Fund';
      const dateStr = new Date(e.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
      return `
        <tr data-id="${e._id || e.id || ''}">
          <td>${dateStr}</td>
          <td>${escapeHtml(String(fund || '—'))}</td>
          <td><span class="tx-type tx-type--${kind === 'yearly-total' ? 'buy' : kind}">${label}</span></td>
          <td>${formatINR(e.amount)}</td>
          <td>${escapeHtml(e.notes || '—')}</td>
          <td>
            <button type="button" class="edit-entry-btn" data-id="${e._id || e.id || ''}">Edit</button>
            <button type="button" class="delete-entry-btn" data-id="${e._id || e.id || ''}">Delete</button>
          </td>
        </tr>`;
    }).join('');

    tableBody.querySelectorAll('.delete-entry-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        if (!id || !confirm('Delete this transaction?')) return;
        try {
          await window.deleteEntry(id);
          await loadAndRender();
        } catch (err) {
          console.error('Failed to delete MF history entry', err);
        }
      });
    });

    tableBody.querySelectorAll('.edit-entry-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        const entry = allEntries.find(item => (item._id || item.id) === id);
        if (!entry) return;
        if (fundSelect) fundSelect.value = entry.fund || 'Other';
        if (customFundInput && fundSelect && fundSelect.value === 'Other') customFundInput.value = entry.fund || '';
        if (yearlyToggle) yearlyToggle.checked = classify(entry) === 'yearly-total';
        if (typeEl) typeEl.value = classify(entry) === 'profit' ? 'profit' : classify(entry) === 'sell' ? 'sell' : 'buy';
        if (amountEl) amountEl.value = entry.amount || '';
        if (dateEl) dateEl.value = new Date(entry.date).toISOString().slice(0, 10);
        if (notesEl) notesEl.value = entry.notes || '';
        if (editingIdInput) editingIdInput.value = id;
        if (cancelEditBtn) cancelEditBtn.style.display = 'inline-block';
        if (submitBtn) submitBtn.textContent = 'Update Entry';
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    });
  }

  function renderYearlyChart(entries) {
    const canvas = document.getElementById('yearlyGrowthChart');
    if (!canvas || typeof Chart === 'undefined') return;

    // Collect years from entries and ensure a continuous range from min(2017, earliest) to current year
    const yearsSet = new Set();
    entries.forEach(e => {
      const y = new Date(e.date).getFullYear();
      if (!Number.isNaN(y)) yearsSet.add(y);
    });
    const yearsArr = Array.from(yearsSet).sort((a, b) => a - b);
    const nowYear = new Date().getFullYear();
    const startYear = Math.min(2017, ...(yearsArr.length ? yearsArr : [nowYear]));
    const endYear = Math.max(nowYear, ...(yearsArr.length ? yearsArr : [nowYear]));
    const labels = [];
    for (let y = startYear; y <= endYear; y++) labels.push(String(y));

    // For each year compute:
    // - investedByYear: sum of buys + yearly-total entries that map to that year
    // - growthByYear: sum of profit entries in that year
    const investedByYear = labels.map(y => {
      const yearNum = Number(y);
      return entries
        .filter(e => new Date(e.date).getFullYear() === yearNum && (classify(e) === 'buy' || classify(e) === 'yearly-total'))
        .reduce((s, e) => s + (Number(e.amount) || 0), 0);
    });

    const growthByYear = labels.map(y => {
      const yearNum = Number(y);
      return entries
        .filter(e => new Date(e.date).getFullYear() === yearNum && classify(e) === 'profit')
        .reduce((s, e) => s + (Number(e.amount) || 0), 0);
    });

    // Ensure labels are shown on x-axis and bars are side-by-side
    const ctx = canvas.getContext('2d');
    if (window.historyYearlyChart && typeof window.historyYearlyChart.destroy === 'function') {
      window.historyYearlyChart.destroy();
    }

    window.historyYearlyChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Total Invested (year)',
            data: investedByYear,
            backgroundColor: '#1abc9c',
            categoryPercentage: 0.6,
            barPercentage: 0.45
          },
          {
            label: 'Total Growth (year)',
            data: growthByYear,
            backgroundColor: '#3498db',
            categoryPercentage: 0.6,
            barPercentage: 0.45
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'top' },
          tooltip: {
            callbacks: {
              label: (ctx) => formatINR(ctx.parsed.y)
            }
          }
        },
        scales: {
          x: {
            stacked: false,
            ticks: {
              autoSkip: false,
              maxRotation: 0,
              minRotation: 0
            }
          },
          y: {
            beginAtZero: true,
            ticks: {
              callback: v => formatINR(v)
            }
          }
        }
      }
    });
  }

  // Utility: escape HTML for table output
  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Load entries from DB and render UI
  async function loadAndRender() {
    if (typeof window.fetchEntries !== 'function') {
      console.error('fetchEntries is not defined');
      return;
    }
    const entries = await window.fetchEntries().catch(() => []);
    // Keep only mutual fund related entries
    allEntries = entries.filter(isMutualFundEntry);

    renderSummary(allEntries);
    populateYearFilter(allEntries);

    const selectedYear = yearFilter ? yearFilter.value : 'all';
    renderTable(allEntries, selectedYear);
    renderYearlyChart(allEntries);
  }

  // Year filter change handler
  if (yearFilter) {
    yearFilter.addEventListener('change', () => {
      renderTable(allEntries, yearFilter.value);
    });
  }

  function exportTransactionsToExcel(entries) {
    if (!window.XLSX) {
      alert('Excel export library is not loaded.');
      return;
    }
    const rows = entries.map(e => ({
      'TXN DATE': new Date(e.date).toISOString().slice(0, 10),
      'SCHEME NAME': e.fund || e.notes || 'Mutual Fund',
      'AMOUNT': Number(e.amount) || 0,
      'BANK': e.bank || e.notes || 'N/A'
    }));
    const ws = window.XLSX.utils.json_to_sheet(rows);
    const wb = window.XLSX.utils.book_new();
    window.XLSX.utils.book_append_sheet(wb, ws, 'Mutual Fund History');
    window.XLSX.writeFile(wb, 'mutual-fund-history.xlsx');
  }

  function importTransactionsFromExcel(file) {
    if (!file || !window.XLSX) return;
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const data = new Uint8Array(evt.target.result);
        const workbook = window.XLSX.read(data, { type: 'array' });
        const ws = workbook.Sheets[workbook.SheetNames[0]];
        const rows = window.XLSX.utils.sheet_to_json(ws, { raw: false, defval: '' });
        for (const row of rows) {
          const dateVal = row['TXN DATE'] || row['Txn Date'] || row['Date'] || row['DATE'];
          const scheme = row['SCHEME NAME'] || row['Scheme Name'] || row['SCHEME'] || row['Fund Name'] || 'Mutual Fund';
          const amount = Number(String(row['AMOUNT'] || row['Amount'] || 0).replace(/[^0-9.-]/g, ''));
          const bank = row['BANK'] || row['Bank'] || 'N/A';
          if (!dateVal || Number.isNaN(amount)) continue;
          const entry = {
            type: 'saving',
            category: 'Mutual Fund',
            subtype: 'investment',
            amount: Math.abs(amount),
            currency: 'INR',
            date: new Date(dateVal).toISOString(),
            fund: String(scheme),
            bank: String(bank),
            notes: `Imported from Excel - ${String(scheme)}`
          };
          await window.addEntry(entry);
        }
        await loadAndRender();
      } catch (err) {
        console.error('Excel import failed', err);
        alert('Excel import failed. Please verify the file columns match TXN DATE, SCHEME NAME, AMOUNT, BANK.');
      }
    };
    reader.readAsArrayBuffer(file);
  }

  if (exportBtn) exportBtn.addEventListener('click', () => exportTransactionsToExcel(allEntries));
  if (importInput) importInput.addEventListener('change', (e) => { const file = e.target.files && e.target.files[0]; if (file) importTransactionsFromExcel(file); e.target.value = ''; });

  // Form submit handler: supports custom fund name, single-year yearly totals, and bulk yearly totals
  if (form) {
    form.addEventListener('submit', async (event) => {
      event.preventDefault();

      // Determine fund name (respect custom fund input if present)
      const fundRaw = fundSelect ? fundSelect.value : '';
      let fundName = fundRaw;
      if (fundRaw === 'Other' && customFundInput) {
        const customVal = (customFundInput.value || '').trim();
        if (!customVal) {
          customFundInput.focus();
          return;
        }
        fundName = customVal;
      }

      // Standard fields
      const typeEl = document.getElementById('historyType');
      const amountEl = document.getElementById('historyAmount');
      const dateEl = document.getElementById('historyDate');
      const notesEl = document.getElementById('historyNotes');

      const type = typeEl ? typeEl.value : 'buy';
      const amount = amountEl ? parseFloat(amountEl.value) : NaN;
      const dateVal = dateEl ? dateEl.value : '';
      const notesInput = notesEl ? notesEl.value.trim() : '';

      // Helper to create and add an entry object via window.addEntry
      async function addEntryObject(entryObj) {
        if (typeof window.addEntry === 'function') {
          await window.addEntry(entryObj);
        } else {
          console.error('addEntry is not defined');
        }
      }

      const editingId = editingIdInput ? editingIdInput.value : '';
      if (editingId) {
        const payload = {
          type: 'saving',
          category: 'Mutual Fund',
          subtype: type === 'sell' ? 'sell' : type === 'profit' ? 'profit' : 'investment',
          amount: Number(amount) || 0,
          currency: 'INR',
          date: new Date(dateVal).toISOString(),
          fund: fundName,
          notes: notesInput || `Mutual Fund ${type}`,
          bank: 'N/A'
        };
        await window.updateEntry(editingId, payload);
        form.reset();
        if (cancelEditBtn) cancelEditBtn.style.display = 'none';
        if (submitBtn) submitBtn.textContent = 'Add Entry';
        if (editingIdInput) editingIdInput.value = '';
        await loadAndRender();
        return;
      }

      // Bulk yearly textarea handling
      if (bulkTextarea && bulkTextarea.value && bulkTextarea.value.trim()) {
        const lines = bulkTextarea.value.split('\n').map(l => l.trim()).filter(Boolean);
        const parsed = [];
        for (const line of lines) {
          const m = line.match(/^(\d{4})\s*[:\-]?\s*([\d,.\s]+)$/);
          if (!m) continue;
          const yr = Number(m[1]);
          const amtStr = m[2].replace(/,/g, '').trim();
          const amt = parseFloat(amtStr);
          if (Number.isNaN(yr) || Number.isNaN(amt)) continue;
          parsed.push({ year: yr, amount: amt });
        }

        if (!parsed.length) {
          bulkTextarea.focus();
          return;
        }

        for (const p of parsed) {
          const entry = {
            type: 'saving',
            category: 'Mutual Fund',
            subtype: 'yearly-total',
            amount: p.amount,
            currency: 'INR',
            date: new Date(p.year, 0, 1).toISOString(),
            fund: `Yearly Total (${p.year})`,
            notes: `Yearly total for ${p.year}`
          };
          await addEntryObject(entry);
        }

        form.reset();
        if (customFundInput) customFundInput.value = '';
        if (bulkTextarea) bulkTextarea.value = '';
        await loadAndRender();
        return;
      }

      // Single-year yearly total handling
      if (yearlyToggle && yearlyToggle.checked) {
        const yr = yearInput ? Number(yearInput.value) : NaN;
        const yrAmt = yearAmountInput ? parseFloat(yearAmountInput.value) : NaN;
        if (Number.isNaN(yr) || Number.isNaN(yrAmt) || yr <= 0) {
          if (yearInput) yearInput.focus();
          return;
        }
        const entry = {
          type: 'saving',
          category: 'Mutual Fund',
          subtype: 'yearly-total',
          amount: yrAmt,
          currency: 'INR',
          date: new Date(yr, 0, 1).toISOString(),
          fund: `Yearly Total (${yr})`,
          notes: `Yearly total for ${yr}`
        };
        await addEntryObject(entry);
        form.reset();
        if (customFundInput) customFundInput.value = '';
        await loadAndRender();
        return;
      }

      // Otherwise, normal dated transaction
      if (Number.isNaN(amount) || amount <= 0 || !dateVal) {
        if (amountEl) amountEl.focus();
        return;
      }

      const subtype = type === 'sell' ? 'sell' : type === 'profit' ? 'profit' : 'investment';
      const actionLabel = type === 'sell' ? 'sell' : type === 'profit' ? 'profit' : 'buy';
      const notes = `${fundName} ${actionLabel}${notesInput ? ' — ' + notesInput : ''}`;

      const entry = {
        type: 'saving',
        category: 'Mutual Fund',
        subtype,
        amount,
        currency: 'INR',
        date: new Date(dateVal).toISOString(),
        fund: fundName,
        notes
      };

      await addEntryObject(entry);
      form.reset();
      if (customFundInput) customFundInput.value = '';
      await loadAndRender();
    });
  }

  // Show/hide custom fund input when user selects "Other"
  if (fundSelect && customFundInput) {
    const customWrapper = document.getElementById('customFundWrapper');
    fundSelect.addEventListener('change', () => {
      if (fundSelect.value === 'Other') {
        if (customWrapper) customWrapper.style.display = 'block';
        customFundInput.focus();
      } else {
        if (customWrapper) customWrapper.style.display = 'none';
        customFundInput.value = '';
      }
    });
    if (fundSelect.value === 'Other' && customFundInput) {
      const customWrapperEl = document.getElementById('customFundWrapper');
      if (customWrapperEl) customWrapperEl.style.display = 'block';
    }
  }

  // Initial load
  await loadAndRender();
});
