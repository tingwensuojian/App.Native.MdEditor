#!/bin/bash

# Reverse proxy CGI for fnOS same-origin access.
# It forwards requests from:
#   /cgi/ThirdParty/<appname>/index.cgi/<path>?<query>
# to local backend service:
#   http://127.0.0.1:<resolved_port>/<path>?<query>

set -uo pipefail

cgi_name="index.cgi"
target_host="127.0.0.1"
request_uri="${REQUEST_URI:-/}"
query_string="${QUERY_STRING:-}"
method="${REQUEST_METHOD:-GET}"

extract_app_id() {
  local uri="$1"
  local prefix="/cgi/ThirdParty/"
  if [[ "$uri" != *"$prefix"* ]]; then
    return 1
  fi
  local tail="${uri#*${prefix}}"
  echo "${tail%%/*}"
}

extract_query_param() {
  local query="$1"
  local key="$2"
  IFS='&' read -r -a pairs <<< "$query"
  for pair in "${pairs[@]}"; do
    local k="${pair%%=*}"
    local v="${pair#*=}"
    if [[ "$k" == "$key" ]]; then
      echo "$v"
      return 0
    fi
  done
  return 1
}

read_service_port_from_config() {
  local app_id="$1"
  local config_path="/var/apps/${app_id}/config"
  if [[ -f "$config_path" ]]; then
    awk -F'=' '$1=="service_port"{print $2; exit}' "$config_path"
  fi
}

read_service_port_from_var() {
  local app_id="$1"
  local var_path="/var/apps/${app_id}/var/service_port"
  if [[ -f "$var_path" ]]; then
    awk 'NF{print $1; exit}' "$var_path"
  fi
}

resolve_target_port() {
  local app_id="$1"
  local query_port="$2"
  local port=""
  if [[ -n "$query_port" ]]; then
    port="$query_port"
  elif [[ -n "${TRIM_SERVICE_PORT:-}" ]]; then
    port="${TRIM_SERVICE_PORT}"
  elif [[ -n "${PORT:-}" ]]; then
    port="${PORT}"
  else
    port="$(read_service_port_from_var "$app_id" || true)"
  fi
  if [[ -z "$port" ]]; then
    port="$(read_service_port_from_config "$app_id" || true)"
  fi
  if [[ -z "$port" ]]; then
    port="18080"
  fi
  echo "$port"
}

sanitize_port() {
  local port="$1"
  if [[ "$port" =~ ^[0-9]{2,5}$ ]]; then
    echo "$port"
  else
    echo "18080"
  fi
}

app_id="$(extract_app_id "$request_uri" || true)"
query_port="$(extract_query_param "${query_string}" "service_port" || true)"
target_port="$(resolve_target_port "$app_id" "$query_port")"
target_port="$(sanitize_port "$target_port")"
base_url="http://${target_host}:${target_port}"

if [[ "${request_uri}" == *"${cgi_name}"* ]]; then
  after_proxy="${request_uri#*${cgi_name}}"
else
  after_proxy=""
fi

if [[ -z "${after_proxy}" ]]; then
  target_path="/"
else
  target_path="${after_proxy%%\?*}"
  [[ -z "${target_path}" ]] && target_path="/"
fi

if [[ "${request_uri}" == *"?"* ]]; then
  target_query="${request_uri#*\?}"
else
  target_query="${query_string}"
fi

target_url="${base_url}${target_path}"
if [[ -n "${target_query}" ]]; then
  target_url="${target_url}?${target_query}"
fi

curl_args=(-sS --include --http1.1 -X "${method}")
curl_args+=(-H "Host: ${target_host}:${target_port}")

[[ -n "${HTTP_COOKIE:-}" ]] && curl_args+=(-H "Cookie: ${HTTP_COOKIE}")
[[ -n "${CONTENT_TYPE:-}" ]] && curl_args+=(-H "Content-Type: ${CONTENT_TYPE}")
[[ -n "${HTTP_ACCEPT:-}" ]] && curl_args+=(-H "Accept: ${HTTP_ACCEPT}")
[[ -n "${HTTP_USER_AGENT:-}" ]] && curl_args+=(-H "User-Agent: ${HTTP_USER_AGENT}")
[[ -n "${HTTP_REFERER:-}" ]] && curl_args+=(-H "Referer: ${HTTP_REFERER}")

if [[ -n "${HTTP_X_FORWARDED_FOR:-}" ]]; then
  curl_args+=(-H "X-Forwarded-For: ${HTTP_X_FORWARDED_FOR}")
fi
if [[ -n "${REMOTE_ADDR:-}" ]]; then
  curl_args+=(-H "X-Real-IP: ${REMOTE_ADDR}")
fi

curl_args+=("${target_url}")

if [[ "${method}" == "POST" || "${method}" == "PUT" || "${method}" == "PATCH" || "${method}" == "DELETE" ]]; then
  if ! cat | curl "${curl_args[@]}" --data-binary @- | sed -e '/^HTTP\/1\.[01] 100/,/^\r\?$/d'; then
    echo "Status: 502 Bad Gateway"
    echo "Content-Type: text/plain; charset=utf-8"
    echo ""
    echo "index.cgi upstream error: ${target_host}:${target_port}"
    exit 0
  fi
else
  if ! curl "${curl_args[@]}" | sed -e '/^HTTP\/1\.[01] 100/,/^\r\?$/d'; then
    echo "Status: 502 Bad Gateway"
    echo "Content-Type: text/plain; charset=utf-8"
    echo ""
    echo "index.cgi upstream error: ${target_host}:${target_port}"
    exit 0
  fi
fi