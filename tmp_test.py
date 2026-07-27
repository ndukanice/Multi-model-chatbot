import json
import urllib.request

payload = json.dumps({"prompt": "Reply with one short sentence about the weather in Paris.", "history": []}).encode()
req = urllib.request.Request(
    "http://localhost:59018/api/chat",
    data=payload,
    headers={"Content-Type": "application/json"},
)
try:
    with urllib.request.urlopen(req, timeout=120) as r:
        print(r.read().decode())
except Exception as e:
    print(type(e).__name__, e)
