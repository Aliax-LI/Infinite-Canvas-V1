from typing import Any, Optional

from pydantic import BaseModel


class CanvasCreateRequest(BaseModel):
    title: str = "未命名画布"
    icon: str = "🧩"
    kind: str = "classic"
    project: Optional[str] = None
    board_x: Optional[float] = None
    board_y: Optional[float] = None


class CanvasMetaUpdate(BaseModel):
    title: Optional[str] = None
    icon: Optional[str] = None
    owner: Optional[str] = None
    color: Optional[str] = None
    pinned: Optional[bool] = None
    project: Optional[str] = None
    board_x: Optional[float] = None
    board_y: Optional[float] = None


class CanvasSaveRequest(BaseModel):
    title: str = "未命名画布"
    icon: str = "🧩"
    nodes: list[dict[str, Any]] = []
    connections: list[dict[str, Any]] = []
    viewport: dict[str, Any] = {}
    logs: list[dict[str, Any]] = []
    settings: dict[str, Any] = {}
    client_id: str = ""
    base_updated_at: int = 0


class ProjectCreateRequest(BaseModel):
    name: str = "新项目"


class ProjectUpdateRequest(BaseModel):
    name: Optional[str] = None
    order: Optional[int] = None


class CanvasAssetCheckRequest(BaseModel):
    urls: list[str] = []


class CanvasAssetDownloadRequest(BaseModel):
    urls: list[str] = []
    items: list[dict[str, Any]] = []
    filename: str = "canvas-output-images.zip"


class SmartCanvasGroupExportItem(BaseModel):
    kind: str = ""
    url: str = ""
    text: str = ""
    name: str = ""


class SmartCanvasGroupExportRequest(BaseModel):
    folder: str = ""
    group_name: str = "group"
    items: list[SmartCanvasGroupExportItem] = []
