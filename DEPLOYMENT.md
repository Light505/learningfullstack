# VPS Deployment With Watchtower

This project follows the simple VPS pattern from the Dreams of Code guide, but
adapted for this PHP/MySQL app:

1. Work on `dev`.
2. Merge tested work into `main`.
3. Manually build and push the web image from `main`.
4. The VPS runs Docker Compose with Traefik and Watchtower.
5. Watchtower detects when the `prod` image tag points to a new digest and
   restarts only the `web` container.

This is simpler than Swarm or Kubernetes. The tradeoff is that the current setup
has one web container, so updates may cause a brief restart. Multi-replica
rolling updates are intentionally deferred until the app needs them.

## Image Tags

Use predictable tags in GitHub Container Registry:

```text
sha-<short-commit-sha>  immutable image for one exact main commit
main                    moving tag for the latest main image you pushed
prod                    moving tag watched by the VPS
test                    temporary test image
```

Production should normally run:

```env
WEB_IMAGE=ghcr.io/light505/learningfullstack:prod
```

## Step 5: Web Image

The VPS should not build the app from source. Build the image locally from a
clean `main` branch, then push it to GHCR.

Bash:

```bash
git checkout main
git pull origin main
SHORT_SHA="$(git rev-parse --short=12 HEAD)"
IMAGE="ghcr.io/light505/learningfullstack"

docker build -t "$IMAGE:sha-$SHORT_SHA" -t "$IMAGE:main" -t "$IMAGE:prod" .
docker push "$IMAGE:sha-$SHORT_SHA"
docker push "$IMAGE:main"
docker push "$IMAGE:prod"
```

PowerShell:

```powershell
git checkout main
git pull origin main
$SHORT_SHA = git rev-parse --short=12 HEAD
$IMAGE = "ghcr.io/light505/learningfullstack"

docker build -t "$IMAGE`:sha-$SHORT_SHA" -t "$IMAGE`:main" -t "$IMAGE`:prod" .
docker push "$IMAGE`:sha-$SHORT_SHA"
docker push "$IMAGE`:main"
docker push "$IMAGE`:prod"
```

The image contains the Apache/PHP runtime plus files copied by the `Dockerfile`.
For this project, that means `src/` is copied into `/var/www/html/`.

## Step 6: VPS Runtime Files

The VPS does not need the full repository. Use this structure:

```text
/opt/learningfullstack/
├── .env
├── docker-compose.yml
├── docker-compose.traefik.yml
├── docker-compose.watchtower.yml
└── database/
    └── init.sql
```

Create the folder:

```bash
sudo mkdir -p /opt/learningfullstack/database
sudo chown -R "$USER:$USER" /opt/learningfullstack
cd /opt/learningfullstack
```

Create `.env`:

```env
APP_DEBUG=false
APP_DOMAIN=micko.lol
WEB_IMAGE=ghcr.io/light505/learningfullstack:prod

MYSQL_ROOT_PASSWORD=replace_with_strong_root_password
MYSQL_DATABASE=mydb
MYSQL_USER=app_user
MYSQL_PASSWORD=replace_with_strong_app_password

TRAEFIK_ACME_EMAIL=admin@example.com

GHCR_USERNAME=Light505
GHCR_TOKEN=github_token_with_package_read_access
WATCHTOWER_POLL_INTERVAL=300
```

Protect it:

```bash
chmod 600 .env
```

Initialize the database once after the containers are running:

```bash
set -a
. ./.env
set +a
docker compose -f docker-compose.yml exec -T db mysql -uroot -p"$MYSQL_ROOT_PASSWORD" < database/init.sql
```

Do not run the database initialization command as part of every deployment.

## Step 7: Firewall

Allow only what the public internet needs:

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow ssh
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
sudo ufw status
```

Do not publicly allow:

```text
3306/tcp  MySQL
8081/tcp  phpMyAdmin
```

phpMyAdmin is bound to `127.0.0.1:8081` and should be reached through SSH
tunneling only.

## Step 8: Traefik Reverse Proxy

Traefik is defined in `docker-compose.traefik.yml`. It handles public HTTP/HTTPS
traffic and routes matching requests to the `web` container.

The important web labels are:

```text
traefik.enable=true
traefik.http.routers.learningfullstack.rule=Host(`${APP_DOMAIN}`)
traefik.http.routers.learningfullstack.entrypoints=websecure
traefik.http.routers.learningfullstack.tls.certresolver=letsencrypt
traefik.http.services.learningfullstack.loadbalancer.server.port=80
```

Check what Compose renders:

```bash
docker compose -f docker-compose.yml -f docker-compose.traefik.yml -f docker-compose.watchtower.yml config | grep -A 8 -B 2 traefik.http.routers
```

The rule should show:

```text
Host(`micko.lol`)
```

## Step 9: HTTPS

Traefik requests and stores Let's Encrypt certificates using the
`traefik_letsencrypt` Docker volume.

Start or recreate Traefik:

```bash
docker compose -f docker-compose.yml -f docker-compose.traefik.yml -f docker-compose.watchtower.yml up -d --force-recreate traefik web
```

Check logs:

```bash
docker logs traefik --tail 200
```

If the browser says the connection is not private, check:

```bash
grep -n "APP_DOMAIN\|TRAEFIK_ACME_EMAIL" .env
docker ps
sudo ufw status
docker logs traefik --tail 200
```

Common causes:

```text
APP_DOMAIN does not match the browser URL
DNS does not point to the VPS
port 80 or 443 is blocked
Traefik is still using old container state and needs recreation
Let's Encrypt rate limits after repeated failed attempts
```

## Step 10: Watchtower Updates

Watchtower is defined in `docker-compose.watchtower.yml`. It monitors only
containers with this label:

```text
com.centurylinklabs.watchtower.enable=true
```

Currently only `web` has that label, so Watchtower should not update MySQL,
phpMyAdmin, or Traefik.

Start the production stack:

```bash
docker compose -f docker-compose.yml -f docker-compose.traefik.yml -f docker-compose.watchtower.yml up -d
```

Check status:

```bash
docker compose -f docker-compose.yml -f docker-compose.traefik.yml -f docker-compose.watchtower.yml ps
docker logs watchtower --tail 100
docker logs web --tail 100
```

Force a one-time Watchtower check:

```bash
set -a
. ./.env
set +a

docker run --rm \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -e REPO_USER="$GHCR_USERNAME" \
  -e REPO_PASS="$GHCR_TOKEN" \
  containrrr/watchtower:latest \
  --run-once --label-enable
```

## phpMyAdmin Access

Open an SSH tunnel from your machine:

```powershell
ssh -L 8081:127.0.0.1:8081 <vps-user>@<vps-host>
```

Then open:

```text
http://localhost:8081
```

## Current Intentional Differences From The Guide

- The guide demonstrates multiple app replicas and rolling restart. This project
  currently uses one `web` container for simplicity.
- The guide uses Docker secrets for the database password. This project uses a
  protected `.env` file for now.
- Monitoring with Uptime Robot is still optional and belongs after the core
  deployment is stable.
