# Dark theme comparison

Actual local browser captures for the docs dark-theme alignment. Each before/after pair uses the same page, viewport and renderer.

| Capture | Renderer | Viewport | Page or state |
| --- | --- | --- | --- |
| hosted-desktop | Mintlify Palm | 1440 × 1000 | English 1.58 overview |
| hosted-mobile | Mintlify Palm | 390 × 844 | English 1.58 overview |
| offline-desktop | Offline reader | 1440 × 1000 | English 1.58 API quickstart |
| offline-mobile | Offline reader | 390 × 844 | English 1.58 overview with navigation open |

Before captures use the main theme at `9a0f1ef15ada6f88b392d7428881b3dc58c301de`; after captures use this branch based on main `90947e80d2a664e19ae6555a3b881889db04ceb8`. The intervening main merge adds Quotas operator documentation and does not alter the captured pages or theme. The styling reference is the default `.dark` palette in `zylon-frontend/packages/ui-v2/styles.css` at `39bd8f71630f0110c4f2a5cc3495d43cd1d7e554`.

Mintlify client 0.0.2296 and the repository offline renderer run locally. Chromium captures use reduced motion, local assets and blocked external requests for reproducibility; Mintlify's remote flag icon is unavailable. Hosted search results require a deployed preview. These are browser screenshots, not generated mockups.

Validation covers both renderers at desktop, tablet and mobile sizes in dark/light themes, English/Spanish, 1.57/1.58 and Zylon Code. The 30 light article screenshots remain byte-identical to the baseline, article text and heading geometry are unchanged, and tabs, accordions, search shells, locale menus, mobile navigation and offline theme persistence are checked. Animated hosted search frames are checked visually rather than for byte identity. Full task-local captures and the harness are kept outside published documentation.
