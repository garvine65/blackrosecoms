import re

def check_html(path):
    print(f"Checking {path}...")
    with open(path, "r", encoding="utf-8") as f:
        content = f.read()
    
    # Check for all 5 metrics
    metrics = [
        "Quality of Work",
        "Compliance & Risk Oversight",
        "Compliance &amp; Risk Oversight",
        "Communication",
        "Timeliness & Reliability",
        "Timeliness &amp; Reliability",
        "Leadership & Initiative",
        "Leadership &amp; Initiative"
    ]
    
    for m in ["Quality of Work", "Compliance", "Communication", "Timeliness", "Leadership", "Overall Rating"]:
        found = m in content
        print(f"  - {m}: {'FOUND' if found else 'MISSING'}")

check_html(r"c:\Users\olwal\gregu\artifact-clone\index.html")
print()
check_html(r"c:\Users\olwal\gregu\black-rose-eval\index.html")
