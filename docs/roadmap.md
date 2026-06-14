# Roadmap

## Done

- Docker local development with web, MySQL, and phpMyAdmin.
- Production-style image build and GHCR tag plan.
- Database schema for marks and rate limits.
- Real mark submission, validation, CSRF protection, and undo.
- Non-overlapping placement rules.
- Random placement within explored canvas tiles.
- Server-Sent Events for near real-time mark updates.
- Optional drawing marks.
- Panning, zooming, map clustering, and SVG export.
- 201x201 bounded tile world with fogged unexplored tiles and 8-neighbor reveal.
- Basic spam and rate-limit controls.
- Playwright coverage for layout, mark flow, drawing, tile fog, export, and
  canvas navigation.

## Before Next Image Push

- [ ] Run `.\scripts\check.ps1 -WithDatabase`.
- [ ] Run `.\scripts\smoke.ps1 -WithPost`.
- [ ] Run `npm run test:playwright`.
- [ ] Build and push `sha-*`, `main`, and `prod` image tags from `main`.

## Product Polish

- [ ] Add a small build/version indicator for easier container testing.
- [ ] Improve mobile placement and drawing ergonomics.
- [ ] Add a simple way to reset local demo data without touching production.
- [ ] Review copy after manual testing.

## Operations

- [ ] Add scheduled MySQL backups and test restore.
- [ ] Add CI checks for pull requests.
- [ ] Confirm Watchtower rolling updates against three web replicas.

## Later Features

- [ ] Admin/moderator page.
- [ ] Hide/restore marks instead of hard deleting moderation cases.
- [ ] Public report flow if traffic grows.
- [ ] Shared session storage before scaling beyond one VPS.
- [ ] Drawing tool improvements.
