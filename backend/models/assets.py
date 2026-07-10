from pydantic import BaseModel, Field


class LocalAssetCaptionRequest(BaseModel):
    names: list[str] = []
    provider: str = "comfly"
    model: str = ""
    ms_model: str = ""
    prompt: str = "描述图片"


class LocalAssetCaptionSaveRequest(BaseModel):
    name: str = ""
    caption: str = ""


class LocalAssetClassifyRequest(BaseModel):
    names: list[str] = []
    provider: str = "comfly"
    model: str = ""
    ms_model: str = ""
    prompt: str = ""


class LocalAssetUrlImportItem(BaseModel):
    url: str = ""
    name: str = ""
    data: str = ""
    content_type: str = ""


class LocalAssetUrlImportRequest(BaseModel):
    items: list[LocalAssetUrlImportItem] = []
    folder: str = ""
    classify: bool = False
    provider: str = "comfly"
    model: str = ""
    ms_model: str = ""
    prompt: str = ""


class LocalAssetFolderRequest(BaseModel):
    parent: str = ""
    path: str = ""
    name: str = ""


class LocalAssetRenameRequest(BaseModel):
    path: str = ""
    name: str = ""


class LocalAssetDeleteRequest(BaseModel):
    names: list[str] = []


class LocalAssetMoveRequest(BaseModel):
    names: list[str] = []
    folder: str = ""


class LocalImageImportRequest(BaseModel):
    path: str = ""
    paths: list[str] = Field(default_factory=list)

class AssetLibraryCategoryRequest(BaseModel):
    name: str = "新文件夹"
    type: str = "image"
    library_id: str = ""


class AssetLibraryRequest(BaseModel):
    name: str = "资产库"


class AssetLibraryAddRequest(BaseModel):
    category_id: str = ""
    url: str = ""
    name: str = ""
    library_id: str = ""


class AssetLibraryBatchAddRequest(BaseModel):
    category_id: str = ""
    library_id: str = ""
    items: list[AssetLibraryAddRequest] = []


class AssetLibraryRenameRequest(BaseModel):
    name: str = ""
    library_id: str = ""


class AssetLibraryBatchDeleteRequest(BaseModel):
    ids: list[str] = []
    library_id: str = ""


class AssetLibraryBatchMoveRequest(BaseModel):
    ids: list[str] = []
    library_id: str = ""
    target_library_id: str = ""
    target_category_id: str = ""


class AssetLibraryBatchCropRequest(BaseModel):
    ids: list[str] = []
    library_id: str = ""
    target_library_id: str = ""
    target_category_id: str = ""
    mode: str = "square"


class AssetLibraryClassifyRequest(BaseModel):
    library_id: str = ""
    ids: list[str] = []
    provider: str = "comfly"
    model: str = ""
    ms_model: str = ""
    prompt: str = ""


class AssetAvatarRegisterRequest(BaseModel):
    library_id: str = ""
    provider_id: str = ""
    project_name: str = "default"
    group_name: str = ""

