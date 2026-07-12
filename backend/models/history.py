from pydantic import BaseModel


class DeleteHistoryRequest(BaseModel):
    timestamp: float


class BatchDeleteHistoryRequest(BaseModel):
    timestamps: list[float]


class PurgeHistoryRequest(BaseModel):
    type: str | None = None
