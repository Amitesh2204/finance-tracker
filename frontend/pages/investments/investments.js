// investments.js - dedicated logic for Investments page with year-wise profit aggregation

document.addEventListener('DOMContentLoaded', async () => {
  const investmentForm = document.getElementById('investmentForm');
  const investmentTableBody = document.querySelector('#investmentsTable tbody');
  const yearSelect = document.getElementById('yearSelect');       // chart year selector
  const savedYearSelect = document.getElementById('savedYearSelect'); // table year selector
  const categoryDetail = document.getElementById('categoryDetail');
  const detailTitle = document.getElementById('detailTitle');
  const detailContent = document.getElementById('detailContent');

  function formatINR(amount) {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(amount);
  }

  // Render Saved Investments table (profit only, aggregated year-wise)
  function renderInvestments(entries, selectedYear) {
    if (!investmentTableBody) return;

    const profitEntries = entries.filter(e => e.subtype === 'profit');
    if (!profitEntries || profitEntries.length === 0) {
      investmentTableBody.innerHTML = '<tr><td colspan="3">No profit entries yet</td></tr>';
      return;
    }

    // Group profits by year
    const yearlyTotals = {};
    profitEntries.forEach(entry => {
      const year = new Date(entry.date).getFullYear();
      if (!yearlyTotals[year]) yearlyTotals[year] = 0;
      yearlyTotals[year] += entry.amount || 0;
    });

    // If year selected, filter
    const displayYears = selectedYear ? [parseInt(selectedYear)] : Object.keys(yearlyTotals);

    investmentTableBody.innerHTML = displayYears.map(y => `
      <tr>
        <td>Mutual Fund</td>
        <td>${formatINR(yearlyTotals[y])}</td>
        <td>${y}</td>
      </tr>
    `).join('');
  }

  async function loadInvestments() {
    const entries = await window.fetchEntries().catch(() => []);
    const investments = entries.filter(e => e.type === 'investment');

    // Populate year selectors dynamically
    const years = [...new Set(investments.map(e => new Date(e.date).getFullYear()))];
    [yearSelect, savedYearSelect].forEach(sel => {
      sel.innerHTML = '';
      years.sort().forEach(y => {
        const opt = document.createElement('option');
        opt.value = y;
        opt.textContent = y;
        sel.appendChild(opt);
      });
    });

    const selectedYearChart = yearSelect.value || null;
    const selectedYearTable = savedYearSelect.value || null;

    renderInvestments(investments, selectedYearTable);

    // Totals: for Mutual Fund, use only profit subtype
    const totals = { 'Mutual Fund':0, 'LIC':0, 'PPF':0, 'Sukanya Yojana':0 };
    investments.forEach(e => {
      if (totals[e.category] !== undefined) {
        if (e.category === 'Mutual Fund') {
          if (e.subtype === 'profit') {
            totals['Mutual Fund'] += e.amount || 0;
          }
        } else {
          totals[e.category] += e.amount || 0;
        }
      }
    });

    document.getElementById('mutualFundTotal').textContent = formatINR(totals['Mutual Fund']);
    document.getElementById('licTotal').textContent = formatINR(totals['LIC']);
    document.getElementById('ppfTotal').textContent = formatINR(totals['PPF']);
    document.getElementById('sukanyaTotal').textContent = formatINR(totals['Sukanya Yojana']);

    const ctx = document.getElementById('investmentGrowthChart').getContext('2d');
    new Chart(ctx, {
      type: 'line',
      data: {
        labels: Object.keys(totals),
        datasets: [{
          label: `Investment Growth ${selectedYearChart || ''}`,
          data: Object.values(totals),
          borderColor: ['#1abc9c','#3498db','#e67e22','#9b59b6'],
          backgroundColor: 'rgba(26,188,156,0.2)',
          fill: true,
          tension: 0.4,
          pointBackgroundColor: ['#1abc9c','#3498db','#e67e22','#9b59b6'],
          pointRadius: 5
        }]
      },
      options: {
        responsive: true,
        plugins: { tooltip: { enabled: true }, legend: { display: false } },
        scales: { y: { beginAtZero: true } }
      }
    });
  }

  // Handle card clicks
  document.querySelectorAll('.cards .card').forEach(card => {
    card.addEventListener('click', () => {
      const category = card.getAttribute('data-category');
      detailTitle.textContent = category + " Details";
      detailContent.textContent = "This is a simple placeholder view for " + category + ".";
      categoryDetail.classList.remove('hidden');
      categoryDetail.scrollIntoView({ behavior: 'smooth' });
    });
  });

  // Year selector changes
  yearSelect.addEventListener('change', () => loadInvestments());
  savedYearSelect.addEventListener('change', () => loadInvestments());

  if (investmentForm) {
    if (typeof window.syncPendingEntries === 'function') {
      await window.syncPendingEntries();
    }
    loadInvestments();

    investmentForm.addEventListener('submit', async event => {
      event.preventDefault();
      const type = document.getElementById('investmentType').value;
      const amount = parseFloat(document.getElementById('investmentAmount').value);
      if (Number.isNaN(amount) || amount <= 0) return;

      // Save as profit entry (only profit is tracked here)
      const entry = {
        type: 'investment',
        category: type,
        subtype: 'profit',
        amount,
        date: new Date().toISOString(),
        notes: `Profit: ${type}`
      };

      if (typeof window.addEntry === 'function') {
        await window.addEntry(entry);
      }
      investmentForm.reset();
      loadInvestments();

      // Sidebar submenu toggle
      const submenuToggle = document.querySelector('.submenu-toggle');
      const submenuList = document.querySelector('.submenu-list');

      if (submenuToggle && submenuList) {
        submenuToggle.addEventListener('click', (e) => {
          e.preventDefault();
          submenuList.classList.toggle('hidden');
          submenuToggle.classList.toggle('active');
          if (submenuToggle.textContent.includes('▸')) {
            submenuToggle.textContent = '📈 Investments ▾';
          } else {
            submenuToggle.textContent = '📈 Investments ▸';
          }
        });
      }
    });
  }
});
