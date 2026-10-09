// loan.js - dedicated logic for the Loan Tracker sub-page.
// Entries are stored with type:'loan' via the same generic window.addEntry/
// fetchEntries/deleteEntry API every other page uses. No other page's
// aggregation checks for type 'loan', so this data stays fully isolated to
// this page by construction, per the "don't integrate elsewhere" requirement.
//
// There is no generic "update" API available (only add/fetch/delete, same as
// every other page in this app), so Edit is implemented as delete-old +
// add-new, matching the safest pattern available without inventing a new
// storage contract.

document.addEventListener('DOMContentLoaded', async () => {
  const currentLoanForm = document.getElementById('currentLoanForm');
  const oldLoanForm = document.getElementById('oldLoanForm');
  const currentLoanCancelBtn = document.getElementById('currentLoanCancelEdit');
  const oldLoanCancelBtn = document.getElementById('oldLoanCancelEdit');
  const currentLoansBody = document.querySelector('#currentLoansTable tbody');
  const oldLoansBody = document.querySelector('#oldLoansTable tbody');

  const summaryEls = {
    activeCount: document.getElementById('loanActiveCount'),
    activeAmount: document.getElementById('loanActiveAmount'),
    totalPaid: document.getElementById('loanTotalPaid'),
    remaining: document.getElementById('loanRemaining'),
    closedCount: document.getElementById('loanClosedCount')
  };

  // ---- Formatting helpers ----
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

  function formatRate(rate) {
    const n = Number(rate);
    return Number.isFinite(n) && n > 0 ? `${n}%` : '—';
  }

  // ---- Toasts ----
  function showToast(message, kind = 'success') {
    const container = document.getElementById('loanToastContainer');
    if (!container) return;
    const el = document.createElement('div');
    el.className = `loan-toast loan-toast--${kind}`;
    el.textContent = message;
    container.appendChild(el);
    setTimeout(() => el.remove(), 3200);
  }

  // ---- EMI "Amount Paid" calculation ----
  // Assumes EMI is due on the 10th of every month. Counts how many EMI
  // cycles have fully completed between the loan's start date and today,
  // then Amount Paid = completed cycles × EMI amount.
  function countCompletedEmiCycles(startDateStr, today = new Date()) {
    const start = new Date(startDateStr);
    if (Number.isNaN(start.getTime())) return 0;
    if (start > today) return 0; // future-dated loan: nothing paid yet

    // First EMI due date: the 10th of the start month if the loan started
    // on/before the 10th, otherwise the 10th of the following month (a loan
    // that starts mid-month, after the 10th, doesn't owe its first EMI until
    // the next cycle).
    let firstYear = start.getFullYear();
    let firstMonth = start.getMonth();
    if (start.getDate() > 10) {
      firstMonth += 1;
      if (firstMonth > 11) { firstMonth = 0; firstYear += 1; }
    }
    const firstDue = new Date(firstYear, firstMonth, 10);
    if (firstDue > today) return 0; // hasn't reached the first EMI date yet

    // Most recent EMI due date on/before today, using the same 10th-of-month rule.
    let lastYear = today.getFullYear();
    let lastMonth = today.getMonth();
    if (today.getDate() < 10) {
      lastMonth -= 1;
      if (lastMonth < 0) { lastMonth = 11; lastYear -= 1; }
    }
    const lastDue = new Date(lastYear, lastMonth, 10);
    if (lastDue < firstDue) return 0;

    const months = (lastDue.getFullYear() - firstDue.getFullYear()) * 12 + (lastDue.getMonth() - firstDue.getMonth()) + 1;
    return Math.max(0, months);
  }

  function computeAmountPaid(loan) {
    const emi = Number(loan.emi) || 0;
    const principal = Number(loan.amount) || 0;
    const cycles = countCompletedEmiCycles(loan.startDate);
    const raw = cycles * emi;
    // Sanity cap: paid amount should never exceed the loan's own principal.
    return principal > 0 ? Math.min(raw, principal) : raw;
  }

  // ---- Data access ----
  async function loadLoanEntries() {
    try {
      const entries = await (window.fetchEntries ? window.fetchEntries() : Promise.resolve([]));
      return (entries || []).filter(e => String(e.type || '').toLowerCase() === 'loan');
    } catch (err) {
      console.warn('fetchEntries failed on Loan Tracker page', err);
      return [];
    }
  }

  // ---- Rendering ----
  function renderSummary(loans) {
    const current = loans.filter(e => e.entryType === 'current');
    const old = loans.filter(e => e.entryType === 'old');
    const activeLoans = current.filter(e => (e.status || 'Active') === 'Active');
    const closedCurrentLoans = current.filter(e => e.status === 'Closed');

    const activeAmount = activeLoans.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
    const totalPaid = current.reduce((sum, e) => sum + computeAmountPaid(e), 0);
    const remaining = current.reduce((sum, e) => sum + Math.max(0, (Number(e.amount) || 0) - computeAmountPaid(e)), 0);
    const closedCount = old.length + closedCurrentLoans.length;

    if (summaryEls.activeCount) summaryEls.activeCount.textContent = String(activeLoans.length);
    if (summaryEls.activeAmount) summaryEls.activeAmount.textContent = formatINR(activeAmount);
    if (summaryEls.totalPaid) summaryEls.totalPaid.textContent = formatINR(totalPaid);
    if (summaryEls.remaining) summaryEls.remaining.textContent = formatINR(remaining);
    if (summaryEls.closedCount) summaryEls.closedCount.textContent = String(closedCount);
  }

  function renderCurrentLoans(loans) {
    if (!currentLoansBody) return;
    const rows = loans
      .filter(e => e.entryType === 'current')
      .sort((a, b) => new Date(b.startDate || b.date || 0) - new Date(a.startDate || a.date || 0));

    if (!rows.length) {
      currentLoansBody.innerHTML = '<tr><td colspan="11" class="loan-empty">No current loans yet — add one on the left to get started.</td></tr>';
      return;
    }

    currentLoansBody.innerHTML = rows.map(e => {
      const status = e.status === 'Closed' ? 'Closed' : 'Active';
      const statusClass = status === 'Active' ? 'loan-status--active' : 'loan-status--closed';
      const principal = Number(e.amount) || 0;
      const paid = computeAmountPaid(e);
      const remaining = Math.max(0, principal - paid);
      const id = e._id || e.id || '';
      return `
        <tr data-id="${id}">
          <td>${escapeHtml(e.loanType || 'Other')}</td>
          <td>${escapeHtml(e.lender || '—')}</td>
          <td>${formatINR(principal)}</td>
          <td>${formatRate(e.interestRate)}</td>
          <td>${formatINR(e.emi)}</td>
          <td>${formatDate(e.startDate)}</td>
          <td>${formatDate(e.endDate)}</td>
          <td>${formatINR(paid)}</td>
          <td>${formatINR(remaining)}</td>
          <td><span class="loan-status ${statusClass}">${status}</span></td>
          <td class="loan-actions-cell">
            <button type="button" class="edit-entry-btn" data-id="${id}" data-kind="current">Edit</button>
            <button type="button" class="delete-entry-btn" data-id="${id}">Delete</button>
          </td>
        </tr>`;
    }).join('');
  }

  function renderOldLoans(loans) {
    if (!oldLoansBody) return;
    const rows = loans
      .filter(e => e.entryType === 'old')
      .sort((a, b) => new Date(b.endDate || b.date || 0) - new Date(a.endDate || a.date || 0));

    if (!rows.length) {
      oldLoansBody.innerHTML = '<tr><td colspan="10" class="loan-empty">No old loans recorded yet.</td></tr>';
      return;
    }

    oldLoansBody.innerHTML = rows.map(e => {
      const status = e.status === 'Closed' ? 'Closed' : 'Paid';
      const statusClass = status === 'Paid' ? 'loan-status--paid' : 'loan-status--closed';
      const id = e._id || e.id || '';
      return `
      <tr data-id="${id}">
        <td>${escapeHtml(e.loanType || 'Other')}</td>
        <td>${escapeHtml(e.lender || '—')}</td>
        <td>${formatINR(e.amount)}</td>
        <td>${formatRate(e.interestRate)}</td>
        <td>${formatINR(e.totalEmiAmount)}</td>
        <td>${formatDate(e.startDate)}</td>
        <td>${formatDate(e.endDate)}</td>
        <td><span class="loan-status ${statusClass}">${status}</span></td>
        <td>${escapeHtml(e.notes || '—')}</td>
        <td class="loan-actions-cell">
          <button type="button" class="edit-entry-btn" data-id="${id}" data-kind="old">Edit</button>
          <button type="button" class="delete-entry-btn" data-id="${id}">Delete</button>
        </td>
      </tr>`;
    }).join('');
  }

  let allLoans = [];
  let lastRenderedMonthKey = '';

  async function refreshAll() {
    allLoans = await loadLoanEntries();
    renderSummary(allLoans);
    renderCurrentLoans(allLoans);
    renderOldLoans(allLoans);
    const now = new Date();
    lastRenderedMonthKey = `${now.getFullYear()}-${now.getMonth()}`;
  }

  // Re-check periodically so "Amount Paid" advances automatically if the
  // page is left open across a month boundary (in addition to recalculating
  // fresh every time the page loads).
  setInterval(() => {
    const now = new Date();
    const key = `${now.getFullYear()}-${now.getMonth()}`;
    if (key !== lastRenderedMonthKey) {
      renderSummary(allLoans);
      renderCurrentLoans(allLoans);
      lastRenderedMonthKey = key;
    }
  }, 30 * 60 * 1000);

  function setCollapsibleOpen(sectionId, open) {
    const section = document.getElementById(sectionId);
    if (!section) return;
    const header = section.querySelector('.collapsible-header');
    const chev = header ? header.querySelector('.chev') : null;
    section.classList.toggle('open', open);
    if (header) header.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (chev) chev.textContent = open ? '▲' : '▼';
  }

  // ---- Current Loan form: add + edit ----
  function resetCurrentLoanFormToAddMode() {
    document.getElementById('currentLoanEditId').value = '';
    document.getElementById('currentLoanSubmitBtn').textContent = 'Add Current Loan';
    if (currentLoanCancelBtn) currentLoanCancelBtn.style.display = 'none';
    currentLoanForm.reset();
    document.getElementById('currentLoanStatus').value = 'Active';
  }

  if (currentLoanForm) {
    currentLoanForm.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const loanType = document.getElementById('currentLoanType').value;
      const lender = document.getElementById('currentLoanLender').value.trim();
      const amount = Number(document.getElementById('currentLoanAmount').value) || 0;
      const interestRate = Number(document.getElementById('currentLoanRate').value) || 0;
      const emi = Number(document.getElementById('currentLoanEmi').value) || 0;
      const startDate = document.getElementById('currentLoanStart').value;
      const endDate = document.getElementById('currentLoanEnd').value;
      const status = document.getElementById('currentLoanStatus').value;
      const notes = document.getElementById('currentLoanNotes').value.trim();
      const editId = document.getElementById('currentLoanEditId').value;

      if (!startDate || amount <= 0 || emi <= 0) {
        showToast('Please fill in Loan Amount, EMI, and Start Date.', 'error');
        return;
      }

      try {
        if (editId && typeof window.deleteEntry === 'function') {
          await window.deleteEntry(editId);
        }
        await window.addEntry({
          type: 'loan',
          entryType: 'current',
          loanType,
          lender,
          amount,
          interestRate,
          emi,
          startDate,
          endDate: endDate || null,
          status,
          notes,
          date: startDate
        });
        showToast(editId ? 'Current loan updated.' : 'Current loan added.', 'success');
        resetCurrentLoanFormToAddMode();
        await refreshAll();
      } catch (err) {
        console.error('Failed to save current loan', err);
        showToast('Something went wrong saving this loan.', 'error');
      }
    });
  }

  if (currentLoanCancelBtn) {
    currentLoanCancelBtn.addEventListener('click', resetCurrentLoanFormToAddMode);
  }

  // ---- Old Loan form: add + edit ----
  function resetOldLoanFormToAddMode() {
    document.getElementById('oldLoanEditId').value = '';
    document.getElementById('oldLoanSubmitBtn').textContent = 'Add Old Loan';
    if (oldLoanCancelBtn) oldLoanCancelBtn.style.display = 'none';
    oldLoanForm.reset();
    document.getElementById('oldLoanStatus').value = 'Paid';
  }

  if (oldLoanForm) {
    oldLoanForm.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const loanType = document.getElementById('oldLoanType').value;
      const lender = document.getElementById('oldLoanLender').value.trim();
      const amount = Number(document.getElementById('oldLoanAmount').value) || 0;
      const interestRate = Number(document.getElementById('oldLoanRate').value) || 0;
      const totalEmiAmount = Number(document.getElementById('oldLoanTotalEmi').value) || 0;
      const status = document.getElementById('oldLoanStatus').value;
      const startDate = document.getElementById('oldLoanStart').value;
      const endDate = document.getElementById('oldLoanEnd').value;
      const notes = document.getElementById('oldLoanNotes').value.trim();
      const editId = document.getElementById('oldLoanEditId').value;

      if (!endDate || amount <= 0 || totalEmiAmount <= 0) {
        showToast('Please fill in Loan Amount, Total EMI Amount, and Date Closed.', 'error');
        return;
      }

      try {
        if (editId && typeof window.deleteEntry === 'function') {
          await window.deleteEntry(editId);
        }
        await window.addEntry({
          type: 'loan',
          entryType: 'old',
          loanType,
          lender,
          amount,
          interestRate,
          totalEmiAmount,
          startDate: startDate || null,
          endDate,
          status,
          notes,
          date: endDate
        });
        showToast(editId ? 'Old loan updated.' : 'Old loan added.', 'success');
        resetOldLoanFormToAddMode();
        await refreshAll();
      } catch (err) {
        console.error('Failed to save old loan', err);
        showToast('Something went wrong saving this loan.', 'error');
      }
    });
  }

  if (oldLoanCancelBtn) {
    oldLoanCancelBtn.addEventListener('click', resetOldLoanFormToAddMode);
  }

  // ---- Edit: populate the matching form from an existing entry ----
  function startEditCurrentLoan(loan) {
    setCollapsibleOpen('addCurrentLoanSection', true);
    document.getElementById('currentLoanEditId').value = loan._id || loan.id || '';
    document.getElementById('currentLoanType').value = loan.loanType || 'Personal Loan';
    document.getElementById('currentLoanLender').value = loan.lender || '';
    document.getElementById('currentLoanAmount').value = loan.amount || '';
    document.getElementById('currentLoanRate').value = loan.interestRate || '';
    document.getElementById('currentLoanEmi').value = loan.emi || '';
    document.getElementById('currentLoanStart').value = loan.startDate || '';
    document.getElementById('currentLoanEnd').value = loan.endDate || '';
    document.getElementById('currentLoanStatus').value = loan.status || 'Active';
    document.getElementById('currentLoanNotes').value = loan.notes || '';
    document.getElementById('currentLoanSubmitBtn').textContent = 'Update Current Loan';
    if (currentLoanCancelBtn) currentLoanCancelBtn.style.display = 'inline-block';
    currentLoanForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function startEditOldLoan(loan) {
    setCollapsibleOpen('addOldLoanSection', true);
    document.getElementById('oldLoanEditId').value = loan._id || loan.id || '';
    document.getElementById('oldLoanType').value = loan.loanType || 'Personal Loan';
    document.getElementById('oldLoanLender').value = loan.lender || '';
    document.getElementById('oldLoanAmount').value = loan.amount || '';
    document.getElementById('oldLoanRate').value = loan.interestRate || '';
    document.getElementById('oldLoanTotalEmi').value = loan.totalEmiAmount || '';
    document.getElementById('oldLoanStatus').value = loan.status || 'Paid';
    document.getElementById('oldLoanStart').value = loan.startDate || '';
    document.getElementById('oldLoanEnd').value = loan.endDate || '';
    document.getElementById('oldLoanNotes').value = loan.notes || '';
    document.getElementById('oldLoanSubmitBtn').textContent = 'Update Old Loan';
    if (oldLoanCancelBtn) oldLoanCancelBtn.style.display = 'inline-block';
    oldLoanForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // ---- Edit/Delete event delegation ----
  async function handleTableClick(event) {
    const editBtn = event.target.closest('.edit-entry-btn');
    if (editBtn) {
      const id = editBtn.getAttribute('data-id');
      const kind = editBtn.getAttribute('data-kind');
      const loan = allLoans.find(e => (e._id || e.id) === id);
      if (!loan) return;
      if (kind === 'current') startEditCurrentLoan(loan);
      else startEditOldLoan(loan);
      return;
    }

    const deleteBtn = event.target.closest('.delete-entry-btn');
    if (deleteBtn) {
      const id = deleteBtn.getAttribute('data-id');
      if (!id) return;
      if (!confirm('Delete this loan entry? This cannot be undone.')) return;
      deleteBtn.disabled = true;
      deleteBtn.textContent = 'Deleting…';
      try {
        if (typeof window.deleteEntry === 'function') {
          await window.deleteEntry(id);
          showToast('Loan entry deleted.', 'success');
        } else {
          console.error('deleteEntry is not defined — is db.js loaded?');
          showToast('Could not delete — please try again.', 'error');
        }
        await refreshAll();
      } catch (err) {
        console.error('Failed to delete loan entry', err);
        showToast('Could not delete this entry.', 'error');
        deleteBtn.disabled = false;
        deleteBtn.textContent = 'Delete';
      }
    }
  }
  if (currentLoansBody) currentLoansBody.addEventListener('click', handleTableClick);
  if (oldLoansBody) oldLoansBody.addEventListener('click', handleTableClick);

  await refreshAll();
});
