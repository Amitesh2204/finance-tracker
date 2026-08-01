// db.js - Shared database functions
const db = new PouchDB('finance');
window.financeDB = db;

function safeInitRemoteSync() {
  try {
    const { couchHost, couchDbName } = window.__CONFIG__ || {};
    if (!couchHost || !couchDbName) {
      return;
    }

    const remoteDB = new PouchDB(`https://${couchHost}/${couchDbName}`, {
      auth: { username: "admin", password: "Winter_2026" },
      skip_setup: true
    });

    db.sync(remoteDB, { live: true, retry: true })
      .on('error', err => console.warn('Remote sync warning:', err));
  } catch (err) {
    console.warn('Remote sync skipped:', err);
  }
}

safeInitRemoteSync();

window.addEntry = async function(entry) {
  try {
    return await db.post(entry);
  } catch (err) {
    console.error("Error adding entry:", err);
  }
};

window.fetchEntries = async function() {
  try {
    const result = await db.allDocs({ include_docs: true });
    return result.rows.map(r => r.doc);
  } catch (err) {
    console.error("Error fetching entries:", err);
    return [];
  }
};
