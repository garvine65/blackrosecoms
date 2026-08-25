import re
import os

with open(r'c:\Users\olwal\gregu\artifact-clone\index.html', 'r', encoding='utf-8') as f:
    html = f.read()

with open(r'c:\Users\olwal\gregu\black-rose-eval\script.js', 'r', encoding='utf-8') as f:
    js = f.read()

# Extract all IDs from html
html_ids = set(re.findall(r'id=["\'](.*?)["\']', html))

# Find all getElementById in js
get_ids = set(re.findall(r'getElementById\(["\'](.*?)["\']\)', js))

print("IDs queried in script.js but missing in artifact-clone/index.html:")
for gid in get_ids:
    if gid not in html_ids:
        print(f"  - {gid}")

print("\nAll IDs queried by script.js:")
for gid in sorted(get_ids):
    print(f"  {gid}: {'FOUND' if gid in html_ids else 'MISSING'}")
