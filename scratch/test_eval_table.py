import json
import urllib.request

url = "https://gulxkinwqdnempzeufer.supabase.co/rest/v1/evaluations"
headers = {
    "apikey": "sb_publishable_jMxabeUek8ibBY4AoPUuHA_UrApy0tD",
    "Authorization": "Bearer sb_publishable_jMxabeUek8ibBY4AoPUuHA_UrApy0tD",
    "Content-Type": "application/json",
    "Prefer": "return=representation"
}

# 1. Fetch existing evaluations
req = urllib.request.Request(url + "?select=*", headers=headers)
try:
    with urllib.request.urlopen(req) as resp:
        data = json.loads(resp.read().decode())
        print(f"FETCH STATUS: {resp.status}")
        print(f"EVALUATIONS COUNT: {len(data)}")
        print(json.dumps(data, indent=2))
except Exception as e:
    print(f"FETCH ERROR: {e}")
