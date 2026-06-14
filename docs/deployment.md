# Deployment

Production runs from a GHCR image. The VPS should pull `WEB_IMAGE`; it should
not build the private repository from source.

This guide assumes the VPS is already hardened and that you sign in as a
non-root user with sudo privileges. It does not configure SSH hardening,
fail2ban, automatic updates, or cloud-provider firewall rules.

## What Runs

The web VPS runs:

- Traefik for HTTP, HTTPS, redirects, and Let's Encrypt certificates.
- The PHP/Apache web app from `WEB_IMAGE`.
- Watchtower for labeled app image updates.
- MySQL only in single-server mode.

Traefik gets certificates through the Let's Encrypt HTTP-01 challenge. DNS for
`APP_DOMAIN` must point to the web VPS before the stack starts, and port `80`
must be reachable from the internet.

## Files To Upload

Create a small deployment bundle from this repository. Do not upload the whole
private source tree to production when using GHCR images.

For the web VPS, upload:

```text
.env.production.example
docker-compose.web.yml
docker-compose.database.yml       # single-server mode only
database/init.sql                 # single-server mode only
database/migrations/              # single-server mode only
scripts/deploy-lib.sh
scripts/deploy-single-server.sh
scripts/deploy-external-web.sh
```

For a separate external DB VPS, upload:

```text
.env.production.example
database/init.sql
database/migrations/
scripts/deploy-lib.sh
scripts/provision-external-db.sh
```

Create these directly on the VPS; they are not repository files:

```text
/opt/learningfullstack/.env       # real secrets and host values
GHCR_TOKEN                        # shell env var or interactive prompt only
SSH keys, DNS records, cloud firewall settings, provider credentials
```

Never commit or upload a GitHub token in `.env`.

## Build An Upload Bundle

From your local checkout:

```bash
tar -czf learningfullstack-deploy.tar.gz \
  .env.production.example \
  docker-compose.web.yml \
  docker-compose.database.yml \
  database/init.sql \
  database/migrations \
  scripts/deploy-lib.sh \
  scripts/deploy-single-server.sh \
  scripts/deploy-external-web.sh \
  scripts/provision-external-db.sh
```

Upload it to the VPS and extract it in a temporary staging directory:

```bash
scp learningfullstack-deploy.tar.gz deployer@example.com:/tmp/
ssh deployer@example.com
mkdir -p /tmp/learningfullstack-deploy
tar -xzf /tmp/learningfullstack-deploy.tar.gz -C /tmp/learningfullstack-deploy
cd /tmp/learningfullstack-deploy
```

The scripts copy runtime files into `/opt/learningfullstack`.

## Create The VPS Env File

Create the deployment directory and private env file:

```bash
sudo install -d -m 0750 -o "$USER" -g "$USER" /opt/learningfullstack
install -m 0600 .env.production.example /opt/learningfullstack/.env
nano /opt/learningfullstack/.env
```

Set at least:

```env
WEB_IMAGE=ghcr.io/light505/learningfullstack:prod
APP_DOMAIN=example.com
TRAEFIK_ACME_EMAIL=admin@example.com
GHCR_USERNAME=Light505
APP_DEBUG=false
WATCHTOWER_POLL_INTERVAL=300
```

For single-server mode, also set:

```env
MYSQL_ROOT_PASSWORD=replace_with_strong_root_password
MYSQL_DATABASE=mydb
MYSQL_USER=app_user
MYSQL_PASSWORD=replace_with_strong_app_password
```

For external DB mode, also set:

```env
DB_HOST=10.0.0.5
DB_PORT=3306
DB_NAME=mydb
DB_USER=app_user
DB_PASS=replace_with_strong_app_password
```

If you provision the external DB with this repo's script, set this on the DB
server:

```env
WEB_SERVER_DB_ALLOWED_HOST=10.0.0.10
MYSQL_BIND_ADDRESS=0.0.0.0
```

Use the web VPS private/VPC IP for `WEB_SERVER_DB_ALLOWED_HOST` when possible.

## Private GHCR Image Pulls

Because this is a private GitHub repository/package, the VPS needs GHCR auth
before Docker can pull `WEB_IMAGE`.

Create a GitHub token with package read access. For a classic PAT, use
`read:packages`; private repository-linked packages may also require `repo`
depending on the package access settings.

Either export it for one command:

```bash
export GHCR_TOKEN='<github-token>'
```

Or leave `GHCR_TOKEN` unset and enter it when the script prompts. The scripts
run:

```bash
docker login ghcr.io -u "$GHCR_USERNAME" --password-stdin
```

