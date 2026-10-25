# Going live

A runbook for putting Nickimart Medical in front of customers. Written to be
followed in order; each step says what it does and how to tell it worked.

**You do not need the code on your machine.** Every step is a page in a browser:
the hosting dashboard, the database provider's own console, and a GitHub Actions
workflow for the two one-off tasks that used to need a terminal. Where a command
is shown, it is there so you can see what the button runs — not because you have
to type it.

Everything here is the medical business. Retail and the bundle platform are
already live and nothing in these steps changes them — the one step that
touches shared routing is step 8, and it does nothing until a variable is set.

---

## What you are deploying

One Next.js application, three businesses, three Postgres databases:

| Business | Database variable | Served at |
|---|---|---|
| Retail (the mall) | `DATABASE_URL` | the main domain |
| Data bundles | `DATA_DATABASE_URL` (falls back to retail) | `/data-bundles` |
| **Medical** | `MEDICAL_DATABASE_URL` (**no fallback**) | `/medicals`, and optionally its own hostname |

The medical variable has no fallback on purpose. Its tables have never lived in
the retail database and must not be created there, so an environment without
that variable simply has no medical application: `/medicals` renders an
unconfigured state, the migrations skip, and nothing else notices. That is also
your safety net — a deploy that forgets the variable does not damage anything,
it just leaves medical switched off.

---

## 1. Create the medical database

Any hosted Postgres (Neon, Supabase, Railway, Vercel Postgres). It must be
**its own database**, not a schema inside the retail one.

Keep the connection string. It looks like:

```
postgresql://USER:PASSWORD@HOST:5432/DATABASE?sslmode=require
```

**Check:** the provider's own dashboard shows the database as available. Most
(Neon, Supabase) have a SQL editor in the browser — `select 1` there is the
whole test. Step 4 checks it properly from GitHub.

---

## 2. Set the environment variables

In the hosting project's settings, for the **production** environment.

Required for medical to work at all:

```
MEDICAL_DATABASE_URL=postgresql://…        # from step 1
```

Required for the application generally — these are almost certainly set already,
since retail is live:

```
DATABASE_URL=postgresql://…
AUTH_SECRET=…                               # npx auth secret
AUTH_TRUST_HOST=true
NEXT_PUBLIC_SITE_URL=https://your-domain    # no trailing slash
```

Optional, and each does nothing until set:

```
MEDICAL_PAYSTACK_SECRET_KEY=sk_live_…       # falls back to the retail key
MEDICAL_PAYSTACK_PUBLIC_KEY=pk_live_…
MEDICAL_HOST=medicals.nickimart.com         # step 7 — leave unset for now
```

> **On Paystack:** leave the medical keys unset to start. Medical payments then
> settle into the retail account, which works from day one, and splitting later
> is one variable and no code. Set them when you want medical money arriving in
> its own payout.

**Check:** nothing yet — the next step is what proves these.

---

## 3. Deploy

Push the branch and deploy as normal. The build is:

```
prisma generate (×3)  →  node scripts/migrate.mjs  →  next build
```

**The migrations run during the build.** That is worth knowing twice, because it
has two consequences:

- The build needs network access to all three databases. A build that cannot
  reach one fails rather than shipping code against a schema that is not there.
- You do not run migrations by hand. `db/medical-migrations/*.sql` are applied
  in filename order, each recorded in a `_NikiMigration` table inside the
  medical database, each wrapped in an advisory lock so two simultaneous deploys
  cannot both apply them.

All three medical migrations are additive and re-runnable: no `DROP`, no
`ALTER COLUMN`, no `TRUNCATE`. Re-running one changes nothing.

**Check:** the build log contains lines like

```
[migrate] medical: applying 0001_medical_init.sql
[migrate] medical: applying 0002_tenders_and_procurement.sql
[migrate] medical: applying 0003_quote_costs_and_order_link.sql
```

If it says `medical: no database URL — skipping`, step 2 did not take.

---

## 4. Give GitHub the two database secrets

