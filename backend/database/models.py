from pydantic import BaseModel, Field
from typing import Optional

class FinanceEntry(BaseModel):
    id: Optional[str] = Field(None, alias="_id", description="Document id for CouchDB/PouchDB")
    rev: Optional[str] = Field(None, alias="_rev", description="Revision id for CouchDB/PouchDB")
    type: str
    amount: float
    currency: str = "INR"
    date: str
    category: Optional[str] = None
    notes: Optional[str] = None

    class Config:
        populate_by_name = True  # allows using both 'id' and '_id' in input/output

