import hashlib
import os
import shutil
import subprocess  # nosec B404
import tempfile

from PIL import Image, ImageOps

from backend.config import MEDIA_PREVIEW_DIR, ensure_data_dirs


def image_has_alpha(img: Image.Image) -> bool:
    if img.mode in ("RGBA", "LA"):
        return True
    if img.mode == "P":
        return "transparency" in img.info
    return False


def media_preview_cache_paths(path: str, width: int) -> tuple[str, str]:
    stat = os.stat(path)
    key = hashlib.sha1(
        f"{os.path.abspath(path)}|{stat.st_mtime_ns}|{stat.st_size}|{width}".encode("utf-8", "ignore"),
        usedforsecurity=False,
    ).hexdigest()
    preview_dir = str(MEDIA_PREVIEW_DIR)
    return (
        os.path.join(preview_dir, f"{key}.webp"),
        os.path.join(preview_dir, f"{key}.png"),
    )


def is_video_preview_file(path: str) -> bool:
    return os.path.splitext(str(path or "").split("?", 1)[0])[1].lower() in {
        ".mp4", ".webm", ".mov", ".m4v", ".avi", ".mkv"
    }


def generate_video_preview_image(path: str, width: int) -> Image.Image:
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        raise RuntimeError("未找到 ffmpeg，无法生成视频预览图")
    fd, frame_path = tempfile.mkstemp(prefix="media_preview_frame_", suffix=".jpg")
    os.close(fd)
    try:
        cmd = [
            ffmpeg, "-hide_banner", "-loglevel", "error", "-y",
            "-ss", "0.5",
            "-i", path,
            "-frames:v", "1",
            "-vf", f"scale='min({width},iw)':-2",
            frame_path,
        ]
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=60)  # nosec B603
        if proc.returncode != 0 or not os.path.exists(frame_path) or os.path.getsize(frame_path) <= 0:
            raise RuntimeError((proc.stderr or "ffmpeg 未能抽取视频首帧").strip()[:300])
        with Image.open(frame_path) as frame:
            img = ImageOps.exif_transpose(frame).copy()
            img.thumbnail((width, width), Image.LANCZOS)
            return img.convert("RGB")
    finally:
        try:
            os.remove(frame_path)
        except OSError:
            pass


def build_media_preview(path: str, width: int) -> tuple[str, str]:
    ensure_data_dirs()
    width = max(64, min(2048, int(width or 512)))
    webp_path, png_path = media_preview_cache_paths(path, width)
    if os.path.exists(webp_path):
        return webp_path, "image/webp"
    if os.path.exists(png_path):
        return png_path, "image/png"
    if is_video_preview_file(path):
        img = generate_video_preview_image(path, width)
    else:
        with Image.open(path) as source:
            img = ImageOps.exif_transpose(source)
            img.thumbnail((width, width), Image.LANCZOS)
            img = img.convert("RGBA" if image_has_alpha(img) else "RGB")
    try:
        img.save(webp_path, format="WEBP", quality=80, method=1)
        return webp_path, "image/webp"
    except (OSError, ValueError):
        img.save(png_path, format="PNG")
        return png_path, "image/png"


def build_image_jpeg(path: str, width: int = 0) -> str:
    ensure_data_dirs()
    width = max(0, min(4096, int(width or 0)))
    stat = os.stat(path)
    key = hashlib.sha1(
        f"{os.path.abspath(path)}|{stat.st_mtime_ns}|{stat.st_size}|{width}|jpg".encode("utf-8", "ignore"),
        usedforsecurity=False,
    ).hexdigest()
    cache_path = os.path.join(str(MEDIA_PREVIEW_DIR), f"{key}.jpg")
    if os.path.exists(cache_path):
        return cache_path
    with Image.open(path) as src:
        img = ImageOps.exif_transpose(src)
        if width:
            img.thumbnail((width, width), Image.LANCZOS)
        if img.mode in ("RGBA", "LA", "P"):
            bg = Image.new("RGB", img.size, (255, 255, 255))
            rgba = img.convert("RGBA")
            bg.paste(rgba, mask=rgba.split()[-1])
            img = bg
        else:
            img = img.convert("RGB")
        img.save(cache_path, format="JPEG", quality=86)
    return cache_path