The token is not stored in `/opt/learningfullstack/.env`.

## Firewall Ports

On the web VPS:

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw status verbose
```

Single-server mode does not need public MySQL access. Do not open `3306/tcp`.
phpMyAdmin is bound to `127.0.0.1:8081`, so it is only reachable through an SSH
tunnel.

On a separate DB VPS, allow MySQL only from the web VPS:

```bash
sudo ufw allow from <web-vps-ip> to any port 3306 proto tcp
sudo ufw status verbose
```

Also configure your cloud firewall/security group with the same rule.

## Single-Server Setup

Use this when the web app and MySQL live on the same VPS:

```bash
cd /tmp/learningfullstack-deploy
bash scripts/deploy-single-server.sh
```

The script:

- installs Docker Engine and the Compose plugin if missing;
- creates `/opt/learningfullstack`;
- copies the Compose files and schema files;
- logs into GHCR when credentials are provided;
- starts Traefik, the web app, Watchtower, and MySQL;
- imports `database/init.sql` on an empty database and applies migrations.

Verify:

```bash
cd /opt/learningfullstack
docker compose --env-file .env -f docker-compose.web.yml -f docker-compose.database.yml ps
curl -I http://<app-domain>
curl -I https://<app-domain>
docker logs traefik --tail 100
docker logs watchtower --tail 100
```

Expected:

- HTTP redirects to HTTPS.
- HTTPS reaches the app.
- Traefik logs show certificate activity or an existing certificate.
- The web container is healthy.
- MySQL data persists in the `db_data` Docker volume.

## External Database Setup

Use this when the web VPS connects to a separate MySQL server.

First, provision or prepare the DB server. If using this repo's DB script, upload
the DB bundle to the DB host, create `/opt/learningfullstack/.env`, then run:

```bash
cd /tmp/learningfullstack-deploy
bash scripts/provision-external-db.sh
```

The DB script installs MySQL if missing, configures the bind address, creates
the database/user, grants access from `WEB_SERVER_DB_ALLOWED_HOST`, and loads
the schema and migrations.

Then deploy the web VPS:

```bash
cd /tmp/learningfullstack-deploy
bash scripts/deploy-external-web.sh
```

The web script starts only:

```bash
docker compose --env-file .env -f docker-compose.web.yml up -d --remove-orphans
```

Do not include `docker-compose.database.yml` in external DB mode, because it
adds the local `db` service and changes the web dependency graph.

Verify:

```bash
cd /opt/learningfullstack
docker compose --env-file .env -f docker-compose.web.yml ps
curl -I http://<app-domain>
curl -I https://<app-domain>
docker logs traefik --tail 100
docker logs watchtower --tail 100
```

## phpMyAdmin

phpMyAdmin is included behind the Compose `tools` profile and is bound to
`127.0.0.1:8081`. Start it only when needed:

```bash
cd /opt/learningfullstack
docker compose --env-file .env -f docker-compose.web.yml -f docker-compose.database.yml --profile tools up -d phpmyadmin
```

For external DB mode, omit `docker-compose.database.yml`:

```bash
docker compose --env-file .env -f docker-compose.web.yml --profile tools up -d phpmyadmin
```

Reach it through an SSH tunnel:

```bash
ssh -L 8081:127.0.0.1:8081 deployer@example.com
```

Then open `http://127.0.0.1:8081`.

## Start, Stop, And Update

Single-server:

```bash
cd /opt/learningfullstack
docker compose --env-file .env -f docker-compose.web.yml -f docker-compose.database.yml up -d --remove-orphans
docker compose --env-file .env -f docker-compose.web.yml -f docker-compose.database.yml down --remove-orphans
```

External DB:

```bash
cd /opt/learningfullstack
docker compose --env-file .env -f docker-compose.web.yml up -d --remove-orphans
docker compose --env-file .env -f docker-compose.web.yml down --remove-orphans
```

Do not add `-v` unless you intentionally want to delete Traefik certificates or
MySQL data.

## Image Tags

```text
sha-<short-commit-sha>  exact commit image
main                    latest pushed main image
prod                    production image watched by Watchtower
```

## Rollback

Retag a known-good commit image as `prod`, push it, then let Watchtower pull it:

```bash
docker pull ghcr.io/light505/learningfullstack:sha-<known-good-sha>
docker tag ghcr.io/light505/learningfullstack:sha-<known-good-sha> ghcr.io/light505/learningfullstack:prod
docker push ghcr.io/light505/learningfullstack:prod
```
