# Product

> Scope note: this file describes **Nickimart Medical** (`/medicals`,
> medicals.nickimart.com). The retail mall and the data-bundle platform in the
> same repository are separate products with their own established identity;
> nothing here applies to them.

## Register

Split, deliberately. The storefront homepage and category pages are **brand**:
a first-time institutional buyer is deciding whether this supplier is real
before they are deciding what to buy. Everything behind it — product detail,
quotation builder, account, admin console, redistributor console — is
**product**: someone is in a task and the interface should disappear into it.

## Users

**The laboratory scientist or biomedical technician.** Knows exactly what they
need and usually knows its catalogue number. Arrives mid-shift, often on a
phone, often on a slow connection. Wants to know three things: do you have it,
what does it cost, how fast can you get it here. Will abandon any flow that
asks them to make an account before answering those.

**The procurement or administrative officer at a hospital, clinic or
university department.** Does not know what the thing is. Has been handed a
list by someone who does. Needs a document — a quotation or a proforma invoice
— with the right institution name, the right figures, and terms their finance
office will accept. Will take that document to someone who signs, and come back
days or weeks later expecting the price to hold.

**The practice owner or small clinic buyer.** Buying a handful of consumables
or one piece of equipment. Price-sensitive and may want to pay over time.

**Nickimart's own staff.** Sales pricing a quotation, procurement chasing a
supplier, stores receiving goods, finance reconciling payments. In the console
all day. Density and keyboard speed matter more than charm.

**Redistributors.** Independent sellers promoting the catalogue through
referral links, tracking what they have earned.

## Product Purpose

A medical and laboratory supplies business, operated end to end. The storefront
is the front of it; the quotation-to-sale workflow is the business. Most of
this catalogue is not sold by adding it to a cart — it is sold by somebody
asking for a price, somebody else preparing a document, and an institution
approving it. The software has to make that path short and the document
correct.

Success: a laboratory manager finds a reagent by catalogue number in under a
minute; a procurement officer receives a correct, professional quotation the
same day they ask; an administrator prices, issues and converts that quotation
without re-entering anything; and the stock, cost and cash figures behind it
all agree at the end of the month.

## Brand Personality

**Precise. Unhurried. Accountable.**

The voice of a good supplier, not a good marketer: states what it stocks, what
it costs and how long it takes, and does not claim anything it cannot show. It
is a business that institutions put on a purchase order, so it reads like one —
plain, specific, and confident enough not to oversell.

Emotionally the target is *relief*: the sense of having found somebody who
knows what a haematology control is and will actually call you back.

## Anti-references

- **Unverified trust theatre.** "Trusted by 5,000+ professionals", "100%
  secure", certification badges, five-star averages, shipping promises the
  business has not committed to. The supplied reference design is full of these
  and they are explicitly out of scope. Claims appear only where a real figure
  backs them.
- **Consumer marketplace energy.** Countdown timers, "only 2 left!", percentage
  starbursts, confetti. The buyer is spending an institution's money against a
  budget line.
- **Generated-template grammar.** A tiny tracked uppercase kicker above every
  section; numbered section markers used as scaffolding; identical icon-heading-
  paragraph cards repeated down the page; gradient text; glass panels; a
  coloured stripe down the left edge of a callout; the big-number hero metric
  row. Any of these present means the page was assembled rather than designed.
- **Clinical coldness.** Pure grey, no warmth, no photography. A supplies
  business whose site shows no product photographs reads as a shell company.
- **Medical-site cliché imagery.** Smiling model in a lab coat with folded arms;
  a stethoscope on a desk; a blue double-helix. The products are the imagery.

## Design Principles

**Answer the three questions first.** Do you have it, what does it cost, how
fast. Every product surface answers all three above the fold, or explains why
it cannot.

**Say the number or say nothing.** No figure appears unless it comes from the
database. No claim appears unless the business can show it. An unknown lead
time is "lead time on request", never an invented range.

**The document is the product.** A quotation or proforma is the thing the
customer keeps, forwards and signs against. It gets more care than any screen:
exact arithmetic, stable versions, a layout a finance office recognises.

**Two prices, one truth.** A price quoted is a price held. Accepted terms
survive every later change to the catalogue, the payment plans and the rate
card.

**Private things stay private.** Supplier identity, purchase cost, sourcing
route and landed cost are internal. The boundary is enforced in the query, not
in the template.

**Earned familiarity in the console.** Staff are in a task. Standard
affordances, consistent vocabulary, density where density helps. Delight is
saved for moments.

## Accessibility & Inclusion

**WCAG 2.2 AA**, storefront and console alike. Several institutional and
public-sector buyers procure against it, and the console is where staff spend
their day.

- Body text at ≥4.5:1, large text at ≥3:1, measured rather than assumed. The
  palette ships only text colours that pass; the lighter greys that would have
  tempted a designer into 3.6:1 body copy are not in the token set.
- A visible focus ring on every interactive element, and a complete keyboard
  path through search, filters, cart, the quotation builder and every console
  table.
- Every product image carries real alt text describing the item, not its
  filename. The product form requires it.
- `prefers-reduced-motion` removes movement and keeps feedback: a pressed
  button still visibly reacts.
- Status is never carried by colour alone — a badge has a word in it.
- Target sizes ≥24px with spacing, ≥44px for anything on the phone storefront.
- Built for a mid-range Android phone on a slow connection in Accra, not a
  desktop on fibre.
