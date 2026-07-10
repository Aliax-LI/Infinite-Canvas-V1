import time
from threading import Lock

CANVAS_LOCK = Lock()


def now_ms() -> int:
    return int(time.time() * 1000)
