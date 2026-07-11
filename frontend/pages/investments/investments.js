// investments.js - dedicated logic for Investments page

document.addEventListener('DOMContentLoaded', async () => {
  const investmentForm = document.getElementById('investmentForm');
  const investmentTableBody = document.querySelector('#investmentsTable tbody');

  // Render investments table
  function renderInvestments(entries) {
    if (!investmentTableBody) return;
    if (!entries || entries.length === 0) {
      investmentTableBody.innerHTML = '<tr><td colspan="3">No investments yet</td></tr>';
      return;
    }

    investmentTableBody.innerHTML = entries.map(entry => {
      const amount = typeof entry.amount === 'number' ? entry.amount.toFixed(2) : entry.amount;
      return `
        <tr>
          <td>${entry.category || entry.type || 'Investment'}</td>
          <td>$${amount}</td>
          <td>${new Date(entry.date).toLocaleString()}</td>
        </tr>
      `;
    }).join('');
  }

  // Load investments from DB
  async function loadInvestments() {
    const entries = await window.fetchEntries().catch(() => []);
    const investments = entries.filter(entry => entry.type === 'investment');
    renderInvestments(investments);

    // Update Savings card on front page
    const totalSavings = investments.reduce((sum, e) => sum + (e.amount || 0), 0);
    const savingsCard = document.getElementById('savings');
    if (savingsCard) {
      savingsCard.textContent = `$${totalSavings.toFixed(2)}`;
    }
  }

  if (investmentForm) {
    await window.syncPendingEntries();
    loadInvestments();

    investmentForm.addEventListener('submit', async event => {
      event.preventDefault();
      const type = document.getElementById('investmentType').value;
      const amount = parseFloat(document.getElementById('investmentAmount').value);
      if (Number.isNaN(amount) || amount <= 0) return;

      const entry = {
        type: 'investment',
        category: type,
        amount,
        date: new Date().toISOString(),
        notes: `Investment: ${type}`
      };

      const saved = await window.addEntry(entry);
      console.log('Investment saved', saved);
      investmentForm.reset();
      loadInvestments();
    });
  }
});
