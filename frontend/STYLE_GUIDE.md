# Frontend Style Guide

## Typography

The global type scale and font families are defined in `src/styles/_tokens.scss`.
Use `--font-family-base` for interface text and `--font-family-mono` for code,
file paths, terminal output, JSON, and diffs. The browser uses its system
fallback stack when Inter or JetBrains Mono is not installed; no external font
service is required.

| Token | Size | Intended use |
| --- | --- | --- |
| `--font-size-xs` | `0.75rem` | Compact metadata |
| `--font-size-sm` | `0.875rem` | Secondary and compact text |
| `--font-size-md` | `1rem` | Body text and controls |
| `--font-size-lg` | `1.125rem` | Emphasized body text |
| `--font-size-xl` | `1.25rem` | Small headings |
| `--font-size-2xl` | `1.5rem` | Large headings |
| `--font-size-3xl` | `1.875rem` | Page-level display headings |

Use the shared `heading-lg`, `body-sm`, and `code-text` mixins from
`src/styles/_typography.scss` in SCSS Modules and feature stylesheets. Global
body and form-control defaults are in `src/styles/globals.scss`.

No local WOFF2 assets are currently included. Font-family declarations use
system fallbacks so the interface remains readable without network font loads.
