# learningfullstack
Learning CI/CD with docker
STACK: Apache, MySQL, PHP

## Local development

Create your local environment file:

```powershell
copy .env.example .env
```

Edit `.env` and set local passwords. Then start the app:

```powershell
docker compose up -d --build
```

If your machine does not have the newer `docker compose` command, use
`docker-compose` instead:

```powershell
docker-compose up -d --build
```

Initialize the database once:

```powershell
Get-Content .\database\init.sql | docker compose exec -T db mysql -uroot -p"<MYSQL_ROOT_PASSWORD>"
```

With the older Compose command:

```powershell
Get-Content .\database\init.sql | docker-compose exec -T db mysql -uroot -p"<MYSQL_ROOT_PASSWORD>"
```

Open the app:

```text
http://localhost:8080
```

phpMyAdmin runs with the normal Compose stack. Open:

```text
http://localhost:8081
```

See `DEVELOPMENT_PLAN.md` for the step-by-step infrastructure checklist.
See `COMPOSE.md` for how the Docker Compose files are organized.

## Database setup

Create the database schema manually after starting MySQL. For local
development, prefer the command above so the SQL is executed through the
Compose project.

```powershell
docker exec -i db mysql -u root -p < database/init.sql
```
