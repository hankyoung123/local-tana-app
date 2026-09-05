# Browser regressions

Install Chromium once with `bunx playwright install chromium`, then run
`bun run test:ui`. Playwright starts the real Next app on port 3187 using a fresh
browser context per test. Browser preview does not use SQLite.

The suite exercises InlineCombobox with the real Plate/Ariakit input, synthetic
DOM composition events, keyboard cancellation/selection, and editor focus return.
Synthetic composition tests cover application event handling; they do not automate
an operating-system IME candidate window.

Responsive tests measure the real Inspector/editor and Sidebar at 760, 1000 and
1440 pixels. Table/Cards tests render the production components into test-only
HTML with the app's actual stylesheet, so layout and native focus semantics can
be tested independently of View configuration mutations. No test route or extra
application state is added.

Run separately from `bun test`; no browser gate or benchmark threshold is added
to CI. Reports live in ignored `test-results/` and `playwright-report/` folders.
