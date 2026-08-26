#!/usr/bin/env python3
"""Export a markdown-only consumer attachment for generation agents.

The full style package can still be zipped for audit/storage. This exporter is
for the runtime generation path: one plain markdown file with design.md and
layouts.md inlined, so attachment preprocessing does not enter archive handling.
"""
import argparse
import os
import sys


def fail(msg):
    print("export_consumer_md.py: %s" % msg, file=sys.stderr)
    sys.exit(1)


def read_text(path, required=True):
    if not os.path.exists(path):
        if required:
            fail("missing %s" % path)
        return ""
    with open(path, "r", encoding="utf-8") as f:
        return f.read()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("pack_dir")
    ap.add_argument("out_md")
    args = ap.parse_args()

    pack = os.path.abspath(args.pack_dir)
    out = os.path.abspath(args.out_md)
    if not os.path.isdir(pack):
        fail("pack_dir not found: %s" % pack)

    design = read_text(os.path.join(pack, "design.md"))
    layouts = read_text(os.path.join(pack, "layouts.md"), required=False)
    manifest = read_text(os.path.join(pack, "manifest.json"), required=False)

    content = [
        "# Miaoda PPT Style Consumer Attachment",
        "",
        "> Runtime rule: this is a plain markdown style attachment. Use the text",
        "> below directly. Do not invoke archive/zip preprocessing, do not search",
        "> `.agent/*/attachments`, do not repair files, and do not read any other",
        "> style package files. Start building after this document is read once.",
        "",
        "## design.md",
        "",
        design.rstrip(),
    ]
    if layouts:
        content += ["", "## layouts.md", "", layouts.rstrip()]
    if manifest:
        content += [
            "",
            "## manifest.json",
            "",
            "```json",
            manifest.rstrip(),
            "```",
        ]
    content.append("")

    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, "w", encoding="utf-8") as f:
        f.write("\n".join(content))

    print("markdown -> %s (%d bytes)" % (out, os.path.getsize(out)))


if __name__ == "__main__":
    main()
