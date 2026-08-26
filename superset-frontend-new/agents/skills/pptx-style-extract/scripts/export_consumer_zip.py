#!/usr/bin/env python3
"""Export a consumer-only style package zip.

The zip keeps only files needed by the generation agent. Every entry is stored
without compression and the first entry is a plain-text guide containing the
fast path plus the core markdown, so attachment text extraction can surface the
rules without asking the agent to repair or parse binary zip bytes.
"""
import argparse
import hashlib
import json
import os
import shutil
import sys
import zipfile

KEEP_ROOT = {"design.md", "layouts.md", "manifest.json"}


def fail(msg):
    print("export_consumer_zip.py: %s" % msg, file=sys.stderr)
    sys.exit(1)


def sha256_file(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def copy_tree(src, dst, include_assets=True):
    if os.path.exists(dst):
        shutil.rmtree(dst)
    os.makedirs(dst)
    for name in KEEP_ROOT:
        src_path = os.path.join(src, name)
        if os.path.exists(src_path):
            shutil.copy2(src_path, os.path.join(dst, name))
    assets_src = os.path.join(src, "assets")
    if include_assets and os.path.isdir(assets_src):
        shutil.copytree(assets_src, os.path.join(dst, "assets"))
    if not os.path.exists(os.path.join(dst, "design.md")):
        fail("missing design.md in %s" % src)


def rel_files(root):
    out = []
    for base, dirs, files in os.walk(root):
        dirs[:] = sorted(d for d in dirs if d != "ref")
        for name in sorted(files):
            path = os.path.join(base, name)
            rel = os.path.relpath(path, root)
            out.append(rel)
    return out


def rewrite_manifest(root):
    manifest_path = os.path.join(root, "manifest.json")
    if not os.path.exists(manifest_path):
        return
    with open(manifest_path, "r", encoding="utf-8") as f:
        manifest = json.load(f)
    files = []
    for rel in rel_files(root):
        if rel == "manifest.json":
            continue
        path = os.path.join(root, rel)
        files.append({
            "path": rel,
            "bytes": os.path.getsize(path),
            "sha256": sha256_file(path),
        })
    digest = hashlib.sha256()
    for item in files:
        digest.update(item["path"].encode("utf-8"))
        digest.update(item["sha256"].encode("ascii"))
    manifest["files"] = files
    manifest["totals"] = {
        "file_count": len(files),
        "bytes": sum(x["bytes"] for x in files),
        "sha256": digest.hexdigest(),
        "asset_count": len(manifest.get("assets") or []),
    }
    manifest["consumerOnly"] = True
    manifest["ref"] = None
    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)
        f.write("\n")


def extract_fast_path(design):
    lines = design.splitlines()
    start = None
    end = None
    for i, line in enumerate(lines):
        if line.strip() == "## Agent Fast Path":
            start = i
            continue
        if start is not None and i > start and line.startswith("## "):
            end = i
            break
    if start is None:
        return ""
    return "\n".join(lines[start:end]) + "\n"


def build_prefix(root):
    with open(os.path.join(root, "design.md"), "r", encoding="utf-8") as f:
        design = f.read()
    layouts_path = os.path.join(root, "layouts.md")
    layouts = ""
    if os.path.exists(layouts_path):
        with open(layouts_path, "r", encoding="utf-8") as f:
            layouts = f.read()
    fast = extract_fast_path(design)
    layout_excerpt = layouts[:12000]
    if len(layouts) > len(layout_excerpt):
        layout_excerpt += "\n<!-- layouts.md truncated in text prefix; full file is in zip. -->\n"
    return """PPTX_STYLE_PACKAGE_TEXT_ENTRY_V1

This attachment is a Miaoda PPT style package. Use the markdown below directly.
Do not repair ZIP bytes, parse binary payloads, search attachment folders, or
rebuild the archive. The ZIP payload after this text exists only to carry image
assets. If you can read this text, you already have the style rules.

=== 00_AGENT_FAST_PATH.md ===
%s
=== design.md ===
%s
=== layouts.md ===
%s
=== ZIP_PAYLOAD_BELOW ===
""" % (fast, design, layout_excerpt)


def write_zip(root, zip_payload_path):
    prefix = os.path.basename(root)
    compression = zipfile.ZIP_STORED
    with zipfile.ZipFile(zip_payload_path, "w", compression=compression) as zf:
        guide = build_prefix(root)
        zf.writestr(prefix + "/00_AGENT_FAST_PATH.md", guide)
        for rel in rel_files(root):
            zf.write(os.path.join(root, rel), prefix + "/" + rel)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("pack_dir")
    ap.add_argument("out_zip")
    ap.add_argument("--work-dir",
                    help="consumer-only directory to materialize; default: <out_zip without .zip>")
    ap.add_argument("--no-assets", action="store_true",
                    help="export text-only zip: keep asset metadata but omit binary assets")
    args = ap.parse_args()

    pack = os.path.abspath(args.pack_dir)
    out_zip = os.path.abspath(args.out_zip)
    if not os.path.isdir(pack):
        fail("pack_dir not found: %s" % pack)
    work_dir = os.path.abspath(args.work_dir or os.path.splitext(out_zip)[0])
    copy_tree(pack, work_dir, include_assets=not args.no_assets)
    rewrite_manifest(work_dir)

    write_zip(work_dir, out_zip)

    print("consumer dir -> %s" % work_dir)
    print("zip -> %s (%d bytes)" % (out_zip, os.path.getsize(out_zip)))
    print("files -> %d" % len(rel_files(work_dir)))


if __name__ == "__main__":
    main()
