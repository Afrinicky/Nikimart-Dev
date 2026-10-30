import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ACCOUNT_UNAVAILABLE,
  WRONG_CODE,
  WRONG_CREDENTIALS,
  signInFailureMessage,
} from "./auth-failure.ts";

/**
 * One thrown error class, two completely different things to tell somebody.
 * Each Auth.js error type that the sign-in path can actually produce is named
 * here, because getting this wrong sends people to reset a working password
 * in the middle of a database outage.
 */

test("a rejected credential is the password, and says so", () => {
  assert.equal(signInFailureMessage("CredentialsSignin"), WRONG_CREDENTIALS);
});

test("the code step borrows the same rule with its own wording", () => {
  assert.equal(signInFailureMessage("CredentialsSignin", WRONG_CODE), WRONG_CODE);
});

test("an authorize callback that threw is an outage, not a bad password", () => {
  // What Auth.js wraps a Prisma timeout or a refused connection in.
  assert.equal(signInFailureMessage("CallbackRouteError"), ACCOUNT_UNAVAILABLE);
  assert.equal(signInFailureMessage("CallbackRouteError", WRONG_CODE), ACCOUNT_UNAVAILABLE);
});

test("anything else is an outage too, because it is not the person's doing", () => {
  for (const type of ["AdapterError", "JWTSessionError", "MissingSecret", "UnknownAction", ""]) {
    assert.equal(signInFailureMessage(type), ACCOUNT_UNAVAILABLE);
  }
});
