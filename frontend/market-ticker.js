(function () {
  'use strict';

  const API_URL = 'https://indian-stock-market-api.vercel.app/stock?symbol=';
  const REFRESH_INTERVAL = 15000;
  const fieldNames = {
    price: ['price', 'currentPrice', 'lastPrice', 'ltp', 'regularMarketPrice', 'lastTradedPrice'],
    change: ['change', 'changeAmount', 'netChange', 'priceChange', 'regularMarketChange'],
    changePercent: ['changePercent', 'change_percentage', 'percentChange', 'percentageChange', 'pChange', 'regularMarketChangePercent'],
    previousClose: ['previousClose', 'previous_close', 'prevClose', 'regularMarketPreviousClose']
  };

  function numericValue(value) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value !== 'string') return null;
    const parsed = Number(value.replace(/[₹,%\s,]/g, ''));
    return Number.isFinite(parsed) ? parsed : null;
  }

  function findField(data, candidates) {
    const wanted = new Set(candidates.map(name => name.toLowerCase().replace(/[^a-z0-9]/g, '')));
    const pending = [{ value: data, depth: 0 }];
    while (pending.length) {
      const { value, depth } = pending.shift();
      if (!value || typeof value !== 'object' || depth > 5) continue;
      for (const [key, nested] of Object.entries(value)) {
        const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (wanted.has(normalizedKey)) {
          const parsed = numericValue(nested);
          if (parsed !== null) return parsed;
        }
        if (nested && typeof nested === 'object') pending.push({ value: nested, depth: depth + 1 });
      }
    }
    return null;
  }

  function parseQuote(data) {
    const price = findField(data, fieldNames.price);
    if (price === null) throw new Error('Quote response did not include a current price');

    const previousClose = findField(data, fieldNames.previousClose);
    let change = findField(data, fieldNames.change);
    let changePercent = findField(data, fieldNames.changePercent);
    if (change === null && previousClose !== null) change = price - previousClose;
    if (changePercent === null && previousClose !== null && previousClose !== 0) {
      changePercent = ((price - previousClose) / previousClose) * 100;
    }
    if (change === null && changePercent !== null && previousClose !== null) {
      change = price - previousClose;
    }
    return { price, change, changePercent };
  }

  function formatNumber(value, digits = 2) {
    return new Intl.NumberFormat('en-IN', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
  }

  function renderQuote(item, quote) {
    const priceEl = item.querySelector('.market-ticker-price');
    const changeEl = item.querySelector('.market-ticker-change');
    const direction = quote.changePercent ?? quote.change;
    const positive = direction > 0;
    const negative = direction < 0;
    item.classList.toggle('is-positive', positive);
    item.classList.toggle('is-negative', negative);
    item.classList.toggle('is-neutral', direction === null || direction === 0);
    item.classList.remove('is-stale');
    priceEl.textContent = formatNumber(quote.price);

    if (quote.change === null && quote.changePercent === null) {
      changeEl.textContent = 'Change unavailable';
      return;
    }

    const arrow = positive ? '▲' : negative ? '▼' : '•';
    const amount = quote.change === null ? '' : `${formatNumber(Math.abs(quote.change))} `;
    const percent = quote.changePercent === null ? '' : `(${quote.changePercent > 0 ? '+' : ''}${formatNumber(quote.changePercent)}%)`;
    changeEl.textContent = `${arrow} ${positive || negative ? (negative ? '−' : '+') : ''}${amount}${percent}`.trim();
  }

  async function fetchQuote(item) {
    const symbol = item.dataset.marketSymbol;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(`${API_URL}${encodeURIComponent(symbol)}`, {
        cache: 'no-store',
        headers: { Accept: 'application/json' },
        signal: controller.signal
      });
      if (!response.ok) throw new Error(`Quote service returned HTTP ${response.status}`);
      renderQuote(item, parseQuote(await response.json()));
      return true;
    } finally {
      window.clearTimeout(timeout);
    }
  }

  function initializeTicker() {
    const ticker = document.getElementById('marketTicker');
    if (!ticker) return;
    const items = [...ticker.querySelectorAll('[data-market-symbol]')];
    const updated = document.getElementById('marketTickerUpdated');
    let refreshing = false;

    async function refresh() {
      if (refreshing || document.hidden) return;
      refreshing = true;
      const results = await Promise.allSettled(items.map(fetchQuote));
      const succeeded = results.filter(result => result.status === 'fulfilled').length;
      items.forEach((item, index) => {
        if (results[index].status === 'rejected') {
          item.classList.add('is-stale');
          if (item.querySelector('.market-ticker-price').textContent === '—') {
            item.querySelector('.market-ticker-change').textContent = 'Market data unavailable';
          }
        }
      });

      if (updated) {
        updated.textContent = succeeded === items.length
          ? `Updated ${new Date().toLocaleTimeString('en-IN')}`
          : succeeded
            ? `${succeeded} of ${items.length} indices updated`
            : 'Live market data unavailable';
      }
      refreshing = false;
    }

    refresh();
    window.setInterval(refresh, REFRESH_INTERVAL);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) refresh();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeTicker, { once: true });
  } else {
    initializeTicker();
  }
})();