import httpx

from backend.services.online_image_service import friendly_upstream_http_error


def test_friendly_upstream_disconnect_message():
    exc = httpx.RemoteProtocolError("Server disconnected without sending a response.")
    msg = friendly_upstream_http_error(exc)
    assert "断开连接" in msg
    assert "Server disconnected" not in msg


def test_friendly_upstream_timeout_message():
    exc = httpx.ReadTimeout("read timeout")
    msg = friendly_upstream_http_error(exc)
    assert "超时" in msg
