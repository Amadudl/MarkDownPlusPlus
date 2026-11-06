#!/bin/sh
# ============================================================
#  Pruefung "unabhaengigkeit" (IEX-Labs-Hook-Kit).
#  Gesetz Unabhaengigkeit, AGENTS.md Abschnitt 1, Punkt 9:
#  a) jede direkte Abhaengigkeit aus package.json, Cargo.toml,
#     requirements*.txt und pyproject.toml steht in opensource.md
#     (Spalte 1); andere Manifesttypen brauchen eine offene Zeile
#     mit ihrem Pfad in cleanup.md
#  b) opensource.md und cleanup.md liegen im Wurzelordner
#  c) Medien und Schriften im Repo nur als offene Aufgabe in
#     cleanup.md (Bestand); neue kommen ueber assets.lock und
#     .githooks/assets-fetch.sh aus dem Repo Amadudl/assets.
#     Im Repo assets selbst (Markerdatei .assets-repo) muss jede
#     Mediendatei in ATTRIBUTION.md stehen.
#  Gelesen wird der Git Index (im pre-commit also das, was
#  committet wird; in der CI der ausgecheckte Stand).
#  Aufruf: sh .githooks/unabhaengigkeit.sh
#  Nur sh, git, awk, sed, grep, tr.
# ============================================================
set -u

top=$(git rev-parse --show-toplevel 2>/dev/null) || {
  echo "✗ unabhaengigkeit: kein Git Repository"
  exit 1
}
cd "$top" || exit 1

tmp=$(mktemp -d "${TMPDIR:-/tmp}/unabh.XXXXXX") || exit 1
trap 'rm -rf "$tmp"' EXIT
trap 'exit 1' INT TERM HUP

fail=0
err() {
  printf '✗ unabhaengigkeit: %s\n' "$1"
  fail=1
}
has() { git cat-file -e ":$1" 2>/dev/null; }
blob() { git cat-file -p ":$1" 2>/dev/null </dev/null | tr -d '\r'; }

git -c core.quotePath=false ls-files --cached > "$tmp/files" || exit 1

# ---------- Regel b ----------
for f in opensource.md cleanup.md; do
  if ! has "$f"; then
    err "$f fehlt im Wurzelordner (oder ist nicht mit 'git add' vorgemerkt). Vorlage: 90_System/Hausordnung.md, Abschnitt „Unabhängigkeit“."
  fi
done

# Komponentennamen aus Spalte 1 der Tabelle in opensource.md
blob opensource.md | awk -F'|' '
  /^[ \t]*\|/ {
    n = $2
    gsub(/`/, "", n); gsub(/\*\*/, "", n)
    if (n ~ /^[ \t]*\[.*\]\(.*\)[ \t]*$/) { sub(/^[ \t]*\[/, "", n); sub(/\]\(.*$/, "", n) }
    gsub(/[ \t]/, "", n)
    if (n == "" || n ~ /^:?-+:?$/ || n == "Komponente") next
    print n
  }' > "$tmp/allowed"

# Offene Aufgaben aus cleanup.md
blob cleanup.md | awk '/^[ \t]*[-*+][ \t]+\[[ \t]\]/' > "$tmp/open"

# Gemeinsame awk Funktionen: Pfad als ganzes Wort in einer Zeile
AWK_MENTION='
function isb(c) { return c == "" || index(" \t`()[]\"<>,;:|*", c) > 0 || c == "\047" }
function mentions(line, s,   pos, off, b, a, a2) {
  off = 0
  while ((pos = index(substr(line, off + 1), s)) > 0) {
    pos += off
    b = (pos > 1) ? substr(line, pos - 1, 1) : ""
    a = substr(line, pos + length(s), 1)
    a2 = substr(line, pos + length(s) + 1, 1)
    if (isb(b) && (isb(a) || (a == "." && (a2 == "" || a2 == " " || a2 == "\t")))) return 1
    off = pos
  }
  return 0
}
function covered(p, pfx,   i, j, n, parts, pre) {
  for (i = 1; i <= nl; i++) if (mentions(L[i], p)) return 1
  if (pfx == "") return 0
  n = split(p, parts, "/")
  pre = ""
  for (j = 1; j < n; j++) {
    pre = pre parts[j] "/"
    for (i = 1; i <= nl; i++) if (tolower(L[i]) ~ pfx && mentions(L[i], pre)) return 1
  }
  return 0
}
function loadlines(f,   l) { nl = 0; while ((getline l < f) > 0) L[++nl] = l; close(f) }
'

