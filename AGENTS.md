# AGENTS.md

## Project Context

This is a learning project for building production-ready websites with:

- Docker for containerization and deployment.
- Apache as the web server.
- MySQL for database storage.
- PHP for the application.

Priorities are security, optimization, ease of deployment, continuous learning,
and professional readiness.

## Current Deployment Direction

This project follows a small, verifiable VPS deployment path inspired by the
Dreams of Code VPS guide. Use that guide as a reference for deployment ideas,
not as a strict blueprint.

Current pattern:

- Work on `dev`.
- Merge tested work into `main`.
- Build the web image from `main` manually.
- Push the image to `ghcr.io/light505/learningfullstack`.
- Run only runtime deployment files on the VPS.
- Use Docker Compose for the VPS stack.
- Use Traefik for HTTPS and routing.
- Use Watchtower to poll the `prod` image tag and restart the `web` containers.
- Keep MySQL on a separate database VPS for the current documented direction.

Intentional choices:

- This app uses PHP/Apache and MySQL.
- The production web stack can run three `web` replicas behind Traefik.
- Watchtower is used for simple image updates while advanced orchestration is
  deferred.
- Secrets are managed with protected `.env` files for now.
- Uptime monitoring belongs after the core deployment is stable.

## Important Docs

- [docs/deployment.md](docs/deployment.md) - VPS deployment steps.
- [docs/local-development.md](docs/local-development.md) - local run, test, and image push workflow.
- [docs/roadmap.md](docs/roadmap.md) - future app and operations ideas.
- [docs/handoff.md](docs/handoff.md) - current app state and verification checklist.
- [docs/moderation-safety.md](docs/moderation-safety.md) - current safety controls and future moderation plan.

## Assistant Guidance

When assisting with this project:

- Explain concepts clearly.
- Prefer small, verifiable steps.
- Avoid advanced orchestration until the current phase is stable.
- Keep the web VPS deployment folder minimal: `.env` and `docker-compose.web.yml`.
- Keep the database VPS deployment folder minimal: `.env` and `database/migrations/`.
- Never put secrets directly in Git-tracked files.
