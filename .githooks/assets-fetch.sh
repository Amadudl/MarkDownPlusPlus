#!/bin/sh
# ============================================================
#  Holt die Assets eines Projekts aus dem privaten Repo
#  Amadudl/assets nach .assets/ (Gesetz Unabhaengigkeit, Punkt 7).
#  assets.lock im Wurzelordner:
#    Zeile 1: tag=<tag im Repo assets>
#    danach : je Zeile ein Pfad im Repo assets (Datei oder Ordner/)
#  Ohne assets.lock passiert nichts (Exit 0).
#  Quelle umstellbar mit ASSETS_REPO_URL (etwa in der CI mit Token
#  aus einem Secret oder fuer Tests mit file://).
#  Aufruf: sh .githooks/assets-fetch.sh
# ============================================================
set -eu

top=$(git rev-parse --show-toplevel 2>/dev/null) || {
  echo "✗ assets-fetch: kein Git Repository"
  exit 1
}
cd "$top"
[ -f assets.lock ] || exit 0

url=${ASSETS_REPO_URL:-https://github.com/Amadudl/assets}
work=$(mktemp -d "${TMPDIR:-/tmp}/assets.XXXXXX")
trap 'rm -rf "$work"' EXIT
trap 'exit 1' INT TERM HUP

tr -d '\r' < assets.lock > "$work/lock"
tag=$(sed -n '1s/^tag=//p' "$work/lock" | sed 's/[[:space:]]*$//')
if [ -z "$tag" ]; then
  echo "✗ assets-fetch: erste Zeile von assets.lock muss tag=<tag> sein"
  exit 1
fi
sed -n '2,$p' "$work/lock" | sed 's/^[[:space:]]*//; s/[[:space:]]*$//' | grep -v '^#' | grep -v '^$' > "$work/paths" || true
if [ ! -s "$work/paths" ]; then
  echo "assets-fetch: assets.lock nennt keine Pfade, nichts zu holen"
  exit 0
fi
if grep -Eq '(^|/)\.\.(/|$)|^/' "$work/paths"; then
  echo "✗ assets-fetch: Pfade in assets.lock muessen relativ sein und duerfen kein .. enthalten"
  exit 1
fi

# Sparse Muster (verankert) und LFS Include Liste
sed 's|^|/|' "$work/paths" > "$work/sparse"
include=$(awk '{ p = $0; sub(/\/$/, "", p); printf "%s%s,%s/**", (NR > 1 ? "," : ""), p, p }' "$work/paths")

echo "assets-fetch: hole $(wc -l < "$work/paths" | tr -d ' ') Pfad(e) aus $url @ $tag"
GIT_LFS_SKIP_SMUDGE=1 git clone --quiet --depth 1 --branch "$tag" --filter=blob:none --no-checkout "$url" "$work/repo"
git -C "$work/repo" sparse-checkout set --no-cone --stdin < "$work/sparse"
GIT_LFS_SKIP_SMUDGE=1 git -C "$work/repo" checkout --quiet
if git -C "$work/repo" lfs version >/dev/null 2>&1; then
  git -C "$work/repo" lfs pull --include="$include"
else
  if grep -rlq '^version https://git-lfs.github.com/spec/v1' "$work/repo" --exclude-dir=.git 2>/dev/null; then
    echo "✗ assets-fetch: git lfs fehlt, die Dateien sind nur LFS Zeiger. Installieren: https://git-lfs.com"
    exit 1
  fi
fi

missing=0
while IFS= read -r p; do
  src="$work/repo/${p%/}"
  if [ ! -e "$src" ]; then
    echo "✗ assets-fetch: $p fehlt im Repo assets @ $tag"
    missing=1
  fi
done < "$work/paths"
[ "$missing" -eq 0 ] || exit 1

rm -rf "$top/.assets.new"
mkdir -p "$top/.assets.new"
while IFS= read -r p; do
  q=${p%/}
  case $q in
    */*) mkdir -p "$top/.assets.new/${q%/*}" ;;
  esac
  cp -R "$work/repo/$q" "$top/.assets.new/$q"
done < "$work/paths"
printf 'tag=%s\n' "$tag" > "$top/.assets.new/.fetched"
rm -rf "$top/.assets"
mv "$top/.assets.new" "$top/.assets"
echo "✓ assets-fetch: .assets/ aktuell (tag $tag)"
