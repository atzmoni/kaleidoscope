#!/usr/bin/env python3
"""Copies src/selfie-show.js into both studio pages, between the // <selfie-show> markers."""
import re, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
mod = (root / "src/selfie-show.js").read_text(encoding="utf-8").rstrip() + "\n"
for name in ["kaleidoscope-studio.html", "src/studio.src.html"]:
    f = root / name; s = f.read_text(encoding="utf-8")
    s2, n = re.subn(r"// <selfie-show>\n.*?// </selfie-show>\n", lambda m: "// <selfie-show>\n" + mod + "// </selfie-show>\n", s, flags=re.S)
    assert n == 1, name
    f.write_text(s2, encoding="utf-8"); print("inlined into", name)
