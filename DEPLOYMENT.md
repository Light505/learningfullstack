# VPS Deployment With Traefik And Watchtower

This phase keeps deployment intentionally small:

1. Work on `dev`.
2. Merge tested work into `main`.
3. Build the PHP/Apache web image from `main`.
4. Push the image to GHCR with `sha-<short-sha>`, `main`, and `prod` tags.
5. Let Watchtower on the VPS pull the updated `prod` image.
6. Restart the `web` replicas one at a time.

This stays close to the Dreams of Code VPS pattern without adding Swarm or
Kubernetes yet. The current production target is three `web` replicas behind
Traefik, with Watchtower rolling through them one at a time.

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
sudo mkdir -p /opt/learningfullstack/database
sudo chown -R "$USER:$USER" /opt/learningfullstack
cd /opt/learningfullstack
```

Copy only these runtime files to `/opt/learningfullstack`:

```text
/opt/learningfullstack/
|-- .env
|-- docker-compose.yml
|-- docker-compose.traefik.yml
|-- docker-compose.watchtower.yml
`-- database/
    `-- init.sql
```

Do not copy the full Git repository, `src/`, `.git/`, docs, or local override
files to the VPS. The application code comes from the GHCR web image.

Create the production `.env` from `.env.vps.example` before copying it to the
VPS, or create it directly on the VPS:

```bash
nano .env
chmod 600 .env
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
WATCHTOWER_POLL_INTERVAL=300
```

Notes:

- `APP_DOMAIN` is only the hostname, such as `example.com`; do not include
  `https://`.
- Do not put GitHub tokens in `.env`. Use `docker login ghcr.io` on each host
  that needs registry access.
- Avoid sharing `docker compose config` output from production because it
  expands `.env` values into the rendered config.

### Private GHCR Package Option

If `ghcr.io/light505/learningfullstack` is private, authenticate Docker
permanently on the VPS:

```bash
echo "<github-token-with-read-packages>" | docker login ghcr.io -u Light505 --password-stdin
ls -la ~/.docker/config.json
```

Use the same Linux user for `docker login` and `docker compose`. Watchtower runs
inside a container, so `docker-compose.watchtower.yml` mounts
`${HOME}/.docker/config.json` into Watchtower as `/config.json`. That lets
Watchtower reuse Docker's saved host login without putting registry credentials
in `.env`.

If you run Docker with `sudo`, the credentials may be stored under
`/root/.docker` instead of your user's home directory. Prefer adding the deploy
user to the `docker` group and running Compose as that user.

This Watchtower Compose file is for the Linux VPS. Do not use it for local
Windows development.

## 2. Confirm The Image Is Published

Build and push the `prod` image from your local machine by following
`LOCAL_DEVELOPMENT.md`.

On the VPS, confirm Docker can pull the production image:

```bash
docker pull ghcr.io/light505/learningfullstack:prod
```

For a private GHCR package, run the VPS `docker login ghcr.io` step first.

## 3. Start Production

From `/opt/learningfullstack` on the VPS:

```bash
docker compose -f docker-compose.yml -f docker-compose.traefik.yml -f docker-compose.watchtower.yml up -d --remove-orphans
```

If the VPS has the standalone Compose command instead of the Docker plugin, use
`docker-compose` with the same `-f` files.

Initialize the database once:

```bash
set -a
. ./.env
set +a
docker compose -f docker-compose.yml exec -T db mysql -uroot -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE" < database/init.sql
```

Do not run the database initialization command on every deploy.

The Compose file creates three web replicas through `deploy.replicas: 3`. The
`web` service must not have `container_name` set, because fixed container names
cannot be scaled. Traefik discovers all three containers through Docker labels.

Verify the `inquiries` table exists:

```bash
set -a
. ./.env
set +a
docker compose -f docker-compose.yml exec db mysql -uroot -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE" -e "SHOW TABLES; DESCRIBE inquiries;"
```

To stop the VPS stack, use the same Compose file set that started it:

```bash
docker compose -f docker-compose.yml -f docker-compose.traefik.yml -f docker-compose.watchtower.yml down --remove-orphans
```

Do not add `-v` on the VPS unless you intentionally want to delete the MySQL and
Traefik certificate volumes.

## 4. Verify VPS Image Pulls

```bash
docker pull ghcr.io/light505/learningfullstack:prod
docker pull ghcr.io/light505/learningfullstack:main
docker pull ghcr.io/light505/learningfullstack:sha-<short-commit-sha>
```

The `sha-<short-commit-sha>` tag is the rollback anchor. If `prod` ever points
to a bad image, retag a known-good `sha-*` image as `prod` and push it again.

## 5. Verify VPS Runtime Files

From the VPS app directory:

```bash
pwd
find . -maxdepth 2 -type f | sort
```

Expected files:

```text
./.env
./database/init.sql
./docker-compose.traefik.yml
./docker-compose.watchtower.yml
./docker-compose.yml
```

