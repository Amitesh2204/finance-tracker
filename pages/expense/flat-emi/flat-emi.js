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
    if (type.includes('personal loan')) return 'personal-loan';
    if (type.includes('friend') || type.includes('personal') || type.includes('repaid')) return 'friend-repayment';
    if (type.includes('other')) return 'other';
    return 'emi';
  }
  function paymentLabel(value) {
    return ({ emi: 'Bank EMI', downpayment: 'Downpayment', bullet: 'Bullet Payment', 'personal-loan': 'Personal Loan', 'friend-repayment': 'Friend / Personal Repayment', other: 'Other' })[value] || value;
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
    const allPaymentRows = payments().sort((a, b) => String(b.date).localeCompare(String(a.date)));
    updateYearFilter(allPaymentRows);
    const selectedYear = document.getElementById('paymentYearFilter').value;
    const paymentRows = selectedYear === 'all' ? allPaymentRows : allPaymentRows.filter(row => String(row.date).slice(0, 4) === selectedYear);
    const lenderRows = lenders();
    const emiPaid = paymentRows.filter(row => row.paymentType === 'emi').reduce((sum, row) => sum + Number(row.amount || 0), 0);
    const downPaid = Number(profile.downPayment || 0) + paymentRows.filter(row => row.paymentType === 'downpayment').reduce((sum, row) => sum + Number(row.amount || 0), 0);
    const bulletPaid = paymentRows.filter(row => row.paymentType === 'bullet').reduce((sum, row) => sum + Number(row.amount || 0), 0);
    const friendBorrowed = lenderRows.filter(row => row.movementType !== 'returned').reduce((sum, row) => sum + Number(row.amount || 0), 0);
    const lenderReturned = lenderRows.filter(row => row.movementType === 'returned').reduce((sum, row) => sum + Number(row.amount || 0), 0);
    const friendRepaid = lenderReturned + paymentRows.filter(row => row.paymentType === 'friend-repayment').reduce((sum, row) => sum + Number(row.amount || 0), 0);
    const flatCost = Number(profile.flatCost || 0);
    const bankLoan = Number(profile.bankLoan || 0);
    const cleared = Math.min(flatCost || 1, downPaid + emiPaid + bulletPaid + friendRepaid);
    const percent = flatCost ? Math.min(100, cleared / flatCost * 100) : 0;

    document.getElementById('flatCost').textContent = money(flatCost);
    document.getElementById('flatCostWords').textContent = profile.propertyName || 'Set up your flat details';
    document.getElementById('bankLoan').textContent = money(emiPaid + bulletPaid);
    document.getElementById('principalPaid').textContent = `of ${money(bankLoan)} Principal`;
    document.getElementById('borrowedTotal').textContent = money(friendBorrowed);
    document.getElementById('repaidTotal').textContent = `${money(friendRepaid)} Repaid`;
    document.getElementById('downPayment').textContent = money(downPaid);
    document.getElementById('totalEmi').textContent = money(emiPaid);
    document.getElementById('totalBullet').textContent = money(bulletPaid);
    document.getElementById('totalBorrowed').textContent = money(friendBorrowed);
    document.getElementById('totalReturned').textContent = money(friendRepaid);
    document.getElementById('remainingBorrowed').textContent = money(Math.max(0, friendBorrowed - friendRepaid));
    document.getElementById('equityPercent').textContent = flatCost ? `Self Funded (${(downPaid / flatCost * 100).toFixed(1)}%)` : 'Set up your flat details';
    document.getElementById('progressPercent').textContent = `${percent.toFixed(1)}% Overall Cleared`;
    document.getElementById('progressBar').style.width = `${percent}%`;
    document.getElementById('legendDown').textContent = money(downPaid);
    document.getElementById('legendEmi').textContent = money(emiPaid);
    document.getElementById('legendFriends').textContent = money(friendRepaid);
    document.getElementById('legendDebt').textContent = money(Math.max(0, flatCost - cleared));

    document.getElementById('paymentRows').innerHTML = paymentRows.length ? paymentRows.map(row => `<tr><td>${safe(row.date)}</td><td><span class="payment-type">${safe(paymentLabel(row.paymentType))}</span></td><td class="amount-cell">${money(row.amount)}</td><td class="note-cell">${safe(row.note || '—')}</td><td class="action-cell"><button class="table-action" data-edit-payment="${safe(row._id)}" type="button">Edit</button><button class="table-action" data-remove="${safe(row._id)}" type="button">Delete</button></td></tr>`).join('') : '<tr><td colspan="5" class="empty-state">No payments recorded for this year.</td></tr>';
    document.getElementById('lenderRows').innerHTML = lenderRows.length ? lenderRows.sort((a, b) => String(b.date).localeCompare(String(a.date))).map(row => `<article class="lender-item"><div><h4>${safe(row.name)} <span class="movement-badge ${row.movementType === 'returned' ? 'returned' : 'borrowed'}">${row.movementType === 'returned' ? 'Returned' : 'Borrowed'}</span></h4><p>${safe(row.date)}${row.note ? ` · ${safe(row.note)}` : ''}</p></div><div class="lender-item-actions"><strong>${money(row.amount)}</strong><button class="table-action" data-edit-lender="${safe(row._id)}" type="button">Edit</button><button class="table-action" data-remove="${safe(row._id)}" type="button">Delete</button></div></article>`).join('') : '<p class="empty-state">No personal loans recorded yet.</p>';
    document.querySelectorAll('[data-remove]').forEach(button => button.addEventListener('click', () => { const doc = documents.find(item => item._id === button.dataset.remove); if (doc) remove(doc); }));
    document.querySelectorAll('[data-edit-payment]').forEach(button => button.addEventListener('click', () => editPayment(button.dataset.editPayment)));
    document.querySelectorAll('[data-edit-lender]').forEach(button => button.addEventListener('click', () => editLender(button.dataset.editLender)));
  }

  function updateYearFilter(rows) {
    const filter = document.getElementById('paymentYearFilter');
    const selected = filter.value || 'all';
    const years = [...new Set(rows.map(row => String(row.date).slice(0, 4)).filter(year => /^\d{4}$/.test(year)))].sort().reverse();
    filter.innerHTML = '<option value="all">All years</option>' + years.map(year => `<option value="${year}">${year}</option>`).join('');
    filter.value = years.includes(selected) || selected === 'all' ? selected : 'all';
  }

  function editPayment(id) {
    const row = documents.find(item => item._id === id);
    if (!row) return;
    const form = document.getElementById('paymentForm');
    form.dataset.editId = id;
    document.getElementById('paymentDate').value = row.date || '';
    document.getElementById('paymentType').value = row.paymentType || 'other';
    document.getElementById('paymentAmount').value = row.amount || '';
    document.getElementById('paymentNote').value = row.note || '';
    document.getElementById('savePaymentButton').textContent = 'Update Payment';
    form.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    document.getElementById('paymentAmount').focus();
  }

  async function importExcel(file) {
    const status = document.getElementById('importStatus');
    if (!file || !window.XLSX) throw new Error('Excel import is unavailable. Please reload the page and try again.');
    const buffer = await file.arrayBuffer();
    const workbook = window.XLSX.read(buffer, { type: 'array' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = window.XLSX.utils.sheet_to_json(sheet, { defval: '' });
    const headers = Object.keys(rows[0] || {}).map(header => header.trim().toUpperCase());
    const newHeaders = ['TXN-DATE', 'PAYMENT TYPE', 'AMOUNT', 'NOTE'];
    const legacyHeaders = ['TXN-DATE', 'AMOUNT', 'EMI / BULLET POINT', 'CHECK NUMBER'];
    const isNewFormat = newHeaders.every(header => headers.includes(header));
    const isLegacyFormat = legacyHeaders.every(header => headers.includes(header));
    if (!isNewFormat && !isLegacyFormat) throw new Error(`Required columns are: ${newHeaders.join(', ')}`);
    const headerValue = (row, name) => row[Object.keys(row).find(key => key.trim().toUpperCase() === name)];
    const imported = [];
    const errors = [];
    rows.forEach((row, index) => {
      const normalizedDate = normalizeDate(headerValue(row, 'TXN-DATE'));
      const amount = Number(headerValue(row, 'AMOUNT'));
      const marker = String(headerValue(row, isNewFormat ? 'PAYMENT TYPE' : 'EMI / BULLET POINT') || '').trim();
      if (!normalizedDate || !Number.isFinite(amount) || amount <= 0 || (!isNewFormat && !/^(emi|bullet)$/i.test(marker))) {
        errors.push(`Row ${index + 2}: date, payment type, and positive amount are required`);
        return;
      }
      const note = isNewFormat ? headerValue(row, 'NOTE') : (headerValue(row, 'CHECK NUMBER') ? `Check: ${headerValue(row, 'CHECK NUMBER')}` : 'Imported from Excel');
      imported.push({ _id: idFor('payment'), type: 'flat-emi-payment', date: normalizedDate, paymentType: normalizePaymentType(marker), amount, note: note || 'Imported from Excel' });
    });
    if (!imported.length) throw new Error(errors.join('; ') || 'No valid payment rows found.');
    await db().bulkDocs(imported);
    await loadDocuments(); render();
    status.textContent = `Imported ${imported.length} payment${imported.length === 1 ? '' : 's'} successfully${errors.length ? `; skipped ${errors.length} invalid row${errors.length === 1 ? '' : 's'}` : '.'}`;
    status.className = 'import-status success';
  }

  function editLender(id) {
    const row = documents.find(item => item._id === id);
    if (!row) return;
    document.getElementById('lenderForm').hidden = false;
    document.getElementById('lenderForm').dataset.editId = id;
    document.getElementById('lenderName').value = row.name || '';
    document.getElementById('lenderType').value = row.movementType || 'borrowed';
    document.getElementById('lenderAmount').value = row.amount || '';
    document.getElementById('lenderDate').value = row.date || '';
    document.getElementById('lenderNote').value = row.note || '';
    document.getElementById('saveLenderButton').textContent = 'Update Entry';
    document.getElementById('lenderName').focus();
  }

  document.addEventListener('DOMContentLoaded', async () => {
    document.getElementById('paymentDate').value = new Date().toISOString().slice(0, 10);
    document.getElementById('lenderDate').value = new Date().toISOString().slice(0, 10);
    document.getElementById('setupForm').addEventListener('submit', async event => { event.preventDefault(); const old = settings(); await save({ ...old, _id: `${PREFIX}settings`, type: 'flat-emi-settings', propertyName: document.getElementById('propertyName').value.trim(), flatCost: Number(document.getElementById('flatCostInput').value) || 0, bankLoan: Number(document.getElementById('bankLoanInput').value) || 0, downPayment: Number(document.getElementById('downPaymentInput').value) || 0, emi: Number(document.getElementById('emiInput').value) || 0, termMonths: Number(document.getElementById('termInput').value) || 0 }); });
    document.getElementById('paymentForm').addEventListener('submit', async event => { event.preventDefault(); const editId = event.target.dataset.editId; const old = editId ? documents.find(item => item._id === editId) : null; await save({ ...(old || {}), _id: editId || idFor('payment'), type: 'flat-emi-payment', date: document.getElementById('paymentDate').value, paymentType: normalizePaymentType(document.getElementById('paymentType').value), amount: Number(document.getElementById('paymentAmount').value) || 0, note: document.getElementById('paymentNote').value.trim() }); event.target.reset(); event.target.dataset.editId = ''; document.getElementById('paymentDate').value = new Date().toISOString().slice(0, 10); document.getElementById('savePaymentButton').textContent = 'Save Payment'; });
    document.getElementById('paymentYearFilter').addEventListener('change', render);
    document.getElementById('lenderForm').addEventListener('submit', async event => { event.preventDefault(); const editId = event.target.dataset.editId; const old = editId ? documents.find(item => item._id === editId) : null; await save({ ...(old || {}), _id: editId || idFor('lender'), type: 'flat-emi-lender', name: document.getElementById('lenderName').value.trim(), movementType: document.getElementById('lenderType').value, amount: Number(document.getElementById('lenderAmount').value) || 0, date: document.getElementById('lenderDate').value, note: document.getElementById('lenderNote').value.trim() }); event.target.reset(); event.target.dataset.editId = ''; document.getElementById('lenderDate').value = new Date().toISOString().slice(0, 10); document.getElementById('saveLenderButton').textContent = 'Save Entry'; event.target.hidden = true; });
    document.getElementById('toggleLenderForm').addEventListener('click', () => { const form = document.getElementById('lenderForm'); form.hidden = !form.hidden; });
    document.getElementById('focusPayment').addEventListener('click', () => { document.getElementById('paymentPanel').scrollIntoView({ behavior: 'smooth' }); document.getElementById('paymentAmount').focus(); });
    document.getElementById('excelInput').addEventListener('change', event => importExcel(event.target.files[0]).catch(error => { console.error('Flat & EMI Excel import failed', error); const status = document.getElementById('importStatus'); status.textContent = `Import failed: ${error.message}`; status.className = 'import-status error'; }).finally(() => { event.target.value = ''; }));
    try { await loadDocuments(); setupForm(); render(); } catch (error) { console.error('Flat & EMI tracker failed to load', error); alert('The tracker could not connect to the database.'); }
  });
})();
