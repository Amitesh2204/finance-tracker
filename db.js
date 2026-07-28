// db.js - Shared database functions using PouchDB + CouchDB sync

const db = new PouchDB('finance');

// Sync with CouchDB (replace URL with your CouchDB endpoint)
const remoteDB = new PouchDB('http://localhost:5984/finance');
db.sync(remoteDB, { live: true, retry: true })
  .on('error', err => console.error("Sync error:", err));

// Add entry
window.addEntry = async function(entry) {
  try {
    const response = await db.post(entry);
    return response;
  } catch (err) {
    console.error("Error adding entry:", err);
  }
};

// Fetch all entries
window.fetchEntries = async function() {
  try {
    const result = await db.allDocs({ include_docs: true });
    return result.rows.map(r => r.doc);
  } catch (err) {
    console.error("Error fetching entries:", err);
    return [];
  }
};
