# Design

> The visual system for **Nickimart Medical** only. The retail mall and the
> data-bundle platform keep their own identity (orange on near-white,
> Montserrat display) and none of this applies to them. Both systems live in
> `src/app/globals.css`; the medical tokens are prefixed `--medi-` and scoped
> to `.medi`, so neither can reach the other.

## Visual theme

A supplier's catalogue, not a clinic's brochure. White paper, one teal that
carries every action, navy for anything with authority, and pale mint used as a
surface to group things rather than as decoration. Products are photographed on
white and are the only colour on most pages.

The shape language is flat and edged: hairline borders, generous radii on
surfaces, nothing floating on a shadow unless it is genuinely above the page.
No gradient is used as a fill. Two exist in the whole system — a dark teal band
behind the hero and the quotation call to action — and both are a single
shallow step within one hue, present to give a large dark area depth rather
than to look like a gradient.

## Color

OKLCH throughout. The retail palette is hex because it predates the decision;
this one is new, and OKLCH is what keeps a nine-step teal ramp perceptually
even — the same ramp in hex drifts muddy around the middle.

Every value below was measured, not estimated
(`WCAG 2.1 relative luminance, sRGB`).

### Teal — the one accent

| Token | OKLCH | Hex | Use |
|---|---|---|---|
| `--medi-mint-50` | `0.975 0.014 186` | `#edfaf8` | Section bands, table header rows, the hover state of a quiet row. |
| `--medi-mint-100` | `0.950 0.026 185` | `#dcf5f1` | Selected chips, info surfaces, the sidebar's active item. |
| `--medi-mint-200` | `0.903 0.046 184` | `#beeae2` | Borders on mint surfaces, dividers inside a teal context. |
| `--medi-teal-300` | `0.800 0.076 184` | `#84cec3` | Accent text and links **on the dark navy band only** (8.69:1). |
| `--medi-teal-400` | `0.700 0.095 184` | `#4eb2a5` | Icon fills, chart series, decorative marks. **Never text of any size** — 2.38:1 on mint-50, which fails even the large-text threshold. |
| `--medi-teal-500` | `0.620 0.104 184` | `#1c9a8d` | Large display text (≥18px) and graphic fills. **3.46:1 — never body copy.** |
| `--medi-teal-600` | `0.545 0.096 185` | `#008277` | **Primary.** Buttons, links, focus rings, the active tab. White on it is 4.72:1; it on white is 4.72:1. |
| `--medi-teal-700` | `0.470 0.082 186` | `#026962` | Hover and pressed states of the primary. |
| `--medi-teal-800` | `0.390 0.066 188` | `#05504c` | The quotation call-to-action band. |
| `--medi-teal-900` | `0.310 0.050 190` | `#063836` | The utility bar above the header. |

### Ink — type and authority

| Token | OKLCH | Hex | On white | Use |
|---|---|---|---|---|
| `--medi-ink` | `0.255 0.045 243` | `#0d2537` | 15.71:1 | Headings, the footer surface, prices. |
| `--medi-ink-soft` | `0.330 0.038 243` | `#243848` | 12.16:1 | Subheadings, emphasised body. |
| `--medi-body` | `0.430 0.026 243` | `#44525d` | 8.07:1 | Body copy. |
| `--medi-muted` | `0.530 0.021 243` | `#626e77` | 5.26:1 | Labels, captions, table headers, metadata. **The lightest text in the system.** |

There is deliberately no fifth, lighter grey. The obvious next step down lands
at 3.6:1 on white, and a token that exists will eventually be used on body copy
— which is the single most common reason a generated interface is hard to read.
Non-text greys (a disabled control, a rule) are separate tokens that cannot be
mistaken for type.

### Semantic

Each pairs a 600-weight foreground for text with a 50-weight surface, and is
never the only signal — a badge carries a word as well as a colour.

| Role | Foreground | Surface |
|---|---|---|
| Success / in stock / paid | `oklch(0.52 0.12 152)` | `oklch(0.96 0.03 152)` |
| Warning / low stock / due | `oklch(0.52 0.12 70)` | `oklch(0.96 0.04 80)` |
| Danger / out of stock / overdue | `oklch(0.53 0.17 25)` | `oklch(0.96 0.03 25)` |
| Info / draft / pending | `oklch(0.52 0.09 243)` | `oklch(0.96 0.02 243)` |

Warning was `0.56` until axe measured a status badge at 4.24:1 against its own
surface — the pairing passes at the body size the rest of the console uses and
fails at the 11px a badge is set in. The figure is for the smallest place a
token is used, not the most common one, so it is `0.52` and measures 5.01:1 on
the warning surface and 5.65:1 on white.

Group headings in the console sidebar are `white/55` on the teal-900 rail,
which measures 5.67:1. `white/35` reads as a nicely recessive label and
measures 3.13:1, which is not a label at all for anyone who cannot resolve it.

### Strategy

