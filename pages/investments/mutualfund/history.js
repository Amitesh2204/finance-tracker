// history.js - Mutual Fund old-data / history sub-page (updated to support yearly totals)
// Requires db.js + app.js to be loaded first (exposes window.fetchEntries / window.addEntry)

document.addEventListener('DOMContentLoaded', async () => {
  const boughtEl = document.getElementById('historyTotalBought');
  const soldEl = document.getElementById('historyTotalSold');
  const netEl = document.getElementById('historyNetInvested');
  const growthEl = document.getElementById('historyTotalGrowth');
  const tableBody = document.querySelector('#historyTable tbody');
  const yearFilter = document.getElementById('historyYearFilter');
  const form = document.getElementById('historyForm');

  // Elements for custom fund support (may be present in HTML)
  const fundSelect = document.getElementById('historyFund');
  const customFundInput = document.getElementById('customFundInput');

  // We'll inject yearly-total UI controls into the form if they are not present.
  // This keeps the HTML backward-compatible while adding the requested feature.
  (function ensureYearlyControls() {
    if (!form) return;
    // Avoid injecting twice
    if (document.getElementById('yearlyControlsInjected')) return;

    const marker = document.createElement('div');
    marker.id = 'yearlyControlsInjected';
    marker.style.display = 'none';
    form.appendChild(marker);

    // Container for yearly controls
    const wrapper = document.createElement('div');
    wrapper.className = 'yearly-controls';

    // Single-year toggle
    const singleLabel = document.createElement('label');
    singleLabel.textContent = 'Add as Yearly Total (single year)';
    singleLabel.style.fontWeight = '600';
    singleLabel.style.marginTop = '6px';

    const singleBlock = document.createElement('div');
    singleBlock.className = 'yearly-block';
    singleBlock.style.marginTop = '6px';

    const yearInput = document.createElement('input');
    yearInput.type = 'number';
    yearInput.id = 'historyYearInput';
    yearInput.min = 1900;
    yearInput.max = 3000;
    yearInput.placeholder = 'Year (e.g., 2017)';
    yearInput.title = 'Year for yearly total (e.g., 2017)';
    yearInput.style.width = '120px';

    const yearAmountInput = document.createElement('input');
    yearAmountInput.type = 'number';
    yearAmountInput.id = 'historyYearAmount';
    yearAmountInput.min = 0;
    yearAmountInput.step = '0.01';
    yearAmountInput.placeholder = 'Yearly total amount';
    yearAmountInput.title = 'Amount for the selected year';
    yearAmountInput.style.width = '160px';

    const yearToggle = document.createElement('input');
    yearToggle.type = 'checkbox';
    yearToggle.id = 'historyYearlyToggle';
    yearToggle.title = 'Check to submit this entry as a yearly total instead of a dated transaction';

    const yearToggleLabel = document.createElement('label');
    yearToggleLabel.htmlFor = 'historyYearlyToggle';
    yearToggleLabel.textContent = 'Use yearly total';
    yearToggleLabel.style.marginLeft = '6px';

    singleBlock.appendChild(yearToggle);
    singleBlock.appendChild(yearToggleLabel);
    singleBlock.appendChild(yearInput);
    singleBlock.appendChild(yearAmountInput);

    // Bulk multi-year textarea
    const bulkLabel = document.createElement('label');
    bulkLabel.textContent = 'Or paste multiple yearly totals (one per line: YEAR:AMOUNT)';
    bulkLabel.style.marginTop = '8px';
    bulkLabel.style.fontWeight = '600';

    const bulkTextarea = document.createElement('textarea');
    bulkTextarea.id = 'historyYearlyBulk';
    bulkTextarea.placeholder = '2017:40000\n2018:45000\n2019:38000';
    bulkTextarea.className = 'investment-form';
    bulkTextarea.style.marginTop = '6px';

    const bulkNote = document.createElement('div');
    bulkNote.className = 'yearly-bulk';
    bulkNote.textContent = 'Tip: Use format YEAR:AMOUNT per line. Currency and commas are optional.';

    wrapper.appendChild(singleLabel);
    wrapper.appendChild(singleBlock);
    wrapper.appendChild(bulkLabel);
    wrapper.appendChild(bulkTextarea);
    wrapper.appendChild(bulkNote);

    // Insert wrapper before the submit button (if present) or at the end of the form
    const submitBtn = form.querySelector('button[type="submit"]');
    if (submitBtn && submitBtn.parentNode) {
      submitBtn.parentNode.insertBefore(wrapper, submitBtn);
    } else {
      form.appendChild(wrapper);
    }
  })();

  function formatINR(amount) {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(Number(amount) || 0);
  }

  function isMutualFundEntry(e) {
    if (typeof window.isMutualFundEntry === 'function') return window.isMutualFundEntry(e);
    if (!e || e.type !== 'investment') return false;
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
      else bought += amt; // includes yearly-total treated as buy
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
    // Build options
    const opts = ['<option value="all">All years</option>']
      .concat(years.map(y => `<option value="${y}">${y}</option>`))
      .join('');
    if (yearFilter) yearFilter.innerHTML = opts;
    // Default to current year if present, otherwise 'all'
    if (yearFilter) yearFilter.value = years.includes(currentYear) ? String(currentYear) : 'all';
  }

  function renderTable(entries, selectedYear) {
    let filtered = entries.slice().sort((a, b) => new Date(b.date) - new Date(a.date));
    if (selectedYear && selectedYear !== 'all') {
      filtered = filtered.filter(e => new Date(e.date).getFullYear() === Number(selectedYear));
    }

    if (!tableBody) return;

    if (filtered.length === 0) {
      tableBody.innerHTML = '<tr><td colspan="5">No transactions yet</td></tr>';
      return;
    }

    tableBody.innerHTML = filtered.map(e => {
      const kind = classify(e);
      const label = kind === 'profit' ? 'Profit' : kind === 'sell' ? 'Sell' : kind === 'yearly-total' ? 'Yearly Total' : 'Buy';
      const fund = e.fund || (e.notes && e.notes.split(' —')[0].replace(/\s(buy|sell|profit)$/i, '')) || e.category || 'Mutual Fund';
      const dateStr = new Date(e.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
      return `
        <tr>
          <td>${dateStr}</td>
          <td>${escapeHtml(String(fund || '—'))}</td>
          <td><span class="tx-type tx-type--${kind === 'yearly-total' ? 'buy' : kind}">${label}</span></td>
          <td>${formatINR(e.amount)}</td>
          <td>${escapeHtml(e.notes || '—')}</td>
        </tr>`;
    }).join('');
  }

  function renderYearlyChart(entries) {
    const canvas = document.getElementById('yearlyGrowthChart');
    if (!canvas || typeof Chart === 'undefined') return;

    // Determine the set of years to show (from entries and at least current year)
    const yearsSet = new Set();
    entries.forEach(e => {
      const y = new Date(e.date).getFullYear();
      if (!Number.isNaN(y)) yearsSet.add(y);
    });
    const years = Array.from(yearsSet).sort((a, b) => a - b);
    if (years.length === 0) {
      const now = new Date().getFullYear();
      years.push(now);
    }

    const startYear = Math.min(...years, 2017);
    const endYear = Math.max(...years, new Date().getFullYear());
    const labels = [];
    for (let y = startYear; y <= endYear; y++) labels.push(String(y));

    // For each year, compute total invested (buys + yearly-total) that occurred in that year (non-cumulative),
    // and growth recorded that year (profit subtype).
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

    // To show cumulative net invested as in previous behavior, compute cumulative running total
    const cumulativeNet = [];
    let running = 0;
    labels.forEach((lab, idx) => {
      running += investedByYear[idx];
      // subtract sells in that year
      const sells = entries
        .filter(e => new Date(e.date).getFullYear() === Number(lab) && classify(e) === 'sell')
        .reduce((s, e) => s + (Number(e.amount) || 0), 0);
      running -= sells;
      cumulativeNet.push(running);
    });

    // Build chart with two datasets per year: cumulative net invested (as area/line) and growth (bar),
    // but user requested "for every year, both the Total Investment and Total Growth bars should be shown side by side."
    // We'll render two bar datasets side-by-side: "Total Invested (yearly)" and "Total Growth (yearly)".
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
            backgroundColor: '#1abc9c'
          },
          {
            label: 'Total Growth (year)',
            data: growthByYear,
            backgroundColor: '#3498db'
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
            stacked: false
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

    // Ensure entries with subtype 'yearly-total' are treated as investments (they should have been stored that way)
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

  // Form submit handler: supports custom fund name when "Other" selected and yearly totals (single + bulk)
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

      // Check yearly controls
      const yearlyToggle = document.getElementById('historyYearlyToggle');
      const yearInput = document.getElementById('historyYearInput');
      const yearAmountInput = document.getElementById('historyYearAmount');
      const bulkTextarea = document.getElementById('historyYearlyBulk');

      // Standard fields
      const typeEl = document.getElementById('historyType');
      const amountEl = document.getElementById('historyAmount');
      const dateEl = document.getElementById('historyDate');
      const notesEl = document.getElementById('historyNotes');

      const type = typeEl ? typeEl.value : 'buy';
      const amount = amountEl ? parseFloat(amountEl.value) : 0;
      const dateVal = dateEl ? dateEl.value : null;
      const notesInput = notesEl ? notesEl.value.trim() : '';

      // Helper to create and add an entry object via window.addEntry
      async function addEntryObject(entryObj) {
        if (typeof window.addEntry === 'function') {
          await window.addEntry(entryObj);
        } else {
          console.error('addEntry is not defined');
        }
      }

      // If bulk textarea has content, parse it and create entries per line
      if (bulkTextarea && bulkTextarea.value && bulkTextarea.value.trim()) {
        const lines = bulkTextarea.value.split('\n').map(l => l.trim()).filter(Boolean);
        const parsed = [];
        for (const line of lines) {
          // Accept formats: "2017:40000" or "2017 - 40,000" or "2017 40000"
          const m = line.match(/^(\d{4})\s*[:\-]?\s*([\d,.\s]+)$/);
          if (!m) continue;
          const yr = Number(m[1]);
          const amtStr = m[2].replace(/,/g, '').trim();
          const amt = parseFloat(amtStr);
          if (Number.isNaN(yr) || Number.isNaN(amt)) continue;
          parsed.push({ year: yr, amount: amt });
        }

        if (!parsed.length) {
          // nothing valid parsed
          bulkTextarea.focus();
          return;
        }

        // Add each parsed yearly total as an entry with subtype 'yearly-total'
        for (const p of parsed) {
          const entry = {
            type: 'investment',
            category: 'Mutual Fund',
            subtype: 'yearly-total',
            amount: p.amount,
            currency: 'INR',
            // use Jan 1 of the year as the date so it maps to that year
            date: new Date(p.year, 0, 1).toISOString(),
            fund: `Yearly Total (${p.year})`,
            notes: `Yearly total for ${p.year}`
          };
          await addEntryObject(entry);
        }

        // Reset form fields and reload
        form.reset();
        if (customFundInput) customFundInput.value = '';
        if (bulkTextarea) bulkTextarea.value = '';
        await loadAndRender();
        return;
      }

      // If single-year toggle is checked, create a yearly-total entry using yearInput/yearAmountInput
      if (yearlyToggle && yearlyToggle.checked) {
        const yr = yearInput ? Number(yearInput.value) : NaN;
        const yrAmt = yearAmountInput ? parseFloat(yearAmountInput.value) : NaN;
        if (Number.isNaN(yr) || Number.isNaN(yrAmt) || yr <= 0) {
          if (yearInput) yearInput.focus();
          return;
        }
        const entry = {
          type: 'investment',
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

      // Otherwise, treat as a normal dated transaction (buy/sell/profit)
      if (Number.isNaN(amount) || amount <= 0 || !dateVal) {
        if (amountEl) amountEl.focus();
        return;
      }

      const subtype = type === 'sell' ? 'sell' : type === 'profit' ? 'profit' : 'investment';
      const actionLabel = type === 'sell' ? 'sell' : type === 'profit' ? 'profit' : 'buy';
      const notes = `${fundName} ${actionLabel}${notesInput ? ' — ' + notesInput : ''}`;

      const entry = {
        type: 'investment',
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
    // If the page pre-selects Other, ensure wrapper visible
    if (fundSelect.value === 'Other' && customFundInput) {
      const customWrapperEl = document.getElementById('customFundWrapper');
      if (customWrapperEl) customWrapperEl.style.display = 'block';
    }
  }

  // Initial load
  await loadAndRender();
});
