# Session Strategy

The app currently uses default PHP file-based sessions. That is acceptable for
local development and the current learning phase.

## Current Production Behavior

The web VPS can run three `web` replicas behind Traefik. Traefik uses a sticky
cookie so a browser keeps returning to the same backend container.

This keeps CSRF/session behavior stable enough for the future mark form, but
it is a temporary scaling step.

## Limitations

File-based sessions are stored inside one container. If a request reaches a
different replica, that replica may not have the same session file.

Sticky sessions reduce that risk, but they do not solve it completely:

- a container restart can lose its local session files;
- a user can be routed to another replica after deployment changes;
- multiple app servers cannot share local container session files.

## Future Direction

Before scaling beyond one VPS or relying on multiple app servers, move sessions
to a shared store:

- Redis-backed sessions for the most common production pattern.
- Database-backed sessions if keeping the stack limited to PHP and MySQL is more
  useful for learning.

Until then, keep Traefik sticky cookies enabled when `deploy.replicas` is greater
than `1`.
