import os
import re

from backend.config import API_ENV_FILE


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
