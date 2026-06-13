# Deployment

Production runs from a GHCR image. The VPS should not build from source.

## Tags

```text
sha-<short-commit-sha>  exact commit image
main                    latest pushed main image
prod                    production image watched by Watchtower
```

## Single-Server VPS Files

The default production deployment runs Traefik, the web app, Watchtower, MySQL,
and optional phpMyAdmin on one VPS. Keep only these runtime files on the VPS:

```text
/opt/learningfullstack/
|-- .env
|-- docker-compose.web.yml
|-- docker-compose.database.yml
`-- database/
    |-- init.sql
    `-- migrations/
```

Example `.env`:

```env
WEB_IMAGE=ghcr.io/light505/learningfullstack:prod
APP_DOMAIN=example.com
TRAEFIK_ACME_EMAIL=admin@example.com
MYSQL_ROOT_PASSWORD=replace_with_strong_root_password
MYSQL_DATABASE=mydb
MYSQL_USER=app_user
MYSQL_PASSWORD=replace_with_strong_app_password
WATCHTOWER_POLL_INTERVAL=300
```

Do not put GitHub tokens in `.env`. If the GHCR package is private, run
`docker login ghcr.io` once on the VPS.

## Start Or Update

```bash
docker compose -f docker-compose.web.yml -f docker-compose.database.yml up -d --remove-orphans
```

Stop:

```bash
docker compose -f docker-compose.web.yml -f docker-compose.database.yml down --remove-orphans
```

Do not add `-v` unless you intentionally want to delete Traefik certificates
and MySQL data.

## Database

The default production database is the `db` service from
`docker-compose.database.yml`. It uses a persistent `db_data` volume and is only
reachable inside the Docker network.

Apply schema from:

```text
database/init.sql
database/migrations/
```

For a fresh database, initialize the base schema once:

```bash
docker compose -f docker-compose.web.yml -f docker-compose.database.yml exec -T db mysql -uroot -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE" < database/init.sql
```

For the migration helper, pass the same Compose file set used for production:

```powershell
.\scripts\apply-migrations.ps1 -ComposeCommand "docker compose -f docker-compose.web.yml -f docker-compose.database.yml"
```

Run database initialization and migrations only when preparing a fresh database
or applying new migration files.

## External Database Mode

To use a separate MySQL server later, set `DB_HOST`, `DB_PORT`, `DB_NAME`,
`DB_USER`, and `DB_PASS` in `.env` and run only the web Compose file:

```bash
docker compose -f docker-compose.web.yml up -d --remove-orphans
```

In external mode, allow MySQL port `3306` only from the web VPS. Do not include
`docker-compose.database.yml`, because that file adds the local `db` service and
the `web` dependency on it.

phpMyAdmin is bound to `127.0.0.1:8081` in both modes. With the single-server
database override, it connects to the internal `db` service. In external mode,
it connects to the configured `DB_HOST`.

## Verify

```bash
docker pull ghcr.io/light505/learningfullstack:prod
docker compose -f docker-compose.web.yml -f docker-compose.database.yml ps
curl -I http://<app-domain>
curl -I https://<app-domain>
docker logs watchtower --tail 100
```

Expected:

- HTTP redirects to HTTPS.
- HTTPS reaches the web app through Traefik.
- Watchtower watches only containers with its enable label.
- The web app can connect to the database.
- MySQL keeps data in the `db_data` named volume.

## Rollback

Retag a known-good commit image as `prod`, push it, then let Watchtower pull it:

```bash
docker pull ghcr.io/light505/learningfullstack:sha-<known-good-sha>
docker tag ghcr.io/light505/learningfullstack:sha-<known-good-sha> ghcr.io/light505/learningfullstack:prod
docker push ghcr.io/light505/learningfullstack:prod
```
