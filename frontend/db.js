// db.js - Shared database functions
const db = new PouchDB('finance');

// Expect environment variables injected at build/runtime
const couchUser = process.env.COUCHDB_USER;
const couchPass = process.env.COUCHDB_PASS;
const couchHost = process.env.COUCHDB_HOST || 'localhost:5984';
const couchDbName = process.env.COUCHDB_DB || 'finance';

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
