import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { DEFAULT_FORWARDER_CURRENCY, isFreightMode } from "@/lib/shipping";
import {
  clean,
  LIMITS,
  nonNegative,
  normaliseCode,
  normaliseCurrency,
  normaliseFrequency,
  validateForwarder,
  whole,
  type ForwarderInput,
} from "@/lib/forwarder-rules";

export type {
  ForwarderInput,
  GoodsClassInput,
  PointInput,
  RouteInput,
} from "@/lib/forwarder-rules";
export { validateForwarder } from "@/lib/forwarder-rules";

export type SaveResult = { ok: true; id: string } | { ok: false; error: string };

/**
 * Writing one forwarder's whole profile.
 *
 * Kept out of the server action so the rules can be read, and tested, without
 * an admin session in the way. The action is then what it should be: check who
 * is asking, hand the payload here, revalidate.
 *
 * Two things this module exists to get right, both learned the hard way:
 *
 * **Nothing is silently altered.** A short code typed as 28 characters used to
 * be stored as the first 24 — the field accepted what you typed and kept
 * something else, and the two only diverged where nobody was looking. Input
 * that is too long is now refused, by name, rather than trimmed.
 *
 * **Nothing is silently guessed at.** Every failure used to come back as "a
 * code may already be in use", whether or not a code was involved, because one
 * `catch` covered the entire transaction. A person cannot act on a guess. The
 * checks below run *before* the write and name the row that is wrong; anything
 * that still gets through is translated from the database's own answer.
 */

// ---------------------------------------------------------------------------
// Translating a failure into something a person can act on
// ---------------------------------------------------------------------------

/**
 * Which table a failed unique constraint belongs to, in words.
 *
 * Matched against whatever Prisma names in `meta.target` — the constraint on
 * some drivers, the column list on others — so a pattern that has to fire for
 * certain matches both.
 */
const CONSTRAINT_SUBJECTS: { match: RegExp; describe: (fields: string[]) => string }[] = [
  {
    match: /^FreightForwarder/,
    describe: () =>
      "Another forwarder already uses that short code. Codes have to be unique across the platform.",
  },
  {
    match: /^ArrivalPoint/,
    describe: () =>
      "One of the consolidation point codes is already used by another point — a forwarder's warehouse, or one of ours. Give it a code of its own.",
  },
  {
    match: /^ForwarderGoodsClass/,
    describe: () => "Two classes of goods have the same name. Rename one.",
  },
  {
    // Only reachable when the database still carries the old constraint, which
    // allowed one class per category. The rows written here are deduplicated
    // before they are sent, so nothing this code does can collide on its own.
    // Matched on the field list as well as the name: Postgres hands Prisma the
    // columns, not the index, so a name-only pattern would never fire. Anchored,
    // so the three-column constraint that replaced it does not match.
    match: /^(ForwarderCategoryMap|forwarderId,categoryId$)/,
    describe: () =>
      "This database still allows only one class per category — migration 0010 has not been applied to it. Nothing was saved. Deploy again, or run `npm run db:migrate:deploy` against it.",
  },
];

/**
 * What went wrong, in the words of somebody who has to fix it.
 *
 * A unique-constraint failure names the constraint, which names the table, and
 * the table says which part of the form the person was looking at. Anything
 * unrecognised is reported as itself rather than dressed up as a guess: a
 * message that is merely confusing beats one that is confidently wrong and
 * sends somebody to change a field that was never the problem.
 */
export function describeSaveFailure(error: unknown): string {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") {
      const target = error.meta?.target;
      const fields = Array.isArray(target) ? target.map(String) : [String(target ?? "")];
      const constraint = fields.join(",");
      for (const { match, describe } of CONSTRAINT_SUBJECTS) {
        if (match.test(constraint)) return describe(fields);
      }
      return `Something here has to be unique and is not: ${constraint}.`;
    }
    if (error.code === "P2003") {
      return "Something this forwarder points at no longer exists — most likely a pickup station that has been removed. Reload the page and try again.";
    }
    if (error.code === "P2025") {
      return "Part of this forwarder was changed or deleted while you were editing. Reload the page and re-apply your changes.";
    }
    return `The database refused the change (${error.code}).`;
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return "The change could not be saved.";
}

// ---------------------------------------------------------------------------
// The write
// ---------------------------------------------------------------------------

/**
 * Create or replace one forwarder's whole profile, in one transaction.
 *
 * `id` empty creates. Everything below the forwarder is reconciled by id: rows
 * the payload still names are updated, rows it does not are deleted. That is
 * the point of saving a whole profile — what is on the screen is what the
 * forwarder is.
 */
