/**
 * Money, done in integers.
 *
 * The retail side stores prices as `Float` and that is survivable there: one
 * item, one price, one multiplication. It is not survivable here. A quotation
 * for a laboratory runs to twenty lines, each with its own quantity and
 * possibly its own discount, then a document-level discount, then delivery and
 * handling, then an instalment uplift of 10%, then a split into a deposit and
 * six payments. Every one of those steps is a multiplication or a division, and
 * binary floating point is wrong at each of them in a way that compounds:
 *
 *     0.1 + 0.2                     === 0.30000000000000004
 *     1234.56 * 3                   === 3703.6800000000003
 *     (84500 * 1.18) / 6            === 16618.333333333336
 *
 * On a document a customer signs, and against a payment schedule that has to
 * add back up to the total exactly, that is not acceptable. So: every amount is
 * carried through this module as an integer number of pesewas, every rounding
 * happens at a named point rather than wherever the arithmetic lands, and the
 * only values that ever become a `number` with a decimal point are the ones
 * being printed.
 *
 * Pure on purpose
 * ---------------
 * Nothing here imports Prisma, or anything else. The database column is
 * `Decimal(14,2)` and Prisma hands it back as a `Decimal` object, but that
 * object's contract — it stringifies to its exact value — is all this module
 * needs, so it is taken structurally. The alternative, importing the generated
 * client, would make this file unloadable by `node --test` and would put the
 * one piece of arithmetic in the system that most needs a test behind an
 * import that cannot be resolved without a bundler. Every other rule module in
 * this repository that carries a test does the same thing.
 *
 * Prisma accepts a decimal string wherever it accepts a Decimal, so
 * `toDecimalString` is the one door out and no conversion is needed at the
 * query.
 *
 * Rates — a discount percentage, an instalment uplift — are `Decimal(7,4)`:
 * 12.5% is stored as `0.1250`. They are carried here as integer basis points
 * (12.5% = 1250) for the same reason, and converted at the edges.
 */

/** An amount of money, as a whole number of pesewas. 100 pesewas = GH₵1. */
export type Pesewas = number;

/** A rate, as whole basis points. 10000 = 100%, 500 = 5%, 1250 = 12.5%. */
export type BasisPoints = number;

/**
 * Anything that knows its own exact decimal value. `Prisma.Decimal` satisfies
 * this, and so does a plain string or number, which is the entire reason this
 * module does not need to import the client.
 */
export interface DecimalLike {
  toString(): string;
}

/** What may be read as money: a column, a form field, a literal, or nothing. */
export type MoneyInput = DecimalLike | number | string | null | undefined;

const PESEWAS_PER_CEDI = 100;
const BASIS_POINTS_PER_UNIT = 10_000;

// ---------------------------------------------------------------------------
// Crossing the boundary
// ---------------------------------------------------------------------------

/**
 * Parse a decimal string into integer units, scaled by `places`.
 *
 * Done on the digits rather than with `Number`, because `Number("84500.15") *
 * 100` is 8450014.999999999 — the exact failure this whole module exists to
 * avoid, reintroduced at the one point where the value is still exact. Here
 * the string is split at the point and reassembled, so nothing is ever
 * approximated; only a digit past `places` is rounded, half away from zero,
 * which is what the column does anyway.
 *
 * Returns null for anything that is not a decimal number, so each caller can
 * decide what absence means rather than having a zero handed to it silently.
 */
