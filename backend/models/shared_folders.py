from pydantic import BaseModel


class SharedFolderRegister(BaseModel):
    path: str = ""
    name: str = ""


class SharedFolderImport(BaseModel):
    library_id: str = ""
    category_id: str = ""
    folder_id: str = ""
    paths: list[str] = []
