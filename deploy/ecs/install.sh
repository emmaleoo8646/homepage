#!/usr/bin/env bash
set -euo pipefail

release="${1:?release ID is required}"
[[ "$release" =~ ^[0-9a-f]{40}-[0-9]{14}$ ]] || { echo "Invalid release ID" >&2; exit 1; }
incoming="/opt/homepage/incoming/$release"
root=/opt/homepage
proxy_dir=/etc/family-diary/nginx-extra
gateway=family-diary-nginx-1

test -f "$incoming/site.tar.gz"
docker network inspect family-diary_edge >/dev/null
mkdir -p "$root/releases/$release" "$root/secrets" "$root/backups"
chmod 700 "$root/secrets"
tar -xzf "$incoming/site.tar.gz" -C "$root/releases/$release"
test -s "$root/releases/$release/index.html"

# Keep the active login and private credentials out of release artifacts.
if [ ! -f "$root/secrets/home.htpasswd" ]; then
  install -m 644 "$incoming/home.htpasswd" "$root/secrets/home.htpasswd"
elif ! cmp -s "$incoming/home.htpasswd" "$root/secrets/home.htpasswd"; then
  echo "Existing server credentials differ; stopping without rotating them." >&2
  exit 1
fi

previous=$(readlink "$root/current" || true)
for file in compose.yaml nginx.conf; do
  [ ! -f "$root/$file" ] || cp -p "$root/$file" "$root/backups/$file.$release"
  install -m 644 "$incoming/$file" "$root/$file"
done
ln -s "$root/releases/$release" "$root/current.next"
mv -Tf "$root/current.next" "$root/current"
if ! docker compose -f "$root/compose.yaml" up -d --force-recreate --no-deps web; then
  if [ -n "$previous" ]; then
    ln -s "$previous" "$root/current.previous"
    mv -Tf "$root/current.previous" "$root/current"
    docker compose -f "$root/compose.yaml" up -d --force-recreate --no-deps web
  fi
  exit 1
fi
docker exec homepage-web nginx -t
healthy=false
for attempt in $(seq 1 15); do
  if docker exec homepage-web wget -q -O /dev/null http://127.0.0.1/healthz; then
    healthy=true
    break
  fi
  sleep 1
done
if ! $healthy; then
  if [ -n "$previous" ]; then
    ln -s "$previous" "$root/current.previous"
    mv -Tf "$root/current.previous" "$root/current"
    docker compose -f "$root/compose.yaml" up -d --force-recreate --no-deps web
  fi
  echo "Homepage did not become healthy." >&2
  exit 1
fi

had_proxy=false
if [ -f "$proxy_dir/homepage.conf" ]; then
  cp -p "$proxy_dir/homepage.conf" "$root/backups/homepage.conf.$release"
  had_proxy=true
fi
cat "$incoming/http.conf" > "$proxy_dir/homepage.conf"
if [ -f /var/lib/docker/volumes/family-diary_certbot_config/_data/live/home.douwuyou.cn/fullchain.pem ]; then
  cat "$incoming/https.conf" >> "$proxy_dir/homepage.conf"
fi
if ! docker exec "$gateway" nginx -t; then
  if $had_proxy; then
    cp -p "$root/backups/homepage.conf.$release" "$proxy_dir/homepage.conf"
  else
    mv "$proxy_dir/homepage.conf" "$root/backups/homepage.conf.invalid.$release"
  fi
  exit 1
fi
docker exec "$gateway" nginx -s reload
printf '%s\n' "$release" > "$root/current-release"
echo "Homepage release installed: $release"
