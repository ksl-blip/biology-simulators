#!/usr/bin/env python3
"""Office → PDF converter using LibreOffice headless."""
from __future__ import annotations

import io
import os
import re
import shutil
import subprocess
import tempfile
import uuid
import zipfile
from pathlib import Path

from flask import Flask, jsonify, request, send_file, send_from_directory
from pypdf import PdfReader, PdfWriter

APP_DIR = Path(__file__).resolve().parent
STATIC_DIR = APP_DIR / "static"
WORK_ROOT = APP_DIR / "work"
WORK_ROOT.mkdir(exist_ok=True)

OFFICE_EXTS = {".docx", ".doc", ".xlsx", ".xls", ".pptx", ".ppt", ".odt", ".ods", ".odp"}
PDF_EXT = {".pdf"}
ZIP_EXT = {".zip"}
SUPPORTED_EXTS = OFFICE_EXTS | PDF_EXT | ZIP_EXT

app = Flask(__name__, static_folder=str(STATIC_DIR), static_url_path="/static")
app.config["MAX_CONTENT_LENGTH"] = 200 * 1024 * 1024  # 200 MB


def safe_name(name: str) -> str:
    base = os.path.basename(name or "file")
    base = re.sub(r"[^\w\u4e00-\u9fff\u3400-\u4dbf.\-()\[\] ]+", "_", base, flags=re.UNICODE)
    base = base.strip(" ._") or "file"
    return base[:180]


def find_soffice() -> str:
    for cand in ("soffice", "libreoffice"):
        path = shutil.which(cand)
        if path:
            return path
    raise RuntimeError("找不到 LibreOffice（soffice）")


def convert_with_soffice(src: Path, out_dir: Path) -> Path:
    """Convert one office file to PDF via LibreOffice. Returns PDF path."""
    out_dir.mkdir(parents=True, exist_ok=True)
    soffice = find_soffice()
    # Unique user profile avoids lock conflicts under concurrent use
    profile = out_dir / f"lo_profile_{uuid.uuid4().hex[:8]}"
    profile.mkdir(parents=True, exist_ok=True)
    cmd = [
        soffice,
        "--headless",
        "--nologo",
        "--nofirststartwizard",
        f"-env:UserInstallation=file://{profile}",
        "--convert-to",
        "pdf",
        "--outdir",
        str(out_dir),
        str(src),
    ]
    proc = subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        timeout=180,
        env={**os.environ, "HOME": str(profile)},
    )
    shutil.rmtree(profile, ignore_errors=True)
    expected = out_dir / (src.stem + ".pdf")
    if expected.exists():
        return expected
    # LibreOffice sometimes tweaks the name slightly — pick newest pdf
    pdfs = sorted(out_dir.glob("*.pdf"), key=lambda p: p.stat().st_mtime, reverse=True)
    if pdfs:
        return pdfs[0]
    err = (proc.stderr or proc.stdout or "").strip() or f"exit {proc.returncode}"
    raise RuntimeError(f"轉換失敗：{src.name} — {err}")


def collect_from_zip(zip_path: Path, dest: Path) -> list[Path]:
    """Extract supported files from ZIP (non-recursive nested zips skipped)."""
    collected: list[Path] = []
    with zipfile.ZipFile(zip_path, "r") as zf:
        for info in zf.infolist():
            if info.is_dir():
                continue
            # Skip macOS junk / hidden
            name = info.filename
            if "__MACOSX" in name or name.startswith(".") or "/." in name:
                continue
            ext = Path(name).suffix.lower()
            if ext not in OFFICE_EXTS and ext not in PDF_EXT:
                continue
            raw = Path(name).name
            target = dest / safe_name(raw)
            # Avoid overwrite collisions
            if target.exists():
                target = dest / f"{target.stem}_{uuid.uuid4().hex[:6]}{target.suffix}"
            with zf.open(info) as src, open(target, "wb") as dst:
                shutil.copyfileobj(src, dst)
            collected.append(target)
    return collected