export async function writeForwarder(id: string, input: ForwarderInput): Promise<SaveResult> {
  const problem = validateForwarder(input);
  if (problem) return { ok: false, error: problem };

  const forwarderCode = normaliseCode(input.code);
  const classes = (input.classes ?? []).filter((c) => clean(c.name).length >= 2);
  const points = (input.points ?? []).filter(
    (p) => clean(p.name).length >= 2 && normaliseCode(p.code).length >= 2,
  );

  // Exactly one default class, or "everything else" is whichever row the
  // database happened to return first.
  const defaultKey = classes.find((c) => c.isDefault)?.key ?? classes[0].key;

  const base = {
    name: clean(input.name),
    code: forwarderCode,
    ghanaAddress: clean(input.ghanaAddress),
    contactName: clean(input.contactName),
    contactPhone: clean(input.contactPhone),
    contactEmail: clean(input.contactEmail),
    originCountry: clean(input.originCountry).toUpperCase().slice(0, 2),
    collectionAddress: clean(input.collectionAddress),
    collectionCity: clean(input.collectionCity),
    currency: normaliseCurrency(input.currency, DEFAULT_FORWARDER_CURRENCY),
    note: clean(input.note).slice(0, LIMITS.note),
    terms: clean(input.terms),
    isActive: input.isActive !== false,
  };

  // Checked before the transaction so the answer can name the other forwarder
  // rather than leaving somebody to guess which one took the code.
  try {
    const clash = await prisma.freightForwarder.findFirst({
      where: { code: forwarderCode, ...(id ? { NOT: { id } } : {}) },
      select: { name: true },
    });
    if (clash) {
      return {
        ok: false,
        error: `The code ${forwarderCode} already belongs to ${clash.name}. Give this one a different code.`,
      };
    }

    // The same question for the warehouses, which share one namespace with our
    // own consolidation points.
    for (const p of points) {
      const pcode = normaliseCode(p.code);
      const owner = await prisma.arrivalPoint.findFirst({
        where: {
          code: pcode,
          ...(p.id ? { NOT: { id: p.id } } : {}),
          ...(id ? { forwarderId: { not: id } } : {}),
        },
        select: { name: true, forwarder: { select: { name: true } } },
      });
      if (owner) {
        const heldBy = owner.forwarder ? `${owner.forwarder.name}'s ` : "our ";
        return {
          ok: false,
          error: `The point code ${pcode} is already ${heldBy}“${owner.name}”. Give “${clean(p.name)}” a code of its own.`,
        };
      }
    }
  } catch (error) {
    return { ok: false, error: describeSaveFailure(error) };
  }

  try {
    const savedId = await prisma.$transaction(
      async (tx) => {
        const forwarder = id
          ? await tx.freightForwarder.update({ where: { id }, data: base })
          : await tx.freightForwarder.create({ data: base });
        const fid = forwarder.id;

        // --- Classes: the rows ------------------------------------------------
        const classIdByKey = new Map<string, string>();
        const keptClassIds: string[] = [];
        let sortOrder = 0;
        for (const c of classes) {
          const data = {
            name: clean(c.name),
            note: clean(c.note).slice(0, LIMITS.note),
            // Retired columns, overwritten on every save so the old
            // extra-cubic-metres levies cannot come back to life.
            levyCbm: 0,
            levyLabel: "",
            sortOrder: sortOrder++,
            isDefault: c.key === defaultKey,
          };
          const existing = c.id
            ? await tx.forwarderGoodsClass.findFirst({
                where: { id: c.id, forwarderId: fid },
                select: { id: true },
              })
            : null;
          const saved = existing
            ? await tx.forwarderGoodsClass.update({ where: { id: existing.id }, data })
            : await tx.forwarderGoodsClass.create({ data: { forwarderId: fid, ...data } });
          classIdByKey.set(c.key, saved.id);
          keptClassIds.push(saved.id);
        }
        await tx.forwarderGoodsClass.deleteMany({
          where: { forwarderId: fid, id: { notIn: keptClassIds } },
        });

        // --- Points, their lanes, and the grid --------------------------------
        //
        // Points the payload no longer names go first. A renamed code on one
        // point and a removed point that held the old code are the same save,
        // and doing the removals last would collide with a code the database
        // is about to free.
        const namedPointIds = points.map((p) => clean(p.id)).filter(Boolean);
        await tx.arrivalPoint.deleteMany({
          where: { forwarderId: fid, id: { notIn: namedPointIds } },
        });

        const keptPointIds: string[] = [];
        const keptRouteIds: string[] = [];
        let defaultRouteTaken = false;

        for (const p of points) {
          const pointData = {
            name: clean(p.name),
            code: normaliseCode(p.code),
            city: clean(p.city).slice(0, LIMITS.city),
            address: clean(p.address).slice(0, LIMITS.address),
            note: clean(p.note).slice(0, LIMITS.note),
            kind: "international",
            hubPickupId: clean(p.hubPickupId) || null,
            isActive: p.isActive !== false,
          };
          const existingPoint = p.id
            ? await tx.arrivalPoint.findFirst({
                where: { id: p.id, forwarderId: fid },
                select: { id: true },
              })
            : null;
          const point = existingPoint
            ? await tx.arrivalPoint.update({ where: { id: existingPoint.id }, data: pointData })
            : await tx.arrivalPoint.create({ data: { forwarderId: fid, ...pointData } });
          keptPointIds.push(point.id);

          for (const r of p.routes ?? []) {
            if (!isFreightMode(r.mode)) continue;
            const minDays = whole(r.minDays);
            const isDefault = Boolean(r.isDefault) && !defaultRouteTaken;
            if (isDefault) defaultRouteTaken = true;

            const routeData = {
              name: clean(r.name).slice(0, LIMITS.label),
              mode: r.mode,
              destinationPointId: point.id,
              currency: normaliseCurrency(r.currency, base.currency),
              minDays,
              // A window that runs backwards would read as "45–35 days".
              maxDays: Math.max(minDays, whole(r.maxDays)),
              minCbm: nonNegative(r.minCbm),
              orderFrequency: normaliseFrequency(r.orderFrequency),
              orderFrequencyDetail: clean(r.orderFrequencyDetail).slice(0, LIMITS.detail),
              note: clean(r.note).slice(0, LIMITS.note),
              isActive: r.isActive !== false,
              isDefault,
            };
            const existingRoute = r.id
              ? await tx.forwarderRoute.findFirst({
                  where: { id: r.id, forwarderId: fid },
                  select: { id: true },
                })
              : null;
            const route = existingRoute
              ? await tx.forwarderRoute.update({ where: { id: existingRoute.id }, data: routeData })
              : await tx.forwarderRoute.create({ data: { forwarderId: fid, ...routeData } });
            keptRouteIds.push(route.id);

            // The column of the grid. A null cell is stored as "not available"
            // rather than dropped, so the listing form can say why a
            // combination is refused instead of falling through to somebody
            // else's price.
            await tx.forwarderRouteRate.deleteMany({ where: { routeId: route.id } });
            const cells = Object.entries(r.rates ?? {})
              .map(([classKey, value]) => {
                const goodsClassId = classIdByKey.get(classKey);
                if (!goodsClassId) return null;
                const available = value !== null && value !== undefined && nonNegative(value) > 0;
                return {
                  routeId: route.id,
                  goodsClassId,
                  ratePerCbm: available ? nonNegative(value) : 0,
                  isAvailable: available,
                  note: "",
                };
              })
              .filter((c): c is NonNullable<typeof c> => c !== null);
            if (cells.length > 0) await tx.forwarderRouteRate.createMany({ data: cells });
          }
        }

        await tx.forwarderRoute.deleteMany({
          where: { forwarderId: fid, id: { notIn: keptRouteIds } },
        });
        // A point created in this pass is not in `namedPointIds`, so the sweep
        // above could not have covered it. This is the one that catches a point
        // whose id the payload invented.
        await tx.arrivalPoint.deleteMany({
          where: { forwarderId: fid, id: { notIn: keptPointIds } },
        });

        // If nothing was marked as the default lane, the first live one is it.
        if (!defaultRouteTaken && keptRouteIds.length > 0) {
          await tx.forwarderRoute.update({
            where: { id: keptRouteIds[0] },
            data: { isDefault: true },
          });
        }

        // --- Our categories, placed in their classes --------------------------
        await tx.forwarderCategoryMap.deleteMany({ where: { forwarderId: fid } });
        // One row per class the category falls into. A category in both
        // "Normal goods" and "Appliances" is two rows, and the lane charges
        // both rates.
        const mappings = Object.entries(input.categoryMap ?? {}).flatMap(
          ([categoryId, classKeys]) => {
            const keys = Array.isArray(classKeys) ? classKeys : [classKeys];
            const ids = new Set(
              keys
                .map((k) => classIdByKey.get(String(k)))
                .filter((v): v is string => Boolean(v)),
            );
            return [...ids].map((goodsClassId) => ({ forwarderId: fid, categoryId, goodsClassId }));
          },
        );
        // No `skipDuplicates`. The rows are already unique — one per class per
        // category, deduplicated above — so the flag could never skip a real
        // duplicate, and all it did was turn a database that still enforces the
        // old one-class-per-category rule into silent data loss: two ticks went
        // in, one row came back, and the save reported success. A save that
        // cannot store what is on the screen has to say so.
        if (mappings.length > 0) {
          await tx.forwarderCategoryMap.createMany({ data: mappings });
        }

        return fid;
      },
      // A wide grid is a lot of small writes in one go. The default five
      // seconds is enough for a two-column sheet and not for a real one.
      { maxWait: 10_000, timeout: 60_000 },
    );

    return { ok: true, id: savedId };
  } catch (error) {
    return { ok: false, error: describeSaveFailure(error) };
  }
}

