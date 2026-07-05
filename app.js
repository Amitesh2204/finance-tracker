// PouchDB offline-first logic
const db = new PouchDB('finance');

// Sync to remote CouchDB via Cloudflare Tunnel or a direct CouchDB endpoint.
// This should point to a CouchDB database endpoint, not the FastAPI server.
const remote = 'https://personaltracker.duckdns.org/finance';

function initSync() {
  db.sync(remote, { live: true, retry: true })
    .on('change', info => console.log('sync change', info))
    .on('paused', err => console.log('sync paused', err))
    .on('active', () => console.log('sync active'))
    .on('denied', err => console.error('sync denied', err))
    .on('complete', info => console.log('sync complete', info))
    .on('error', err => console.error('sync error', err));
}

// Prevent duplicates using deterministic _id (timestamp + random)
function createEntry(entry) {
  // Ensure unique id: type-date-uuid
  const id = entry._id || `entry:${entry.type || 'txn'}:${entry.date || Date.now()}:${Math.random().toString(36).slice(2,9)}`;
  const doc = Object.assign({}, entry, { _id: id });
  return db.put(doc).catch(err => {
    if (err.status === 409) {
      // conflict -> fetch existing and merge if necessary
      return db.get(id).then(existing => Object.assign({}, existing, doc)).then(merged => db.put(merged));
    }
    throw err;
  });
}

// Simple UI bindings
document.addEventListener('DOMContentLoaded', () => {
  initSync();
  // Expose for debugging
  window.financeDB = db;
  window.createEntry = createEntry;
});
