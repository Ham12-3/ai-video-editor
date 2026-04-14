# ClipForge Design System

The source of truth for how ClipForge looks and feels. Every colour, size, and spacing choice lives here. If it's not in this file, don't invent it.

**Direction:** editorial, print-inspired, warm linen on warm near-black. Serif for display, sans for body, mono for data. Zero border radius. One accent colour, used sparingly for error / destructive states only.

Reference mockups are in [`../design-mockups/`](../design-mockups/).

---

## Palette

| Token | Value | Used for |
|-------|-------|----------|
| `--background` | `#F3EBE2` | Page background. Warm linen. |
| `--foreground` | `#1A1A1A` | Primary text. Near-black. |
| `--muted-foreground` | `#3D3D3D` | Secondary text, labels, crumbs. |
| `--foreground-inverse` | `#FFFFFF` | Text on dark surfaces (video preview, black buttons). |
| `--surface-inverse` | `#1A1A1A` | Dark surfaces. Video preview bg. Primary CTA bg. |
| `--card` | `#FAF5EE` | Card background, lighter than page by a touch. |
| `--muted` | `#E8DFD3` | Selected nav item background. |
| `--border` | `#D9CFC2` | 1px borders. Always 1px, always this colour. |
| `--accent` | `#B03E16` | Failed state, destructive action text. **Text use only.** |

**Contrast:**
- `--foreground` on `--background` = ~14:1 (AAA)
- `--muted-foreground` on `--background` = ~8:1 (AAA)
- `--accent` on `--background` = ~5.1:1 (AA for normal text)

**No other colours exist.** No blue, no green, no purple. If you need to communicate state, use outlined uppercase labels not coloured fills. If you need to communicate an error, use `--accent` sparingly.

---

## Typography

**Three families, no more:**

| Token | Family | Used for |
|-------|--------|----------|
| `--font-heading` | **Newsreader** (serif, weights 400–500) | Display headlines, page titles, EDL op names, stat values |
| `--font-sans` | **Inter** (sans, weights 400–500–700) | Body copy, button labels, nav items, descriptions |
| `--font-mono` | **Geist Mono** (mono, weights 400–500–700) | Timestamps, timecodes, crumbs, mono-label tags (`01 TRIM`), badges, stats, numerics |

### Type scale

| Use | Family | Size | Weight | Letter-spacing | Line-height |
|-----|--------|------|--------|----------------|-------------|
| Hero headline (desktop) | Newsreader | 180px | 400 | -6px | 0.92 |
| Page title large | Newsreader | 112px | 400 | -3.5px | 1.00 |
| Page title | Newsreader | 52px | 400 | -1.5px | 1.05 |
| Section title | Newsreader | 36px | 400 | -0.8px | 1.10 |
| Large stat / number | Newsreader | 28px | 400 | -0.5px | 1.10 |
| Card title | Newsreader | 24px | 400 | -0.3px | 1.15 |
| Table row title | Newsreader | 19px | 400 | -0.3px | 1.20 |
| Brand wordmark | Newsreader | 22px | 500 | -0.4px | 1.00 |
| Italic blurb | Newsreader italic | 20-22px | 400 | -0.3px | 1.45 |
| Body large | Inter | 16px | 400 | 0 | 1.55 |
| Body | Inter | 14px | 400–500 | 0 | 1.45 |
| Small body | Inter | 13px | 400 | 0 | 1.45 |
| Mono data | Geist Mono | 13px | 400 | 1px | 1.00 |
| Mono label | Geist Mono | 11px | 400 | 2px | 1.00 |
| Mono tag | Geist Mono | 10px | 400–700 | 2px | 1.00 |

### Rules

- **Newsreader is for display only.** Never use it for button labels, form fields, table columns, or anything UI-functional.
- **Every mono label is ALL CAPS.** Letter-spacing 2px. Always.
- **No system font stacks anywhere.** If the font isn't loaded, fail visibly with a fallback that makes the mistake obvious.
- **Italic is meaningful.** Reserved for quoted copy, invitation text, and "deferred / skipped" states in op lists.

---

## Spacing scale

Don't pick arbitrary values. Pick from this list:

`4 · 8 · 12 · 16 · 20 · 24 · 28 · 32 · 36 · 48 · 56 · 72`

| Context | Typical |
|---------|---------|
| Nav item padding | `10 16` |
| Card padding | `28` |
| Page padding (desktop) | `48 56` |
| Page padding (mobile) | `16 20` |
| Section gap | `24 36` |
| Form field gap | `16` |
| Button padding | `12 22` (large), `10 18` (small) |
| Inside table cell | `14 4` (dense), `22 4` (editorial) |

---

## Radius

**Zero. Everywhere. No exceptions.**

```css
--radius: 0px;
```

This is non-negotiable. The editorial feel collapses the moment you round a corner. No rounded cards, no rounded inputs, no rounded buttons, no rounded badges. Use padding and stroke to create containment, not radius.

---

## Borders & separation

- **Stroke thickness:** always 1px. Never 2px or more.
- **Stroke colour:** `--border` for most dividers. `--foreground` when the divider needs emphasis (e.g. the top border of the projects table, to signal "the data starts here").
- **No box-shadows, no elevations, no gradients.** Flat.
- **No dividers for decoration.** Use whitespace. Only add a 1px rule when it's carrying information (table column break, card boundary, section transition).

---

## Elements

### Buttons

Three states, one hierarchy:

