# Deployment

Production runs from a pushed GHCR image. The VPS should not build the app from
source.

## Image Tags

```text
sha-<short-commit-sha>  exact commit image
main                    latest pushed main image
prod                    production image watched by Watchtower
test                    temporary test image
```

## Web VPS Files

Only these files are needed on the web VPS:

```text
/opt/learningfullstack/
|-- .env
`-- docker-compose.web.yml
```

Example `.env`:

```env
WEB_IMAGE=ghcr.io/light505/learningfullstack:prod
APP_DOMAIN=example.com
TRAEFIK_ACME_EMAIL=admin@example.com
DB_HOST=10.0.0.5
DB_PORT=3306
DB_NAME=mydb
DB_USER=app_user
DB_PASS=replace_with_strong_app_password
WATCHTOWER_POLL_INTERVAL=300
```

Do not put GitHub tokens in `.env`. If the GHCR package is private, run
`docker login ghcr.io` once on the VPS.

## Start Or Update

```bash
docker compose -f docker-compose.web.yml up -d --remove-orphans
```

Stop:

```bash
docker compose -f docker-compose.web.yml down --remove-orphans
```

Do not add `-v` unless you intentionally want to delete Traefik certificates.

## Database VPS

MySQL is installed directly on the database VPS, not through Compose.

Apply schema from:

```text
database/init.sql
database/migrations/
```

The database firewall should allow port `3306` only from the web VPS.

## Verify

```bash
docker pull ghcr.io/light505/learningfullstack:prod
docker compose -f docker-compose.web.yml ps
curl -I http://<app-domain>
curl -I https://<app-domain>
docker logs watchtower --tail 100
```

Expected:

- HTTP redirects to HTTPS.
- HTTPS reaches the web app through Traefik.
- Watchtower watches only containers with its enable label.
- The web app can connect to the database.

## Rollback

Retag a known-good commit image as `prod`, push it, then let Watchtower pull it:

```bash
docker pull ghcr.io/light505/learningfullstack:sha-<known-good-sha>
docker tag ghcr.io/light505/learningfullstack:sha-<known-good-sha> ghcr.io/light505/learningfullstack:prod
docker push ghcr.io/light505/learningfullstack:prod
```
