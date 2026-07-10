import os
import shutil

from backend.config import BASE_DIR


def cli_bin_directories() -> list[str]:
    home = os.path.expanduser("~")
    dirs = [
        os.path.join(home, ".local", "bin"),
        os.path.join(home, ".codex", "bin"),
        os.path.join(home, ".npm-global", "bin"),
        "/opt/homebrew/bin",
        "/usr/local/bin",
    ]
    nvm_base = os.path.join(home, ".nvm", "versions", "node")
    if os.path.isdir(nvm_base):
        for entry in sorted(os.listdir(nvm_base), reverse=True):
            bin_dir = os.path.join(nvm_base, entry, "bin")
            if os.path.isdir(bin_dir):
                dirs.append(bin_dir)
    seen: set[str] = set()
    result: list[str] = []
    for directory in dirs:
        if directory and directory not in seen and os.path.isdir(directory):
            seen.add(directory)
            result.append(directory)
    return result


def discover_cli_executable(*names: str) -> str:
    for name in names:
        if not name:
            continue
        found = shutil.which(name)
        if found:
            return found
    suffixes = ("", ".exe", ".cmd")
    for bin_dir in cli_bin_directories():
        for name in names:
            if not name:
                continue
            for suffix in suffixes:
                candidate = os.path.join(bin_dir, f"{name}{suffix}")
                if os.path.isfile(candidate) and os.access(candidate, os.X_OK):
                    return candidate
    return ""


def codex_cli_executable() -> str:
    configured = os.getenv("CODEX_BIN", "").strip()
    return configured or discover_cli_executable("codex")


def gpt_image_2_skill_executable() -> str:
    configured = os.getenv("GPT_IMAGE_2_SKILL_BIN", "").strip()
    return configured or discover_cli_executable("gpt-image-2-skill")


def gemini_cli_executable() -> str:
    for key in ("ANTIGRAVITY_BIN", "AGY_BIN", "GEMINI_BIN"):
        configured = os.getenv(key, "").strip().strip(chr(34))
        if configured:
            return configured
    return discover_cli_executable("agy") or discover_cli_executable("gemini")


def is_antigravity_cli(exe: str) -> bool:
    text = str(exe or "").lower()
    return os.path.basename(text).startswith("agy") or "antigravity" in text


def gemini_cli_display_name(exe: str | None = None) -> str:
    target = exe or gemini_cli_executable()
    return "Antigravity CLI" if is_antigravity_cli(target) else "Gemini CLI"


def jimeng_cli_executable() -> str:
    if str(os.getenv("JIMENG_USE_WSL", "")).strip().lower() in {"1", "true", "yes", "on", "wsl"}:
        return shutil.which("wsl.exe") or shutil.which("wsl") or "wsl.exe"
    configured = (os.getenv("JIMENG_BIN") or os.getenv("DREAMINA_BIN") or "").strip()
    return configured or discover_cli_executable("dreamina")
