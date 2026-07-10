from pydantic import BaseModel


class DeleteHistoryRequest(BaseModel):
    timestamp: float
