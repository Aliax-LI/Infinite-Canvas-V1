from typing import Any

from pydantic import BaseModel


class WorkflowField(BaseModel):
    id: str
    node: str = ""
    input: str = ""
    name: str = ""
    type: str = "text"
    default: Any = None
    min: float | None = None
    max: float | None = None
    step: float | None = None
    options: list[str] = []
    random_enabled: bool = False


class WorkflowConfig(BaseModel):
    title: str = ""
    fields: list[WorkflowField] = []
    mini_cards: dict[str, Any] = {}


class WorkflowUploadRequest(BaseModel):
    name: str
    workflow: dict[str, Any]


class WorkflowRunRequest(BaseModel):
    fields: dict[str, Any] = {}
    config: WorkflowConfig
    client_id: str = ""
