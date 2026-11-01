#!/bin/sh
# ============================================================
#  Holt die Assets eines Projekts aus dem privaten Repo
#  Amadudl/assets nach .assets/ (Gesetz Unabhaengigkeit, Punkt 7).
#  assets.lock im Wurzelordner:
#    Zeile 1: tag=<tag im Repo assets>
#    danach : je Zeile ein Pfad im Repo assets (Datei oder Ordner/)
#  Ohne assets.lock passiert nichts (Exit 0).
#  Quelle umstellbar mit ASSETS_REPO_URL (etwa fuer Tests mit file://).
#  Zugangsdaten nicht in die URL legen, sondern ueber einen Credential
#  Helper oder http.extraHeader; eine URL mit Zugangsdaten wird in der
#  Ausgabe maskiert.
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
case $url in
  *://*@*)
    case ${url#*://} in
      git@*) ;;
      *) echo "✗ assets-fetch: ASSETS_REPO_URL darf keine Zugangsdaten enthalten (Credential Helper oder http.extraHeader nutzen)"; exit 1 ;;
    esac ;;
esac
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
if grep -Evq '^[A-Za-z0-9_][A-Za-z0-9._ -]*(/[A-Za-z0-9_][A-Za-z0-9._ -]*)*/?$' "$work/paths"; then
  echo "✗ assets-fetch: Pfade in assets.lock muessen relativ sein und duerfen kein .. enthalten (erlaubt: Segmente aus A-Z a-z 0-9 _ . - Leerzeichen, nicht mit Punkt beginnend, Trenner /)"
  exit 1
fi

if awk '{ p = $0; sub(/\/$/, "", p); a[NR] = p } END { for (i = 1; i <= NR; i++) for (j = 1; j <= NR; j++) if (i != j && (a[i] == a[j] || index(a[j], a[i] "/") == 1)) { print a[i] " / " a[j]; bad = 1 } exit !bad }' "$work/paths"; then
  echo "✗ assets-fetch: Pfade in assets.lock duerfen sich nicht ueberschneiden (siehe oben)"
  exit 1
fi

# Sparse Muster (verankert) und LFS Include Liste
sed 's|^|/|' "$work/paths" > "$work/sparse"
include=$(awk '{ p = $0; sub(/\/$/, "", p); printf "%s%s,%s/**", (NR > 1 ? "," : ""), p, p }' "$work/paths")

safe_url=$(printf '%s' "$url" | sed -E 's|^([A-Za-z][A-Za-z0-9+.-]*://)[^/]*@|\1***@|')
echo "assets-fetch: hole $(wc -l < "$work/paths" | tr -d ' ') Pfad(e) aus $safe_url @ $tag"
clone_rc=0
GIT_LFS_SKIP_SMUDGE=1 git clone --quiet --depth 1 --branch "$tag" --filter=blob:none --no-checkout "$url" "$work/repo" 2> "$work/clone.err" || clone_rc=$?
sed -E "s|([A-Za-z][A-Za-z0-9+.-]*://)[^/ '\"]*@|\\1***@|g" "$work/clone.err" >&2
if [ "$clone_rc" -ne 0 ]; then
  echo "✗ assets-fetch: Klonen von $safe_url @ $tag fehlgeschlagen"
  exit 1
fi
# Symlinks (120000) und Submodule (160000) im Repo assets ablehnen, wenn sie
# ein gelisteter Pfad ist, darunter liegen oder ein Elternordner davon sind:
# cp wuerde Links mitkopieren oder ihnen folgen, Ziele laegen ausserhalb von
# .assets/. Geprueft wird der Baum, nicht das Arbeitsverzeichnis (Windows
# legt Symlinks sonst als Textdateien an).
git -C "$work/repo" -c core.quotePath=false ls-tree -r HEAD > "$work/tree"
awk -F '\t' '{ split($1, m, " "); if (m[1] == "120000" || m[1] == "160000") print $2 }' "$work/tree" > "$work/links"
if [ -s "$work/links" ] && awk 'NR == FNR { l[++n] = $0; next } { p = $0; sub(/\/$/, "", p); for (i = 1; i <= n; i++) if (l[i] == p || index(l[i], p "/") == 1 || index(p, l[i] "/") == 1) { print "    " l[i]; bad = 1 } } END { exit !bad }' "$work/links" "$work/paths"; then
  echo "✗ assets-fetch: Symlink oder Submodul im Repo assets @ $tag unter den Pfaden aus assets.lock (siehe oben); abgebrochen, nichts kopiert"
  exit 1
fi
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
  cp -RP "$work/repo/$q" "$top/.assets.new/$q"
done < "$work/paths"
if [ -n "$(find "$top/.assets.new" -type l 2>/dev/null | head -1)" ]; then
  rm -rf "$top/.assets.new"
  echo "✗ assets-fetch: Symlink in den geholten Dateien; abgebrochen, .assets/ unveraendert"
  exit 1
fi
printf 'tag=%s\n' "$tag" > "$top/.assets.new/.fetched"
rm -rf "$top/.assets"
mv "$top/.assets.new" "$top/.assets"
echo "✓ assets-fetch: .assets/ aktuell (tag $tag)"
