"""Repository factory — Json* (default) or Sqlite* when STORAGE_BACKEND=sqlite."""

from __future__ import annotations

from backend.config import STORAGE_BACKEND
from backend.repositories.protocols import (
    ApiProvidersRepository,
    AssetLibraryRepository,
    CanvasRepository,
    ConversationRepository,
    HistoryRepository,
    ProjectRepository,
    PromptLibraryRepository,
    RunningHubWorkflowRepository,
    SecretsRepository,
    SharedFoldersRepository,
    WorkflowRepository,
)

_project_repo: ProjectRepository | None = None
_canvas_repo: CanvasRepository | None = None
_conversation_repo: ConversationRepository | None = None
_history_repo: HistoryRepository | None = None
_asset_library_repo: AssetLibraryRepository | None = None
_prompt_library_repo: PromptLibraryRepository | None = None
_api_providers_repo: ApiProvidersRepository | None = None
_secrets_repo: SecretsRepository | None = None
_shared_folders_repo: SharedFoldersRepository | None = None
_runninghub_workflow_repo: RunningHubWorkflowRepository | None = None
_workflow_repo: WorkflowRepository | None = None


def _use_sqlite() -> bool:
    from backend.config import STORAGE_BACKEND

    return STORAGE_BACKEND == "sqlite"


def get_project_repository() -> ProjectRepository:
    global _project_repo
    if _project_repo is None:
        if _use_sqlite():
            from backend.repositories.sqlite.project_repository import SqliteProjectRepository

            _project_repo = SqliteProjectRepository()
        else:
            from backend.repositories.json.project_repository import JsonProjectRepository

            _project_repo = JsonProjectRepository()
    return _project_repo


def get_canvas_repository() -> CanvasRepository:
    global _canvas_repo
    if _canvas_repo is None:
        if _use_sqlite():
            from backend.repositories.sqlite.canvas_repository import SqliteCanvasRepository

            _canvas_repo = SqliteCanvasRepository()
        else:
            from backend.repositories.json.canvas_repository import JsonCanvasRepository

            _canvas_repo = JsonCanvasRepository()
    return _canvas_repo


def get_conversation_repository() -> ConversationRepository:
    global _conversation_repo
    if _conversation_repo is None:
        if _use_sqlite():
            from backend.repositories.sqlite.conversation_repository import SqliteConversationRepository

            _conversation_repo = SqliteConversationRepository()
        else:
            from backend.repositories.json.conversation_repository import JsonConversationRepository

            _conversation_repo = JsonConversationRepository()
    return _conversation_repo


def get_history_repository() -> HistoryRepository:
    global _history_repo
    if _history_repo is None:
        if _use_sqlite():
            from backend.repositories.sqlite.history_repository import SqliteHistoryRepository

            _history_repo = SqliteHistoryRepository()
        else:
            from backend.repositories.json.history_repository import JsonHistoryRepository

            _history_repo = JsonHistoryRepository()
    return _history_repo


def get_asset_library_repository() -> AssetLibraryRepository:
    global _asset_library_repo
    if _asset_library_repo is None:
        if _use_sqlite():
            from backend.repositories.sqlite.asset_library_repository import SqliteAssetLibraryRepository

            _asset_library_repo = SqliteAssetLibraryRepository()
        else:
            from backend.repositories.json.asset_library_repository import JsonAssetLibraryRepository

            _asset_library_repo = JsonAssetLibraryRepository()
    return _asset_library_repo


def get_prompt_library_repository() -> PromptLibraryRepository:
    global _prompt_library_repo
    if _prompt_library_repo is None:
        if _use_sqlite():
            from backend.repositories.sqlite.prompt_library_repository import SqlitePromptLibraryRepository

            _prompt_library_repo = SqlitePromptLibraryRepository()
        else:
            from backend.repositories.json.prompt_library_repository import JsonPromptLibraryRepository

            _prompt_library_repo = JsonPromptLibraryRepository()
    return _prompt_library_repo


def get_api_providers_repository() -> ApiProvidersRepository:
    global _api_providers_repo
    if _api_providers_repo is None:
        if _use_sqlite():
            from backend.repositories.sqlite.api_providers_repository import SqliteApiProvidersRepository

            _api_providers_repo = SqliteApiProvidersRepository()
        else:
            from backend.repositories.json.api_providers_repository import JsonApiProvidersRepository

            _api_providers_repo = JsonApiProvidersRepository()
    return _api_providers_repo


def get_secrets_repository() -> SecretsRepository:
    global _secrets_repo
    if _secrets_repo is None:
        if _use_sqlite():
            from backend.repositories.sqlite.secrets_repository import SqliteSecretsRepository

            _secrets_repo = SqliteSecretsRepository()
        else:
            from backend.repositories.json.secrets_repository import JsonSecretsRepository

            _secrets_repo = JsonSecretsRepository()
    return _secrets_repo


def get_shared_folders_repository() -> SharedFoldersRepository:
    global _shared_folders_repo
    if _shared_folders_repo is None:
        if _use_sqlite():
            from backend.repositories.sqlite.shared_folders_repository import SqliteSharedFoldersRepository

            _shared_folders_repo = SqliteSharedFoldersRepository()
        else:
            from backend.repositories.json.shared_folders_repository import JsonSharedFoldersRepository

            _shared_folders_repo = JsonSharedFoldersRepository()
    return _shared_folders_repo


def get_runninghub_workflow_repository() -> RunningHubWorkflowRepository:
    global _runninghub_workflow_repo
    if _runninghub_workflow_repo is None:
        if _use_sqlite():
            from backend.repositories.sqlite.runninghub_workflow_repository import SqliteRunningHubWorkflowRepository

            _runninghub_workflow_repo = SqliteRunningHubWorkflowRepository()
        else:
            from backend.repositories.json.runninghub_workflow_repository import JsonRunningHubWorkflowRepository

            _runninghub_workflow_repo = JsonRunningHubWorkflowRepository()
    return _runninghub_workflow_repo


def get_workflow_repository() -> WorkflowRepository:
    global _workflow_repo
    if _workflow_repo is None:
        if _use_sqlite():
            from backend.repositories.sqlite.workflow_repository import SqliteWorkflowRepository

            _workflow_repo = SqliteWorkflowRepository()
        else:
            from backend.repositories.json.workflow_repository import JsonWorkflowRepository

            _workflow_repo = JsonWorkflowRepository()
    return _workflow_repo


def reset_repositories() -> None:
    """Clear cached singletons — for tests only."""
    global _project_repo, _canvas_repo, _conversation_repo, _history_repo
    global _asset_library_repo, _prompt_library_repo, _api_providers_repo, _secrets_repo
    global _shared_folders_repo, _runninghub_workflow_repo, _workflow_repo
    _project_repo = None
    _canvas_repo = None
    _conversation_repo = None
    _history_repo = None
    _asset_library_repo = None
    _prompt_library_repo = None
    _api_providers_repo = None
    _secrets_repo = None
    _shared_folders_repo = None
    _runninghub_workflow_repo = None
    _workflow_repo = None