def merge_pdfs(pdf_paths: list[Path], out_path: Path) -> Path:
    writer = PdfWriter()
    for p in pdf_paths:
        reader = PdfReader(str(p))
        for page in reader.pages:
            writer.add_page(page)
    with open(out_path, "wb") as f:
        writer.write(f)
    return out_path


def zip_pdfs(pdf_paths: list[Path], out_path: Path) -> Path:
    with zipfile.ZipFile(out_path, "w", zipfile.ZIP_DEFLATED) as zf:
        used: set[str] = set()
        for p in pdf_paths:
            arc = p.name
            if arc in used:
                arc = f"{p.stem}_{uuid.uuid4().hex[:6]}.pdf"
            used.add(arc)
            zf.write(p, arcname=arc)
    return out_path


@app.get("/")
def index():
    return send_from_directory(STATIC_DIR, "index.html")


@app.get("/api/health")
def health():
    try:
        soffice = find_soffice()
        ver = subprocess.run(
            [soffice, "--version"], capture_output=True, text=True, timeout=30
        )
        version = (ver.stdout or ver.stderr or "").strip()
        return jsonify({"ok": True, "engine": "libreoffice", "version": version})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


@app.post("/api/convert")
def convert():
    mode = (request.form.get("mode") or "merge").strip().lower()
    if mode not in ("merge", "multi"):
        return jsonify({"ok": False, "error": "模式無效，請選「合併」或「多檔 ZIP」"}), 400

    files = request.files.getlist("files")
    if not files or all(not f.filename for f in files):
        return jsonify({"ok": False, "error": "請先選擇檔案"}), 400

    job_id = uuid.uuid4().hex
    job_dir = WORK_ROOT / job_id
    src_dir = job_dir / "src"
    pdf_dir = job_dir / "pdf"
    src_dir.mkdir(parents=True)
    pdf_dir.mkdir(parents=True)

    results: list[dict] = []
    to_convert: list[Path] = []

    try:
        for up in files:
            if not up.filename:
                continue
            fname = safe_name(up.filename)
            ext = Path(fname).suffix.lower()
            if ext not in SUPPORTED_EXTS:
                results.append(
                    {
                        "name": fname,
                        "status": "error",
                        "message": f"不支援嘅格式：{ext or '（無副檔名）'}",
                    }
                )
                continue

            saved = src_dir / fname
            if saved.exists():
                saved = src_dir / f"{Path(fname).stem}_{uuid.uuid4().hex[:6]}{ext}"
            up.save(saved)

            if ext in ZIP_EXT:
                try:
                    extracted = collect_from_zip(saved, src_dir)
                    if not extracted:
                        results.append(
                            {
                                "name": fname,
                                "status": "error",
                                "message": "ZIP 內冇 Word／Excel／PPT／PDF 檔案",
                            }
                        )
                    else:
                        results.append(
                            {
                                "name": fname,
                                "status": "ok",
                                "message": f"已解壓 {len(extracted)} 個檔案",
                            }
                        )
                        to_convert.extend(extracted)
                except zipfile.BadZipFile:
                    results.append(
                        {"name": fname, "status": "error", "message": "ZIP 檔案損壞"}
                    )
            else:
                to_convert.append(saved)

        pdf_paths: list[Path] = []
        for src in to_convert:
            ext = src.suffix.lower()
            try:
                if ext in PDF_EXT:
                    dest = pdf_dir / (src.stem + ".pdf")
                    if dest.exists():
                        dest = pdf_dir / f"{src.stem}_{uuid.uuid4().hex[:6]}.pdf"
                    shutil.copy2(src, dest)
                    pdf_paths.append(dest)
                    results.append(
                        {"name": src.name, "status": "ok", "message": "已納入 PDF"}
                    )
                elif ext in OFFICE_EXTS:
                    # Convert into a per-file subdir to avoid name clashes
                    sub = pdf_dir / f"c_{uuid.uuid4().hex[:8]}"
                    sub.mkdir()
                    pdf = convert_with_soffice(src, sub)
                    dest = pdf_dir / f"{src.stem}.pdf"
                    if dest.exists():
                        dest = pdf_dir / f"{src.stem}_{uuid.uuid4().hex[:6]}.pdf"
                    shutil.move(str(pdf), str(dest))
                    shutil.rmtree(sub, ignore_errors=True)
                    pdf_paths.append(dest)
                    results.append(
                        {
                            "name": src.name,
                            "status": "ok",
                            "message": f"→ {dest.name}",
                            "pdf": dest.name,
                        }
                    )
                else:
                    results.append(
                        {
                            "name": src.name,
                            "status": "error",
                            "message": f"略過不支援格式 {ext}",
                        }
                    )
            except subprocess.TimeoutExpired:
                results.append(
                    {"name": src.name, "status": "error", "message": "轉換逾時（>180 秒）"}
                )
            except Exception as e:
                results.append(
                    {"name": src.name, "status": "error", "message": str(e)[:300]}
                )

        if not pdf_paths:
            return jsonify(
                {
                    "ok": False,
                    "error": "冇成功轉換任何檔案",
                    "results": results,
                }
            ), 400

        # Sort by original stem for stable order
        pdf_paths.sort(key=lambda p: p.name.lower())

        if mode == "merge":
            out_name = "merged.pdf"
            if len(pdf_paths) == 1:
                out_name = pdf_paths[0].name
            out_path = job_dir / out_name
            if len(pdf_paths) == 1:
                shutil.copy2(pdf_paths[0], out_path)
            else:
                merge_pdfs(pdf_paths, out_path)
            download_name = out_name
            mime = "application/pdf"
        else:
            out_name = "converted_pdfs.zip"
            out_path = job_dir / out_name
            zip_pdfs(pdf_paths, out_path)
            download_name = out_name
            mime = "application/zip"

        return jsonify(
            {
                "ok": True,
                "job_id": job_id,
                "download_url": f"/api/download/{job_id}/{out_name}",
                "download_name": download_name,
                "mime": mime,
                "count": len(pdf_paths),
                "mode": mode,
                "results": results,
            }
        )
    except Exception as e:
        shutil.rmtree(job_dir, ignore_errors=True)
        return jsonify({"ok": False, "error": str(e)[:500], "results": results}), 500


