from pydantic import BaseModel


class CodexHelpRequest(BaseModel):
    command: str = ""


class GeminiCliHelpRequest(BaseModel):
    command: str = ""


class JimengHelpRequest(BaseModel):
    command: str = ""


class JimengQueryMediaRequest(BaseModel):
    submit_id: str = ""
    kind: str = "image"
