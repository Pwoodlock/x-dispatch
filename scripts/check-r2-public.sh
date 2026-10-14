#!/usr/bin/env bash
# Checks dl.x-dispatch.app the way installed apps, updaters and the website see it.
# Runs from CI machines on purpose: data-center traffic is what edge bot rules block.
#
#   check-r2-public.sh [tag...]   extra tags to verify besides the current stable and RC
set -uo pipefail

BASE="${R2_PUBLIC_BASE:-https://dl.x-dispatch.app}"
# User agents of the real clients: the in-app update check, the Windows updater, the website sync.
UA_APP="X-Dispatch/health-check"
UA_SQUIRREL="update-electron-app/3.3.0 (win32: x64)"
UA_NODE="node"

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
failures=0

fail() {
  echo "::error title=dl.x-dispatch.app::$1"
  echo "- :x: $1" >> "${GITHUB_STEP_SUMMARY:-/dev/null}"
  failures=$((failures + 1))
}

# jq on Windows ends lines with CR; strip it so local runs behave like CI.
jqr() { jq -r "$@" | tr -d '\r'; }

# Prints the HTTP status; the body lands in $2.
get() {
  local url="$1" out="$2" ua="$3" code
  code="$(curl -sS -L --retry 2 --max-time 30 -A "$ua" -o "$out" -w '%{http_code}' "$url")" || true
  echo "${code:-000}"
}

# Fetches the first byte and prints "<status> <total size>".
probe() {
  local url="$1" ua="$2" headers="$WORK/headers" code total
  : > "$headers"
  code="$(curl -sS -L --retry 2 --max-time 30 -A "$ua" -r 0-0 -o /dev/null -D "$headers" -w '%{http_code}' "$url")" || true
  total="$(tr -d '\r' < "$headers" | awk -F'/' 'tolower($0) ~ /^content-range:/ { print $2 }' | tail -1)"
  echo "${code:-000} ${total:-?}"
}

check_release() {
  local tag="$1" manifest="$WORK/$tag.json" code extra name size url result
  code="$(get "$BASE/releases/$tag/manifest.json" "$manifest" "$UA_NODE")"
  if [ "$code" != "200" ]; then
    fail "releases/$tag/manifest.json returned $code"
    return
  fi
  for extra in notes.md sha256sums.txt; do
    code="$(get "$BASE/releases/$tag/$extra" /dev/null "$UA_NODE")"
    [ "$code" = "200" ] || fail "releases/$tag/$extra returned $code"
  done
  while IFS=$'\t' read -r name size url; do
    result="$(probe "$url" "$UA_APP")"
    if [ "${result%% *}" != "206" ]; then
      fail "$name returned ${result%% *}"
    elif [ "${result#* }" != "$size" ]; then
      fail "$name is ${result#* } bytes, manifest says $size"
    fi
  done < <(jqr '.files[] | [.name, (.size | tostring), .url] | @tsv' "$manifest")
}

declare -a tags=()
for pointer in latest.json latest-rc.json; do
  code="$(get "$BASE/$pointer" "$WORK/$pointer" "$UA_APP")"
  if [ "$code" != "200" ]; then
    fail "$pointer returned $code"
    continue
  fi
  expected="stable"
  [ "$pointer" = "latest-rc.json" ] && expected="rc"
  channel="$(jqr '.channel // empty' "$WORK/$pointer" 2>/dev/null)"
  tag="$(jqr '.tag // empty' "$WORK/$pointer" 2>/dev/null)"
  if [ "$channel" != "$expected" ] || [ -z "$tag" ]; then
    fail "$pointer is not a valid $expected manifest"
    continue
  fi
  tags+=("$tag")
done

code="$(get "$BASE/win32/x64/RELEASES?id=XDispatch&localVersion=0.0.0&arch=amd64" "$WORK/RELEASES" "$UA_SQUIRREL")"
if [ "$code" != "200" ]; then
  fail "Windows feed RELEASES returned $code"
else
  while read -r _ package _; do
    [ -n "${package:-}" ] || continue
    result="$(probe "$BASE/win32/x64/$package" "$UA_SQUIRREL")"
    [ "${result%% *}" = "206" ] || fail "Windows feed package $package returned ${result%% *}"
  done < <(tr -d '\r' < "$WORK/RELEASES" | sed 's/^\xEF\xBB\xBF//')
fi

# Velopack feed: each channel's release list, and every package it names at its size.
# Beta lists exist only while a beta does; before the first Velopack release there are none.
stable_lists=0
for channel in win linux-x64 linux-arm64 darwin-arm64 darwin-x64 \
  win-beta linux-x64-beta linux-arm64-beta darwin-arm64-beta darwin-x64-beta; do
  list="$WORK/releases.$channel.json"
  code="$(get "$BASE/updates/releases.$channel.json?id=XDispatch&localVersion=0.0.0" "$list" "$UA_APP")"
  if [ "$code" = "404" ]; then
    continue
  elif [ "$code" != "200" ]; then
    fail "updates/releases.$channel.json returned $code"
    continue
  fi
  [[ "$channel" == *-beta ]] || stable_lists=$((stable_lists + 1))
  while IFS=$'\t' read -r name size; do
    result="$(probe "$BASE/updates/$name" "$UA_APP")"
    if [ "${result%% *}" != "206" ]; then
      fail "updates/$name returned ${result%% *}"
    elif [ "${result#* }" != "$size" ]; then
      fail "updates/$name is ${result#* } bytes, releases.$channel.json says $size"
    fi
  done < <(jqr '.Assets[] | [.FileName, (.Size | tostring)] | @tsv' "$list")
done
case "$stable_lists" in
  0) echo "::notice title=dl.x-dispatch.app::No Velopack update feed yet." ;;
  5) ;;
  *) fail "Only $stable_lists of 5 stable Velopack release lists are published" ;;
esac

for tag in "${tags[@]}" "$@"; do
  check_release "$tag"
done

if [ "$failures" -gt 0 ]; then
  echo "$failures problem(s) on $BASE"
  exit 1
fi
echo "- :white_check_mark: dl.x-dispatch.app serves ${tags[*]} $* to apps, updaters and the website" >> "${GITHUB_STEP_SUMMARY:-/dev/null}"
echo "OK: ${tags[*]} $*"
