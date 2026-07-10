from pydantic import BaseModel


class ComfyInstancesPayload(BaseModel):
    instances: list[str] = []