@app.get("/api/download/<job_id>/<path:filename>")
def download(job_id: str, filename: str):
    if not re.fullmatch(r"[a-f0-9]{32}", job_id):
        return jsonify({"ok": False, "error": "無效工作編號"}), 400
    job_dir = WORK_ROOT / job_id
    path = (job_dir / Path(filename).name).resolve()
    if not str(path).startswith(str(job_dir.resolve())) or not path.is_file():
        return jsonify({"ok": False, "error": "找不到檔案"}), 404
    return send_file(path, as_attachment=True, download_name=path.name)


@app.post("/api/cleanup/<job_id>")
def cleanup(job_id: str):
    if not re.fullmatch(r"[a-f0-9]{32}", job_id):
        return jsonify({"ok": False}), 400
    shutil.rmtree(WORK_ROOT / job_id, ignore_errors=True)
    return jsonify({"ok": True})


def main():
    # Clean old work dirs on start (optional soft cleanup)
    for d in WORK_ROOT.iterdir():
        if d.is_dir():
            try:
                # keep recent; remove if empty-ish — skip aggressive cleanup
                pass
            except Exception:
                pass
    print("Office → PDF 轉換器")
    print("引擎：LibreOffice headless")
    print("開啟：http://127.0.0.1:8765")
    app.run(host="0.0.0.0", port=8765, debug=False, threaded=True)


if __name__ == "__main__":
    main()
