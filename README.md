# learningfullstack

Learning CI/CD and production-style deployment with Docker, Apache, MySQL, and
PHP.

## Project Layout

```text
learningfullstack/
|-- src/                         PHP application
|-- database/                    Database schema
|-- docs/                        Project guides and roadmap
|-- Dockerfile                   PHP/Apache image
|-- docker-compose.yml           Base web service
|-- docker-compose.override.yml  Local development services
`-- docker-compose.web.yml       Web VPS deployment stack
```

## Quick Start

```powershell
copy .env.local.example .env
docker compose up -d --build
```

Open:

```text
http://localhost:8080
http://localhost:8081
```

Initialize the local schema once:

```powershell
$env:MYSQL_ROOT_PASSWORD = "<MYSQL_ROOT_PASSWORD>"
$env:DB_NAME = "appdb"
.\scripts\apply-migrations.ps1
```

## Guides

- [Local development](docs/local-development.md)
- [Website roadmap](docs/website-roadmap.md)
- [Handoff](docs/handoff.md)
- [Design review checklist](docs/design-review.md)
- [VPS deployment](docs/deployment.md)
- [Compose file roles](docs/compose.md)
- [Development plan](docs/development-plan.md)
- [Session strategy](docs/session-strategy.md)
- [Roadmap](docs/roadmap.md)

## Checks

```powershell
.\scripts\check.ps1
.\scripts\check.ps1 -WithDatabase
.\scripts\smoke.ps1
.\scripts\smoke.ps1 -WithPost
```
