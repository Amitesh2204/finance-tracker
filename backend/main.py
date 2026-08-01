import os
import logging
from pathlib import Path
from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from backend.database.db import get_db
from backend.database.models import FinanceEntry
from couchdb.http import ResourceConflict, ResourceNotFound

app = FastAPI(title="Finance Tracker API")
db = None

# Allow GitHub Pages frontend to call FastAPI
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve frontend static files (SPA)
project_root = Path(__file__).resolve().parent.parent
frontend_dir = project_root / 'frontend'
if frontend_dir.exists():
    app.mount('/frontend', StaticFiles(directory=str(frontend_dir), html=True), name='frontend')

@app.get('/sw.js')
def serve_service_worker():
    sw = project_root / 'sw.js'
    if sw.exists():
        return FileResponse(str(sw), media_type='application/javascript')
    raise HTTPException(status_code=404, detail='Service worker not found')

@app.get('/')
def serve_index():
    index = project_root / 'index.html'
    if index.exists():
        return FileResponse(str(index))
    raise HTTPException(status_code=404, detail='Frontend not found')

@app.on_event("startup")
def startup_event():
    global db
    try:
        db = get_db()
        logging.info("CouchDB connection initialized")
        logging.info(f"Database name: {db.name}")
    except Exception:
        logging.exception("Failed to initialize CouchDB connection")
        db = None


@app.get("/entries")
def list_entries():
    if db is None:
        raise HTTPException(status_code=503, detail="Database unavailable")
    docs = [row.doc for row in db.view("_all_docs", include_docs=True)]
    for d in docs:
        logging.debug(f"Returning doc {d.get('_id')} rev {d.get('_rev')}")
    return docs

@app.post("/entries")
def create_entry(entry: FinanceEntry):
    if db is None:
        raise HTTPException(status_code=503, detail="Database unavailable")
    doc = entry.dict(by_alias=True)
    if not doc.get("_rev"):
        doc.pop("_rev", None)

    entry_id = doc.get("_id")
    try:
        if entry_id and entry_id.strip():
            try:
                existing = db[entry_id]
                doc["_rev"] = existing["_rev"]
                logging.debug(f"Updating existing entry {entry_id} rev {doc['_rev']}")
            except ResourceNotFound:
                doc.pop("_rev", None)
                logging.debug(f"Creating new entry {entry_id}")
        else:
            doc.pop("_id", None)

        res = db.save(doc)
        doc["_id"], doc["_rev"] = res[0], res[1]
        logging.info(f"Entry saved: {doc['_id']} rev {doc['_rev']}")
        return doc
    except ResourceConflict:
        existing = db[entry_id]
        doc["_rev"] = existing["_rev"]
        res = db.save(doc)
        doc["_id"], doc["_rev"] = res[0], res[1]
        logging.warning(f"Conflict resolved for {doc['_id']} rev {doc['_rev']}")
        return doc
    except Exception as e:
        logging.exception("Failed to save entry")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/entries/{id}")
def get_entry(id: str):
    if db is None:
        raise HTTPException(status_code=503, detail="Database unavailable")
    try:
        doc = db[id]
        logging.debug(f"Fetched entry {id} rev {doc.get('_rev')}")
        return doc
    except Exception:
        raise HTTPException(status_code=404, detail="Not found")

@app.put("/entries/{id}")
def update_entry(id: str, entry: FinanceEntry):
    if db is None:
        raise HTTPException(status_code=503, detail="Database unavailable")
    try:
        existing = db[id]
    except Exception:
        raise HTTPException(status_code=404, detail="Not found")

    data = entry.dict(by_alias=True)
    data["_id"] = id
    data["_rev"] = existing["_rev"]

    try:
        res = db.save(data)
        data["_id"], data["_rev"] = res[0], res[1]
        logging.info(f"Entry updated: {data['_id']} rev {data['_rev']}")
        return data
    except ResourceConflict:
        existing = db[id]
        data["_rev"] = existing["_rev"]
        res = db.save(data)
        data["_id"], data["_rev"] = res[0], res[1]
        logging.warning(f"Conflict resolved on update for {data['_id']} rev {data['_rev']}")
        return data
    except Exception as e:
        logging.exception("Failed to update entry")
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/entries/{id}")
def delete_entry(id: str):
    if db is None:
        raise HTTPException(status_code=503, detail="Database unavailable")
    try:
        doc = db[id]
        db.delete(doc)
        logging.info(f"Entry deleted: {id}")
        return {"ok": True}
    except Exception:
        raise HTTPException(status_code=404, detail="Not found")

@app.get("/health")
def health():
    return {"database": db is not None}
