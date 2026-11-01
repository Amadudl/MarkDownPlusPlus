#!/bin/sh
# Git LFS fuer die Hooks (IEX-Labs-Hook-Kit v3).
# core.hooksPath = .githooks verdraengt die Hooks aus "git lfs install" in
# .git/hooks. Die Kit Hooks rufen git lfs deshalb selbst auf, wie es die Hooks
# von git lfs tun, aber nur wenn das Repo LFS nutzt (.gitattributes mit
# filter=lfs). Fehlt git-lfs dann, melden sie das und enden mit 2, wie git lfs.
# Wird mit "." eingebunden.

# iex_lfs_attr_datei <datei>: wahr, wenn die Attributdatei filter=lfs setzt.
iex_lfs_attr_datei() {
  tr -d '\r' < "$1" 2>/dev/null | grep -v '^[[:space:]]*#' | grep -Eq '[[:space:]]filter=lfs([[:space:]]|$)'
}

# iex_lfs_genutzt [commit ...]
# Wahr, wenn eine .gitattributes im Arbeitsverzeichnis (versioniert oder neu)
# oder in einem der genannten Commits filter=lfs setzt.
iex_lfs_genutzt() {
  _lfs_top=$(git rev-parse --show-toplevel 2>/dev/null) || _lfs_top=""
  if [ -n "$_lfs_top" ]; then
    _lfs_liste=$(git -C "$_lfs_top" -c core.quotePath=false ls-files -co --exclude-standard -- ':(glob)**/.gitattributes' 2>/dev/null)
    _lfs_alt_ifs=$IFS; IFS='
'
    for _lfs_f in $_lfs_liste; do
      if [ -f "$_lfs_top/$_lfs_f" ] && iex_lfs_attr_datei "$_lfs_top/$_lfs_f"; then IFS=$_lfs_alt_ifs; return 0; fi
    done
    IFS=$_lfs_alt_ifs
  fi
  for _lfs_c in "$@"; do
    case "$_lfs_c" in *[!0]*) ;; *) continue ;; esac
    git rev-parse --verify --quiet "$_lfs_c^{commit}" >/dev/null 2>&1 || continue
    _lfs_liste=$(git -c core.quotePath=false ls-tree -r --name-only "$_lfs_c" 2>/dev/null | grep -E '(^|/)\.gitattributes$')
    _lfs_alt_ifs=$IFS; IFS='
'
    for _lfs_f in $_lfs_liste; do
      if git cat-file blob "$_lfs_c:$_lfs_f" 2>/dev/null | tr -d '\r' | grep -v '^[[:space:]]*#' | grep -Eq '[[:space:]]filter=lfs([[:space:]]|$)'; then
        IFS=$_lfs_alt_ifs; return 0
      fi
    done
    IFS=$_lfs_alt_ifs
  done
  return 1
}

# iex_lfs_vorhanden <hookname>: wahr, wenn git-lfs im PATH liegt; sonst Meldung.
iex_lfs_vorhanden() {
  command -v git-lfs >/dev/null 2>&1 && return 0
  echo "✗ $1: Dieses Repo nutzt Git LFS (.gitattributes mit filter=lfs), aber git-lfs fehlt im PATH. Installieren: https://git-lfs.com" >&2
  return 2
}
