#!/usr/bin/env bash
# Run by GitHub Actions over SSH after initial manual server setup.
set -euo pipefail
sha=${1:?Missing tested commit}
path=${2:?Missing deployment path}
[[ "$sha" =~ ^[a-f0-9]{40}$ ]] || { echo 'Invalid commit.'; exit 1; }
[[ "$path" =~ ^/[a-zA-Z0-9/_.-]+$ && "$path" != '/' && "$path" != *'..'* ]] || { echo 'Invalid deployment path.'; exit 1; }
cd "$path"
exec 9>.deploy.lock
flock -n 9 || { echo 'Another deployment is running.'; exit 1; }
[[ -f .env ]] || { echo 'Initial setup required: .env missing.'; exit 1; }
[[ -z "$(git status --porcelain --untracked-files=no)" ]] || { echo 'Tracked server files have local changes; refusing to overwrite.'; exit 1; }
git fetch origin main
[[ "$(git rev-parse origin/main)" == "$sha" ]] || { echo 'main changed since the workflow started. Run deployment again.'; exit 1; }
[[ -n "$(docker compose ps --status running -q app)" ]] || { echo 'Initial manual startup or recovery required; app is not running.'; exit 1; }
# Capture a consistent backup before a new version can migrate the database.
docker compose exec -T app node scripts/backup.js /app/data/backups
git merge --ff-only "$sha"
docker compose build app
docker compose up -d --no-build
# Verify the app starts, serves login and keeps participant data private.
ready=0
for attempt in 1 2 3 4 5 6; do
  if docker compose exec -T app node --input-type=module -e '
    const base="http://127.0.0.1:3000";
    const state=await fetch(base+"/api/state",{signal:AbortSignal.timeout(5000)});
    const login=await fetch(base+"/login",{signal:AbortSignal.timeout(5000)});
    if(state.status!==401 || login.status!==200) process.exit(1);
  '; then ready=1; break; fi
  sleep 2
done
[[ "$ready" == 1 ]] || { echo 'App readiness failed. Backup retained; no automatic database rollback.'; exit 1; }
site=$(docker compose exec -T app node -e 'process.stdout.write(process.env.ALFA_PUBLIC_URL)')
[[ "$site" == https://* ]] || { echo 'HTTPS origin missing.'; exit 1; }
[[ "$(curl --proto '=https' --tlsv1.2 --silent --show-error --max-time 20 --output /dev/null --write-out '%{http_code}' "$site/login")" == 200 ]] || { echo 'Public HTTPS login check failed.'; exit 1; }
[[ "$(curl --proto '=https' --tlsv1.2 --silent --show-error --max-time 20 --output /dev/null --write-out '%{http_code}' "$site/api/state")" == 401 ]] || { echo 'Public API privacy check failed.'; exit 1; }
echo "Deployment verified: $sha"
