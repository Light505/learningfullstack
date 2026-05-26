# VPS Deployment With GitHub Actions

This project deploys from the `main` branch. Keep active development on `dev`, then merge `dev` into `main` when you want production to update.

## 1. Prepare the VPS once

Install Docker Engine and Docker Compose on the VPS before continuing.

Create an app directory:

```bash
sudo mkdir -p /opt/learningfullstack
sudo chown "$USER:$USER" /opt/learningfullstack
```

Clone the production branch:

```bash
git clone -b main <your-repo-url> /opt/learningfullstack
cd /opt/learningfullstack
```

Create the production environment file:

```bash
nano .env
```

Use strong production values:

```env
MYSQL_ROOT_PASSWORD=replace_with_strong_root_password
MYSQL_DATABASE=mydb
MYSQL_USER=app_user
MYSQL_PASSWORD=replace_with_strong_app_password
```

Start the services:

```bash
docker compose -f docker-compose.yml -f docker-compose.traefik.yml up -d --build
```

Initialize the database once:

```bash
set -a
. ./.env
set +a
docker compose -f docker-compose.yml exec -T db mysql -uroot -p"$MYSQL_ROOT_PASSWORD" < database/init.sql
```

Do not run the database initialization command on every deploy.

## 2. Create a deploy SSH key

On your local machine, create a key dedicated to GitHub Actions deployment:

```bash
ssh-keygen -t ed25519 -C "github-actions-learningfullstack-deploy" -f ./learningfullstack_deploy_key
```

Copy the public key to the VPS deploy user:

```bash
ssh-copy-id -i ./learningfullstack_deploy_key.pub <vps-user>@<vps-host>
```

Test SSH access:

```bash
ssh -i ./learningfullstack_deploy_key <vps-user>@<vps-host>
```

## 3. Add GitHub repository secrets

In GitHub, open:

```text
Repository -> Settings -> Secrets and variables -> Actions -> New repository secret
```

Create these secrets:

```text
VPS_HOST       VPS IP address or domain
VPS_USER       VPS SSH username
VPS_SSH_KEY    contents of ./learningfullstack_deploy_key
VPS_SSH_PORT   SSH port, usually 22
```

`VPS_SSH_KEY` must contain the private key, including the begin and end lines.

## 4. Development flow

Work on `dev` locally:

```bash
git checkout dev
git add .
git commit -m "Describe the change"
git push origin dev
```

Merge into `main` when ready:

```bash
git checkout main
git pull origin main
git merge dev
git push origin main
```

Pushing to `main` triggers `.github/workflows/deploy.yml`.

## 5. What the workflow does

The workflow SSHes into the VPS and runs:

```bash
cd /opt/learningfullstack
git fetch origin main
git reset --hard origin/main
docker compose -f docker-compose.yml -f docker-compose.traefik.yml up -d --build
docker compose -f docker-compose.yml -f docker-compose.traefik.yml ps
```

The explicit `-f` flags are intentional. They prevent Docker Compose from automatically loading `docker-compose.override.yml`, which is for development. phpMyAdmin is included in the base stack and bound to `127.0.0.1:8081`.

phpMyAdmin is bound to `127.0.0.1:8081`, so it is only reachable from the VPS itself. Access it from your machine with an SSH tunnel:

```powershell
ssh -i .\learningfullstack_actions_key -p 2202 -L 8081:127.0.0.1:8081 lighthal@micko.lol
```

Then open:

```text
http://localhost:8081
```

## 6. Manual deploy fallback

If GitHub Actions is unavailable, deploy manually from the VPS:

```bash
cd /opt/learningfullstack
git fetch origin main
git reset --hard origin/main
docker compose -f docker-compose.yml -f docker-compose.traefik.yml up -d --build
docker compose -f docker-compose.yml -f docker-compose.traefik.yml ps
```