The one-off tasks run as a GitHub Actions workflow, so GitHub needs to be able
to reach the databases. In the repository: **Settings → Secrets and variables →
Actions → New repository secret**.

| Secret | Value |
|---|---|
| `MEDICAL_DATABASE_URL` | the string from step 1 |
| `NIKIMART_DATABASE_URL` | the retail database — **probably already there** |

The retail one is needed because step 6 promotes an account that lives in the
retail database. Neither is ever printed in a log.

**Check:** **Actions → "Nickimart Medical setup" → Run workflow → status**. It
reports which migrations are applied, whether it has been seeded, and whether
anybody can sign in. It changes nothing, so run it as often as you like.

If it fails, the report names which of two things is wrong, because they are
fixed differently:

| It says | What to do |
|---|---|
| `relation "_NikiMigration" does not exist` | The schema is not applied **yet**. It is applied by the build, not by this workflow — wait for the deploy in step 3 to finish, confirm `[migrate] medical: applied` in its build log, then run `status` again. Running this before the first successful deploy always fails this way. |
| `Can't reach database server at …` | The secret is wrong, or the database is asleep. Check `MEDICAL_DATABASE_URL` in step 4; a Neon database that has been idle can take a moment to wake, so try once more first. |
| `Database \`…\` does not exist` | The host is right and the database name at the end of the URL is not. |
| `Authentication failed` | Copy the connection string from the provider again, including `?sslmode=require`. |

---

## 5. Seed the medical catalogue

**Actions → "Nickimart Medical setup" → Run workflow → seed.**

Seeding is a one-off, which is why it is not part of the build. It creates the
departments, a starter catalogue, expense groups and the settings rows, and is
safe to re-run: existing rows are left alone, so a setting somebody has changed
is not undone.

It creates **no** orders, customers or sales history. A dashboard that opens on
invented figures is one nobody can trust afterwards.

Under the bonnet the workflow runs `npm run medical:seed`, and prints the status
report before and after so you can see what changed.

**Check:** the run's log ends with non-zero `products` and `settings` counts.

---

## 6. Make yourself a medical administrator

There is a chicken-and-egg here and this step is the answer to it: the console's
Staff screen can only be opened by an administrator, so the first one has to be
made from outside.

**First, register at the live site like any customer.** Identity is one Nickimart
account across all three businesses, and this step grants a role to an account
that already exists — it cannot create a login and cannot set a password.

Then **Actions → "Nickimart Medical setup" → Run workflow → grant-admin**, and
put that email address in the **email** field.

**Check:** the log reads `… is now a medical administrator.` and
`Active administrators: 1`. Sign in at `/login` and open `/medicals/admin` —
you should see eighteen sections in the sidebar.

Everybody else is granted access from **Staff** inside the console, so this
should only ever be needed once. The console refuses to remove its last
administrator, so you cannot lock yourself out from inside.

---

## 7. Settle the two decisions that are deliberately switched off

Open **Settings** in the console. Two switches under Finance are off and the
screen says why:

- **Tax.** No VAT/NHIL/GETFund treatment is implemented, because the three
  cannot be expressed as one rate and guessing would put a wrong figure on a
  customer's document. Nothing assumes a rate anywhere in the code.
- **Instalments.** Off pending the consumer-credit position under the Borrowers
  and Lenders Act 2020. The schema and the pricing both support them.

Read `docs/medical/REGULATORY.md` before turning either on. Turning them on
changes what customers are shown and charged.

While you are in Settings, set the business name, email, phone and address —
they print on every quotation and proforma invoice.

---

## 8. Point the subdomain (optional)

The medical site is always reachable at `/medicals`. This step additionally
serves it at `medicals.nickimart.com`.

1. Add `medicals.nickimart.com` as a domain on the **same** deployment.
2. Point the DNS record as the host instructs, and wait for the certificate.
3. Confirm `https://medicals.nickimart.com/medicals` loads the medical home
   page. It will, because it is the same deployment.
4. **Now** set the variable and redeploy:

   ```
   MEDICAL_HOST=medicals.nickimart.com
   ```

