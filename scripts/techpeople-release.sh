#!/usr/bin/env bash
#
# [TECHPEOPLE] Cut a new release tag and push it in one shot.
#
# Tags look like  0.0.1-techpeople.N  where N is an auto-incrementing build
# number. The script:
#   1. fetches tags from origin (so N accounts for releases cut elsewhere),
#   2. finds the highest existing N for the BASE version and bumps it by one,
#   3. creates an empty "[techpeople] release <tag>" marker commit and tags it,
#   4. pushes the branch and the tag — the tag triggers
#      .github/workflows/techpeople-build.yml, which builds & pushes the image.
#
# It deliberately does NOT touch package.json / package-lock.json: the image
# version comes from the git-tag name (GITHUB_REF_NAME), and editing only
# package.json desynced it from package-lock.json, which broke `npm ci` inside
# the Docker build. See tech_docs/RELEASE_CYCLE.md.
#
# Usage:
#   scripts/techpeople-release.sh                 # bump suffix on the current BASE
#   scripts/techpeople-release.sh 0.0.2           # start a new BASE (suffix -> .1)
#   DRY_RUN=1 scripts/techpeople-release.sh        # show what would happen, change nothing
#
set -euo pipefail

# --- config -----------------------------------------------------------------
PREID="techpeople"                       # the pre-release identifier in the tag
DEFAULT_BASE="0.0.1"                     # used only when no techpeople tag exists yet

# --- locate repo root so the script works from any cwd ----------------------
ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

# --- make sure we know about tags created from other machines ---------------
git fetch --tags --quiet origin 2>/dev/null || true

latest_tag_for_base() {
  local base="$1"
  git tag --list "${base}-${PREID}.*" | sort -V | tail -n1
}

# --- determine the BASE version (the X.Y.Z part) ----------------------------
# Either passed as $1 (to bump the base), or reuse the BASE of the most recent
# techpeople tag. A new BASE always restarts the suffix at .1.
if [[ -n "${1:-}" ]]; then
  BASE="$1"
else
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

NEW_TAG="${BASE}-${PREID}.${NEXT_N}"

echo "Base version : $BASE"
echo "Latest tag   : ${LATEST:-<none>}"
echo "New tag       : $NEW_TAG"

# --- safety checks ----------------------------------------------------------
if git rev-parse -q --verify "refs/tags/${NEW_TAG}" >/dev/null; then
  echo "ERROR: tag ${NEW_TAG} already exists locally." >&2
  exit 1
fi

if git ls-remote --exit-code --tags origin "refs/tags/${NEW_TAG}" >/dev/null 2>&1; then
  echo "ERROR: tag ${NEW_TAG} already exists on origin." >&2
  exit 1
fi

if [[ -n "$(git status --porcelain)" ]]; then
  echo "ERROR: working tree is dirty. Commit or stash changes before releasing." >&2
  git status --short >&2
  exit 1
fi

RELEASE_MSG="[techpeople] release ${NEW_TAG}"

if [[ "${DRY_RUN:-0}" == "1" ]]; then
  echo "[dry-run] would create an empty commit: ${RELEASE_MSG}"
  echo "[dry-run] would tag that commit as ${NEW_TAG}"
  echo "[dry-run] would push the current branch and the tag to origin."
  exit 0
fi

# --- commit, tag and push ---------------------------------------------------
# Create an empty release-marker commit (no file changes — package.json must
# stay in sync with package-lock.json), tag it, then push HEAD before the tag
# so the tag never points at a commit missing from the branch on origin.
git commit --allow-empty -m "$RELEASE_MSG"
git tag "$NEW_TAG"
git push origin HEAD
git push origin "$NEW_TAG"

echo "Done. Committed, tagged and pushed ${NEW_TAG}."
echo "Watch the build: https://github.com/TechPeopleOrg/superset_tech/actions"
