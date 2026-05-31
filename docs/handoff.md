# Handoff

## Current State

`I was here` is now a working canvas guestbook.

Visitors can:

- choose a canvas spot or use random placement;
- leave a display name, message, drawing, color, and shape;
- see marks saved from MySQL;
- select marks on the canvas;
- use Recent Marks for navigation;
- see near real-time updates through Server-Sent Events;
- undo their latest mark in the current session.

The canvas starts with one tile and expands to a 3x3 area around newly saved
marks without deleting existing marks.

Canvas tile styling uses `src/assets/images/cave-wall-texture.png` as the first
visual layer. Each tile caps that image at `1024px x 1024px`; if the image is
missing, the current whiteboard grid remains underneath as the fallback.

## Important Files

```text
src/index.php                       Main page
src/assets/css/home.css             App styling
src/assets/js/canvas-prototype.js   Canvas, form, drawing, realtime behavior
src/api/marks.php                   Mark create/list/undo API
src/api/marks-stream.php            Server-Sent Events stream
src/app/marks.php                   Mark validation and repository logic
database/init.sql                   Fresh database schema
database/migrations/                Incremental migrations
```

## Local Run

```powershell
docker compose up -d --build
```

Open:

```text
http://localhost:8080
```

Normal local startup after the first build should stay:

```powershell
docker compose up -d
```

Production startup on the web VPS should stay:

```bash
cd /opt/learningfullstack
docker compose -f docker-compose.web.yml up -d --remove-orphans
```

## Verification

Before pushing an image, run:

```powershell
.\scripts\check.ps1 -WithDatabase
.\scripts\smoke.ps1 -WithPost
npm run test:playwright
```

## Next Good Step

Push a tested image, then continue product polish from `docs/roadmap.md`.
