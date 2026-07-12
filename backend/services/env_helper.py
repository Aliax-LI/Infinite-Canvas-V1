import os
import re

from backend.config import API_ENV_FILE


def ensure_runtime_config_files() -> None:
    """Create API env and data dirs on first run so saving keys does not fail."""
    try:
        API_ENV_FILE.parent.mkdir(parents=True, exist_ok=True)
        if not API_ENV_FILE.is_file():
            API_ENV_FILE.touch()
    except OSError as exc:
        print(f"初始化 API 配置目录失败: {exc}")


def load_env_file() -> None:
    """Load persisted API keys from api.env into os.environ (setdefault — no override)."""
    if not API_ENV_FILE.is_file():
        return
    try:
        for raw_line in API_ENV_FILE.read_text(encoding="utf-8-sig").splitlines():
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            if key:
                os.environ.setdefault(key, value)
    except OSError as exc:
        print(f"加载 API 配置失败 ({API_ENV_FILE}): {exc}")


def env_quote(value: str) -> str:
    text = str(value or "")
    pattern = r"\s|#|[\"\x27]"
    if not text or re.search(pattern, text):
        return chr(34) + text.replace("\\", "\\\\").replace(chr(34), "\\" + chr(34)) + chr(34)
    return text


def update_env_values(updates: dict[str, str]) -> None:
    API_ENV_FILE.parent.mkdir(parents=True, exist_ok=True)
    lines: list[str] = []
    if API_ENV_FILE.is_file():
        lines = API_ENV_FILE.read_text(encoding="utf-8-sig").splitlines()
    seen: set[str] = set()
    next_lines: list[str] = []
    for line in lines:
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in line:
            next_lines.append(line)
            continue
        key = line.split("=", 1)[0].strip()
        if key in updates:
            next_lines.append(f"{key}={env_quote(updates[key])}")
            os.environ[key] = str(updates[key] or "")
            seen.add(key)
        else:
            next_lines.append(line)
    for key, value in updates.items():
        if key not in seen:
            next_lines.append(f"{key}={env_quote(value)}")
            os.environ[key] = str(value or "")
    API_ENV_FILE.write_text("\n".join(next_lines).rstrip() + "\n", encoding="utf-8")
