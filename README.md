# I was here

A PHP/MySQL canvas guestbook. Visitors choose an explored spot on a shared
201x201 tile world and leave a name, message or drawing, color, and shape.

The app uses plain PHP, Apache, MySQL, CSS, browser JavaScript, Docker Compose,
and Playwright.

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

## App Behavior

- Marks are saved in MySQL and loaded through `src/api/marks.php`.
- Server-Sent Events in `src/api/marks-stream.php` keep browsers synced.
- The canvas starts at tile `0,0`; saved marks reveal that tile and its eight
  neighbors.
- Unexplored but visible tiles are fogged and unavailable for placement.
- Users can undo their latest mark in the current PHP session.

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
- [Moderation and safety](docs/moderation-safety.md)
