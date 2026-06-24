#!/usr/bin/env bash
set -euo pipefail

# ===== 可改配置 =====
BASE_URL="${BASE_URL:-http://192.168.2.2:3000}"
USERNAME="${USERNAME:-admin}"
PASSWORD="${PASSWORD:-admin123456}"
TEST_FILE_PATH="${TEST_FILE_PATH:-/vol4/1000/开发文件夹/mac/tmp-auth-test.txt}"
# ====================

COOKIE_JAR="$(mktemp)"
cleanup() { rm -f "$COOKIE_JAR"; }
trap cleanup EXIT

echo "== BASE_URL: $BASE_URL"
echo "== USERNAME: $USERNAME"
echo "== TEST_FILE_PATH: $TEST_FILE_PATH"
echo

step() { echo; echo "---- $1 ----"; }

step "1) 未登录检查 /api/auth/me (期望 401)"
HTTP_CODE=$(curl -sS -o /tmp/auth_me_before.json -w "%{http_code}" \
  -b "$COOKIE_JAR" -c "$COOKIE_JAR" \
  "$BASE_URL/api/auth/me" || true)
echo "HTTP: $HTTP_CODE"
cat /tmp/auth_me_before.json || true
echo

if [[ "$HTTP_CODE" != "401" ]]; then
  echo "[失败] 未登录 /me 不是 401，认证保护可能未生效。"
  exit 1
fi

step "2) 登录 /api/auth/login"
HTTP_CODE=$(curl -sS -o /tmp/auth_login.json -w "%{http_code}" \
  -X POST "$BASE_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"$USERNAME\",\"password\":\"$PASSWORD\"}" \
  -b "$COOKIE_JAR" -c "$COOKIE_JAR")
echo "HTTP: $HTTP_CODE"
cat /tmp/auth_login.json
echo

if [[ "$HTTP_CODE" != "200" ]]; then
  echo "[失败] 登录未成功，请检查用户名/密码或后端日志。"
  exit 1
fi

step "3) 登录后检查 /api/auth/me (期望 200)"
HTTP_CODE=$(curl -sS -o /tmp/auth_me_after.json -w "%{http_code}" \
  -b "$COOKIE_JAR" -c "$COOKIE_JAR" \
  "$BASE_URL/api/auth/me")
echo "HTTP: $HTTP_CODE"
cat /tmp/auth_me_after.json
echo

if [[ "$HTTP_CODE" != "200" ]]; then
  echo "[失败] 登录后 /me 不是 200。"
  exit 1
fi

step "4) 写文件 POST /api/file (期望 200 或 403)"
HTTP_CODE=$(curl -sS -o /tmp/auth_write.json -w "%{http_code}" \
  -X POST "$BASE_URL/api/file" \
  -H "Content-Type: application/json" \
  -d "$(cat <<EOF
{"path":"$TEST_FILE_PATH","content":"hello auth test $(date +%s)","encoding":"utf8"}
EOF
)" \
  -b "$COOKIE_JAR" -c "$COOKIE_JAR")
echo "HTTP: $HTTP_CODE"
cat /tmp/auth_write.json
echo

step "5) 读文件 GET /api/file (期望 200 或 403/404)"
ENC_PATH=$(python3 - <<PY
import urllib.parse
print(urllib.parse.quote("""$TEST_FILE_PATH""", safe=""))
PY
)
HTTP_CODE=$(curl -sS -o /tmp/auth_read.json -w "%{http_code}" \
  -b "$COOKIE_JAR" -c "$COOKIE_JAR" \
  "$BASE_URL/api/file?path=$ENC_PATH&mode=text")
echo "HTTP: $HTTP_CODE"
cat /tmp/auth_read.json
echo

step "6) 删文件 POST /api/file/delete (期望 200 或 403/404)"
HTTP_CODE=$(curl -sS -o /tmp/auth_delete.json -w "%{http_code}" \
  -X POST "$BASE_URL/api/file/delete" \
  -H "Content-Type: application/json" \
  -d "{\"path\":\"$TEST_FILE_PATH\"}" \
  -b "$COOKIE_JAR" -c "$COOKIE_JAR")
echo "HTTP: $HTTP_CODE"
cat /tmp/auth_delete.json
echo

step "7) 退出登录 /api/auth/logout (期望 200)"
HTTP_CODE=$(curl -sS -o /tmp/auth_logout.json -w "%{http_code}" \
  -X POST "$BASE_URL/api/auth/logout" \
  -b "$COOKIE_JAR" -c "$COOKIE_JAR")
echo "HTTP: $HTTP_CODE"
cat /tmp/auth_logout.json
echo

step "8) 退出后再查 /api/auth/me (期望 401)"
HTTP_CODE=$(curl -sS -o /tmp/auth_me_final.json -w "%{http_code}" \
  -b "$COOKIE_JAR" -c "$COOKIE_JAR" \
  "$BASE_URL/api/auth/me")
echo "HTTP: $HTTP_CODE"
cat /tmp/auth_me_final.json
echo

echo
echo "== 测试完成 =="
echo "说明："
echo "- 200: 操作成功"
echo "- 403: 权限不足（这是权限系统生效的表现）"
echo "- 404: 路由或目标资源不存在"
echo "- 401: 未登录"