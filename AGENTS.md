# AGENTS.md

## Project

`I was here` is a small PHP/Apache and MySQL canvas guestbook. Visitors place a
mark on a shared 201x201 tile world, with optional message, drawing, color, and
shape.

## Work Rules

- Keep changes small, tested, and aligned with the existing PHP, plain JS, CSS,
  Docker, and PowerShell script setup.
- Do not add new frameworks or orchestration unless the current code needs it.
- Never commit secrets. Use `.env` from the example files for local and VPS
  configuration.
- Keep VPS runtime files minimal: `.env` plus `docker-compose.web.yml` on the
  web host, and schema files only where database setup is performed.
- Before image pushes, run the checks listed in [README.md](README.md).

## Useful Docs

- [README.md](README.md): quick start, checks, and app map.
- [docs/deployment.md](docs/deployment.md): GHCR and VPS deployment.
- [docs/roadmap.md](docs/roadmap.md): active next work.
