# Moderation And Safety

Version 6 keeps the public wall usable without adding an admin interface yet.

## Current Controls

- CSRF protection on mark submission and undo.
- Position validation and spacing rules before a mark is saved.
- Database-backed rate limiting for mark submission.
- Basic spam validation for repeated characters, excessive links, and all-caps
  message spam.
- Recent duplicate protection for identical display name + message pairs.

## Moderation Decision

Anonymous posting can stay open for now because marks are short, placement is
limited, and Version 6 adds basic abuse controls. Admin/moderator tooling should
wait until there is real usage data.

## Future Admin Plan

- Add an `is_hidden` flag to marks instead of deleting content immediately.
- Add a private moderator view for recent marks.
- Let moderators hide, restore, or permanently delete marks.
- Add an audit table for moderation actions.
- Consider a report button if public traffic grows.

## Reporting Decision

Reporting is not needed for the first public version. Revisit reporting after
rate limiting and spam checks are tested with real usage.
