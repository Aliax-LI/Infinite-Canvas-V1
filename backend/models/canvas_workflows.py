from typing import Any

from pydantic import BaseModel


class CanvasWorkflowExportRequest(BaseModel):
    nodes: list[dict[str, Any]] = []
    connections: list[dict[str, Any]] = []
    filename: str = "canvas-workflow.zip"
    include_resources: bool = True
    library_id: str = ""
    category_id: str = ""
    name: str = ""
