# Moderation And Safety

## Current Controls

- CSRF protection on create and undo.
- Required display name.
- Message or drawing required.
- Position bounds for the 201x201 world.
- Minimum spacing between marks.
- Rate limiting: 20 mark submissions per hashed client IP per 5 minutes.
- Basic spam checks for repeated characters, excessive links, and all-caps
  messages.

Anonymous posting stays open for now.

## Later

- Add `is_hidden` to marks.
- Add a private moderator list.
- Add hide, restore, and permanent delete actions.
- Add a moderation audit log.
- Add public reporting only if traffic grows.
