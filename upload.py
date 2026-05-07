#!/usr/bin/env python3
import os, base64, requests, json, time

TOKEN = "YOUR_GITHUB_TOKEN"
REPO = "eagle-qi/ssl-cert-monitoring"
BRANCH = "main"
URL = f"https://api.github.com/repos/{REPO}/contents"
PROXY = {"http": "http://203.0.113.1:31280", "https": "http://203.0.113.1:31280"}
H = {"Authorization": f"token {TOKEN}", "Accept": "application/vnd.github.v3+json"}

SKIP = {'.git', 'node_modules', '__pycache__', '.venv', 'upload_api.py', 'upload.sh', 'upload_batch.sh', 'push_v2.py'}

def get_sha(path):
    try:
        r = requests.get(f"{URL}/{path}", headers=H, params={"ref": BRANCH}, proxies=PROXY, timeout=10)
        if r.status_code == 200:
            return r.json().get("sha")
    except: pass
    return None

def upload(path):
    try:
        with open(path, 'rb') as f:
            content = f.read()
        encoded = base64.b64encode(content).decode()
        sha = get_sha(path)
        data = {"message": f"Update {path}" if sha else f"Add {path}", "content": encoded, "branch": BRANCH}
        if sha: data["sha"] = sha
        r = requests.put(f"{URL}/{path}", headers=H, json=data, proxies=PROXY, timeout=30)
        if r.status_code in (200, 201):
            print(f"✓ {path}")
            return True
        else:
            print(f"✗ {path}: {r.json().get('message', r.status_code)}")
    except Exception as e:
        print(f"! {path}: {e}")
    return False

print(f"Uploading to {REPO}/tree/{BRANCH}...")
total = success = 0

for root, dirs, files in os.walk("."):
    dirs[:] = [d for d in dirs if d not in SKIP]
    for f in files:
        if f in SKIP: continue
        path = os.path.relpath(os.path.join(root, f), ".")
        total += 1
        if upload(path):
            success += 1
        time.sleep(0.2)

print(f"\nDone: {success}/{total} files uploaded")
