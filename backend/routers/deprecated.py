from fastapi import APIRouter, HTTPException

router = APIRouter(tags=["deprecated"])

_REMOVED_DETAIL = "应用内热更新已废弃，请前往 GitHub Releases 手动安装新版"


def _removed() -> None:
    raise HTTPException(status_code=404, detail=_REMOVED_DETAIL)


@router.get("/api/update-connectivity")
def update_connectivity_removed() -> None:
    _removed()


@router.get("/api/update-connectivity/probe")
def update_connectivity_probe_removed() -> None:
    _removed()


@router.post("/api/update-from-github")
def update_from_github_removed() -> None:
    _removed()


@router.get("/api/update-backups")
def update_backups_removed() -> None:
    _removed()


@router.post("/api/update-rollback")
def update_rollback_removed() -> None:
    _removed()
