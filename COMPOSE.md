# Docker Compose Files

This project uses multiple Compose files so local development, production
routing, and automatic image updates stay separate.

## File Roles

| File | Purpose | Use it when |
| --- | --- | --- |
| `docker-compose.yml` | Base app stack: PHP/Apache web app, MySQL database, and phpMyAdmin. | Always. |
| `docker-compose.override.yml` | Local development settings: localhost port, local build, and live-mounted `src/`. | Local development. Loaded automatically by Compose. |
| `docker-compose.traefik.yml` | Production Traefik HTTPS reverse proxy. | Deploying to a public VPS. |
| `docker-compose.watchtower.yml` | Watchtower auto-update service for the web image. | Current production update mechanism. |

## Local Development

Compose automatically includes `docker-compose.override.yml` when you run from
this directory.

```powershell
docker-compose up -d --build
```

Open the app:

```text
http://localhost:8080
```

Open phpMyAdmin:

```text
http://localhost:8081
```

## Production With Traefik And Watchtower

Production runs the web app from a pushed image. Watchtower polls GHCR and
restarts the `web` container when the configured image tag points to a new
digest.

```bash
docker compose -f docker-compose.yml -f docker-compose.traefik.yml -f docker-compose.watchtower.yml up -d
```

Set these values in production `.env`:

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

Production image tag convention:

```text
sha-<short-commit-sha>  exact main commit image
main                    latest main image you pushed
prod                    production image watched by the VPS
test                    temporary test image
```

Watchtower is limited to containers with:

```text
com.centurylinklabs.watchtower.enable=true
```

Currently only the `web` service has that label.

## Production phpMyAdmin Access

phpMyAdmin is included in the base stack and binds to `127.0.0.1:8081`. On a
VPS, that means it is not publicly exposed by default. Access it through an SSH
tunnel:

```powershell
ssh -L 8081:127.0.0.1:8081 <vps-user>@<vps-host>
```

Then open:

```text
http://localhost:8081
```
