import { test } from "node:test";
import assert from "node:assert/strict";
import { callbackOrigin } from "./site.ts";

/**
 * Where Paystack sends the payer back.
 *
 * Getting this wrong is expensive in the worst way: the money has already left
 * the customer's wallet, and the only thing left to get right is showing them
 * what they bought. It has failed twice — once by trusting a request header,
 * once by handing back a Vercel deployment URL that sits behind Vercel's own
 * login page. Both are pinned here.
 */

const KEYS = ["NEXT_PUBLIC_SITE_URL", "VERCEL_PROJECT_PRODUCTION_URL", "VERCEL_URL", "VERCEL", "PORT"];

function withEnv(env: Record<string, string | undefined>, run: () => void) {
  const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  for (const k of KEYS) delete process.env[k];
  Object.assign(process.env, env);
  try {
    run();
  } finally {
    for (const k of KEYS) delete process.env[k];
    for (const [k, v] of Object.entries(saved)) if (v !== undefined) process.env[k] = v;
  }
}

test("an explicitly configured domain wins", () => {
  withEnv({ NEXT_PUBLIC_SITE_URL: "https://www.4ubundles.store" }, () => {
    assert.equal(callbackOrigin(), "https://www.4ubundles.store");
  });
  withEnv({ NEXT_PUBLIC_SITE_URL: "https://nikimart.gh/" }, () => {
    assert.equal(callbackOrigin(), "https://nikimart.gh");
  });
});

test("otherwise the project's production domain", () => {
  withEnv({ VERCEL: "1", VERCEL_PROJECT_PRODUCTION_URL: "nikimart.vercel.app" }, () => {
    assert.equal(callbackOrigin(), "https://nikimart.vercel.app");
  });
});

test("never the per-deployment URL, which is behind Vercel's login page", () => {
  // This is the regression: a buyer who had paid was returned to a
  // project-hash-team.vercel.app address and met "Log in to Vercel".
  withEnv({ VERCEL: "1", VERCEL_URL: "nikimart-o5mr2m65p-afrinickys-projects.vercel.app" }, () => {
    const origin = callbackOrigin();
    assert.ok(!origin.includes("o5mr2m65p"), `deployment URL leaked into ${origin}`);
    assert.equal(origin, "https://nikimart.vercel.app");
  });
  // Even alongside a production domain, the deployment URL must not win.
  withEnv(
    {
      VERCEL: "1",
      VERCEL_URL: "nikimart-o5mr2m65p-afrinickys-projects.vercel.app",
      VERCEL_PROJECT_PRODUCTION_URL: "nikimart.vercel.app",
    },
    () => assert.equal(callbackOrigin(), "https://nikimart.vercel.app"),
  );
});

test("localhost in development, where there is no deployment to ask", () => {
  withEnv({}, () => assert.equal(callbackOrigin(), "http://localhost:3000"));
  withEnv({ PORT: "3200" }, () => assert.equal(callbackOrigin(), "http://localhost:3200"));
});

test("the return address is never taken from a request header", () => {
  // Belt and braces: the function takes no arguments, so there is nothing a
  // request could inject even if a caller wanted to pass one.
  assert.equal(callbackOrigin.length, 0);
});
