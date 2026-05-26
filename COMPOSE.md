# Docker Compose Files

This project uses multiple Compose files so local development, admin tools, and
production routing stay separate.

## File Roles

| File | Purpose | Use it when |
| --- | --- | --- |
| `docker-compose.yml` | Base app stack: PHP/Apache web app, MySQL database, and phpMyAdmin. | Always. |
| `docker-compose.override.yml` | Local development settings: localhost port and live-mounted `src/`. | Local development. Loaded automatically by Compose. |
| `docker-compose.traefik.yml` | Production Traefik HTTPS reverse proxy. | Deploying to a public VPS. |

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

## Production With Traefik

Production should use explicit `-f` flags so local overrides are not loaded.

```bash
docker compose -f docker-compose.yml -f docker-compose.traefik.yml up -d --build
```

Set these values in production `.env`:

```env
APP_DOMAIN=example.com
TRAEFIK_ACME_EMAIL=admin@example.com
MYSQL_ROOT_PASSWORD=replace_with_strong_root_password
MYSQL_DATABASE=mydb
MYSQL_USER=app_user
MYSQL_PASSWORD=replace_with_strong_app_password
```

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
