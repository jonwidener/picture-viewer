"""Metadata extraction, thumbnails, display derivatives and video transcoding."""
import json
import os
import subprocess
import threading
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path

from PIL import Image, ImageOps
from pillow_heif import register_heif_opener

register_heif_opener()

IMAGE_EXT = {".jpg", ".jpeg", ".png", ".heic", ".heif", ".gif", ".webp"}
VIDEO_EXT = {".mov", ".mp4", ".m4v"}
DERIVE_EXT = {".heic", ".heif"}  # images browsers can't display
THUMB_SIZE = 480
DISPLAY_SIZE = 2560

_gen_slots = threading.BoundedSemaphore(4)
_executor = ThreadPoolExecutor(max_workers=2)
_jobs = {}  # (file_id, rotation) -> {"status": "processing"|"error", "error": str}
_jobs_lock = threading.Lock()


def kind_for(ext):
    if ext in IMAGE_EXT:
        return "image"
    if ext in VIDEO_EXT:
        return "video"
    return None


def _parse_naive(s):
    """Parse a timestamp, keeping wall-clock time (offset discarded), as epoch seconds."""
    s = s.strip().replace("Z", "")
    for fmt in ("%Y:%m:%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d %H:%M:%S"):
        try:
            return int(datetime.strptime(s[:19], fmt).replace(tzinfo=timezone.utc).timestamp())
        except ValueError:
            continue
    return None


def image_meta(path):
    meta = {"width": None, "height": None, "taken_at": None}
    try:
        with Image.open(path) as im:
            w, h = im.size
            exif = im.getexif()
            if exif.get(274) in (5, 6, 7, 8):
                w, h = h, w
            meta["width"], meta["height"] = w, h
            raw = exif.get_ifd(0x8769).get(36867) or exif.get(306)
            if isinstance(raw, str):
                meta["taken_at"] = _parse_naive(raw)
    except Exception:
        pass
    return meta


def video_meta(path):
    meta = {"width": None, "height": None, "duration": None, "codec": None, "taken_at": None}
    try:
        out = subprocess.run(
            ["ffprobe", "-v", "error", "-print_format", "json", "-show_format", "-show_streams", str(path)],
            capture_output=True, text=True, timeout=60, check=True,
        ).stdout
        info = json.loads(out)
    except Exception:
        return meta
    fmt = info.get("format", {})
    try:
        meta["duration"] = float(fmt["duration"])
    except (KeyError, ValueError):
        pass
    tags = fmt.get("tags", {})
    stamp = tags.get("com.apple.quicktime.creationdate") or tags.get("creation_time")
    if stamp:
        meta["taken_at"] = _parse_naive(stamp)
    for st in info.get("streams", []):
        if st.get("codec_type") != "video":
            continue
        w, h = st.get("width"), st.get("height")
        rot = st.get("tags", {}).get("rotate")
        for sd in st.get("side_data_list", []):
            if "rotation" in sd:
                rot = sd["rotation"]
        try:
            if rot is not None and abs(int(float(rot))) % 180 == 90:
                w, h = h, w
        except ValueError:
            pass
        meta["width"], meta["height"], meta["codec"] = w, h, st.get("codec_name")
        break
    return meta


def _atomic_write(dest, write):
    tmp = dest.with_name(f".{uuid.uuid4().hex}{dest.suffix}")
    try:
        write(tmp)
        os.replace(tmp, dest)
    finally:
        tmp.unlink(missing_ok=True)


def _vf_rotate(rotation):
    """ffmpeg filters rotating clockwise by `rotation` degrees (applied after auto-rotation)."""
    return {90: ["transpose=1"], 180: ["transpose=1", "transpose=1"], 270: ["transpose=2"]}.get(rotation, [])


def _save_jpeg(src, dest, size, quality, rotation=0):
    def write(tmp):
        with Image.open(src) as im:
            im = ImageOps.exif_transpose(im)
            if rotation:
                im = im.rotate(-rotation, expand=True)  # PIL rotates counterclockwise
            im.thumbnail((size, size))
            im.convert("RGB").save(tmp, "JPEG", quality=quality)

    _atomic_write(dest, write)


def thumb_path(cache_dir, f, src):
    """Return path to a cached JPEG thumbnail, generating it if needed."""
    dest = Path(cache_dir) / "thumbs" / f"{f['id']}-{f['mtime']}-{f['rotation']}.jpg"
    if dest.exists():
        return dest
    dest.parent.mkdir(exist_ok=True)
    with _gen_slots:
        if f["kind"] == "image":
            _save_jpeg(src, dest, THUMB_SIZE, 80, f["rotation"])
        else:
            t = "1" if (f["duration"] or 0) > 2 else "0"

            def write(tmp):
                subprocess.run(
                    ["ffmpeg", "-v", "error", "-y", "-ss", t, "-i", str(src), "-frames:v", "1",
                     "-vf", ",".join(_vf_rotate(f["rotation"]) + [f"scale={THUMB_SIZE}:{THUMB_SIZE}:force_original_aspect_ratio=decrease"]),
                     "-q:v", "4", str(tmp)],
                    check=True, timeout=120,
                )

            _atomic_write(dest, write)
    return dest


def display_path(cache_dir, f, src):
    """JPEG rendition for formats browsers can't show (HEIC)."""
    dest = Path(cache_dir) / "display" / f"{f['id']}-{f['mtime']}-{f['rotation']}.jpg"
    if dest.exists():
        return dest
    dest.parent.mkdir(exist_ok=True)
    with _gen_slots:
        _save_jpeg(src, dest, DISPLAY_SIZE, 90, f["rotation"])
    return dest


def needs_transcode(f, ext):
    return f["codec"] != "h264" or ext not in {".mp4", ".m4v", ".mov"} or bool(f["rotation"])


def transcode_dest(cache_dir, f):
    return Path(cache_dir) / "video" / f"{f['id']}-{f['mtime']}-{f['rotation']}.mp4"


def _transcode(job, src, dest, rotation):
    try:
        dest.parent.mkdir(exist_ok=True)

        def write(tmp):
            subprocess.run(
                ["ffmpeg", "-v", "error", "-y", "-i", str(src), *(["-vf", ",".join(_vf_rotate(rotation))] if rotation else []),
                 "-c:v", "libx264", "-preset", "veryfast",
                 "-crf", "23", "-pix_fmt", "yuv420p", "-c:a", "aac", "-movflags", "+faststart", str(tmp)],
                check=True, capture_output=True,
            )

        _atomic_write(dest, write)
        with _jobs_lock:
            _jobs.pop(job, None)
    except Exception as e:  # keep the error so the UI can report it
        err = getattr(e, "stderr", b"") or b""
        with _jobs_lock:
            _jobs[job] = {"status": "error", "error": (err.decode(errors="ignore") or str(e))[-300:]}


def playback_status(cache_dir, f, src, ext):
    """Return (status, path). status: ready | processing | error. Starts a transcode if needed."""
    if not needs_transcode(f, ext):
        return "ready", src
    dest = transcode_dest(cache_dir, f)
    if dest.exists():
        return "ready", dest
    key = (f["id"], f["rotation"])
    with _jobs_lock:
        job = _jobs.get(key)
        if job is None:
            _jobs[key] = job = {"status": "processing"}
            _executor.submit(_transcode, key, src, dest, f["rotation"])
    return job["status"], None
