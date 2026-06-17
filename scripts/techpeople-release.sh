#!/usr/bin/env bash
#
# [TECHPEOPLE] Cut a new release tag and push it in one shot.
#
# Tags look like  0.0.1-techpeople.N  where N is an auto-incrementing build
# number. The script:
#   1. finds the highest existing N for the current BASE version (local + remote),
#   2. bumps it by one,
#   3. writes the full version into superset-frontend/package.json,
#   4. commits that change, creates the tag and pushes both — triggering
#      .github/workflows/techpeople-build.yml which builds & pushes the image.
#
# Usage:
#   scripts/techpeople-release.sh                 # bump suffix on current BASE
#   scripts/techpeople-release.sh 0.0.2           # start a new BASE (suffix -> .1)
#   DRY_RUN=1 scripts/techpeople-release.sh        # show what would happen, change nothing
#
set -euo pipefail

# --- config -----------------------------------------------------------------
PREID="techpeople"                       # the pre-release identifier in the tag
PKG_JSON="superset-frontend/package.json"
DEFAULT_BASE="0.0.1"                     # used only when no techpeople tag exists yet

# --- locate repo root so the script works from any cwd ----------------------
ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

# --- determine the BASE version (the X.Y.Z part) ----------------------------
# Either passed as $1, or reuse the BASE of the most recent techpeople tag.
fetch_tags() {
  # Make sure we know about tags created from other machines before computing N.
  git fetch --tags --quiet origin 2>/dev/null || true
}

latest_tag_for_base() {
  local base="$1"
  git tag --list "${base}-${PREID}.*" | sort -V | tail -n1
}

fetch_tags

if [[ -n "${1:-}" ]]; then
  BASE="$1"
else
  # Highest techpeople tag overall -> reuse its base.
  LATEST_ANY="$(git tag --list "*-${PREID}.*" | sort -V | tail -n1)"
  if [[ -n "$LATEST_ANY" ]]; then
    BASE="${LATEST_ANY%-${PREID}.*}"
  else
    BASE="$DEFAULT_BASE"
  fi
fi

# --- compute the next suffix number -----------------------------------------
LATEST="$(latest_tag_for_base "$BASE")"
if [[ -n "$LATEST" ]]; then
  CURRENT_N="${LATEST##*.}"
  NEXT_N=$((CURRENT_N + 1))
else
  NEXT_N=1
fi

NEW_VERSION="${BASE}-${PREID}.${NEXT_N}"
NEW_TAG="$NEW_VERSION"

echo "Base version : $BASE"
echo "Latest tag   : ${LATEST:-<none>}"
echo "New version  : $NEW_VERSION"

# --- safety checks ----------------------------------------------------------
if git rev-parse -q --verify "refs/tags/${NEW_TAG}" >/dev/null; then
  echo "ERROR: tag ${NEW_TAG} already exists locally." >&2
  exit 1
fi

if [[ -n "$(git status --porcelain)" ]]; then
  echo "ERROR: working tree is dirty. Commit or stash changes before releasing." >&2
  git status --short >&2
  exit 1
fi

if [[ "${DRY_RUN:-0}" == "1" ]]; then
  echo "[dry-run] would set ${PKG_JSON} version to ${NEW_VERSION}"
  echo "[dry-run] would commit, tag ${NEW_TAG}, and push to origin."
  exit 0
fi

# --- write version into package.json ----------------------------------------
# Use node if available (keeps JSON formatting valid), else fall back to sed.
if command -v node >/dev/null 2>&1; then
  node -e '
    const fs = require("fs");
    const f = process.argv[1], v = process.argv[2];
    const pkg = JSON.parse(fs.readFileSync(f, "utf8"));
    pkg.version = v;
    fs.writeFileSync(f, JSON.stringify(pkg, null, 2) + "\n");
  ' "$PKG_JSON" "$NEW_VERSION"
else
  # Replace only the first "version": "..." line.
  sed -i.bak -E "0,/\"version\": \"[^\"]*\"/s//\"version\": \"${NEW_VERSION}\"/" "$PKG_JSON"
  rm -f "${PKG_JSON}.bak"
fi

git add "$PKG_JSON"
git commit -m "[techpeople] release ${NEW_VERSION}"

# --- tag and push -----------------------------------------------------------
git tag "$NEW_TAG"
git push origin HEAD          # push the version-bump commit
git push origin "$NEW_TAG"    # push the tag -> triggers techpeople-build.yml

echo "Done. Pushed commit + tag ${NEW_TAG}."
