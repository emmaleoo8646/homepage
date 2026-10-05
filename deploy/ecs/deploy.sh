#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."

host="${1:-alog-prod}"
[[ "$host" =~ ^[A-Za-z0-9_.@-]+$ ]] || { echo "Invalid SSH destination" >&2; exit 1; }
test -z "$(git status --porcelain)" || { echo "Commit source changes before deploying." >&2; exit 1; }
commit=$(git rev-parse HEAD)
release="$commit-$(date -u +%Y%m%d%H%M%S)"
node deploy/ecs/create-login.mjs
npx tsc --noEmit
npm run build

package=$(mktemp -d)
trap 'rm -rf "$package"' EXIT
COPYFILE_DISABLE=1 tar -czf "$package/site.tar.gz" -C dist/client .
ssh -o BatchMode=yes -o StrictHostKeyChecking=yes "$host" "mkdir -p /opt/homepage/incoming/$release"
scp -o BatchMode=yes -o StrictHostKeyChecking=yes "$package/site.tar.gz" deploy/ecs/compose.yaml deploy/ecs/nginx.conf deploy/ecs/http.conf deploy/ecs/https.conf deploy/ecs/install.sh "$host:/opt/homepage/incoming/$release/"
scp -o BatchMode=yes -o StrictHostKeyChecking=yes .env.ecs.htpasswd "$host:/opt/homepage/incoming/$release/home.htpasswd"
ssh -o BatchMode=yes -o StrictHostKeyChecking=yes "$host" "bash /opt/homepage/incoming/$release/install.sh $release"
echo "Server installed. Once DNS is ready, complete HTTPS as described in deploy/ecs/README.md."
