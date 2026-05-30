# Handoff

## Project

`learningfullstack` now contains the early version of `I was here`, a nostalgic
digital cave-wall website where visitors will eventually leave small marks on a
shared canvas.

## Current Focus

Backend and infrastructure work is paused unless needed for the website.

The current page is a frontend design prototype only. It does not yet submit,
store, or retrieve real marks.

## What Exists

- Visual prototype: `src/index.php`
- Page CSS: `src/assets/css/home.css`
- Prototype interaction JS: `src/assets/js/canvas-prototype.js`
- Cave wall texture: `src/assets/images/cave-wall-texture.png`
- Product roadmap: `docs/website-roadmap.md`
- Design review checklist: `docs/design-review.md`
- Infrastructure/deployment roadmap: `docs/development-plan.md`

## Design Intent

The website should feel friendly and nostalgic, like a quiet digital cave wall.

Important product ideas:

- visitors leave a mark;
- a mark contains a display name and optional short message;
- marks appear as small dots/shapes on the canvas;
- clicking a mark expands or previews its details;
- marks should not overlap;
- users can choose a color and shape;
- users can choose placement or random placement;
- the page should show how many marks exist.

## Current Prototype Behavior

- The canvas uses static sample mark data.
- The entry count is `count($marks)` in `src/index.php`.
- Clicking a sample mark updates the selected-mark preview.
- The compose panel is disabled intentionally.
- The Recent Marks section is a static preview.

## How To Run Locally

```powershell
docker compose up -d --build
```

Open:

```text
http://localhost:8080
```

## Checks

Run static checks:

```powershell
.\scripts\check.ps1
```

Run live smoke checks while containers are running:

```powershell
.\scripts\smoke.ps1
```

## Suggested Next Step

Review Version 2 using `docs/design-review.md`, then start Version 3 from
`docs/website-roadmap.md` when the design is approved:

1. Build mark validation and save logic.
2. Render saved marks from the database.
3. Replace the disabled compose preview with a real form.

Do not build real mark submission until the visual direction is approved.