/**
 * Delete a forwarder outright, and say so when it cannot be done.
 *
 * Everything that belongs to them is cleared here by hand rather than left to
 * the database's cascades. The cascades are declared and they do work — but a
 * schema built up over several additive migrations can end up with a foreign
 * key that was created once without `ON DELETE CASCADE` and then skipped on
 * every later run by the `duplicate_object` guard. When that happens the delete
 * raises a constraint violation, and the old code swallowed it: the button went
 * grey for a moment, the row stayed exactly where it was, and nothing anywhere
 * said why. Doing the work explicitly makes the outcome the same on every
 * database, however its constraints were assembled.
 *
 * What survives: listings, order lines and purchases keep their own records and
 * are left pointing at nothing. That is the honest outcome — the forwarder is
 * gone — and the listing form then asks the seller to choose another.
 */
export async function removeForwarder(id: string): Promise<SaveResult> {
  try {
    await prisma.$transaction(
      async (tx) => {
        const points = await tx.arrivalPoint.findMany({
          where: { forwarderId: id },
          select: { id: true },
        });
        const pointIds = points.map((p) => p.id);
        const routes = await tx.forwarderRoute.findMany({
          where: { forwarderId: id },
          select: { id: true },
        });
        const routeIds = routes.map((r) => r.id);

        // Records that outlive the forwarder let go of it first.
        await tx.product.updateMany({
          where: { forwarderId: id },
          data: { forwarderId: null, forwarderRouteId: null },
        });
        if (routeIds.length > 0) {
          await tx.product.updateMany({
            where: { forwarderRouteId: { in: routeIds } },
            data: { forwarderRouteId: null },
          });
          await tx.orderItem.updateMany({
            where: { freightRouteId: { in: routeIds } },
            data: { freightRouteId: null },
          });
        }
        if (pointIds.length > 0) {
          await tx.product.updateMany({
            where: { arrivalPointId: { in: pointIds } },
            data: { arrivalPointId: null },
          });
          await tx.orderItem.updateMany({
            where: { arrivalPointId: { in: pointIds } },
            data: { arrivalPointId: null },
          });
          await tx.orderItem.updateMany({
            where: { consolidationPointId: { in: pointIds } },
            data: { consolidationPointId: null },
          });
          await tx.shipment.updateMany({
            where: { arrivalPointId: { in: pointIds } },
            data: { arrivalPointId: null },
          });
          await tx.vendor.updateMany({
            where: { consolidationPointId: { in: pointIds } },
            data: { consolidationPointId: null },
          });
          // Domestic rules priced out of a warehouse that no longer exists.
          await tx.shippingRule.deleteMany({ where: { originPointId: { in: pointIds } } });
        }
        await tx.purchaseOrder.updateMany({
          where: { forwarderId: id },
          data: { forwarderId: null, routeId: null },
        });
        if (routeIds.length > 0) {
          await tx.purchaseOrder.updateMany({
            where: { routeId: { in: routeIds } },
            data: { routeId: null },
          });
        }

        // Then the forwarder's own rows, innermost first.
        if (routeIds.length > 0) {
          await tx.forwarderRouteRate.deleteMany({ where: { routeId: { in: routeIds } } });
        }
        await tx.forwarderRoute.deleteMany({ where: { forwarderId: id } });
        await tx.forwarderCategoryMap.deleteMany({ where: { forwarderId: id } });
        await tx.forwarderGoodsClass.deleteMany({ where: { forwarderId: id } });
        await tx.arrivalPoint.deleteMany({ where: { forwarderId: id } });
        await tx.freightForwarder.deleteMany({ where: { id } });
      },
      { maxWait: 10_000, timeout: 60_000 },
    );
    return { ok: true, id };
  } catch (error) {
    return { ok: false, error: describeSaveFailure(error) };
  }
}
