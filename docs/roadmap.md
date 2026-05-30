# Roadmap

This is the single project roadmap.

## Done

- Docker local development with web, MySQL, and phpMyAdmin.
- Production-style image build and GHCR tag plan.
- Database schema for marks and rate limits.
- Real mark submission, validation, CSRF protection, and undo.
- Non-overlapping placement rules.
- Random placement within committed canvas tiles.
- Server-Sent Events for near real-time mark updates.
- Optional drawing marks.
- Panning, zooming, and dynamic 3x3 canvas expansion.
- Basic spam and rate-limit controls.
- Playwright coverage for layout, mark flow, drawing, and canvas expansion.

## Before Next Image Push

- [ ] Commit the current polish and documentation changes.
- [ ] Rebuild the local image.
- [ ] Run `.\scripts\check.ps1 -WithDatabase`.
- [ ] Run `.\scripts\smoke.ps1 -WithPost`.
- [ ] Run `npm run test:playwright`.

## Product Polish

- [ ] Add a small build/version indicator for easier container testing.
- [ ] Improve mobile placement and drawing ergonomics.
- [ ] Add better empty-state guidance after the first canvas expansion.
- [ ] Add a simple way to reset local demo data without touching production.
- [ ] Review copy after manual testing.

## Operations

- [ ] Use Windows 11 user environment variables for local development secrets
      instead of `.env`.
- [ ] Add scheduled MySQL backups and test restore.
- [ ] Add CI checks for pull requests.
- [ ] Document rollback from a known-good `sha-*` image tag.
- [ ] Confirm Watchtower rolling updates against three web replicas.

## Later Features

- [ ] Admin/moderator page.
- [ ] Hide/restore marks instead of hard deleting moderation cases.
- [ ] Public report flow if traffic grows.
- [ ] Shared session storage before scaling beyond one VPS.
- [ ] Drawing tool improvements.