| Variant | Bg | Fg | Border | Use |
|---------|-----|-----|--------|-----|
| Primary | `--surface-inverse` | `--foreground-inverse` | none | One per screen. `Render video`, `Download MP4`, `New project`. |
| Outline | transparent | `--foreground` | 1px `--foreground` | Secondary. `Cancel`, `Discard`, `Test`. |
| Ghost | transparent | `--foreground` | none | Tertiary, inline actions. `Replace`, `Skip`. |
| Destructive text | transparent | `--accent` | none | `Delete` only. Always ghost, never filled. |

Padding: `[12, 22]` default, `[10, 18]` compact, `[14, 28]` hero CTA. Zero radius. Primary gets a trailing `→` arrow when the action moves the user forward.

### Status badges

Uppercase Geist Mono 10px, letter-spacing 2px, 1px outline, padding `[4, 10]`. Never filled with colour. Variants:

| State | Border | Text |
|-------|--------|------|
| EDITING (active) | none | `--foreground-inverse` on `--foreground` fill (the one exception) |
| SHIPPED | `--foreground` | `--foreground` |
| NOT SET | `--border` | `--muted-foreground` |
| FAILED | `--accent` | `--accent` |
| VALID | `--foreground` | `--foreground` |

### Toggles

Desktop: 32×18px, dark inverse fill when on, white square slider.
Mobile: 40×24px (touch target compliant when combined with row padding).

### Inputs

Full-width, 1px border, no radius, padding `[14, 16]`, background `--card` or `--background`, italicized placeholder in `--muted-foreground`.

### Focus ring

**2px `--foreground` outline with 2px offset**, never a box-shadow. Appears only on `:focus-visible`, never on `:focus` (prevents it showing on mouse clicks).

---

## Layouts

### Desktop (≥1024px)
- **Sidebar + main:** 220px sidebar, `fill_container` main. Used for Editor, Projects, Settings.
- **Hero:** full width, generous whitespace, bottom-anchored content.
- **Page padding:** `48 56`.

### Mobile (<768px)
- **56px top header** with burger + wordmark + avatar.
- **Single scrolling column**, 16–20px horizontal padding, 100px bottom padding to clear sticky action bar.
- **Sticky bottom bar** for primary action (full-width black button).
- **Progressive disclosure:** show 4 rows of a list, then "Show N more ↓" in italic mono.

### Tablet (768–1023px)
Follow mobile rules with tighter type scale. Sidebar can return as a slide-over sheet rather than a permanent column.

---

## Motion

Editorial means calm. Motion is minimal and informational, not decorative.

- **Page transitions:** none. Hard cut.
- **State changes:** 150ms ease-out, opacity and transform only. Never colour transitions longer than 80ms.
- **Progress bars:** the fill animates in lockstep with real data. No fake smooth bars that outpace reality.
- **Hovers:** 80ms tint shift (e.g. black button → ~85% black), no scale, no shadow.
- **Focus ring:** appears instantly, never animated in.
- **Render-complete moment:** one exception — the "It's done." headline can fade in over 300ms. That's the only place we earn a flourish.

---

## Iconography

- **No icons in section titles, nav items, or buttons.** If a button needs an icon to be understood, rewrite the label.
- **Only one glyph allowed in UI chrome: `→`** (arrow right). Signals forward motion. Used in primary CTAs, "Start another project →", breadcrumbs.
- **The download button uses `↓`.** One-off, because download is a verb with a direction.
- **No Lucide icons, no Material Symbols, no Feather.** If you find yourself reaching for one, rewrite the affordance to not need it.

---

## Anti-slop guardrails

If any of these appear, delete and try again:

1. Purple / violet / indigo anywhere
2. 3-column icon-card feature grid
3. Icons in coloured circles
4. Everything centered
5. Rounded corners of any size
6. Decorative blobs, wavy dividers, floating circles
7. Emoji in headings
8. Coloured left-borders on cards
9. Generic hero copy ("Welcome to X", "Unlock the power of…", "Your all-in-one solution")
10. Cookie-cutter hero → 3 features → testimonials → CTA rhythm

Source: OpenAI's "Designing Delightful Frontends" (Mar 2026) + our own editorial constraints.

---

## Voice

Copy is part of the design.

- **Short.** "Bring your own keys." beats "Easily manage your API keys in one place."
- **British English.** Favourite, realise, colour, organise.
- **Specific nouns, not categories.** "a red Tesla Model 3" not "a vehicle".
- **No marketing verbs.** Skip "empower", "unlock", "supercharge", "revolutionise".
- **Italic for invitations.** "Got a clip lying in your Downloads folder? Drop it in." is italic Newsreader.
- **Confident labels.** "It's done." not "Render successful!".

---

## Implementation notes

- CSS variables live in [`src/app/globals.css`](src/app/globals.css).
- Tailwind v4 `@theme` block exposes them as utility classes (`bg-background`, `text-muted-foreground`, `font-heading`, etc.).
- Fonts are loaded via `next/font/google` in [`src/app/layout.tsx`](src/app/layout.tsx).
- Every component imports tokens via Tailwind classes, never hard-coded hex values.
- If you need a new token, add it here first, commit it, then use it.

---

## When to update this file

- A new screen introduces a new pattern that three other screens will reuse.
- We change accent colour, type family, or radius policy.
- We add a new type scale step because the existing ones don't work.

Not when:
- One component needs a one-off style (that belongs in the component, or doesn't belong at all).
- You want to experiment with a new colour (experiment in the mockup, not in the code).
