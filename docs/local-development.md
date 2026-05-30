# Local Development

Use this on your Windows machine while building the app.

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

The only local environment file should be `.env`. Compose loads it
automatically, so local startup should stay:

```powershell
docker compose up -d
```

Do not pass a separate env file during normal local startup.

Later, local secrets should move to Windows 11 user environment variables.

## Database

Schema files live in `database/init.sql` and `database/migrations/`.

Apply migrations after creating a fresh local database volume:

```powershell
.\scripts\apply-migrations.ps1
```

To reset the local database:

```powershell
docker compose down --remove-orphans -v
docker compose up -d --build
```

## Checks

```powershell
.\scripts\check.ps1
.\scripts\check.ps1 -WithDatabase
.\scripts\smoke.ps1
.\scripts\smoke.ps1 -WithPost
npm run test:playwright
```

## Image Publishing

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
