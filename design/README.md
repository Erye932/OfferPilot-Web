# Design Prototypes

Static HTML prototypes for redesigning OfferPilot pages. Open any `.html` file
directly in a browser — no build step, no React, no server.

## Files

- `report.html` — V4 diagnosis report page (highest priority)
- `home.html` — Landing page (planned)
- `diagnose.html` — Diagnose input page (planned)
- `loading.html` — Async diagnose loading page (planned)

## How to preview

Option A — double-click:
just open the `.html` file in File Explorer, it renders in your default browser.

Option B — serve locally if you want hot-reload feel:
```powershell
npx serve design
# then open http://localhost:3000/report.html
```

## Stack used in prototypes

- Tailwind CSS via Play CDN (`cdn.tailwindcss.com`)
- Inter (Google Fonts) + JetBrains Mono
- Lucide icons inline as SVG
- No build, no framework

## Migration path

1. User reviews the prototype, approves the visual direction
2. We port the exact styles + layout into the existing React components
3. Delete the prototypes (or keep them as reference snapshots)
