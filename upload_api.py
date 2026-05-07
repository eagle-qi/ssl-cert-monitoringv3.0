#!/usr/bin/env python3
import os, base64, requests, time

TOKEN = "YOUR_GITHUB_TOKEN"
REPO = "eagle-qi/ssl-cert-monitoring"
BRANCH = "main"
URL = f"https://api.github.com/repos/{REPO}/contents"
H = {"Authorization": f"token {TOKEN}", "Accept": "application/vnd.github.v3+json"}
PROXY = {"http": "http://203.0.113.1:31280", "https": "http://203.0.113.1:31280"}

SKIP = {'.git', 'node_modules', '__pycache__', '.venv', 'upload_api.py'}

def sha(p):
    r = requests.get(f"{URL}/{p}", headers=H, params={"ref": BRANCH}, proxies=PROXY)
    return r.json().get("sha") if r.status_code == 200 else None

def put(p, data):
    s = sha(p)
    d = {"message": f"Update {p}" if s else f"Add {p}", "content": data, "branch": BRANCH}
    if s: d["sha"] = s
    r = requests.put(f"{URL}/{p}", headers=H, json=d, proxies=PROXY)
    return r.status_code in (200, 201)

def walk(base):
    c = 0
    for r, ds, fs in os.walk(base):
        ds[:] = [d for d in ds if d not in SKIP]
        for f in fs:
            if f in SKIP: continue
            p = os.path.join(r, f)
            rel = os.path.relpath(p, base)
            try:
                with open(p, 'rb') as fp: content = fp.read()
                if put(rel, base64.b64encode(content).decode()):
                    print(f"✓ {rel}")
                    c += 1
                else:
                    print(f"✗ {rel}")
                time.sleep(0.1)
            except Exception as e:
                print(f"! {rel}: {e}")
    return c

print(f"Uploading to {REPO}...")
count = walk(".")
print(f"\nDone! {count} files uploaded")
