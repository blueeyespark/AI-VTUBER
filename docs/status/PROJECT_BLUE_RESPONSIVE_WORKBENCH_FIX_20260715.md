# Project Blue Responsive Workbench Fix — 2026-07-15

## Problem

At compact desktop widths, the auxiliary Blue Chat pane was hidden but its saved grid width remained reserved. The active editor was squeezed into a narrow column, tabs overflowed, and dashboard text wrapped one word per line while a large empty region remained on the right.

## Resolution

- Compact workbenches now reserve `0px` for the auxiliary column.
- Blue Chat opens as a right-side overlay at widths of 1400px or less.
- Closing the overlay restores the full editor width.
- Returning to a wide window restores the user's saved docked-chat width.
- Width and height overrides were added to the Electron smoke-capture harness.
- A regression test protects the responsive grid, overlay behavior, resize listener, and smoke dimensions.

## Verification

- JavaScript syntax checks for `control.js` and `main.cjs`.
- Full desktop-pet test suite.
- Compact Electron smoke capture at 1200×760.
- Wide Electron smoke capture at 1920×1080.