**Restrained** on every working surface: teal under 10% of the pixels, used for
the primary action, the current selection and state, never for decoration.
**Committed** on exactly two bands — the homepage hero and the quotation call to
action — where a dark teal surface carries the whole section. The homepage is
brand; it is allowed one place to be loud, and one is the number.

## Typography

### Families

**Schibsted Grotesk** — headings, buttons, labels, body, the lot.

Chosen against reflex. The three faces that came to mind first were Inter, IBM
Plex Sans and Space Grotesk; all three are the training-data default for
"clinical technical product" and all three are on the reject list for exactly
that reason. The brand as a physical object is a reagent bottle's printed label
and the faceplate of a good analytical balance: precise, legible at a glance,
not styled. Schibsted Grotesk is a Scandinavian news grotesque — tight, even
caps, unfussy lowercase, real character in the numerals — which reads
institutional without reading cold.

One family, not two. The product register says one well-tuned sans usually is
right, and a storefront whose display face is a second, similar sans is the
timid pairing the brief warns about. Contrast is carried by weight and size:
800 for display, 700 for headings, 600 for controls, 400–500 for text.

**Geist** — tabular figures only, through `.font-figures`.

Not a second display face. It is already loaded by the shared chrome, so it
costs nothing, and the retail side established the pattern for the same reason:
proportional digits make a column of prices ragged and a total hard to compare
against the one above it. Prices, quantities, order totals and every table
figure go through it. Words never do.

### Scale

Fixed rem on product surfaces, fluid only on the homepage hero. A clamped
heading that shrinks inside a console panel looks worse than a fixed one.

| Step | Size | Weight | Tracking |
|---|---|---|---|
| Display (hero) | `clamp(2.25rem, 1.4rem + 3.6vw, 4.25rem)` | 800 | `-0.035em` |
| h1 | `2rem` | 700 | `-0.025em` |
| h2 | `1.5rem` | 700 | `-0.02em` |
| h3 | `1.1875rem` | 650 | `-0.015em` |
| Body large | `1.0625rem` / 1.6 | 400 | — |
| Body | `0.9375rem` / 1.6 | 400 | — |
| Label | `0.8125rem` | 600 | `0.005em` |
| Meta | `0.75rem` | 500 | — |

Ratio ≈ 1.2 between steps on working surfaces. The hero max is 68px, well under
the 96px ceiling. Tracking never goes below `-0.035em`. `text-wrap: balance` on
h1–h3, `pretty` on prose, prose capped at 68ch.

No tracked uppercase kicker above section headings. It appears nowhere in the
system; a heading that needs a label above it to be understood is a heading
that needs rewriting.

## Layout

- Container `1280px`, gutters `16px` phone / `24px` tablet / `32px` desktop.
- Spacing on a 4px base. Section rhythm varies rather than repeating: a dense
  rail sits tighter under its heading than a narrative block does.
- Desktop category sidebar is a real column (`248px`), not a drawer — the
  catalogue has twelve categories and a buyer scans them.
- Product grids: `repeat(auto-fit, minmax(240px, 1fr))`, no breakpoints.
- z-index is a named scale: `dropdown 10 · sticky 20 · drawer-backdrop 30 ·
  drawer 40 · modal-backdrop 50 · modal 60 · toast 70 · tooltip 80`.
- Radii: `6px` controls, `10px` inputs and chips, `14px` cards, `20px` panels
  and bands. Never fully round except on avatars and count badges.

## Components

Every interactive component ships default, hover, focus-visible, active,
disabled, loading and error. The focus ring is one definition reused
everywhere: a 2px white halo then a 2px `--medi-teal-600` ring, so it reads on
white and on mint alike.

Cards are used where a card is the right affordance — a product, which is a
discrete thing with a picture, a name and a price — and nowhere else. Nested
cards do not appear. Lists, tables and plain sections carry everything else.

Loading is a skeleton of the shape that is coming, never a spinner in the
middle of content. Empty states say what the screen is for and offer the action
that fills it.

## Motion

150–250ms, `cubic-bezier(0.22, 1, 0.36, 1)` — the ease-out curve the retail
side already uses, so the two consoles feel like one company. No bounce.

Motion conveys state: a press, a pending navigation, a drawer arriving, a row
updating, a rail scrolling. The homepage gets one short orchestrated entrance
on the hero and a stagger on the first product rail; nothing else fades in on
scroll, because a section that animates on every scroll past is decoration.

Reveals enhance an already-visible default — content is never gated behind a
class-triggered transition, which never fires in a headless render and ships
the section blank.

`prefers-reduced-motion` drops movement and keeps feedback: colour and opacity
transitions remain, so a pressed button still reacts.

## What this system does not do

Gradient text. Glass panels. Coloured stripes down the left edge of callouts.
Tracked uppercase eyebrows. Numbered section markers as scaffolding. Big-number
hero metric rows. Identical icon-heading-paragraph card grids. Any of these in
a diff is a defect, not a preference.
