// Relative, with the extension: pulled in by a *.test.ts run through Node's
// type stripping, which resolves neither the "@/…" alias nor a missing
// extension.
import { randomInt } from "crypto";

/**
 * A password somebody has to read off a text message and type on a phone.
 *
 * Which rules out most of what makes a password strong on paper. It is going
 * to be read aloud, retyped, and sometimes written down, so every character
 * that can be misread is left out: no O or 0, no I, l or 1, no S against 5.
 * What is left is unambiguous in any font, at arm's length, on a cracked
 * screen.
 *
 * The strength comes from length and from how briefly it lives. Ten characters
 * from a 30-symbol alphabet is a shade under 50 bits — far beyond guessing
 * against a login — and the account it opens is made to replace it the moment
 * somebody signs in with it.
 */

/** No O/0, I/l/1, S/5, Z/2 — the pairs people get wrong reading a text. */
const ALPHABET = "ABCDEFGHJKMNPQRTUVWXY";
const DIGITS = "346789";

/**
 * Two groups of four and a pair of digits: "KTVR-MPQX-47".
 *
 * Grouped because a run of ten characters is where people lose their place,
 * and the hyphens are typed, not decorative — they are part of the password,
 * so what is read out is exactly what is entered.
 */
export function temporaryPassword(pick: (max: number) => number = randomInt): string {
  const take = (from: string, n: number) =>
    Array.from({ length: n }, () => from[pick(from.length)]).join("");
  return `${take(ALPHABET, 4)}-${take(ALPHABET, 4)}-${take(DIGITS, 2)}`;
}

/** The alphabets, exposed so a test can prove nothing ambiguous crept back in. */
export const TEMP_PASSWORD_ALPHABETS = { letters: ALPHABET, digits: DIGITS };
