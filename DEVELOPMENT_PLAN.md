# Development Plan

This plan keeps the project moving one clear step at a time. Work happens on
`dev`; production deploys only after changes are merged to `main`.

## Current Baseline

- PHP/Apache web app runs in Docker.
- MySQL runs in Docker on the same host.
- Traefik can terminate HTTPS and route traffic to the web container.
- Production updates are handled by Watchtower polling the pushed web image.
- Local development should use Docker Compose with the development override.

## Phase 1: Local Development Confidence

Goal: make the project easy to run, test, stop, and reset locally.

- [x] Confirm Docker Desktop or Docker Engine is installed locally.
- [x] Create a local `.env` file from `.env.local.example`.
- [x] Start the local containers with Docker Compose.
- [x] Initialize the database schema from `database/init.sql`.
- [x] Open the app at `http://localhost:8080`.
- [x] Open phpMyAdmin at `http://localhost:8081`.
- [x] Document common local commands in `LOCAL_DEVELOPMENT.md`.
- [x] Keep Docker Compose file roles documented in `COMPOSE.md`.

Done when: a fresh clone can run locally using documented commands.

Verified on 2026-05-27:

- `docker-compose up -d --build` started `web`, `db`, and `phpmyadmin`.
- `db` reported healthy.
- `mydb` contains the `inquiries` table.
- `http://localhost:8080` returned HTTP 200.
- `http://localhost:8081` returned HTTP 200.

## Phase 2: Production Docker Cleanup

Goal: keep the production image small, predictable, and separate from local-only
settings. During this phase, MySQL still runs on the same VPS; only the web app
changes from "build on server" to "pull and run a prebuilt image."

- [x] Keep `.dockerignore` updated so secrets, Git files, docs, and local files
      are not sent into the image build context.
- [x] Keep local builds in `docker-compose.override.yml`.
- [x] Run production from `WEB_IMAGE` instead of `build: .`.
- [x] Build and push the web image manually from `main`.
- [x] Use image tags for production updates (`sha-*`, `main`, `prod`).
- [x] Deploy only Compose/runtime files to the VPS.
- [x] Add Watchtower for automatic web image updates.
- [x] Keep production Compose files explicit with `-f` flags.
- [x] Confirm production deploy does not load `docker-compose.override.yml`.
- [x] Review whether `php:apache-bookworm` should remain the base image.
- [x] Only consider Alpine if required PHP extensions and Apache behavior remain
      simple and reliable.
- [ ] Start the production Compose stack on the VPS with Watchtower.
- [ ] Confirm the VPS can `docker pull ghcr.io/light505/learningfullstack:prod`.
- [ ] Confirm Watchtower pulls the GHCR image and restarts the web service.
- [x] Slim the production image after the image/update loop is proven.
- [x] Add three `web` replicas behind Traefik after the slimmed image is stable.
- [ ] Confirm Watchtower uses rolling restart behavior across the three
      replicas.

Done when: Watchtower pulls a versioned web image and runs it beside the local
VPS MySQL database.

Implemented on 2026-05-27:

- Local development builds the web image through `docker-compose.override.yml`.
- Production Compose uses `WEB_IMAGE` and no longer builds the web app on the
  VPS.
- After merging to `main`, the web image is built and pushed manually with
  `sha-*`, `main`, and `prod` tags.
- Watchtower monitors only the labeled `web` container and updates it when the
  pushed `prod` tag points to a new digest.
- Watchtower is configured for rolling restarts so the later three-replica VPS
  setup can follow the Dreams of Code pattern without adding Swarm or
  Kubernetes.
- The production image avoids a separate recursive `chown` layer by using
  `COPY --chown`.
- The `web` service no longer sets `container_name`, so Compose can scale it.
- Traefik uses a sticky cookie for the current PHP file-based sessions.
- Local `docker-compose build web` completed successfully.

## Phase 3: Separate Database Server

Goal: move MySQL from the web VPS to a dedicated database VPS.

- [ ] Create a second VPS running Ubuntu 24.04 LTS.
- [ ] Install and harden MySQL on the database VPS.
- [ ] Bind MySQL to the database server private IP, not the public internet.
- [ ] Configure the database VPS firewall to allow port `3306` only from the web
      VPS private IP.
