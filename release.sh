#!/usr/bin/env bash
# Build module.zip and publish a GitHub release for la-talents.
# Usage:
#   ./release.sh            release the version already in module.json
#   ./release.sh 1.6.5      bump module.json to 1.6.5 (version + download URL), commit, then release
set -euo pipefail
cd "$(dirname "$0")"

REPO="jacobmovingfwd/la-talents"
die() { echo "error: $*" >&2; exit 1; }

command -v gh >/dev/null      || die "gh CLI not found (https://cli.github.com)"
command -v python3 >/dev/null || die "python3 not found"
gh auth status >/dev/null 2>&1 || die "gh is not logged in (run: gh auth login)"
[ "$(git rev-parse --abbrev-ref HEAD)" = "main" ] || die "switch to the main branch first"

read_version() { python3 -c "import json;print(json.load(open('module.json'))['version'])"; }

# Optional bump
if [ $# -ge 1 ]; then
  NEW="${1#v}"
  [[ "$NEW" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || die "version must look like 1.2.3"
  [ -z "$(git status --porcelain)" ] || die "working tree has uncommitted changes; commit or stash them before bumping"
  NEW="$NEW" REPO="$REPO" python3 - <<'PY'
import json, os
d = json.load(open('module.json'))
v, repo = os.environ['NEW'], os.environ['REPO']
d['version'] = v
d['download'] = f"https://github.com/{repo}/releases/download/v{v}/module.zip"
open('module.json', 'w').write(json.dumps(d, indent=2) + "\n")
PY
  git add module.json
  git commit -q -m "Release v$NEW"
fi

VERSION="$(read_version)"
TAG="v$VERSION"

# Sanity checks
[ -z "$(git status --porcelain)" ] || die "working tree has uncommitted changes; commit them first"
grep -q "releases/download/$TAG/module.zip" module.json \
  || die "module.json 'download' URL does not reference $TAG (use ./release.sh $VERSION to fix it)"
git rev-parse -q --verify "refs/tags/$TAG" >/dev/null && die "tag $TAG already exists locally"
git ls-remote --exit-code --tags origin "refs/tags/$TAG" >/dev/null 2>&1 && die "tag $TAG already exists on origin"

# Push the commits first so the tag points at something GitHub has
git push origin main

COMMIT="$(git rev-parse HEAD)"
SHORT="$(git rev-parse --short HEAD)"
PREV="$(git describe --tags --abbrev=0 2>/dev/null || true)"

# Release notes: commit subjects since the previous tag
if [ -n "$PREV" ]; then
  RANGE="$PREV..HEAD"; SINCE="Changes since $PREV:"
else
  RANGE="HEAD"; SINCE="Changes:"
fi
NOTES_FILE="$(mktemp)"
ZIP_DIR="$(mktemp -d)"
trap 'rm -rf "$NOTES_FILE" "$ZIP_DIR"' EXIT
{
  echo "**la-talents $VERSION** (commit \`$SHORT\`)"
  echo
  echo "$SINCE"
  git log --no-merges --pretty='- %s (`%h`)' $RANGE
  echo
  echo "Install via manifest: https://raw.githubusercontent.com/$REPO/main/module.json"
  [ -n "$PREV" ] && echo "Full diff: https://github.com/$REPO/compare/$PREV...$TAG"
} > "$NOTES_FILE"

# Build the zip from the committed tree (module.json at the zip root, as Foundry expects)
git archive --format=zip -o "$ZIP_DIR/module.zip" "$COMMIT"
cp module.json "$ZIP_DIR/module.json"

# Tag and publish
git tag -a "$TAG" -m "la-talents $VERSION" "$COMMIT"
git push origin "$TAG"
gh release create "$TAG" "$ZIP_DIR/module.zip" "$ZIP_DIR/module.json" \
  --repo "$REPO" --title "$TAG" --notes-file "$NOTES_FILE" --verify-tag

echo
echo "Released $TAG at $SHORT"
echo "https://github.com/$REPO/releases/tag/$TAG"
