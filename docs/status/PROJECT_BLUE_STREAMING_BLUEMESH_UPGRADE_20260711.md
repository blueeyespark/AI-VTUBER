# Project Blue Streaming + BlueMesh upgrade

Date: 2026-07-11

## Streaming Studio improvements

- Added a real streaming preflight model.
- Added platform-specific chat readiness guidance:
  - Twitch: EventSub/chat API path.
  - YouTube Live: LiveChatMessages path.
  - Discord: existing approved bot channel flow.
  - Other/Kick: creator-approved adapter only.
- Added adult-platform profiles:
  - Joystick.
  - Fansly.
  - OnlyFans.
  - Chaturbate.
- Added `adult_verified` stream mode.
- Added adult-platform readiness checks:
  - selected platform must be an adult platform before adult mode is allowed.
  - verified consenting adults only.
  - platform rules reviewed for the current session.
  - creator approval for adult-platform preparation.
  - explicit adult content remains blocked on SFW platforms.
  - credentials/tokens/stream keys remain session-only and are never saved.
- Added chat moderation decision helper.
- Added explicit checks for:
  - OBS websocket connection.
  - scene/source review.
  - platform mode.
  - chat mode.
  - avatar backend.
  - voice profile.
  - no persisted secrets.
  - creator approval before going live.
- Added Control Center button: **Full Stream Preflight**.
- Added Control Center button: **Adult Platform Readiness**.
- Added Control Center moderation button behavior that now shows an actual moderation-readiness report instead of a generic chat plan.

## BlueMesh improvements

- Added BlueMesh status readiness fields:
  - server tool ready
  - push tool ready
  - docs ready
  - database exists
  - security rules
  - recommended sync workflow
- Added backend preflight command:

```powershell
python -m blue_mesh.lan preflight
```

- Added Control Center button: **Sync Preflight**.
- The preflight report is read-only and does not push, import, overwrite, or store pairing tokens.

## Security rules preserved

- No stream keys are stored.
- No OBS passwords are stored.
- No platform tokens are stored.
- BlueMesh pairing tokens are session-only.
- `.env` files are not synced.
- BlueMesh imports still require approval.
- Conflicts become reports instead of blind overwrites.
- Going live, switching scenes, posting socially, or changing account settings remains approval-gated.
- Adult-platform mode does not bypass platform rules, consent, age verification, or creator approval.

## Verification

- `npm.cmd run check`: passed.
- `npm.cmd test`: 42/42 passed.
- `python -m unittest discover -s tests -p test_blue_mesh_lan.py`: 4/4 passed with `PYTHONPATH=src`.
- `python -m blue_mesh.lan preflight`: returned a valid readiness report.

## Notes

The current fresh copy does not yet have a BlueMesh SQLite database at `Project Blue App\.blue\bluemesh.db`, so preflight correctly reports setup is needed until the local Blue identity/node database is created.
