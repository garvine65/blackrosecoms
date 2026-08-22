import re
import json

with open(r'c:\Users\olwal\gregu\artifact-clone\app.js', 'r', encoding='utf-8') as f:
    text = f.read()

m = re.search(r'const CL_TEMPLATES = (\[.*?\]);\n\n// ── State', text, re.DOTALL)
if m:
    tpls = json.loads(m.group(1))
    print(f"Successfully parsed {len(tpls)} templates from app.js!\n")
    for t in tpls:
        tot_items = sum(len(s['items']) for s in t['sections'])
        print(f"  - {t['id'].lpad if hasattr(t['id'], 'lpad') else t['id']} | {t['name']} | {len(t['sections'])} sections | {tot_items} items | Clients: {t['clientTypes']}")
else:
    print("Failed to find CL_TEMPLATES match")
