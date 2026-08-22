// budget.js - Budget page: set per-category monthly budgets, compare to actual spend
// Requires db.js + app.js to be loaded first (window.fetchEntries / window.addEntry)

document.addEventListener('DOMContentLoaded', async () => {
  const EXPENSE_CATEGORIES = [
    'School Fees','Rent','Food & Fruit','Vegetables','Electricity',
    'Doctor Fees','Medicine & Tests','Loan','Saving','Clothes','BC','Other'
  ];

  function normalizeCategory(raw) {
    if (!raw) return 'Other';
    const trimmed = String(raw).trim();
    if (EXPENSE_CATEGORIES.includes(trimmed)) return trimmed;
    const lower = trimmed.toLowerCase();
    if (lower.includes('veg') || lower.includes('vegetable')) return 'Vegetables';
    if (lower.includes('food') || lower.includes('fruit') || lower.includes('dining')) return 'Food & Fruit';
    if (lower.includes('rent')) return 'Rent';
    if (lower.includes('school') || lower.includes('tuition') || lower.includes('fees')) return 'School Fees';
    if (lower.includes('electric')) return 'Electricity';
    if (lower.includes('doctor') || lower.includes('clinic') || lower.includes('hospital')) return 'Doctor Fees';
    if (lower.includes('medicine') || lower.includes('test')) return 'Medicine & Tests';
    if (lower.includes('loan')) return 'Loan';
    if (lower.includes('save') || lower.includes('saving')) return 'Saving';
    if (lower.includes('cloth') || lower.includes('apparel')) return 'Clothes';
    if (lower === 'balance' || lower === 'bc') return 'BC';
    return 'Other';
  }

  const categorySelect = document.getElementById('budgetCategory');
  const form = document.getElementById('budgetForm');
  const amountInput = document.getElementById('budgetAmount');
  const monthInput = document.getElementById('budgetMonth');
  const viewMonthInput = document.getElementById('budgetViewMonth');
  const tableBody = document.querySelector('#budgetTable tbody');
  const totalBudgetEl = document.getElementById('budgetTotalBudget');
  const totalSpentEl = document.getElementById('budgetTotalSpent');
  const remainingEl = document.getElementById('budgetRemaining');

  function formatINR(v) {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(Number(v) || 0);
  }

  function currentMonthValue() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }

  if (categorySelect) {
    categorySelect.innerHTML = EXPENSE_CATEGORIES.map(c => `<option value="${c}">${c}</option>`).join('');
  }
  if (monthInput) monthInput.value = currentMonthValue();
  if (viewMonthInput) viewMonthInput.value = currentMonthValue();

  let allEntries = [];

  // "Last save wins": if the same category/month has been budgeted more than
  // once (no delete/upsert available via addEntry), the most recently saved
  // entry is treated as the effective budget instead of summing duplicates.
  function effectiveBudgets(entries, monthValue) {
    const byCategory = {};
    entries
      .filter(e => String(e.type || '').toLowerCase() === 'budget' && e.month === monthValue)
      .forEach(e => {
        const cat = normalizeCategory(e.category);
        const existing = byCategory[cat];
        if (!existing || new Date(e.date) >= new Date(existing.date)) {
          byCategory[cat] = e;
        }
      });
    const result = {};
    Object.keys(byCategory).forEach(cat => { result[cat] = Number(byCategory[cat].amount) || 0; });
    return result;
  }

  function spentByCategory(entries, monthValue) {
    const [year, month] = monthValue.split('-').map(Number);
    const result = {};
    entries
      .filter(e => {
        const t = String(e.type || '').toLowerCase();
        if (t !== 'expense' && t !== 'trip') return false;
        const d = new Date(e.date);
        return d.getFullYear() === year && (d.getMonth() + 1) === month;
      })
      .forEach(e => {
        const cat = normalizeCategory(e.category || e.notes || 'Other');
        result[cat] = (result[cat] || 0) + (Number(e.amount) || 0);
      });
    return result;
  }

  function statusFor(budgeted, spent) {
    if (!budgeted) return { cls: 'none', label: 'No budget' };
    const pct = spent / budgeted;
    if (pct > 1) return { cls: 'over', label: 'Over budget' };
    if (pct >= 0.9) return { cls: 'warn', label: 'Near limit' };
    return { cls: 'ok', label: 'On track' };
  }

  function renderTable(budgets, spent) {
    if (!tableBody) return;
    const rows = EXPENSE_CATEGORIES.map(cat => {
      const budgeted = budgets[cat] || 0;
      const spentAmt = spent[cat] || 0;
      const remaining = budgeted - spentAmt;
      const status = statusFor(budgeted, spentAmt);
      const pct = budgeted ? Math.min((spentAmt / budgeted) * 100, 100) : 0;
      const barClass = status.cls === 'over' ? 'is-over' : status.cls === 'warn' ? 'is-warn' : '';
      return `
        <tr>
          <td>${cat}</td>
          <td>${budgeted ? formatINR(budgeted) : '—'}</td>
          <td>
            ${formatINR(spentAmt)}
            ${budgeted ? `<span class="budget-progress ${barClass}"><span style="width:${pct}%"></span></span>` : ''}
          </td>
          <td>${budgeted ? formatINR(remaining) : '—'}</td>
          <td><span class="budget-status budget-status--${status.cls}">${status.label}</span></td>
        </tr>`;
    }).join('');
    tableBody.innerHTML = rows;
  }

  function renderChart(budgets, spent) {
    const canvas = document.getElementById('budgetChart');
    if (!canvas || typeof Chart === 'undefined') return;
    const ctx = canvas.getContext('2d');
    if (window.budgetChartInstance && typeof window.budgetChartInstance.destroy === 'function') {
      window.budgetChartInstance.destroy();
    }
    window.budgetChartInstance = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: EXPENSE_CATEGORIES,
        datasets: [
          { label: 'Budgeted', data: EXPENSE_CATEGORIES.map(c => budgets[c] || 0), backgroundColor: '#3498db' },
          { label: 'Spent', data: EXPENSE_CATEGORIES.map(c => spent[c] || 0), backgroundColor: '#e74c3c' }
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

  function renderSummary(budgets, spent) {
    const totalBudget = Object.values(budgets).reduce((s, v) => s + v, 0);
    const totalSpent = Object.values(spent).reduce((s, v) => s + v, 0);
    if (totalBudgetEl) totalBudgetEl.textContent = formatINR(totalBudget);
    if (totalSpentEl) totalSpentEl.textContent = formatINR(totalSpent);
    if (remainingEl) remainingEl.textContent = formatINR(totalBudget - totalSpent);
  }

  function renderForMonth(monthValue) {
    const budgets = effectiveBudgets(allEntries, monthValue);
    const spent = spentByCategory(allEntries, monthValue);
    renderSummary(budgets, spent);
    renderTable(budgets, spent);
    renderChart(budgets, spent);
  }

  async function loadAndRender() {
    allEntries = await (window.fetchEntries ? window.fetchEntries() : Promise.resolve([])).catch(() => []);
    renderForMonth(viewMonthInput ? viewMonthInput.value || currentMonthValue() : currentMonthValue());
  }

  if (viewMonthInput) {
    viewMonthInput.addEventListener('change', () => {
      renderForMonth(viewMonthInput.value || currentMonthValue());
    });
  }

  if (form) {
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const category = categorySelect ? categorySelect.value : 'Other';
      const amount = parseFloat(amountInput.value);
      const month = monthInput.value || currentMonthValue();
      if (Number.isNaN(amount) || amount <= 0 || !month) return;

      const entry = {
        type: 'budget',
        category: normalizeCategory(category),
        amount,
        month,
        date: new Date().toISOString(),
        notes: `Budget for ${category} — ${month}`
      };

      if (typeof window.addEntry === 'function') {
        await window.addEntry(entry);
        await loadAndRender();
        if (viewMonthInput) {
          viewMonthInput.value = month;
          renderForMonth(month);
        }
      }

      form.reset();
      if (monthInput) monthInput.value = currentMonthValue();
    });
  }

  await loadAndRender();
});
