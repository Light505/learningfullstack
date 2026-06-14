# Local Development

## Start

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

Compose loads `docker-compose.override.yml` automatically for local development.
That starts the web app, MySQL, and phpMyAdmin. Keep local secrets in `.env`,
created from the example file.

## Database

Schema files live in `database/init.sql` and `database/migrations/`.

Apply migrations after creating a fresh local database volume or pulling new
migration files:

```powershell
.\scripts\apply-migrations.ps1
```

Reset local database data:

```powershell
docker compose down --remove-orphans -v
docker compose up -d --build
.\scripts\apply-migrations.ps1
```

## Checks

```powershell
.\scripts\check.ps1
.\scripts\check.ps1 -WithDatabase
.\scripts\smoke.ps1
.\scripts\smoke.ps1 -WithPost
npm run test:playwright
```

## Build And Push

Log in to GHCR once:

```powershell
$env:GHCR_TOKEN = "<github-token-with-write-packages>"
$env:GHCR_TOKEN | docker login ghcr.io -u Light505 --password-stdin
Remove-Item Env:\GHCR_TOKEN
```

Build and push from a clean `main` branch:

```powershell
git checkout main
git pull origin main
git status --short
$SHORT_SHA = git rev-parse --short=12 HEAD
$IMAGE = "ghcr.io/light505/learningfullstack"

docker build -t "$IMAGE`:sha-$SHORT_SHA" -t "$IMAGE`:main" -t "$IMAGE`:prod" .
docker push "$IMAGE`:sha-$SHORT_SHA"
docker push "$IMAGE`:main"
docker push "$IMAGE`:prod"
```

Do not commit registry credentials or `.docker-auth`.