- [ ] Create a dedicated app database user with the minimum required privileges.
- [ ] Back up the existing local/single-server database before migration.
- [ ] Restore or migrate the database to the database VPS.
- [ ] Change the web app `DB_HOST` to the private IP or private hostname of the
      database VPS.
- [ ] Remove the production `db` service from the web server Compose stack.
- [ ] Update deployment docs with the new two-server procedure.

Done when: the web VPS can serve the app while MySQL runs on a separate VPS.

## Phase 4: Backups And Recovery

Goal: make database failure recoverable before adding more infrastructure.

- [ ] Add scheduled MySQL backups.
- [ ] Store backups outside the database VPS.
- [ ] Test restoring a backup into a clean database.
- [ ] Document the restore procedure.
- [ ] Decide backup retention rules.

Done when: recovery has been tested, not just configured.

## Phase 5: CI/CD Improvements

Goal: make deployments safer and more repeatable.

- [ ] Add a build/check workflow for `dev` and pull requests.
- [ ] Keep production deployment limited to `main`.
- [ ] Add deployment health checks after `docker compose up`.
- [ ] Add rollback notes or a simple rollback command.
- [ ] Consider building and pushing an image instead of building on the VPS.

Done when: `dev` can be checked automatically before merging to `main`.

## Phase 6: Load Balancing Research

Goal: understand scaling before implementing it.

- [ ] Learn the difference between a reverse proxy and a load balancer.
- [ ] Decide whether Traefik will run on one public edge VPS.
- [ ] Decide whether each app server gets its own VPS.
- [ ] Confirm how sessions will work across multiple app servers.
- [ ] Consider sticky sessions only as a temporary learning step.
- [ ] Consider Redis or database-backed sessions for a more production-ready
      setup.

Done when: the scaling design is documented before any server is added.

## Phase 7: Load Balanced App Servers

Goal: run more than one web app server behind Traefik.

- [ ] Create at least two app VPS instances.
- [ ] Deploy the same app image/config to each app VPS.
- [ ] Point all app servers to the separated database VPS.
- [ ] Configure Traefik to route to multiple app servers.
- [ ] Confirm HTTPS still works.
- [ ] Confirm form submission works through each app server.
- [ ] Confirm sessions behave correctly.

Done when: traffic can reach more than one app server without breaking app
behavior.

## Local Run Procedure

See `LOCAL_DEVELOPMENT.md` for the current local run procedure. The short form
from the repository root is:

```powershell
cd learningfullstack
copy .env.local.example .env
```

Edit `.env` and set local values:

```env
MYSQL_ROOT_PASSWORD=root_password_for_local_dev
MYSQL_DATABASE=mydb
MYSQL_USER=app_user
MYSQL_PASSWORD=app_password_for_local_dev
APP_DEBUG=true
```

Start the app and database:

```powershell
docker compose up -d --build
```

If your local Docker install uses the older Compose command:

```powershell
docker-compose up -d --build
```

Initialize the database schema:

```powershell
$env:MYSQL_ROOT_PASSWORD = "<MYSQL_ROOT_PASSWORD>"
$env:MYSQL_DATABASE = "mydb"
Get-Content .\database\init.sql | docker compose exec -T db mysql -uroot -p"$env:MYSQL_ROOT_PASSWORD" "$env:MYSQL_DATABASE"
```

With the older Compose command:

```powershell
$env:MYSQL_ROOT_PASSWORD = "<MYSQL_ROOT_PASSWORD>"
$env:MYSQL_DATABASE = "mydb"
Get-Content .\database\init.sql | docker-compose exec -T db mysql -uroot -p"$env:MYSQL_ROOT_PASSWORD" "$env:MYSQL_DATABASE"
```

Open the app:

```text
http://localhost:8080
```

phpMyAdmin runs with the normal Compose stack. Open:

```text
http://localhost:8081
```

Stop local containers:

```powershell
docker compose down --remove-orphans
```

Reset the local database completely:

```powershell
docker compose down --remove-orphans -v
docker compose up -d --build
```

Then run the database initialization command again.
