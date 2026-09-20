// loan.js - dedicated logic for the Loan Tracker sub-page.
// Entries are stored with type:'loan' via the same generic window.addEntry/
// fetchEntries/deleteEntry API every other page uses, but no other page's
// aggregation checks for type 'loan' — so this data stays fully isolated to
// this page by construction, per the "don't integrate elsewhere" requirement.

document.addEventListener('DOMContentLoaded', async () => {
  const currentLoanForm = document.getElementById('currentLoanForm');
  const oldLoanForm = document.getElementById('oldLoanForm');
  const currentLoansBody = document.querySelector('#currentLoansTable tbody');
  const oldLoansBody = document.querySelector('#oldLoansTable tbody');
  const totalEmiEl = document.getElementById('loanTotalEmi');
  const activeCountEl = document.getElementById('loanActiveCount');
  const totalPaidOffEl = document.getElementById('loanTotalPaidOff');

  function formatINR(amount) {
    try {
      return window.formatCurrency ? window.formatCurrency(amount) : new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(Number(amount) || 0);
    } catch {
      return `₹${(Number(amount) || 0).toFixed(2)}`;
    }
  }

  function escapeHtml(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  }

  function formatDate(value) {
    if (!value) return '—';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  async function loadLoanEntries() {
    try {
      const entries = await (window.fetchEntries ? window.fetchEntries() : Promise.resolve([]));
      return (entries || []).filter(e => String(e.type || '').toLowerCase() === 'loan');
    } catch (err) {
      console.warn('fetchEntries failed on Loan Tracker page', err);
      return [];
    }
  }

  function renderSummary(loans) {
    const current = loans.filter(e => e.entryType === 'current');
    const old = loans.filter(e => e.entryType === 'old');
    const activeLoans = current.filter(e => (e.status || 'Active') === 'Active');
    const totalEmi = activeLoans.reduce((sum, e) => sum + (Number(e.emi) || 0), 0);
    const totalPaidOff = old.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

    if (totalEmiEl) totalEmiEl.textContent = formatINR(totalEmi);
    if (activeCountEl) activeCountEl.textContent = String(activeLoans.length);
    if (totalPaidOffEl) totalPaidOffEl.textContent = formatINR(totalPaidOff);
  }

  function renderCurrentLoans(loans) {
    if (!currentLoansBody) return;
    const rows = loans
      .filter(e => e.entryType === 'current')
      .sort((a, b) => new Date(b.startDate || b.date || 0) - new Date(a.startDate || a.date || 0));

    if (!rows.length) {
      currentLoansBody.innerHTML = '<tr><td colspan="8">No current loans yet</td></tr>';
      return;
    }

    currentLoansBody.innerHTML = rows.map(e => {
      const status = e.status === 'Closed' ? 'Closed' : 'Active';
      const statusClass = status === 'Active' ? 'loan-status--active' : 'loan-status--closed';
      return `
        <tr data-id="${e._id || e.id || ''}">
          <td>${escapeHtml(e.loanType || 'Other')}</td>
          <td>${escapeHtml(e.lender || '—')}</td>
          <td>${formatINR(e.amount)}</td>
          <td>${formatINR(e.emi)}</td>
          <td>${formatDate(e.startDate)}</td>
          <td>${formatDate(e.endDate)}</td>
          <td><span class="loan-status ${statusClass}">${status}</span></td>
          <td><button type="button" class="delete-entry-btn" data-id="${e._id || e.id || ''}">Delete</button></td>
        </tr>`;
    }).join('');
  }

  function renderOldLoans(loans) {
    if (!oldLoansBody) return;
    const rows = loans
      .filter(e => e.entryType === 'old')
      .sort((a, b) => new Date(b.endDate || b.date || 0) - new Date(a.endDate || a.date || 0));

    if (!rows.length) {
      oldLoansBody.innerHTML = '<tr><td colspan="7">No old loans recorded yet</td></tr>';
      return;
    }

    oldLoansBody.innerHTML = rows.map(e => `
      <tr data-id="${e._id || e.id || ''}">
        <td>${escapeHtml(e.loanType || 'Other')}</td>
        <td>${escapeHtml(e.lender || '—')}</td>
        <td>${formatINR(e.amount)}</td>
        <td>${formatDate(e.startDate)}</td>
        <td>${formatDate(e.endDate)}</td>
        <td>${escapeHtml(e.notes || '—')}</td>
        <td><button type="button" class="delete-entry-btn" data-id="${e._id || e.id || ''}">Delete</button></td>
      </tr>`).join('');
  }

  async function refreshAll() {
    const loans = await loadLoanEntries();
    renderSummary(loans);
    renderCurrentLoans(loans);
    renderOldLoans(loans);
  }

  // Add Current Loan (EMI)
  if (currentLoanForm) {
    currentLoanForm.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const loanType = document.getElementById('currentLoanType').value;
      const lender = document.getElementById('currentLoanLender').value.trim();
      const amount = Number(document.getElementById('currentLoanAmount').value) || 0;
      const emi = Number(document.getElementById('currentLoanEmi').value) || 0;
      const startDate = document.getElementById('currentLoanStart').value;
      const endDate = document.getElementById('currentLoanEnd').value;
      const status = document.getElementById('currentLoanStatus').value;
      const notes = document.getElementById('currentLoanNotes').value.trim();

      if (!startDate || amount <= 0 || emi <= 0) return;

      try {
        await window.addEntry({
          type: 'loan',
          entryType: 'current',
          loanType,
          lender,
          amount,
          emi,
          startDate,
          endDate: endDate || null,
          status,
          notes,
          date: startDate
        });
        currentLoanForm.reset();
        document.getElementById('currentLoanType').value = loanType;
        document.getElementById('currentLoanStatus').value = 'Active';
        await refreshAll();
      } catch (err) {
        console.error('Failed to add current loan', err);
      }
    });
  }

  // Add Old Loan (one-time entry)
  if (oldLoanForm) {
    oldLoanForm.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const loanType = document.getElementById('oldLoanType').value;
      const lender = document.getElementById('oldLoanLender').value.trim();
      const amount = Number(document.getElementById('oldLoanAmount').value) || 0;
      const startDate = document.getElementById('oldLoanStart').value;
      const endDate = document.getElementById('oldLoanEnd').value;
      const notes = document.getElementById('oldLoanNotes').value.trim();

      if (!endDate || amount <= 0) return;

      try {
        await window.addEntry({
          type: 'loan',
          entryType: 'old',
          loanType,
          lender,
          amount,
          startDate: startDate || null,
          endDate,
          status: 'Closed',
          notes,
          date: endDate
        });
        oldLoanForm.reset();
        document.getElementById('oldLoanType').value = loanType;
        await refreshAll();
      } catch (err) {
        console.error('Failed to add old loan', err);
      }
    });
  }

  // Delete (event delegation so it keeps working after re-renders)
  async function handleDeleteClick(event) {
    const btn = event.target.closest('.delete-entry-btn');
    if (!btn) return;
    const id = btn.getAttribute('data-id');
    if (!id) return;
    if (!confirm('Delete this loan entry? This cannot be undone.')) return;
    btn.disabled = true;
    btn.textContent = 'Deleting…';
    try {
      if (typeof window.deleteEntry === 'function') {
        await window.deleteEntry(id);
      } else {
        console.error('deleteEntry is not defined — is db.js loaded?');
      }
      await refreshAll();
    } catch (err) {
      console.error('Failed to delete loan entry', err);
      btn.disabled = false;
      btn.textContent = 'Delete';
    }
  }
  if (currentLoansBody) currentLoansBody.addEventListener('click', handleDeleteClick);
  if (oldLoansBody) oldLoansBody.addEventListener('click', handleDeleteClick);

  await refreshAll();
});