# ---------- Manifeste finden ----------
awk '
{
  p = $0
  if (("/" p) ~ /\/node_modules\//) next
  n = split(p, a, "/"); b = a[n]
  if (b == "package.json") print "npm\t" p
  else if (b == "Cargo.toml") print "cargo\t" p
  else if (b ~ /^requirements.*\.txt$/) print "req\t" p
  else if (b == "pyproject.toml") print "pyproject\t" p
  else if (b == "build.gradle" || b == "build.gradle.kts" || b ~ /\.csproj$/ || b == "pom.xml" || b == "go.mod" || b == "pubspec.yaml" || b == "composer.json" || b == "Gemfile") print "unknown\t" p
}' "$tmp/files" > "$tmp/manifests"

# ---------- Parser ----------
# Ausgabe je Parser: "self<TAB>name" (eigenes Paket) oder "dep<TAB>name<TAB>own|ext"
AWK_NPM='
function ownv(v,  l) {
  l = tolower(v)
  if (v ~ /^workspace:/) return 1
  if (v ~ /^(file|link):/) { sub(/[#?].*$/, "", l); return l !~ /\.(whl|tgz|tar|tar\.gz|tar\.bz2|tar\.xz|zip)$/ }
  if (l ~ /(\/|:)\.\.?(\/|$)|%2e/) return 0
  return l ~ /^(git\+)?(https:\/\/|ssh:\/\/git@|git@)github\.com[\/:]amadudl\/lib-[a-z0-9._-]+(\.git)?([\/#?@]|$)/ || l ~ /^(github:)?amadudl\/lib-[a-z0-9._-]+(\.git)?([\/#?@]|$)/
}
{ s = s $0 "\n" }
END {
  n = 0; len = length(s); i = 1
  while (i <= len) {
    c = substr(s, i, 1)
    if (c == " " || c == "\t" || c == "\n") { i++; continue }
    if (index("{}[]:,", c)) { T[++n] = c; K[n] = "p"; i++; continue }
    if (c == "\"") {
      v = ""; i++
      while (i <= len) {
        c = substr(s, i, 1)
        if (c == "\\") { v = v substr(s, i + 1, 1); i += 2; continue }
        if (c == "\"") break
        v = v c; i++
      }
      i++; T[++n] = v; K[n] = "s"; continue
    }
    v = ""
    while (i <= len && index(" \t\n{}[]:,\"", substr(s, i, 1)) == 0) { v = v substr(s, i, 1); i++ }
    T[++n] = v; K[n] = "l"
  }
  sec["dependencies"]; sec["devDependencies"]; sec["peerDependencies"]; sec["optionalDependencies"]
  d = 0
  for (i = 1; i <= n; i++) {
    t = T[i]
    if (K[i] == "p") {
      if (t == "{" || t == "[") { d++; ty[d] = t; ek[d] = (t == "{"); continue }
      if (t == "}" || t == "]") { d--; continue }
      if (t == ",") { if (ty[d] == "{") ek[d] = 1; continue }
      continue
    }
    if (K[i] == "s" && ty[d] == "{" && ek[d]) {
      key[d] = t; ek[d] = 0
      if (T[i + 1] != ":") continue
      if (d == 1 && t == "name" && K[i + 2] == "s") print "self\t" T[i + 2]
      if (d == 2 && ty[1] == "{" && (key[1] in sec) && K[i + 2] == "s") {
        v = T[i + 2]; name = t
        if (v ~ /^npm:/) {
          r = substr(v, 5); p = 0
          for (j = length(r); j > 1; j--) if (substr(r, j, 1) == "@") { p = j; break }
          name = (p > 1) ? substr(r, 1, p - 1) : r
        }
        print "dep\t" name "\t" (ownv(v) ? "own" : "ext")
      }
    }
  }
}'

AWK_CARGO='
function own(v,  g) {
  v = tolower(v)
  if (match(v, /(^|[{, \t])git[ \t]*=[ \t]*"[^"]*"/)) { g = substr(v, RSTART, RLENGTH); sub(/^[^"]*"/, "", g); sub(/"$/, "", g) }
  else { g = v; gsub(/^[ \t"\047]+|[ \t"\047]+$/, "", g) }
  if (g ~ /(\/|:)\.\.?(\/|$)|%2e/) return 0
  return g ~ /^(git\+)?(https:\/\/|ssh:\/\/git@|git@)github\.com[\/:]amadudl\/lib-[a-z0-9._-]+(\.git)?([\/#?@]|$)/
}
function unq(s) { sub(/[ \t]#.*$/, "", s); gsub(/^[ \t"\047]+|[ \t"\047]+$/, "", s); return s }
function add(n) { if (!(n in seen)) { seen[n] = 1; ord[++cnt] = n } }
{
  t = $0; sub(/^[ \t]+/, "", t); sub(/[ \t]+$/, "", t)
  if (t == "" || t ~ /^#/) next
  if (t ~ /^\[/) {
    h = t; sub(/^\[+[ \t]*/, "", h); sub(/[ \t]*\]+[ \t]*(#.*)?$/, "", h)
    sect = ""; inpkg = (h == "package")
    if (h ~ /(^|\.)(dev-|build-)?dependencies$/) sect = "dep"
    else if (h ~ /(^|\.)(dev-|build-)?dependencies\.[^.]+$/) { sect = "tbl"; cur = h; sub(/^.*\./, "", cur); cur = unq(cur); add(cur) }
    next
  }
  if (inpkg && t ~ /^name[ \t]*=/) { v = t; sub(/^name[ \t]*=/, "", v); print "self\t" unq(v); next }
  if (sect == "tbl") {
    if (t ~ /^path[ \t]*=/) ownf[cur] = 1
    else if (t ~ /^git[ \t]*=/ && own(t)) ownf[cur] = 1
    else if (t ~ /^package[ \t]*=/) { v = t; sub(/^package[ \t]*=/, "", v); real[cur] = unq(v) }
    next
  }
  if (sect == "dep") {
    if (match(t, /^"[^"]+"/)) { name = substr(t, 2, RLENGTH - 2); rest = substr(t, RLENGTH + 1) }
    else if (match(t, /^[A-Za-z0-9_-]+/)) { name = substr(t, 1, RLENGTH); rest = substr(t, RLENGTH + 1) }
    else next
    sk = ""
    if (match(rest, /^\.[A-Za-z0-9_-]+/)) { sk = substr(rest, 2, RLENGTH - 1); rest = substr(rest, RLENGTH + 1) }
    if (rest !~ /^[ \t]*=/) next
    v = rest; sub(/^[ \t]*=[ \t]*/, "", v)
    add(name)
    if (sk == "path") ownf[name] = 1
    else if (sk == "git" && own(v)) ownf[name] = 1
    else if (sk == "package") real[name] = unq(v)
    else if (sk == "") {
      if (v ~ /(\{|,)[ \t]*path[ \t]*=/) ownf[name] = 1
      if (v ~ /(\{|,)[ \t]*git[ \t]*=/ && own(v)) ownf[name] = 1
      if (match(v, /(\{|,)[ \t]*package[ \t]*=[ \t]*"[^"]+"/)) { p = substr(v, RSTART, RLENGTH); sub(/^.*=[ \t]*"/, "", p); sub(/"$/, "", p); real[name] = p }
    }
  }
}
END { for (i = 1; i <= cnt; i++) { n = ord[i]; r = (n in real) ? real[n] : n; print "dep\t" r "\t" ((n in ownf) ? "own" : "ext") } }'

AWK_PYCOMMON='
function own(v,  g) {
  g = tolower(v); if (g ~ /^[^:\/]*@/) sub(/^[^@]*@[ \t]*/, "", g); sub(/^[ \t]+/, "", g)
  if (g ~ /(\/|:)\.\.?(\/|$)|%2e/) return 0
  return g ~ /^(git\+)?(https:\/\/|ssh:\/\/git@|git@)github\.com[\/:]amadudl\/lib-[a-z0-9._-]+(\.git)?([\/#?@]|$)/ || g ~ /^github:amadudl\/lib-[a-z0-9._-]+(\.git)?([\/#?@]|$)/
}
function arch(s) { s = tolower(s); sub(/[ \t]+--.*$/, "", s); sub(/[ \t]*;.*$/, "", s); sub(/#.*$/, "", s); sub(/[ \t"\047]+$/, "", s); return s ~ /\.(whl|tgz|tar|tar\.gz|tar\.bz2|tar\.xz|zip)$/ }
function emit(r,   name, rest) {
  if (match(r, /^[ \t]*[A-Za-z0-9][A-Za-z0-9._-]*/)) {
    name = substr(r, RSTART, RLENGTH); gsub(/[ \t]/, "", name)
    rest = substr(r, RSTART + RLENGTH)
    sub(/[ \t]*;.*$/, "", rest)
    if (rest ~ /^[ \t]*(\[[^]]*\])?[ \t]*@/ && (own(rest) || (tolower(rest) ~ /^[^@]*@[ \t]*file:/ && !arch(rest)))) return
    print "dep\t" name "\text"
  }
}'

AWK_REQ='
{
  l = $0
  sub(/^[ \t]+/, "", l)
  if (l ~ /^#/) next
  sub(/[ \t]+#.*$/, "", l); sub(/[ \t\\]+$/, "", l)
  if (l == "") next
  if (l ~ /^(-e|--editable)([ \t=]|$)/) sub(/^(-e|--editable)[ \t=]*/, "", l)
  else if (l ~ /^-/) next
  if (l ~ /^(\.|\/|~|file:)/) {
    if (arch(l)) { nm = l; sub(/[ \t]+--.*$/, "", nm); sub(/[ \t]*;.*$/, "", nm); sub(/#.*$/, "", nm); sub(/[ \t]+$/, "", nm); sub(/^.*\//, "", nm); print "dep\t" nm "\text" }
    next
  }
  if (l ~ /^[A-Za-z][A-Za-z0-9+.-]*:\/\// || l ~ /^git\+/) {
    sub(/[ \t]*;.*$/, "", l)
    if (own(l)) next
    if (match(l, /[#&]egg=[A-Za-z0-9._-]+/)) { nm = substr(l, RSTART + 5, RLENGTH - 5); print "dep\t" nm "\text"; next }
    print "dep\t" l "\text"; next
  }
  emit(l)
}'

AWK_PYP='
function flushsub() { if (sn != "" && tolower(sn) != "python" && !sown) print "dep\t" sn "\text"; sn = "" }
END { flushsub() }
function scan(t,   i, c) {
  for (i = 1; i <= length(t); i++) {
    c = substr(t, i, 1)
    if (q != "") {
      if (c == "\\" && q == "\"") { buf = buf substr(t, i + 1, 1); i++; continue }
      if (c == q) { if (bd == 0) emit(buf); q = ""; buf = ""; continue }
      buf = buf c; continue
    }
    if (c == "\"" || c == "\047") { q = c; buf = ""; continue }
    if (c == "#") return
    if (c == "{") bd++
    else if (c == "}") bd--
    else if (c == "]" && bd == 0) { inarr = 0; return }
  }
}
{
  line = $0
  if (inarr) { scan(line); next }
  t = line; sub(/^[ \t]+/, "", t); sub(/[ \t]+$/, "", t)
  if (t ~ /^\[/) {
    flushsub()
    h0 = t; sub(/^\[+[ \t]*/, "", h0); sub(/[ \t]*\][ \t]*(#.*)?$/, "", h0)
    h = h0; gsub(/"/, "", h)
    if (h0 ~ /^tool\.poetry\.((dev-)?dependencies|group\.("[^"]+"|[^."]+)\.dependencies)\.("[^"]+"|[^."]+)$/) { match(h0, /\.("[^"]+"|[^."]+)$/); sn = substr(h0, RSTART + 1); gsub(/"/, "", sn); sown = 0 }
    next
  }
  if (sn != "") {
    if (t ~ /^path[ \t]*=/) { pp = t; sub(/^path[ \t]*=[ \t]*/, "", pp); gsub(/^["\047]|["\047][ \t]*(#.*)?$/, "", pp); if (!arch(pp)) sown = 1 }
    else if (t ~ /^git[ \t]*=/) { g = t; sub(/^git[ \t]*=[ \t]*/, "", g); gsub(/^["\047]|["\047][ \t]*(#.*)?$/, "", g); if (own(g)) sown = 1 }
    next
  }
  if (t == "" || t ~ /^#/) next
  if ((h == "project" || h == "tool.poetry") && t ~ /^name[ \t]*=/) {
    v = t; sub(/^name[ \t]*=[ \t]*["\047]/, "", v); sub(/["\047].*$/, "", v); print "self\t" v; next
  }
  if ((h == "project" && t ~ /^dependencies[ \t]*=[ \t]*\[/) || ((h == "project.optional-dependencies" || h == "dependency-groups") && t ~ /^("[^"]+"|[A-Za-z0-9_.-]+)[ \t]*=[ \t]*\[/)) {
    inarr = 1; bd = 0; q = ""; sub(/^[^\[]*\[/, "", t); scan(t); next
  }
  if (h ~ /^tool\.poetry\.((dev-)?dependencies|group\.[^.]+\.dependencies)$/ && t ~ /^("[^"]+"|[A-Za-z0-9_.-]+)[ \t]*=/) {
    k = t; sub(/[ \t]*=.*$/, "", k); gsub(/"/, "", k)
    v = t; sub(/^[^=]*=[ \t]*/, "", v)
    if (tolower(k) == "python") next
    if (match(v, /(\{|,)[ \t]*path[ \t]*=[ \t]*("[^"]*"|\047[^\047]*\047)/)) { pp = substr(v, RSTART, RLENGTH); sub(/^[^"\047]*["\047]/, "", pp); sub(/["\047]$/, "", pp); if (!arch(pp)) next }
    if (match(v, /(\{|,)[ \t]*git[ \t]*=[ \t]*"[^"]*"/)) { g = substr(v, RSTART, RLENGTH); sub(/^[^"]*"/, "", g); sub(/"$/, "", g); if (own(g)) next }
    print "dep\t" k "\text"
  }
}'

: > "$tmp/deps"
: > "$tmp/unknown"
tab=$(printf '\t')
while IFS="$tab" read -r kind path; do
  [ -n "$path" ] || continue
  case $kind in
    npm) prog=$AWK_NPM; eco=npm ;;
    cargo) prog=$AWK_CARGO; eco=cargo ;;
    req) prog="$AWK_PYCOMMON$AWK_REQ"; eco=py ;;
    pyproject) prog="$AWK_PYCOMMON$AWK_PYP"; eco=py ;;
    unknown) printf '%s\n' "$path" >> "$tmp/unknown"; continue ;;
    *) continue ;;
  esac
  blob "$path" > "$tmp/m"
  awk "$prog" "$tmp/m" | ECO=$eco MF=$path awk '{ print ENVIRON["ECO"] "\t" ENVIRON["MF"] "\t" $0 }' >> "$tmp/deps"
done < "$tmp/manifests"

# ---------- Regel a ----------
ALLOWED="$tmp/allowed" awk -F'\t' '
BEGIN { f = ENVIRON["ALLOWED"]; while ((getline l < f) > 0) ok[l] = 1; close(f) }
$3 == "self" { self[$1 SUBSEP $4] = 1; next }
$3 == "dep" { n++; E[n] = $1; M[n] = $2; N[n] = $4; F[n] = $5 }
END {
  for (i = 1; i <= n; i++) {
    if (F[i] == "own" || ((E[i] SUBSEP N[i]) in self) || (N[i] in ok)) continue
    k = M[i] SUBSEP N[i]
    if (k in done) continue
    done[k] = 1
    printf "%s: Abhaengigkeit \"%s\" fehlt in opensource.md\n", M[i], N[i]
  }
}' "$tmp/deps" > "$tmp/missing"
while IFS= read -r line; do err "$line"; done < "$tmp/missing"

# Nicht geparste Manifesttypen
OPEN="$tmp/open" awk "$AWK_MENTION"'
BEGIN { loadlines(ENVIRON["OPEN"]) }
{ if (covered($0, "")) print "ok\t" $0; else print "bad\t" $0 }' "$tmp/unknown" > "$tmp/unknown.res"
while IFS="$tab" read -r st path; do
  [ -n "$path" ] || continue
  if [ "$st" = ok ]; then
    printf '  unabhaengigkeit: %s wird nicht geparst, Abhaengigkeiten von Hand in opensource.md (offene Aufgabe in cleanup.md)\n' "$path"
  else
    err "$path: Manifesttyp wird nicht geparst; cleanup.md braucht eine offene Zeile mit diesem Pfad (Aufgabe: Abhaengigkeiten von Hand in opensource.md fuehren, Parser ergaenzen)"
  fi
done < "$tmp/unknown.res"

# ---------- Regel c ----------
awk '{ l = tolower($0); if (l ~ /\.(png|jpg|jpeg|gif|webp|avif|bmp|tif|tiff|ico|icns|svg|psd|ai|ttf|otf|woff|woff2|eot|mp3|wav|ogg|flac|m4a|aac|mp4|webm|mov|avi|mkv|glb|gltf|obj|fbx|stl|blend|3mf|dae|usdz)$/) print }' "$tmp/files" > "$tmp/media"

if has .assets-repo || [ -f .assets-repo ]; then
  if ! has ATTRIBUTION.md; then
    err "Repo assets: ATTRIBUTION.md fehlt im Wurzelordner"
  fi
  blob ATTRIBUTION.md > "$tmp/attr"
  OPEN="$tmp/attr" awk "$AWK_MENTION"'
  BEGIN { loadlines(ENVIRON["OPEN"]) }
  !covered($0, ".") { print $0 ": Mediendatei fehlt in ATTRIBUTION.md (Herkunft, Lizenz, Urheber)" }' "$tmp/media" > "$tmp/media.res"
else
  OPEN="$tmp/open" awk "$AWK_MENTION"'
  BEGIN { loadlines(ENVIRON["OPEN"]) }
  !covered($0, "ziel:[ \t]*assets") { print $0 ": Medien oder Schriftdatei im Repo; erlaubt nur ueber den Assets Weg (assets.lock, sh .githooks/assets-fetch.sh) oder als Bestand mit offener Zeile in cleanup.md" }' "$tmp/media" > "$tmp/media.res"
fi
while IFS= read -r line; do err "$line"; done < "$tmp/media.res"

# assets.lock Format
if has assets.lock; then
  blob assets.lock > "$tmp/lock"
  if ! sed -n '1p' "$tmp/lock" | grep -q '^tag=[^[:space:]]'; then
    err "assets.lock: erste Zeile muss tag=<tag> sein"
  fi
  if sed -n '2,$p' "$tmp/lock" | tr -d '\r' | sed 's/^[[:space:]]*//; s/[[:space:]]*$//' | grep -v '^#' | grep -v '^$' | grep -Evq '^[A-Za-z0-9_][A-Za-z0-9._ -]*(/[A-Za-z0-9_][A-Za-z0-9._ -]*)*/?$'; then
    err "assets.lock: Pfade muessen relativ sein und duerfen kein .. enthalten (erlaubt: Segmente aus A-Z a-z 0-9 _ . - Leerzeichen, nicht mit Punkt beginnend, Trenner /)"
  fi
  sed -n '2,$p' "$tmp/lock" | tr -d '\r' | sed 's/^[[:space:]]*//; s/[[:space:]]*$//' | grep -v '^#' | grep -v '^$' > "$tmp/lockpaths" || true
  awk '{ p = $0; sub(/\/$/, "", p); a[NR] = p } END { for (i = 1; i <= NR; i++) for (j = 1; j <= NR; j++) if (i != j && (a[i] == a[j] || index(a[j], a[i] "/") == 1)) print a[i] " / " a[j] }' "$tmp/lockpaths" > "$tmp/lockover"
  while IFS= read -r line; do err "assets.lock: Pfade ueberschneiden sich: $line"; done < "$tmp/lockover"
fi

if [ "$fail" -ne 0 ]; then
  echo ""
  echo "  Gesetz Unabhaengigkeit (AGENTS.md Abschnitt 1): fremde Komponenten nur als begruendete Ausnahme in opensource.md,"
  echo "  Bestand als offene Aufgabe in cleanup.md, Assets aus dem Repo Amadudl/assets ueber assets.lock."
  exit 1
fi
echo "✓ unabhaengigkeit gruen"
exit 0
