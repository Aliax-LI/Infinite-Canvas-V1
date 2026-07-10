from pydantic import BaseModel


class ConversationCreateRequest(BaseModel):
    title: str = "新对话"
