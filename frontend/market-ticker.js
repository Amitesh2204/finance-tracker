(function () {
  'use strict';

  const PRIMARY_API_URL = 'https://indian-stock-market-api.vercel.app/stock?symbol=';
  const FALLBACK_API_URL = 'https://query1.finance.yahoo.com/v8/finance/chart/';
  const REFRESH_INTERVAL = 5000;
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

    const chart = data?.chart?.result?.[0];
    if (chart?.meta?.regularMarketPrice != null) {
      const price = numericValue(chart.meta.regularMarketPrice);
      const previousClose = numericValue(chart.meta.chartPreviousClose ?? chart.meta.previousClose);
      if (price !== null) {
        const change = previousClose === null ? null : price - previousClose;
        return { price, change, changePercent: previousClose ? change / previousClose * 100 : null,
          timestamp: chart.meta.regularMarketTime ? chart.meta.regularMarketTime * 1000 : Date.now() };
      }
    }
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
    return { price, change, changePercent, timestamp: Date.now() };
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
    let quote;
    let lastError;
    const cacheBust = Date.now();
    const primaryUrl = `${PRIMARY_API_URL}${encodeURIComponent(symbol)}&_=${cacheBust}`;
    const fallbackUrl = `${FALLBACK_API_URL}${encodeURIComponent(symbol)}?range=1d&interval=1m&_=${cacheBust}`;
    const urls = [primaryUrl, fallbackUrl].map(source =>
      `https://api.allorigins.win/raw?url=${encodeURIComponent(source)}&t=${cacheBust}`);
    for (const url of urls) {
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 4500);
      try {
        const response = await fetch(url, { cache: 'no-store', headers: { Accept: 'application/json' }, signal: controller.signal });
        if (!response.ok) throw new Error(`Quote service returned HTTP ${response.status}`);
        quote = parseQuote(await response.json());
        break;
      } catch (error) { lastError = error; }
      finally { window.clearTimeout(timeout); }
    }
    if (!quote) throw lastError || new Error('No quote provider returned market data');
    renderQuote(item, quote);
    try {
      await saveQuote(item, quote);
    } catch (error) {
      console.warn(`Could not save ${symbol} market quote`, error);
    }
    return true;
  }

  async function saveQuote(item, quote) {
    const db = window.financeDB;
    if (!db || typeof db.put !== 'function') return;
    const symbol = item.dataset.marketSymbol;
    if (!isEndOfDaySnapshotReady(quote.timestamp)) return;
    const date = indiaDateKey(quote.timestamp);
    const id = `market-index:${symbol}:${date}`;
    if (savedEndOfDayIds.has(id)) return;
    const doc = {
      _id: id, docType: 'market-index-quote', symbol,
      name: item.querySelector('.market-ticker-name').textContent.trim(),
      price: quote.price, change: quote.change, changePercent: quote.changePercent,
      date, fetchedAt: new Date().toISOString()
    };
    try {
      await db.put(doc);
      savedEndOfDayIds.add(id);
    } catch (error) {
      if (error.status !== 409) throw error;
      const current = await db.get(id);
      await db.put({ ...doc, _rev: current._rev });
      savedEndOfDayIds.add(id);
    }
  }

  async function showSavedQuotes(items) {
    const db = window.financeDB;
    if (!db || typeof db.allDocs !== 'function') return;
    try {
      const result = await db.allDocs({ startkey: 'market-index:', endkey: 'market-index:\uffff', include_docs: true });
      const latest = new Map();
      result.rows.map(row => row.doc).filter(doc => doc?.docType === 'market-index-quote').forEach(doc => {
        const fetchedAt = new Date(doc.fetchedAt).getTime();
        if (Number.isFinite(fetchedAt) && isEndOfDaySnapshotReady(fetchedAt) && indiaDateKey(fetchedAt) === doc.date) {
          savedEndOfDayIds.add(doc._id);
        }
        if (!latest.has(doc.symbol) || latest.get(doc.symbol).fetchedAt < doc.fetchedAt) latest.set(doc.symbol, doc);
      });
      items.forEach(item => {
        const quote = latest.get(item.dataset.marketSymbol);
        if (quote) renderQuote(item, quote);
      });
    } catch (error) { console.warn('Could not load saved market quotes', error); }
  }

  const savedEndOfDayIds = new Set();

  function indiaDateKey(timestamp) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(new Date(timestamp));
    const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
  }

  function isEndOfDaySnapshotReady(timestamp) {
    const now = new Date();
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    }).formatToParts(now);
    const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
    const afterMarketClose = Number(values.hour) * 60 + Number(values.minute) >= 15 * 60 + 35;
    return afterMarketClose && indiaDateKey(timestamp) === indiaDateKey(now.getTime());
  }

  async function initializeTicker() {
    const ticker = document.getElementById('marketTicker');
    if (!ticker) return;
    const items = [...ticker.querySelectorAll('[data-market-symbol]')];
    const updated = document.getElementById('marketTickerUpdated');
    let refreshing = false;
    // Finish restoring saved values before the first live request so a slower
    // PouchDB read cannot overwrite a newer quote after it has rendered.
    await showSavedQuotes(items);

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
          ? `Updated ${new Date().toLocaleTimeString('en-IN')} · next check in 5s`
          : succeeded
            ? `${succeeded}/${items.length} updated · retrying in 5s`
            : 'Market data unavailable · retrying in 5s';
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