function parseScaled(raw: string, places: number): number | null {
  const text = raw.trim().replace(/[,\s_]/g, "");
  if (text === "") return null;

  const match = /^([+-]?)(\d*)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/.exec(text);
  if (!match) return null;

  const [, signText, intPart = "", fracPart = "", expText] = match;
  if (intPart === "" && fracPart === "") return null;

  const sign = signText === "-" ? -1 : 1;

  // Exponent notation turns up in a Decimal's own toString for very small or
  // very large values. Shifting the point is just moving digits between the
  // two halves, which stays exact.
  let digitsInt = intPart;
  let digitsFrac = fracPart;
  const exponent = expText ? Number(expText) : 0;
  if (exponent > 0) {
    const take = Math.min(exponent, digitsFrac.length);
    digitsInt += digitsFrac.slice(0, take) + "0".repeat(exponent - take);
    digitsFrac = digitsFrac.slice(take);
  } else if (exponent < 0) {
    const shift = -exponent;
    const take = Math.min(shift, digitsInt.length);
    digitsFrac =
      "0".repeat(shift - take) + digitsInt.slice(digitsInt.length - take) + digitsFrac;
    digitsInt = digitsInt.slice(0, digitsInt.length - take);
  }

  const kept = digitsFrac.slice(0, places).padEnd(places, "0");
  const scaled = Number(`${digitsInt || "0"}${kept}`);
  if (!Number.isFinite(scaled)) return null;

  // One digit past the scale decides the rounding; anything beyond it cannot
  // change the answer, because a 5 followed by more digits is still above half
  // and a 4 followed by anything is still below it.
  const next = digitsFrac.charCodeAt(places) - 48;
  const roundUp = next >= 5 && next <= 9;

  return sign * (scaled + (roundUp ? 1 : 0));
}

/**
 * A database `Decimal`, a form field, or a literal, as pesewas.
 *
 * Anything that is not a number — null from an optional column, an empty input,
 * the string a user left blank, a word — is zero, because every caller here
 * wants zero and none of them want to check first.
 */
export function toPesewas(value: MoneyInput): Pesewas {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return 0;
    return roundHalfAway(value * PESEWAS_PER_CEDI);
  }
  return parseScaled(String(value), 2) ?? 0;
}

/**
 * Pesewas back to the string the `Decimal(14,2)` column takes.
 *
 * A string rather than a number: Prisma accepts either for a Decimal field, and
 * a string cannot be rounded on its way through a float on a large figure.
 */
export function toDecimalString(pesewas: Pesewas): string {
  const n = Math.trunc(pesewas);
  const sign = n < 0 ? "-" : "";
  const body = String(Math.abs(n)).padStart(3, "0");
  return `${sign}${body.slice(0, -2)}.${body.slice(-2)}`;
}

/** Pesewas as a plain number of cedis, for a chart, an export or a total. */
export function toCedis(pesewas: Pesewas): number {
  return pesewas / PESEWAS_PER_CEDI;
}

/** A rate from the database (`0.1250`) as basis points (`1250`). */
export function toBasisPoints(value: MoneyInput): BasisPoints {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return 0;
    return roundHalfAway(value * BASIS_POINTS_PER_UNIT);
  }
  return parseScaled(String(value), 4) ?? 0;
}

/** Basis points back to the string the `Decimal(7,4)` column takes. */
export function basisPointsToDecimalString(bp: BasisPoints): string {
  const n = Math.trunc(bp);
  const sign = n < 0 ? "-" : "";
  const body = String(Math.abs(n)).padStart(5, "0");
  return `${sign}${body.slice(0, -4)}.${body.slice(-4)}`;
}

/**
 * A percentage as typed by an administrator ("12.5") as basis points.
 * The admin forms speak percent; everything below them speaks basis points.
 */
export function percentToBasisPoints(percent: number | string | null | undefined): BasisPoints {
  if (percent === null || percent === undefined) return 0;
  if (typeof percent === "number") {
    if (!Number.isFinite(percent)) return 0;
    return roundHalfAway(percent * 100);
  }
  return parseScaled(percent, 2) ?? 0;
}

/** Basis points as a percentage, for display: 1250 → 12.5. */
export function basisPointsToPercent(bp: BasisPoints): number {
  return bp / 100;
}

// ---------------------------------------------------------------------------
// Arithmetic
// ---------------------------------------------------------------------------

/**
 * Round half away from zero.
 *
 * Not `Math.round`, which rounds half *up* and therefore rounds −2.5 to −2
 * — so a refund line and the charge it reverses would not cancel. Not
 * banker's rounding either: a customer reading two identical lines rounded
 * differently has found a bug, whatever the statisticians say.
 */
export function roundHalfAway(n: number): number {
  return n < 0 ? -Math.round(-n) : Math.round(n);
}

/** `quantity × unitPrice`. Quantity is a whole number, so this is exact. */
export function lineAmount(quantity: number, unitPrice: Pesewas): Pesewas {
  return Math.trunc(quantity) * unitPrice;
}

/**
 * `amount × rate`, rounded to the pesewa.
 *
 * The single most-used operation here: a line discount, a document discount, a
 * tax line, an instalment uplift, a commission. One implementation, one
 * rounding rule, so the same inputs give the same answer wherever it is called.
 */
