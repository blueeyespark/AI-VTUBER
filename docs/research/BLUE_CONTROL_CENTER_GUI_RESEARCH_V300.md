# Blue Control Center GUI Research — v3.0

Research date: 2026-07-04

## Interfaces reviewed

### ChatGPT

OpenAI's Projects interface keeps chats, files, project instructions, and
project memory together. Its sidebar makes switching persistent contexts
predictable without replacing the main conversation surface.

Applied to Blue:

- Persistent named conversations remain the primary Chat workspace.
- Duplicate historical titles are collapsed visually without deleting data.
- The active conversation is shown in the bottom status bar.
- File, folder, image, OCR, clipboard, and voice tools stay attached to Chat.

Source:
https://help.openai.com/en/articles/10169521-projects-in-chatgpt

### Visual Studio Code

VS Code divides its workbench into stable regions: Activity/Side Bar,
editor/content area, panels, and a Status Bar. It also exposes commands through
a searchable Command Palette and restores the user's workbench state.

Applied to Blue:

- Persistent left navigation on wide windows
- Responsive horizontal navigation on compact windows
- Large central workspace for the active view
- Compact bottom status bar
- Ctrl+1 through Ctrl+6 view shortcuts
- Ctrl+K command search
- Last selected view remains persistent

Source:
https://code.visualstudio.com/docs/editing/userinterface

### Microsoft Fluent 2

Fluent recommends brief, scannable navigation, a responsive inline drawer that
reflows on small widths, consistent spacing, clear hierarchy, and controls that
remain accessible rather than appearing only on hover.

Applied to Blue:

- 190-pixel task-focused navigation that reflows below 720 pixels
- Four-pixel-based spacing rhythm
- Visible labels for every navigation item
- Keyboard focus rings and no hover-only commands
- Reduced container rounding and stronger workspace hierarchy

Sources:

- https://fluent2.microsoft.design/components/web/react/core/nav/usage
- https://fluent2.microsoft.design/layout
- https://fluent2.microsoft.design/accessibility

## Movement diagnosis

The window's roaming vector was correct. The renderer mapped positive screen X
to negative model yaw and negative screen X to positive yaw. Blue therefore
turned away from the direction of travel, producing a backward-walking effect.

The corrected mapping is:

- positive screen X -> positive 0.58-radian yaw
- negative screen X -> negative 0.58-radian yaw
- near-vertical travel -> preserve the previous horizontal heading
- idle -> blend smoothly back to front-facing

The behavior is covered by automated direction and label tests and by an
isolated right-walk Electron capture.
