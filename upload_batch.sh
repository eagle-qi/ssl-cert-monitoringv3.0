#!/bin/bash
TOKEN="YOUR_GITHUB_TOKEN"
REPO="eagle-qi/ssl-cert-monitoring"
PROXY="-x http://203.0.113.1:31280"
BASE="https://api.github.com/repos/$REPO/contents"
BRANCH="main"

upload() {
  local path="$1"
  local file="$2"
  
  # 获取 SHA
  sha=$(curl -s $PROXY -H "Authorization: token $TOKEN" "$BASE/$path?ref=$BRANCH" 2>/dev/null | grep -o '"sha":"[^"]*"' | head -1 | cut -d'"' -f4)
  
  # base64 编码内容
  if [[ "$file" == *.png || "$file" == *.svg ]]; then
    encoded=$(base64 -i "$file" 2>/dev/null | tr -d '\n')
  else
    encoded=$(base64 -i "$file" 2>/dev/null | tr -d '\n')
  fi
  
  [ -z "$encoded" ] && echo "✗ $path (encoding failed)" && return
  
  local msg="Update $path"
  [ -z "$sha" ] && msg="Add $path"
  
  # 构建 JSON
  if [ -n "$sha" ]; then
    json="{\"message\":\"$msg\",\"content\":\"$encoded\",\"branch\":\"$BRANCH\",\"sha\":\"$sha\"}"
  else
    json="{\"message\":\"$msg\",\"content\":\"$encoded\",\"branch\":\"$BRANCH\"}"
  fi
  
  # 上传
  result=$(curl -s $PROXY -X PUT -H "Authorization: token $TOKEN" -H "Content-Type: application/json" -d "$json" "$BASE/$path" 2>/dev/null)
  
  if echo "$result" | grep -q '"sha"'; then
    echo "✓ $path"
    return 0
  else
    echo "✗ $path"
    return 1
  fi
}

export -f upload
export TOKEN PROXY BASE BRANCH

cd /Users/monkey/WorkBuddy/20260501220232/ssl-cert-monitoring

# 跳过列表
SKIP_DIRS="node_modules __pycache__ .venv .git upload"
SKIP_FILES="upload_api.py upload.sh push_v2.py"

total=0
success=0

find . -type f ! -path './.git/*' | while read f; do
  # 检查跳过目录
  skip=0
  for skip_dir in $SKIP_DIRS; do
    if echo "$f" | grep -q "/$skip_dir/"; then
      skip=1
      break
    fi
  done
  
  # 检查跳过文件
  fname=$(basename "$f")
  for skip_file in $SKIP_FILES; do
    if [ "$fname" = "$skip_file" ]; then
      skip=1
      break
    fi
  done
  
  if [ $skip -eq 0 ]; then
    path="${f:2}"
    upload "$path" "$f"
    success=$((success + $?))
    total=$((total + 1))
  fi
done

echo ""
echo "Uploaded: $((success))/$total files"
