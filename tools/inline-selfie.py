#!/usr/bin/env python3
"""Copies the studio modules into both studio pages, between their markers:
src/selfie-show.js → // <selfie-show> … // </selfie-show>, src/studio-pro.js → // <studio-pro> … // </studio-pro>."""
import re, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
MODS = [("selfie-show", "src/selfie-show.js"), ("studio-pro", "src/studio-pro.js")]
for name in ["kaleidoscope-studio.html", "src/studio.src.html"]:
    f = root / name; s = f.read_text(encoding="utf-8")
    for tag, path in MODS:
        mod = (root / path).read_text(encoding="utf-8").rstrip() + "\n"
        s, n = re.subn(r"// <%s>\n.*?// </%s>\n" % (tag, tag), lambda m: "// <%s>\n" % tag + mod + "// </%s>\n" % tag, s, flags=re.S)
        assert n == 1, (name, tag)
    f.write_text(s, encoding="utf-8"); print("inlined into", name)
