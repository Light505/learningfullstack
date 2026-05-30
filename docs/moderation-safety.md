# Moderation And Safety

Current controls:

- CSRF protection on create and undo.
- Required display name.
- Message or drawing required.
- Position bounds and spacing checks.
- Rate limiting for mark submission.
- Basic spam checks for repeated characters, excessive links, and all-caps
  messages.
- Duplicate protection for recent identical display name and message pairs.

Anonymous posting stays open for now.

Future moderation should add:

- `is_hidden` on marks;
- private moderator list;
- hide, restore, and permanent delete actions;
- moderation audit log;
- public reporting only if traffic grows.
