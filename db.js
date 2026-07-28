// db.js - Shared database functions
const db = new PouchDB('finance');

// Read from config.js
const { couchUser, couchPass, couchHost, couchDbName } = window.__CONFIG__;

const remoteDB = new PouchDB(`http://${couchUser}:${couchPass}@${couchHost}/${couchDbName}`);

db.sync(remoteDB, { live: true, retry: true })
  .on('error', err => console.error("Sync error:", err));

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
