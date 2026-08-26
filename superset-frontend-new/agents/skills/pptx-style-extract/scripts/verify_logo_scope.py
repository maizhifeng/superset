#!/usr/bin/env python3
"""Backward-compatible entrypoint for PPTX layout asset verification."""
import sys

from verify_layout_assets import main, validate_layout_assets

validate_logo_scope = validate_layout_assets


if __name__ == "__main__":
    sys.exit(main())
