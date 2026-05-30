# I was here Website Roadmap

This roadmap tracks the user-facing app from the current visual prototype toward
the real interactive website.

## Current State

- The homepage is a design-only prototype.
- The canvas shows static sample marks.
- Clicking a sample mark updates the selected-mark preview.
- The entry count is based on static sample data.
- The compose panel is disabled and does not submit anything.
- The Recent Marks section is a static preview.
- Version 1 and Version 2 are complete.

## Product Direction

`I was here` is a digital cave wall. Visitors leave a small mark on a shared
canvas: a display name, an optional short message, and eventually an optional
drawing.

The emotional target is friendly and nostalgic: simple, quiet, and a little
human.

## Version 1: Visual Prototype

Goal: decide whether the design direction feels right.

- [x] Replace the placeholder business page.
- [x] Add a large visual canvas.
- [x] Show non-overlapping sample marks.
- [x] Show selected mark details when a sample mark is clicked.
- [x] Show a visible entry count.
- [x] Include a disabled compose panel to preview the future form.
- [x] Use a nostalgic cave-wall texture.

Done when: the design is approved as the starting direction.

## Version 2: Static UI Refinement

Goal: improve the frontend before adding real persistence.

- [x] Add a dedicated Recent Marks preview section with static sample rows.
- [x] Add clear empty, selected, and disabled states.
- [x] Refine mark shapes, spacing, hover, focus, and selected states.
- [x] Add a mobile-first review pass for the canvas and side panel.
- [x] Replace symbol text buttons with better icons where useful.
- [x] Decide final placeholder copy for the form and canvas hint.

Done when: the page feels ready to connect to real data.

Status: complete. Review the design before starting Version 3.

## Version 3: Real Mark Submission

Goal: let visitors place real message marks.

- [x] Create the `marks` database table.
- [x] Store mark UID, x/y position, message, display name, color, shape, and
      creation time.
- [x] Validate display name, message, position, color, and shape.
- [x] Add CSRF protection to mark submission.
- [x] Add backend save/list functions for marks.
- [x] Save marks through a backend endpoint.
- [x] Replace the disabled compose preview with a real form.
- [x] Render saved marks from the database.
- [x] Update the entry count from the database.

Done when: a visitor can leave a message mark and see it after refresh.

## Version 4: Placement Rules

Goal: keep the canvas readable as more marks are added.

- [x] Prevent marks from overlapping.
- [x] Add spacing rules between marks.
- [x] Support user-chosen placement.
- [x] Support random placement.
- [x] Show a useful message when a chosen location is too close to another mark.
- [x] Add undo for the current visitor's latest mark.

Done when: users can place marks without visual clutter.

## Version 5: Recent Marks

Goal: show activity without making the canvas noisy.

- [x] Add a Recent Marks section.
- [x] Show new marks without a full page reload.
- [x] Use Server-Sent Events for near real-time updates, with polling as a
      fallback.
- [x] Keep the list compact and scannable.

Done when: new activity is visible soon after marks are created.

## Version 6: Moderation And Safety

Goal: keep the public wall usable.

- [x] Add rate limiting for mark submission.
- [x] Add basic spam controls.
- [x] Decide whether anonymous posting needs moderation.
- [x] Add an admin/moderator plan before building admin UI.
- [x] Add reporting or hiding rules if needed.

Done when: public posting has a basic abuse plan.

## Version 7: Drawing Marks

Goal: add optional drawing once message marks are stable.

- [x] Decide drawing storage format.
- [x] Add a simple drawing tool.
- [x] Store drawings with or beside message marks.
- [x] Add size limits.
- [x] Keep drawings visually compact on the shared canvas.

Done when: visitors can leave either a message, a drawing, or both.

## Future Canvas Expansion

- [ ] Resize the canvas dynamically as marks reach the edge.
- [x] Limit how far users can pan.
- [x] Add pan and zoom controls.
- [x] Keep the entry count and mark discovery usable at larger scale.

## Technical Notes

- Keep backend changes paused until a frontend step needs them.
- Keep Version 1 and Version 2 focused on visual/user experience decisions.
- Use REST for create/undo/bootstrap requests and Server-Sent Events for live
  mark activity updates.
- Use the existing scripts before handoff or review:

```powershell
.\scripts\check.ps1
.\scripts\smoke.ps1
```
