from pydantic import BaseModel


class Base64UploadRequest(BaseModel):
    data: str = ""
    name: str = ""
    content_type: str = ""
