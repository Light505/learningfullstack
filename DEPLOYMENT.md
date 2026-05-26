# VPS Deployment With Watchtower

This phase keeps deployment simple:

1. Work on `dev`.
2. Merge tested work into `main`.
3. Manually build and push the web image from `main`.
4. Watchtower on the VPS detects the new image digest.
5. Watchtower pulls the image and restarts only the web container.

This is simpler than Swarm rolling deployments, but it has a tradeoff: the web
container restarts in place, so a brief interruption is possible. Later, when
the project needs real multi-replica rollouts, move back to Swarm, Kubernetes,
or another orchestrator.

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

## 1. Prepare The VPS Once

Install Docker Engine and Docker Compose on the VPS.

Create the app directory:

```bash
sudo mkdir -p /opt/learningfullstack
sudo chown "$USER:$USER" /opt/learningfullstack
cd /opt/learningfullstack
```

Copy these files to `/opt/learningfullstack`:

```text
docker-compose.yml
docker-compose.traefik.yml
docker-compose.watchtower.yml
database/init.sql
```

Create the production `.env`:

```bash
nano .env
```

Use strong production values:

```env
WEB_IMAGE=ghcr.io/light505/learningfullstack:prod
APP_DOMAIN=example.com
TRAEFIK_ACME_EMAIL=admin@example.com
MYSQL_ROOT_PASSWORD=replace_with_strong_root_password
MYSQL_DATABASE=mydb
MYSQL_USER=app_user
MYSQL_PASSWORD=replace_with_strong_app_password
GHCR_USERNAME=Light505
GHCR_TOKEN=github_token_with_package_read_access
WATCHTOWER_POLL_INTERVAL=300
```

Start production:

```bash
docker compose -f docker-compose.yml -f docker-compose.traefik.yml -f docker-compose.watchtower.yml up -d
```

Initialize the database once:

```bash
set -a
. ./.env
set +a
docker compose -f docker-compose.yml exec -T db mysql -uroot -p"$MYSQL_ROOT_PASSWORD" < database/init.sql
```

Do not run the database initialization command on every deploy.

## 2. Development Flow

Work on `dev`:

```bash
git checkout dev
git add .
git commit -m "Describe the change"
git push origin dev
```

Merge into `main` when ready:

```bash
git checkout main
git pull origin main
git merge dev
git push origin main
```

## 3. Publish The Web Image Manually

Build and push from a clean `main` branch.

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

Watchtower will check the registry on its poll interval. When the `prod` tag
points to a new digest, it pulls the image and restarts the `web` container.

## 4. Check Deployment

On the VPS:

```bash
docker compose -f docker-compose.yml -f docker-compose.traefik.yml -f docker-compose.watchtower.yml ps
docker logs watchtower --tail 100
docker logs web --tail 100
```

To force a one-time Watchtower check:

```bash
docker run --rm \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -e REPO_USER="$GHCR_USERNAME" \
  -e REPO_PASS="$GHCR_TOKEN" \
  containrrr/watchtower:latest \
  --run-once --label-enable
```

## 5. phpMyAdmin Access

phpMyAdmin is bound to `127.0.0.1:8081`, so it is only reachable from the VPS
itself. Access it from your machine with an SSH tunnel:

```powershell
ssh -L 8081:127.0.0.1:8081 <vps-user>@<vps-host>
```

Then open:

```text
http://localhost:8081
```
