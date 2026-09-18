import test from "node:test";
import assert from "node:assert/strict";
import { TEMP_PASSWORD_ALPHABETS, temporaryPassword } from "./temp-password.ts";

/**
 * The password an agent reads off a text message.
 *
 * Every character in it is one somebody has to recognise and retype, so the
 * things worth testing are the things that cost a support call: an O that was
 * a zero, an l that was a one, a password that is a different length each time.
 *
 * Run with: npm test
 */

test("it is grouped, fixed length, and typed exactly as it reads", () => {
  for (let i = 0; i < 200; i++) {
    assert.match(temporaryPassword(), /^[A-Z]{4}-[A-Z]{4}-\d{2}$/);
  }
});

test("nothing in it can be misread for something else", () => {
  const banned = ["O", "0", "I", "l", "1", "S", "5", "Z", "2"];
  const all = TEMP_PASSWORD_ALPHABETS.letters + TEMP_PASSWORD_ALPHABETS.digits;
  for (const c of banned) assert.equal(all.includes(c), false, `${c} is ambiguous`);
  for (let i = 0; i < 200; i++) {
    const password = temporaryPassword();
    for (const c of banned) assert.equal(password.includes(c), false);
  }
});

test("it is long enough to be worth nothing to a guesser", () => {
  // 10 characters, 8 of them from 21 symbols and 2 from 6: ~40 bits, against a
  // login that rate-limits. The real protection is that it dies at first use.
  const combinations =
    TEMP_PASSWORD_ALPHABETS.letters.length ** 8 * TEMP_PASSWORD_ALPHABETS.digits.length ** 2;
  assert.ok(combinations > 1e11, "too few combinations");
});

test("the randomness is the caller's, so it can be pinned down", () => {
  assert.equal(temporaryPassword(() => 0), "AAAA-AAAA-33");
});