Afterwards `https://medicals.nickimart.com/` serves the medical home page and
`/categories`, `/cart` and `/admin` on that host are the medical ones.

Three things are deliberately **not** rewritten on that host, because they are
shared: `/api/*` (sign-in, the Paystack webhook, uploads), `/_next/*` (the
build's assets), and any URL containing a dot (which is how `/logo.png` and
`/favicon.ico` keep working). The retail domain is completely unaffected either
way — with the variable unset no rewrite exists at all.

**Check:** on the medical host, `/` is the medical home page and `/logo.png`
still returns the image. On the retail domain, `/` is still the mall.

---

## 9. Paystack webhook

In the Paystack dashboard for whichever account medical settles into, set the
webhook URL to:

```
https://your-domain/api/paystack/webhook
```

One endpoint serves all three businesses. It works out which account signed each
event and refuses one account's signature over another's orders.

**Check:** take a real low-value payment and confirm the order moves to paid
without anybody touching it.

---

## 10. Smoke test, in the order a real sale happens

Worth doing once on the live site, because it is the chain nothing else proves
end to end:

1. **Products** — the catalogue is there, prices are right, cost is visible to
   you and will not be to sales.
2. **Institutions** — add the first hospital or laboratory.
3. **Quotation requests** — submit one from the storefront as a customer would,
   then take it in the console.
4. **Quotations** — draft from the request, price the lines, issue it. Confirm
   it goes read-only, and that issuing with an unpriced line is refused.
5. **Accept and convert** — the quotation becomes a sales order and stock is
   reserved, not deducted.
6. **Sourcing** — if the shelf cannot cover it, raise a sourcing request, invite
   a supplier to quote, and confirm the landed-cost comparison ranks on total
   acquisition cost rather than unit price.
7. **Purchase order → goods receipt** — raise a draft, approve it, record a
   delivery. Only accepted quantities enter stock, at landed cost.
8. **Dispatch → delivery → payment** — three separate records. Revenue is
   recognised on delivery and nowhere earlier.
9. **Audit log** — every step you just took is in it, with your name.

There is also `npm run medical:check`, which runs this whole chain against a
database and makes 51 assertions. It is **not** in the setup workflow and not
something to run from a browser, because it writes test data — tenders, orders,
payments. It belongs against a scratch database from a machine that has the
code, or not at all. The nine steps above are the live test.

---

## Where each task lives

Nothing here needs a terminal on your machine.

| Task | Where |
|---|---|
| Create the database | the database provider's dashboard |
| Environment variables | the hosting dashboard |
| Deploy, and apply migrations | push to the branch; the build does it |
| Seed, grant an administrator, check status | GitHub → Actions → "Nickimart Medical setup" |
| Business settings, staff, everything daily | the console itself, at `/medicals/admin` |
| Ad-hoc SQL, if you ever need it | the database provider's SQL editor |

The only thing deliberately left out of the browser is `medical:check`: it
writes test data and must never touch production.

---

## If something goes wrong

**A migration fails during the build.** Nothing shipped — the build stopped
before `next build`, so the running deployment is untouched. Read the error, fix
the SQL, deploy again. The migrations are re-runnable, so a partial apply is
safe to repeat.

**Medical shows "not configured".** `MEDICAL_DATABASE_URL` is unset or
unreachable in that environment. Retail and bundles are unaffected.

**You cannot get into the console.** Re-run step 6 (grant-admin). It is safe to
re-run and reactivates a suspended account.

**You need to undo a deploy.** Roll back to the previous deployment in the
host's dashboard. The medical migrations are additive, so an older build runs
happily against the newer schema — the columns it does not know about simply go
unread.

---

## What is not built

Said here so it is not discovered later:

- **Customer-facing quotation acceptance.** The console records a customer's
  answer on their behalf. The page a customer would follow to accept it
  themselves is not built, though the token it needs is on the record.
- **PDF rendering.** Quotations and proformas are read in the console.
  `pdfUrl` is on the model and nothing writes it yet.
- **Point of sale.** No counter screen; the schema supports the channel.
- **Instalment schedules.** Computed by the pricing module, switched off.
