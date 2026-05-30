# Roadmap

This file keeps future work in one place. The detailed infrastructure sequence
lives in [development-plan.md](development-plan.md).

## High Priority

- [ ] Email notifications for users and admins.
- [ ] Admin dashboard for viewing, filtering, and moderating marks.
- [ ] Contact form improvements: phone number, category, optional fields.
- [ ] Production HTTPS validation through Traefik and Let's Encrypt.

## Security

- [x] Add a baseline Content Security Policy.
- [ ] Replace inline CSS/JS with external assets or nonces, then tighten CSP by
      removing `unsafe-inline`.
- [ ] Review proxy/IP handling before deploying behind more infrastructure.
- [ ] Add CAPTCHA or another bot-control layer if abuse appears.
- [ ] Add regular dependency and image update checks.
- [x] Add a production PHP ini override for safer default runtime settings.

## App Quality

- [ ] Add focused PHP tests for validation and submission behavior.
- [ ] Improve accessibility of the form and navigation.
- [ ] Add real-time validation feedback where it helps users.
- [ ] Add structured logging for production troubleshooting.

## Operations

- [ ] Add scheduled MySQL backups and test restore.
- [ ] Add CI checks for pull requests.
- [ ] Document rollback from a known-good `sha-*` image tag.
- [ ] Add deployment health checks after Compose updates.
- [ ] Use Windows 11 user environment variables for local development secrets
      instead of `.env` or command-line variables.

## Later Learning Tracks

- [ ] Learn MVC structure or evaluate Laravel for the next app.
- [ ] Move sessions to a shared store before scaling beyond one host. See
      [session-strategy.md](session-strategy.md).
- [ ] Research managed database options.
- [ ] Explore Kubernetes only after the current VPS workflow is stable.
