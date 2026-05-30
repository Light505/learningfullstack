# I was here

A small PHP/MySQL web app where visitors leave a mark on a shared canvas.

Marks can include a display name, short message, optional drawing, color, shape,
and canvas position. The app uses Docker for local development and production
image builds.

## Quick Start

```powershell
copy .env.local.example .env
docker compose up -d --build
.\scripts\apply-migrations.ps1
```

Open:

```text
http://localhost:8080
http://localhost:8081
```

Docker Compose loads `docker-compose.override.yml` automatically for local
development. That starts the web app, MySQL, and phpMyAdmin.

Normal local startup should stay:

```powershell
docker compose up -d
```

Production uses a separate startup command on the web VPS:

```bash
cd /opt/learningfullstack
docker compose -f docker-compose.web.yml up -d --remove-orphans
```

Production phpMyAdmin is started only when needed with the `tools` profile. See
[Deployment](docs/deployment.md).

## Checks

```powershell
.\scripts\check.ps1
.\scripts\check.ps1 -WithDatabase
.\scripts\smoke.ps1
.\scripts\smoke.ps1 -WithPost
npm run test:playwright
```

## Main Files

```text
src/                         PHP app, CSS, and browser JS
database/init.sql            Fresh database bootstrap schema
database/migrations/         Incremental schema migrations
scripts/                     Local check, smoke, and migration scripts
tests/                       PHP and Playwright tests
docker-compose.yml           Base web service
docker-compose.override.yml  Local development services
docker-compose.web.yml       VPS web stack
```

## Docs

- [Local development](docs/local-development.md)
- [Deployment](docs/deployment.md)
- [Roadmap](docs/roadmap.md)
- [Handoff](docs/handoff.md)
- [Moderation and safety](docs/moderation-safety.md)
