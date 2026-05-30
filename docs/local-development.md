# Local Development And Image Publishing

Use this guide on your own machine, not on the VPS.

## 1. Create Local Environment

Create `.env` from the local template:

```powershell
copy .env.local.example .env
```

Edit `.env` and set local-only values:

```env
APP_DEBUG=true
APP_DOMAIN=localhost
WEB_IMAGE=learningfullstack-web:local
DB_HOST=db
DB_PORT=3306
DB_NAME=mydb
DB_USER=user
DB_PASS=password
MYSQL_ROOT_PASSWORD=rootpassword
```

Registry credentials do not belong in `.env`. Use `docker login ghcr.io` once
on each host that needs registry access.

## 2. Start Local Containers

Docker Compose automatically loads `docker-compose.override.yml` for local
development. That override builds the local image, publishes the app on
`localhost:8080`, and live-mounts `src/`.

```powershell
docker compose up -d --build
```

If your machine uses the standalone Compose command:

```powershell
docker-compose up -d --build
```

Open:

```text
http://localhost:8080
http://localhost:8081
```

## 3. Initialize Local Database Once

With the Docker Compose plugin:

```powershell
$env:MYSQL_ROOT_PASSWORD = "<MYSQL_ROOT_PASSWORD>"
$env:DB_NAME = "appdb"
.\scripts\apply-migrations.ps1
```

With standalone Compose:

```powershell
$env:MYSQL_ROOT_PASSWORD = "<MYSQL_ROOT_PASSWORD>"
$env:DB_NAME = "appdb"
.\scripts\apply-migrations.ps1 -ComposeCommand docker-compose
```

Do not run this every time unless you intentionally reset the database.

## 4. Permanent Local GHCR Login

Pushing images to GHCR requires Docker to be logged in. Use a GitHub classic PAT
with `write:packages`.

```powershell
$env:GHCR_TOKEN = "<github-token-with-write-packages>"
$env:GHCR_TOKEN | docker login ghcr.io -u Light505 --password-stdin
```

Docker stores the login in your local Docker credential store or
`~/.docker/config.json`, depending on your Docker installation. Future
`docker push` commands can reuse it until you run `docker logout ghcr.io`, remove
the credential, or the token expires/revokes.

### Windows Credential Helper Error

If `docker login` fails with an error like this:

```text
error saving credentials: error storing credentials - err: exit status 1, out: `Not enough memory resources are available to process this command.`
```

Docker reached GHCR, but Windows failed while saving the credential. Try the
normal fix first:

```powershell
docker logout ghcr.io
Restart-Service com.docker.service
$env:GHCR_TOKEN = "<github-token-with-write-packages>"
$env:GHCR_TOKEN | docker login ghcr.io -u Light505 --password-stdin
```

If that still fails, use a separate Docker config for this project. This avoids
the broken Windows credential helper and stores the GHCR auth in
`.docker-auth/config.json`:

```powershell
New-Item -ItemType Directory -Force .docker-auth
$env:DOCKER_CONFIG = "$PWD\.docker-auth"
$env:GHCR_TOKEN = "<github-token-with-write-packages>"
$env:GHCR_TOKEN | docker login ghcr.io -u Light505 --password-stdin
```

Keep using that config in the same terminal when pushing:

```powershell
$env:DOCKER_CONFIG = "$PWD\.docker-auth"
docker push ghcr.io/light505/learningfullstack:prod
```

Do not commit `.docker-auth`; it contains registry credentials.

If Docker later fails with this message:

```text
Error response from daemon: Get "https://registry-1.docker.io/v2/": unknown: malformed HTTP Authorization header
```

the active Docker config has a bad Docker Hub credential. Remove the Docker Hub
entry from the project-local config, then log in to GHCR again:

```powershell
$env:DOCKER_CONFIG = "$PWD\.docker-auth"
docker logout
docker logout https://index.docker.io/v1/
docker logout ghcr.io
$env:GHCR_TOKEN = "<github-token-with-write-packages>"
$env:GHCR_TOKEN | docker login ghcr.io -u Light505 --password-stdin
Remove-Item Env:\GHCR_TOKEN
```

This leaves the project config with GHCR credentials only.

## 5. Build And Push Production Image

Build and push only from a clean `main` branch:

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

For a private GHCR package, the VPS needs its own Docker login with a PAT that
has `read:packages`. See [deployment.md](deployment.md).

## 6. Stop Local Containers

## Run Local Checks

```powershell
.\scripts\check.ps1
.\scripts\check.ps1 -WithDatabase
.\scripts\smoke.ps1
.\scripts\smoke.ps1 -WithPost
```

```powershell
docker compose down --remove-orphans
```

To remove the local database volume too:

```powershell
docker compose down --remove-orphans -v
```

If your machine uses standalone Compose:

```powershell
docker-compose down --remove-orphans
```
