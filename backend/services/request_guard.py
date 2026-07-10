import urllib.parse

from fastapi import HTTPException, Request


def origin_from_url(value: str) -> str:
    parsed = urllib.parse.urlparse(str(value or ""))
    if not parsed.scheme or not parsed.netloc:
        return ""
    return f"{parsed.scheme}://{parsed.netloc}".lower()


def ensure_same_origin_request(request: Request) -> None:
    host = str(request.headers.get("host") or "").lower()
    expected = f"{request.url.scheme}://{host}".lower() if host else ""
    origin = origin_from_url(request.headers.get("origin", ""))
    referer = origin_from_url(request.headers.get("referer", ""))
    actual = origin or referer
    if expected and actual and actual != expected:
        raise HTTPException(status_code=403, detail="只允许从当前页面导入本地图片")
