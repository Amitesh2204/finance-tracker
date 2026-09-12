// Flat & EMI Tracker. Uses only flat-emi:* documents and does not feed shared finance totals.
(function () {
  'use strict';

  const PREFIX = 'flat-emi:';
  let documents = [];
  const money = value => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(value) || 0);
  const safe = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;' }[char]));
  const db = () => window._localFinanceDB;

  function idFor(type) { return `${PREFIX}${type}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`; }
  function normalizePaymentType(value) {
    const type = String(value || 'emi').toLowerCase().replace(/[_-]+/g, ' ');
    if (type.includes('down')) return 'downpayment';
    if (type.includes('bullet')) return 'bullet';
    if (type.includes('friend') || type.includes('personal') || type.includes('repaid')) return 'friend-repayment';
    return 'emi';
  }
  function normalizeDate(value) {
    if (typeof value === 'number' && value > 20000) return new Date(Date.UTC(1899, 11, 30) + value * 86400000).toISOString().slice(0, 10);
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
  }
  function settings() { return documents.find(doc => doc._id === `${PREFIX}settings`) || {}; }
  function payments() { return documents.filter(doc => doc._id.startsWith(`${PREFIX}payment:`)); }
  function lenders() { return documents.filter(doc => doc._id.startsWith(`${PREFIX}lender:`)); }
  async function loadDocuments() {
    const result = await db().allDocs({ include_docs: true, startkey: PREFIX, endkey: `${PREFIX}\uffff` });
    documents = result.rows.map(row => row.doc).filter(Boolean);
  }
  async function save(document) { await db().put(document); await loadDocuments(); render(); }
  async function remove(document) { await db().remove(document); await loadDocuments(); render(); }

  function setupForm() {
    const value = settings();
    document.getElementById('propertyName').value = value.propertyName || '';
    document.getElementById('flatCostInput').value = value.flatCost || '';
    document.getElementById('bankLoanInput').value = value.bankLoan || '';
    document.getElementById('downPaymentInput').value = value.downPayment || '';
    document.getElementById('emiInput').value = value.emi || '';
    document.getElementById('termInput').value = value.termMonths || '';
  }

  function render() {
    const profile = settings();
    const paymentRows = payments().sort((a, b) => String(b.date).localeCompare(String(a.date)));
    const lenderRows = lenders();
    const emiPaid = paymentRows.filter(row => row.paymentType === 'emi').reduce((sum, row) => sum + Number(row.amount || 0), 0);
    const downPaid = Number(profile.downPayment || 0) + paymentRows.filter(row => row.paymentType === 'downpayment').reduce((sum, row) => sum + Number(row.amount || 0), 0);
    const bulletPaid = paymentRows.filter(row => row.paymentType === 'bullet').reduce((sum, row) => sum + Number(row.amount || 0), 0);
    const friendBorrowed = lenderRows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
    const friendRepaid = paymentRows.filter(row => row.paymentType === 'friend-repayment').reduce((sum, row) => sum + Number(row.amount || 0), 0);
    const flatCost = Number(profile.flatCost || 0);
    const bankLoan = Number(profile.bankLoan || 0);
    const cleared = Math.min(flatCost || 1, downPaid + emiPaid + bulletPaid + friendRepaid);
    const percent = flatCost ? Math.min(100, cleared / flatCost * 100) : 0;

    document.getElementById('flatCost').textContent = money(flatCost);
    document.getElementById('flatCostWords').textContent = profile.propertyName || 'Set up your flat details';
    document.getElementById('bankLoan').textContent = money(bankLoan);
    document.getElementById('principalPaid').textContent = `${money(emiPaid + bulletPaid)} Principal Paid`;
    document.getElementById('borrowedTotal').textContent = money(friendBorrowed);
    document.getElementById('repaidTotal').textContent = `${money(friendRepaid)} Repaid`;
    document.getElementById('downPayment').textContent = money(downPaid);
    document.getElementById('equityPercent').textContent = flatCost ? `Self Funded (${(downPaid / flatCost * 100).toFixed(1)}%)` : 'Set up your flat details';
    document.getElementById('progressPercent').textContent = `${percent.toFixed(1)}% Overall Cleared`;
    document.getElementById('progressBar').style.width = `${percent}%`;
    document.getElementById('legendDown').textContent = money(downPaid);
    document.getElementById('legendEmi').textContent = money(emiPaid);
    document.getElementById('legendFriends').textContent = money(friendRepaid);
    document.getElementById('legendDebt').textContent = money(Math.max(0, flatCost - cleared));

    document.getElementById('paymentRows').innerHTML = paymentRows.length ? paymentRows.map(row => `<tr><td>${safe(row.date)}</td><td>${safe(row.paymentType)}</td><td>${money(row.amount)}</td><td>${safe(row.note || '—')}</td><td><button class="table-action" data-remove="${safe(row._id)}" type="button">Delete</button></td></tr>`).join('') : '<tr><td colspan="5" class="empty-state">No payments recorded yet.</td></tr>';
    document.getElementById('lenderRows').innerHTML = lenderRows.length ? lenderRows.map(row => `<article class="lender-item"><div><h4>${safe(row.name)}</h4><p>${safe(row.date)}${row.note ? ` · ${safe(row.note)}` : ''}</p></div><div><strong>${money(row.amount)}</strong><button class="table-action" data-remove="${safe(row._id)}" type="button">Delete</button></div></article>`).join('') : '<p class="empty-state">No personal loans recorded yet.</p>';
    document.querySelectorAll('[data-remove]').forEach(button => button.addEventListener('click', () => { const doc = documents.find(item => item._id === button.dataset.remove); if (doc) remove(doc); }));
  }

  async function importExcel(file) {
    if (!file || !window.XLSX) return alert('Excel import is unavailable. Please reload the page and try again.');
    const buffer = await file.arrayBuffer();
    const workbook = window.XLSX.read(buffer, { type: 'array' });
    const rows = window.XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { defval: '' });
    for (const row of rows) {
      const date = row.Date || row.date || row['Payment Date'];
      const amount = Number(row.Amount || row.amount || row.Payment || 0);
      if (!date || !amount) continue;
      const normalizedDate = normalizeDate(date);
      if (!normalizedDate) continue;
      await db().put({ _id: idFor('payment'), type: 'flat-emi-payment', date: normalizedDate, paymentType: normalizePaymentType(row.Type || row.type), amount, note: row.Note || row.note || 'Imported from Excel' });
    }
    await loadDocuments(); render();
  }

  document.addEventListener('DOMContentLoaded', async () => {
    document.getElementById('paymentDate').value = new Date().toISOString().slice(0, 10);
    document.getElementById('lenderDate').value = new Date().toISOString().slice(0, 10);
    document.getElementById('setupForm').addEventListener('submit', async event => { event.preventDefault(); const old = settings(); await save({ ...old, _id: `${PREFIX}settings`, type: 'flat-emi-settings', propertyName: document.getElementById('propertyName').value.trim(), flatCost: Number(document.getElementById('flatCostInput').value) || 0, bankLoan: Number(document.getElementById('bankLoanInput').value) || 0, downPayment: Number(document.getElementById('downPaymentInput').value) || 0, emi: Number(document.getElementById('emiInput').value) || 0, termMonths: Number(document.getElementById('termInput').value) || 0 }); });
    document.getElementById('paymentForm').addEventListener('submit', async event => { event.preventDefault(); await save({ _id: idFor('payment'), type: 'flat-emi-payment', date: document.getElementById('paymentDate').value, paymentType: normalizePaymentType(document.getElementById('paymentType').value), amount: Number(document.getElementById('paymentAmount').value) || 0, note: document.getElementById('paymentNote').value.trim() }); event.target.reset(); document.getElementById('paymentDate').value = new Date().toISOString().slice(0, 10); });
    document.getElementById('lenderForm').addEventListener('submit', async event => { event.preventDefault(); await save({ _id: idFor('lender'), type: 'flat-emi-lender', name: document.getElementById('lenderName').value.trim(), amount: Number(document.getElementById('lenderAmount').value) || 0, date: document.getElementById('lenderDate').value, note: document.getElementById('lenderNote').value.trim() }); event.target.reset(); document.getElementById('lenderDate').value = new Date().toISOString().slice(0, 10); event.target.hidden = true; });
    document.getElementById('toggleLenderForm').addEventListener('click', () => { const form = document.getElementById('lenderForm'); form.hidden = !form.hidden; });
    document.getElementById('focusPayment').addEventListener('click', () => { document.getElementById('paymentPanel').scrollIntoView({ behavior: 'smooth' }); document.getElementById('paymentAmount').focus(); });
    document.getElementById('excelInput').addEventListener('change', event => importExcel(event.target.files[0]).catch(error => { console.error('Flat & EMI Excel import failed', error); alert('Could not import the Excel file.'); }));
    try { await loadDocuments(); setupForm(); render(); } catch (error) { console.error('Flat & EMI tracker failed to load', error); alert('The tracker could not connect to the database.'); }
  });
})();
