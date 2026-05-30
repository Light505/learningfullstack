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
DB_USER=appuser
DB_PASS=replace_with_strong_app_password
WATCHTOWER_POLL_INTERVAL=300
```

Do not put GitHub tokens in `.env`. If the GHCR package is private, run
`docker login ghcr.io` once on the VPS.

`DB_USER`, `DB_PASS`, and the web VPS IP must match the MySQL user created on
the database VPS exactly.

## Start Or Update

Use the same startup workflow every time on the web VPS:

```bash
cd /opt/learningfullstack
docker compose -f docker-compose.web.yml up -d --remove-orphans
```

Stop:

```bash
cd /opt/learningfullstack
docker compose -f docker-compose.web.yml down --remove-orphans
```

Do not add `-v` unless you intentionally want to delete Traefik certificates.

## phpMyAdmin

phpMyAdmin is a temporary production tool. It is not part of the normal web
startup.

Start or recreate it only when needed:

```bash
cd /opt/learningfullstack
docker compose -f docker-compose.web.yml --profile tools up -d --force-recreate phpmyadmin
```

Use an SSH tunnel from your machine to the web VPS:

```powershell
ssh -L 8081:127.0.0.1:8081 <web-user>@<web-vps-ip>
```

Then open:

```text
http://127.0.0.1:8081
```

If `.env` changes, recreate phpMyAdmin before opening it. Containers keep the
environment they started with, so an old phpMyAdmin container can still use old
database credentials.

Stop phpMyAdmin when finished:

```bash
cd /opt/learningfullstack
docker compose -f docker-compose.web.yml --profile tools stop phpmyadmin
docker compose -f docker-compose.web.yml --profile tools rm -f phpmyadmin
```

## Database VPS

MySQL is installed directly on the database VPS, not through Compose.

Only these files are needed on the database VPS:

```text
/opt/learningfullstack-db/
|-- .env
`-- database/
    |-- init.sql
    `-- migrations/
        |-- 001_create_marks.sql
        `-- 002_create_rate_limits.sql
```

Example `.env`:

```env
DB_HOST=10.0.0.5
DB_PORT=3306
DB_NAME=mydb
DB_USER=appuser
DB_PASS=replace_with_strong_app_password
WEB_VPS_MYSQL_HOST=203.0.113.10
```

`DB_HOST` is the database VPS address MySQL binds to. Prefer the private/VPC IP.
`WEB_VPS_MYSQL_HOST` is the web VPS address allowed to connect to MySQL.

Create the database and user:

```bash
cd /opt/learningfullstack-db
set -a
. ./.env
set +a
sudo mysql
```

Inside MySQL, use the same values from `.env`:

```sql
CREATE DATABASE IF NOT EXISTS mydb CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'appuser'@'<web-vps-ip>' IDENTIFIED BY '<db-password>';
GRANT SELECT, INSERT, UPDATE, DELETE ON mydb.* TO 'appuser'@'<web-vps-ip>';
FLUSH PRIVILEGES;
EXIT;
```

Import the current schema:

```bash
sudo mysql mydb < database/init.sql
```

The database firewall should allow port `3306` only from the web VPS:

```bash
sudo ufw allow OpenSSH
sudo ufw allow from <web-vps-ip> to any port 3306 proto tcp
sudo ufw enable
sudo ufw status verbose
```

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

## Troubleshooting MySQL Access

If adding a mark fails with:

```text
SQLSTATE[HY000] [1045] Access denied for user 'appuser'@'<web-vps-ip>'
```

the web app reached MySQL, but MySQL rejected the username, password, or source
host.

On the web VPS, check the values the app is using:

```bash
cd /opt/learningfullstack
grep DB_ .env
```

On the database VPS, create or update the exact user for the exact web VPS IP:

```bash
sudo mysql
```

```sql
CREATE USER IF NOT EXISTS 'appuser'@'<web-vps-ip>' IDENTIFIED BY '<db-password>';
ALTER USER 'appuser'@'<web-vps-ip>' IDENTIFIED BY '<db-password>';
GRANT SELECT, INSERT, UPDATE, DELETE ON mydb.* TO 'appuser'@'<web-vps-ip>';
FLUSH PRIVILEGES;
EXIT;
```

Then recreate the web service:

```bash
cd /opt/learningfullstack
docker compose -f docker-compose.web.yml up -d --force-recreate web
```

Keep the username consistent. If the web VPS uses `DB_USER=appuser`, MySQL must
have a user like `'appuser'@'<web-vps-ip>'`.

If phpMyAdmin shows the same error while the web app works, recreate phpMyAdmin:

```bash
cd /opt/learningfullstack
docker compose -f docker-compose.web.yml --profile tools up -d --force-recreate phpmyadmin
```

That refreshes phpMyAdmin's container environment from the current `.env`.

## Rollback

Retag a known-good commit image as `prod`, push it, then let Watchtower pull it:

```bash
docker pull ghcr.io/light505/learningfullstack:sha-<known-good-sha>
docker tag ghcr.io/light505/learningfullstack:sha-<known-good-sha> ghcr.io/light505/learningfullstack:prod
docker push ghcr.io/light505/learningfullstack:prod
```
