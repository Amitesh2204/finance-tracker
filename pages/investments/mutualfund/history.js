// history.js - Mutual Fund old-data / history sub-page
// Requires db.js + app.js to be loaded first (exposes window.fetchEntries / window.addEntry)

document.addEventListener('DOMContentLoaded', async () => {
  const boughtEl = document.getElementById('historyTotalBought');
  const soldEl = document.getElementById('historyTotalSold');
  const netEl = document.getElementById('historyNetInvested');
  const growthEl = document.getElementById('historyTotalGrowth');
  const tableBody = document.querySelector('#historyTable tbody');
  const yearFilter = document.getElementById('historyYearFilter');
  const form = document.getElementById('historyForm');

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

  // Classify a mutual fund entry as 'buy' | 'sell' | 'profit'
  function classify(e) {
    const notes = String(e.notes || '').toLowerCase();
    if (e.subtype === 'profit' || notes.includes('profit')) return 'profit';
    if (e.subtype === 'sell' || notes.includes(' sell') || notes.includes('sold')) return 'sell';
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
      else bought += amt;
    });
    boughtEl.textContent = formatINR(bought);
    soldEl.textContent = formatINR(sold);
    netEl.textContent = formatINR(bought - sold);
    growthEl.textContent = formatINR(growth);
  }

  function populateYearFilter(entries) {
    const years = [...new Set(entries.map(e => new Date(e.date).getFullYear()).filter(y => !Number.isNaN(y)))].sort((a, b) => b - a);
    const current = yearFilter.value || 'all';
    yearFilter.innerHTML = '<option value="all">All years</option>' +
      years.map(y => `<option value="${y}">${y}</option>`).join('');
    yearFilter.value = years.includes(Number(current)) || current === 'all' ? current : 'all';
  }

  function renderTable(entries, selectedYear) {
    let filtered = entries.slice().sort((a, b) => new Date(b.date) - new Date(a.date));
    if (selectedYear && selectedYear !== 'all') {
      filtered = filtered.filter(e => new Date(e.date).getFullYear() === Number(selectedYear));
    }

    if (filtered.length === 0) {
      tableBody.innerHTML = '<tr><td colspan="5">No transactions yet</td></tr>';
      return;
    }

    tableBody.innerHTML = filtered.map(e => {
      const kind = classify(e);
      const label = kind === 'profit' ? 'Profit' : kind === 'sell' ? 'Sell' : 'Buy';
      const fund = e.fund || (e.notes && e.notes.split(' —')[0].replace(/\s(buy|sell|profit)$/i, '')) || e.category || 'Mutual Fund';
      const dateStr = new Date(e.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
      return `
        <tr>
          <td>${dateStr}</td>
          <td>${fund}</td>
          <td><span class="tx-type tx-type--${kind}">${label}</span></td>
          <td>${formatINR(e.amount)}</td>
          <td>${e.notes || '—'}</td>
        </tr>`;
    }).join('');
  }

  function renderYearlyChart(entries) {
    const canvas = document.getElementById('yearlyGrowthChart');
    if (!canvas || typeof Chart === 'undefined') return;

    const years = [...new Set(entries.map(e => new Date(e.date).getFullYear()).filter(y => !Number.isNaN(y)))];
    const startYear = Math.min(2017, ...(years.length ? years : [new Date().getFullYear()]));
    const endYear = Math.max(new Date().getFullYear(), ...(years.length ? years : [new Date().getFullYear()]));

    const labels = [];
    for (let y = startYear; y <= endYear; y++) labels.push(y);

    let running = 0;
    const netInvestedByYear = labels.map(y => {
      entries.forEach(e => {
        if (new Date(e.date).getFullYear() === y) {
          const kind = classify(e);
          if (kind === 'buy') running += Number(e.amount) || 0;
          else if (kind === 'sell') running -= Number(e.amount) || 0;
        }
      });
      return running;
    });

    const growthByYear = labels.map(y =>
      entries
        .filter(e => new Date(e.date).getFullYear() === y && classify(e) === 'profit')
        .reduce((sum, e) => sum + (Number(e.amount) || 0), 0)
    );

    const ctx = canvas.getContext('2d');
    if (window.historyYearlyChart && typeof window.historyYearlyChart.destroy === 'function') {
      window.historyYearlyChart.destroy();
    }
    window.historyYearlyChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label: 'Net Invested (cumulative)', data: netInvestedByYear, backgroundColor: '#1abc9c' },
          { label: 'Growth recorded that year', data: growthByYear, backgroundColor: '#3498db' }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'top' } },
        scales: { y: { beginAtZero: true } }
      }
    });
  }

  async function loadAndRender() {
    const entries = await window.fetchEntries().catch(() => []);
    allEntries = entries.filter(isMutualFundEntry);

    renderSummary(allEntries);
    populateYearFilter(allEntries);
    renderTable(allEntries, yearFilter.value || 'all');
    renderYearlyChart(allEntries);
  }

  yearFilter.addEventListener('change', () => {
    renderTable(allEntries, yearFilter.value);
  });

  form.addEventListener('submit', async event => {
    event.preventDefault();
    const fund = document.getElementById('historyFund').value;
    const type = document.getElementById('historyType').value; // buy | sell | profit
    const amount = parseFloat(document.getElementById('historyAmount').value);
    const dateVal = document.getElementById('historyDate').value;
    const notesInput = document.getElementById('historyNotes').value.trim();

    if (Number.isNaN(amount) || amount <= 0 || !dateVal) return;

    const subtype = type === 'sell' ? 'sell' : type === 'profit' ? 'profit' : 'investment';
    const actionLabel = type === 'sell' ? 'sell' : type === 'profit' ? 'profit' : 'buy';
    const notes = `${fund} ${actionLabel}${notesInput ? ' — ' + notesInput : ''}`;

    const entry = {
      type: 'investment',
      category: 'Mutual Fund',
      subtype,
      amount,
      currency: 'INR',
      date: new Date(dateVal).toISOString(),
      fund,
      notes
    };

    await window.addEntry(entry);
    form.reset();
    await loadAndRender();
  });

  await loadAndRender();
});
