with open(r"c:\Users\olwal\gregu\scratch\exact_script.js", "r", encoding="utf-8") as f:
    js = f.read()

# Add Gregory to DIRECTORS
if "'greg'" not in js:
    js = js.replace(
        "{ id: 'diane', name: 'Diane Meria', role: 'Director' }",
        "{ id: 'diane', name: 'Diane Meria', role: 'Director' },\n  { id: 'greg', name: 'Gregory Nyataige', role: 'Director' }"
    )

with open(r"c:\Users\olwal\gregu\black-rose-eval\script.js", "w", encoding="utf-8") as f:
    f.write(js)

print("Updated script.js successfully!")
