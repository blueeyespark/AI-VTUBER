# Project Blue Control Center UI Research — 2026-07-10

## Sources checked

- VS Code user interface documentation: broad work areas belong in an activity/sidebar, while the main editor area carries the active work surface. VS Code also uses a status bar, command palette/search, and panel areas for diagnostics.
- ChatGPT desktop/chat patterns: the chat composer is the primary control point for messages, attachments, voice, and work actions.
- Microsoft Fluent-style command organization: related commands should be grouped into compact action areas instead of spread across oversized duplicate panels.

## Applied information architecture

- **Overview**: health, function coverage, shortcuts, and high-level workspace map.
- **Chat**: primary work surface for conversation, memory, attachments, OCR, creation, research, expansion planning, diagnostics, system checks, approvals, and latest artifacts.
- **Companion**: body, voice, presence, local brain/model setup, movement, OBS, privacy, and activity history.
- **Connections**: Discord and BlueMesh live here because they connect Blue to other people/devices.

## UI rules for future changes

- Do not create a separate tab when the feature is really a chat action.
- Do not create a side rail inside Chat unless it shows live context; actions should stay near the composer as compact buttons.
- Every visible button must have an ID, a route, or an explicit control-audit exemption.
- Top status chips should either run the related check or focus the exact feature area.
- Diagnostics belong inside Chat, not Chromium/Electron developer tools.
