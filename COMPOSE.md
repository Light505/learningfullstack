# Docker Compose Files

This project keeps local development and VPS deployment separate. Local
development uses the default Compose pair. The web VPS gets one deployment
Compose file. The database VPS runs raw MySQL through `apt`, not Compose.

## File Roles

| File | Purpose | Use it when |
| --- | --- | --- |
| `docker-compose.yml` | Local/base web app service. | Local development with the override file. |
| `docker-compose.override.yml` | Local development settings: localhost port, local build, and live-mounted `src/`. | Local development. Loaded automatically by Compose. |
| `docker-compose.web.yml` | Complete web VPS stack: Traefik, web app, Watchtower, and optional phpMyAdmin profile. | Web VPS deployment. |

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
docker compose -f docker-compose.web.yml up -d --remove-orphans
```

Stop production with the same file set:

```bash
docker compose -f docker-compose.web.yml down --remove-orphans
```

Set these values in production `.env`:

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

Use `.env.web.example` as the web VPS template. Copy it to `.env` on the web
VPS. It does not include a GitHub token.
If the GHCR package is private, log Docker in once on the VPS with
`docker login ghcr.io`. Watchtower mounts `${HOME}/.docker/config.json` so it can
reuse Docker's saved registry credentials from that host.

Use `.env.local.example` on your own machine for local development and optional
GHCR image publishing.

## Database VPS

The database VPS runs raw MySQL installed with `apt`, not Docker Compose. Use
`.env.database.example` as a notes/template file for the one real `.env` on that
server, but MySQL itself is managed by `systemctl` and `/etc/mysql/...` config.

The web VPS `.env` should use the database VPS address as `DB_HOST`. If private
networking is unavailable, you can use the database VPS public IP for `DB_HOST`,
but only with firewall rules that allow MySQL port `3306` from the web VPS IP
and deny everyone else.

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

Production runs three `web` replicas through:

```yaml
deploy:
  replicas: 3
```

The `web` service intentionally has no `container_name`, because fixed container
names prevent scaling. Traefik discovers the replicas through Docker labels and
uses a sticky cookie so the current PHP file-based session behavior works across
multiple web containers.

Local development overrides this back to one replica in
`docker-compose.override.yml` so the local `8080:80` port binding does not
conflict.

## Production phpMyAdmin Access

phpMyAdmin is not part of the always-running production stack. Start it only
when you need to inspect or test the production database. It connects to
`DB_HOST` using `DB_USER` and `DB_PASS` from the web VPS `.env`:

```bash
docker compose -f docker-compose.web.yml --profile tools up -d phpmyadmin
```

It binds to `127.0.0.1:8081`, so it is not publicly exposed by default. Access
it through an SSH local port tunnel to the web VPS:

```powershell
ssh -L 8081:127.0.0.1:8081 <vps-user>@<vps-host>
```

Then open:

```text
http://localhost:8081
```

When finished, stop it:

```bash
docker compose -f docker-compose.web.yml --profile tools stop phpmyadmin
docker compose -f docker-compose.web.yml --profile tools rm -f phpmyadmin
```