Check permissions:

```bash
ls -la .env
```

Expected: `.env` is readable only by the deploying user, commonly `-rw-------`.

## 6. Confirm Firewall Rules

Firewall work is already considered complete for this phase. The expected UFW
shape is SSH plus public web traffic:

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
sudo ufw status verbose
```

Do not open MySQL `3306` or phpMyAdmin `8081` to the public internet. MySQL is
only used inside the Docker network, and phpMyAdmin is bound to
`127.0.0.1:8081` for SSH tunnel access.

## 7. Verify VPS Traefik Routing

Before starting the stack, confirm DNS points to the VPS:

```bash
dig +short <app-domain>
```

After starting the VPS stack:

```bash
docker compose -f docker-compose.yml -f docker-compose.traefik.yml -f docker-compose.watchtower.yml ps
docker logs traefik --tail 100
curl -I http://<app-domain>
curl -I https://<app-domain>
```

Expected behavior:

- HTTP on port `80` redirects to HTTPS.
- HTTPS on port `443` reaches the `web` container through the Traefik router.
- Traefik routes only the hostname in `APP_DOMAIN`.

## 8. Verify HTTPS And Let's Encrypt

Let's Encrypt HTTP challenge requires:

- Public DNS for `APP_DOMAIN` points to this VPS.
- Port `80` is reachable from the internet.
- Port `443` is reachable from the internet.
- `TRAEFIK_ACME_EMAIL` is set in `.env`.
- The `traefik_letsencrypt` volume is preserved.

Check certificate behavior:

```bash
curl -Iv https://<app-domain>
docker logs traefik --tail 200
```

If certificate issuance fails, fix DNS/firewall issues first, then restart only
Traefik:

```bash
docker compose -f docker-compose.yml -f docker-compose.traefik.yml -f docker-compose.watchtower.yml restart traefik
```

## 9. Verify Watchtower Update Behavior

Watchtower is configured with `WATCHTOWER_LABEL_ENABLE=true`, and currently
only the `web` service has this label:

```text
com.centurylinklabs.watchtower.enable=true
```

That means Watchtower should update `web` only. It should not update MySQL,
Traefik, or phpMyAdmin automatically.

Check Watchtower logs:

```bash
docker logs watchtower --tail 100
```

Force a one-time Watchtower check:

```bash
docker run --rm \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v "$HOME/.docker/config.json:/config.json:ro" \
  containrrr/watchtower:latest \
  --run-once --label-enable --rolling-restart
```

After pushing a new `prod` image, verify only the three `web` replicas restarted
and that Watchtower handled them one at a time:

```bash
docker ps --format "table {{.Names}}\t{{.Image}}\t{{.Status}}"
docker logs watchtower --tail 200
docker compose -f docker-compose.yml -f docker-compose.traefik.yml -f docker-compose.watchtower.yml logs web --tail 100
```

If Watchtower logs this error:

```text
client version 1.25 is too old. Minimum supported API version is 1.40
```

make sure `docker-compose.watchtower.yml` sets:

```yaml
DOCKER_API_VERSION: "1.40"
```

Then recreate only Watchtower:

```bash
docker compose -f docker-compose.yml -f docker-compose.traefik.yml -f docker-compose.watchtower.yml up -d --force-recreate watchtower
docker logs watchtower --tail 100
```

## phpMyAdmin Access

phpMyAdmin is bound to `127.0.0.1:8081`, so it is only reachable from the VPS
itself. Access it from your machine with an SSH tunnel:

```powershell
ssh -L 8081:127.0.0.1:8081 <vps-user>@<vps-host>
```

Then open:

```text
http://localhost:8081
```

## Troubleshooting Inquiry Saves

If the site loads but submitting the inquiry form shows:

```text
Error saving your inquiry. Please try again later.
```

the web container can probably reach MySQL, but the `inquiries` table is missing
or has an older shape. Copying `database/init.sql` to the VPS does not apply it;
you must run it against the database.

Check the live schema:

```bash
cd /opt/learningfullstack
set -a
. ./.env
set +a
docker compose -f docker-compose.yml exec db mysql -uroot -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE" -e "SHOW TABLES; DESCRIBE inquiries;"
```

If `inquiries` does not exist, initialize it:

```bash
docker compose -f docker-compose.yml exec -T db mysql -uroot -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE" < database/init.sql
```

Or create the table manually from a MySQL prompt:

```sql
CREATE TABLE IF NOT EXISTS inquiries (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    status ENUM('new', 'read', 'replied') NOT NULL DEFAULT 'new',
    ip_address VARCHAR(45) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_inquiries_ip_created_at
ON inquiries (ip_address, created_at);

CREATE INDEX idx_inquiries_status
ON inquiries (status);
```

If the table exists but is missing columns, inspect it with phpMyAdmin or run the
needed `ALTER TABLE` statements before testing the form again.
