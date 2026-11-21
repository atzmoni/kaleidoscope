#!/bin/bash
# Builds the standalone pages from src/: inlines three.js into the builder and wraps both in a full document.
set -e
cd "$(dirname "$0")/.."
python3 - <<'PY'
head = '<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#07090d"><link rel="stylesheet" href="fonts/fonts.css"></head><body>\n'
s = open('src/builder.src.html', encoding='utf-8').read()
three = open('src/three.min.js', encoding='utf-8').read()
tag = '<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>'
assert tag in s
s = s.replace(tag, '<script>' + three.replace('</script', '<\\/script') + '</script>')
open('kaleidoscope-builder.html', 'w', encoding='utf-8').write(head + s + '\n</body></html>')
PY
echo "built kaleidoscope-builder.html (the studio page is kept as is; src/studio.src.html is its artifact version)"