export function applyRate(amount: Pesewas, rate: BasisPoints): Pesewas {
  return roundHalfAway((amount * rate) / BASIS_POINTS_PER_UNIT);
}

/** Sum, with no intermediate rounding to go wrong. */
export function sum(amounts: readonly Pesewas[]): Pesewas {
  return amounts.reduce((total, n) => total + n, 0);
}

/** Never below zero — a discount larger than the line does not create credit. */
export function floorAtZero(amount: Pesewas): Pesewas {
  return amount < 0 ? 0 : amount;
}

/**
 * Split an amount into `parts` instalments that add back to exactly the amount.
 *
 * GH₵10,000 over 3 is 3,333.33 three times, which is 9,999.99 — and a schedule
 * that does not add up to the total is a schedule that leaves a customer owing
 * a pesewa forever, or being chased for one. The remainder is distributed one
 * pesewa at a time across the earliest instalments, so the shortfall is
 * collected first and the last payment is never the odd one out.
 *
 * Returns `parts` amounts whose sum is `amount`, for any amount and any parts.
 */
export function splitEvenly(amount: Pesewas, parts: number): Pesewas[] {
  const n = Math.trunc(parts);
  if (n <= 0) return [];
  if (n === 1) return [amount];

  const sign = amount < 0 ? -1 : 1;
  const magnitude = Math.abs(amount);
  const base = Math.floor(magnitude / n);
  const remainder = magnitude - base * n;

  return Array.from({ length: n }, (_, i) => sign * (base + (i < remainder ? 1 : 0)));
}

/**
 * Apportion an amount across weights so the parts add back to exactly the
 * amount — a purchase order's shipping and duty spread over its lines by value,
 * or a document discount spread back over the lines it came off.
 *
 * Largest-remainder: each part takes its exact share floored, then the pesewas
 * left over go to the parts with the largest fractional claim on them. The
 * obvious alternative — round each share and hope — drifts by a pesewa per part
 * and puts a landed cost into inventory that does not match what was paid.
 *
 * Weights that sum to zero split the amount evenly: it has to go somewhere, and
 * "nowhere" would silently lose it.
 */
export function apportion(amount: Pesewas, weights: readonly number[]): Pesewas[] {
  if (weights.length === 0) return [];
  const total = weights.reduce((t, w) => t + Math.max(0, w), 0);
  if (total <= 0) return splitEvenly(amount, weights.length);

  const sign = amount < 0 ? -1 : 1;
  const magnitude = Math.abs(amount);

  const exact = weights.map((w) => (magnitude * Math.max(0, w)) / total);
  const floored = exact.map(Math.floor);
  let left = magnitude - floored.reduce((t, n) => t + n, 0);

  const order = exact
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((a, b) => b.fraction - a.fraction);

  const out = [...floored];
  for (const { index } of order) {
    if (left <= 0) break;
    out[index] += 1;
    left -= 1;
  }

  return out.map((n) => sign * n);
}

// ---------------------------------------------------------------------------
// Display
// ---------------------------------------------------------------------------

/**
 * "GH₵1,250.00". Always two decimal places, because these figures appear in
 * columns and next to each other on a document, and a trailing digit that comes
 * and goes reads as an amount that changed. The sign leads the symbol —
 * "−GH₵30.00" and not "GH₵-30.00" — matching `src/lib/format.ts` on the retail
 * side, where the same decision is explained at length.
 */
export function formatPesewas(pesewas: Pesewas): string {
  const body = Math.abs(toCedis(pesewas)).toLocaleString("en-GH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${pesewas < 0 ? "−" : ""}GH₵${body}`;
}

/** The same, without the pesewas, for a chart axis or a headline figure. */
export function formatPesewasShort(pesewas: Pesewas): string {
  const body = Math.abs(toCedis(pesewas)).toLocaleString("en-GH", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
  return `${pesewas < 0 ? "−" : ""}GH₵${body}`;
}

/** "12.5%" — trailing zeros dropped, because "12.50%" reads as false precision. */
export function formatRate(bp: BasisPoints): string {
  return `${basisPointsToPercent(bp).toLocaleString("en-GH", { maximumFractionDigits: 2 })}%`;
}
