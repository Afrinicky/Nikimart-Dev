"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, Globe2, Layers, MapPin, Plus, Table2, Tags, Trash2 } from "lucide-react";
import { Field, inputClass } from "@/components/ui/Field";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { FOREIGN_COUNTRIES } from "@/lib/countries";
import {
  FREIGHT_MODES,
  FREIGHT_MODE_LABELS,
  ORDER_FREQUENCIES,
  ORDER_FREQUENCY_LABELS,
  type Forwarder,
  type FreightMode,
} from "@/lib/shipping";
import { saveForwarder, type ForwarderState } from "@/lib/forwarder-actions";
import { FormFeedback } from "@/components/ui/FormFeedback";

/**
 * Registering a freight forwarder: one window, everything.
 *
 * A forwarder is a company with a rate sheet, and their sheet has a shape. Down
 * the side are their own classes of goods — Normal, Special, Heavy-Duty — which
 * are never our categories. Across the top are the modes they run into one
 * particular warehouse of theirs in Ghana. Each cell is a price per cubic metre,
 * and the ones they will not carry are left blank.
 *
 * So the form is that grid, one per warehouse, with rows and columns an admin
 * adds as they go. Nothing is saved until the whole thing is, which is what
 * lets a grid be filled in before any of it exists in the database.
 *
 * Two numbers here decide more than they look like they do. The **minimum CBM**
 * is the smallest consignment a lane accepts — it is what the order-placement
 * queue waits for before anything is bought. The **order frequency** is when
 * purchases are actually placed on that lane. Neither is ever shown to a buyer.
 */

type Rates = Record<string, number | null>;

interface RouteDraft {
  key: string;
  id?: string;
  name: string;
  mode: string;
  currency: string;
  minDays: number;
  maxDays: number;
  minCbm: number;
  orderFrequency: string;
  orderFrequencyDetail: string;
  isDefault: boolean;
  rates: Rates;
}

interface PointDraft {
  key: string;
  id?: string;
  name: string;
  code: string;
  city: string;
  address: string;
  hubPickupId: string;
  routes: RouteDraft[];
}

interface ClassDraft {
  key: string;
  id?: string;
  name: string;
  isDefault: boolean;
}

let counter = 0;
const nextKey = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${counter++}`;

function newClass(): ClassDraft {
  return { key: nextKey("c"), name: "", isDefault: false };
}

function newRoute(currency: string, classes: ClassDraft[]): RouteDraft {
  return {
    key: nextKey("r"),
    name: "",
    mode: FREIGHT_MODES[0],
    currency,
    minDays: 0,
    maxDays: 0,
    minCbm: 0,
    orderFrequency: "",
    orderFrequencyDetail: "",
    isDefault: false,
    rates: Object.fromEntries(classes.map((c) => [c.key, null])),
  };
}

function newPoint(currency: string, classes: ClassDraft[]): PointDraft {
  return {
    key: nextKey("p"),
    name: "",
    code: "",
    city: "",
    address: "",
    hubPickupId: "",
    routes: [newRoute(currency, classes)],
  };
}

/** Read an existing forwarder into the drafts the form edits. */
function toDrafts(f: Forwarder | null, currency: string) {
  if (!f) {
    const classes = [{ ...newClass(), isDefault: true }];
    return { classes, points: [newPoint(currency, classes)] };
  }

  const classes: ClassDraft[] = f.goodsClasses.map((g) => ({
    key: g.id,
    id: g.id,
    name: g.name,
    isDefault: g.isDefault,
  }));
  if (classes.length === 0) classes.push({ ...newClass(), isDefault: true });

  const points: PointDraft[] = f.consolidations.map((p) => ({
    key: p.id,
    id: p.id,
    name: p.name,
    code: p.code,
    city: p.city,
    address: p.address,
    hubPickupId: p.pickupPointId ?? "",
    routes: f.routes
      .filter((r) => r.destinationPointId === p.id)
      .map((r) => ({
        key: r.id,
        id: r.id,
        name: r.name,
        mode: r.mode,
        currency: r.currency || currency,
        minDays: r.minDays,
        maxDays: r.maxDays,
        minCbm: r.minCbm,
        orderFrequency: r.orderFrequency,
        orderFrequencyDetail: r.orderFrequencyDetail,
        isDefault: r.isDefault,
        // A missing cell is N/A; an unavailable one is too.
        rates: Object.fromEntries(
          classes.map((c) => {
            const cell = r.rates.find((x) => x.goodsClassId === c.id);
            return [c.key, cell && cell.isAvailable && cell.ratePerCbm > 0 ? cell.ratePerCbm : null];
          }),
        ),
      })),
  }));
  if (points.length === 0) points.push(newPoint(currency, classes));
  for (const p of points) if (p.routes.length === 0) p.routes.push(newRoute(currency, classes));

  return { classes, points };
}

export function ForwarderRegistrationForm({
  forwarder,
  currencies,
  rateToGhs,
  pickupPoints,
  categories,
  submitLabel,
}: {
  forwarder: Forwarder | null;
  currencies: { code: string; name: string; symbol: string }[];
  /** Currency code → what one unit is worth in GH₵, kept current by the daily fetch. */
  rateToGhs: Record<string, number>;
  pickupPoints: { id: string; label: string }[];
  categories: { id: string; label: string }[];
  submitLabel: string;
}) {
  const router = useRouter();
  const action = saveForwarder.bind(null, forwarder?.id ?? "");
  const [state, formAction] = useActionState<ForwarderState, FormData>(action, {});

  const [name, setName] = useState(forwarder?.name ?? "");
  const [code, setCode] = useState(forwarder?.code ?? "");
  const [contactName, setContactName] = useState(forwarder?.contactName ?? "");
  const [contactPhone, setContactPhone] = useState(forwarder?.contactPhone ?? "");
  const [contactEmail, setContactEmail] = useState(forwarder?.contactEmail ?? "");
  const [ghanaAddress, setGhanaAddress] = useState(forwarder?.ghanaAddress ?? "");
  const [originCountry, setOriginCountry] = useState(forwarder?.originCountry ?? "");
  const [collectionCity, setCollectionCity] = useState(forwarder?.collectionCity ?? "");
  const [collectionAddress, setCollectionAddress] = useState(forwarder?.collectionAddress ?? "");
  const [currency, setCurrency] = useState(forwarder?.currency || "USD");
  const [terms, setTerms] = useState(forwarder?.terms ?? "");
  const [isActive, setIsActive] = useState(forwarder?.isActive ?? true);

  // Built once. `toDrafts` mints keys for new rows, so re-running it on every
  // render would hand the grid a different set of keys than its cells are
  // stored under.
  const [drafts] = useState(() => toDrafts(forwarder, forwarder?.currency || "USD"));
  const [classes, setClasses] = useState<ClassDraft[]>(drafts.classes);
  const [points, setPoints] = useState<PointDraft[]>(drafts.points);
  const [categoryMap, setCategoryMap] = useState<Record<string, string[]>>(() => {
    // An existing class's key is its id, so the stored mapping resolves; a
    // brand-new one has no mapping to resolve yet.
    const byId = new Map(drafts.classes.filter((c) => c.id).map((c) => [c.id!, c.key]));
    const out: Record<string, string[]> = {};
    for (const [categoryId, classIds] of Object.entries(forwarder?.categoryMap ?? {})) {
      const keys = classIds.map((id) => byId.get(id)).filter((k): k is string => Boolean(k));
      if (keys.length > 0) out[categoryId] = keys;
    }
    return out;
  });

  /** Put a category in one of their classes, or take it back out. */
  const toggleMapping = (categoryId: string, classKey: string) =>
    setCategoryMap((prev) => {
      const current = prev[categoryId] ?? [];
      const next = current.includes(classKey)
        ? current.filter((k) => k !== classKey)
        : [...current, classKey];
      const out = { ...prev };
      if (next.length > 0) out[categoryId] = next;
      else delete out[categoryId];
      return out;
    });

  // A new forwarder lands on their own page once it exists, so the grid the
  // admin just filled in comes back with real ids behind it.
  useEffect(() => {
    if (state.ok && state.id && !forwarder) router.replace(`/admin/shipping/forwarders/${state.id}`);
  }, [state.ok, state.id, forwarder, router]);

  // --- Rows -----------------------------------------------------------------
  const addClass = () => {
    const c = newClass();
    setClasses((prev) => [...prev, c]);
    setPoints((prev) =>
      prev.map((p) => ({
        ...p,
        routes: p.routes.map((r) => ({ ...r, rates: { ...r.rates, [c.key]: null } })),
      })),
    );
  };

  const removeClass = (key: string) => {
    setClasses((prev) => (prev.length <= 1 ? prev : prev.filter((c) => c.key !== key)));
    setPoints((prev) =>
      prev.map((p) => ({
        ...p,
        routes: p.routes.map((r) => {
          const rates = { ...r.rates };
          delete rates[key];
          return { ...r, rates };
        }),
      })),
    );
    setCategoryMap((prev) =>
      Object.fromEntries(
        Object.entries(prev)
          .map(([categoryId, keys]) => [categoryId, keys.filter((k) => k !== key)] as const)
          .filter(([, keys]) => keys.length > 0),
      ),
    );
  };

  const patchClass = (key: string, patch: Partial<ClassDraft>) =>
    setClasses((prev) =>
      prev.map((c) =>
        c.key === key
          ? { ...c, ...patch }
          : patch.isDefault
            ? { ...c, isDefault: false }
            : c,
      ),
    );

  // --- Points and columns ---------------------------------------------------
  const patchPoint = (key: string, patch: Partial<PointDraft>) =>
    setPoints((prev) => prev.map((p) => (p.key === key ? { ...p, ...patch } : p)));

  const patchRoute = (pointKey: string, routeKey: string, patch: Partial<RouteDraft>) =>
    setPoints((prev) =>
      prev.map((p) =>
        p.key !== pointKey
          ? patch.isDefault
            ? { ...p, routes: p.routes.map((r) => ({ ...r, isDefault: false })) }
            : p
          : {
              ...p,
              routes: p.routes.map((r) =>
                r.key === routeKey
                  ? { ...r, ...patch }
                  : patch.isDefault
                    ? { ...r, isDefault: false }
                    : r,
              ),
            },
      ),
    );

  const setCell = (pointKey: string, routeKey: string, classKey: string, value: number | null) =>
    setPoints((prev) =>
      prev.map((p) =>
        p.key === pointKey
          ? {
              ...p,
              routes: p.routes.map((r) =>
                r.key === routeKey ? { ...r, rates: { ...r.rates, [classKey]: value } } : r,
              ),
            }
          : p,
      ),
    );

  const payload = JSON.stringify({
    name,
    code,
    ghanaAddress,
    contactName,
    contactPhone,
    contactEmail,
    originCountry,
    collectionAddress,
    collectionCity,
    currency,
    terms,
    isActive,
    classes: classes.map((c) => ({
      key: c.key,
      id: c.id,
      name: c.name,
      isDefault: c.isDefault,
    })),
    points: points.map((p) => ({
      key: p.key,
      id: p.id,
      name: p.name,
      code: p.code,
      city: p.city,
      address: p.address,
      hubPickupId: p.hubPickupId || null,
      routes: p.routes.map((r) => ({
        key: r.key,
        id: r.id,
        name: r.name,
        mode: r.mode,
        currency: r.currency,
        minDays: r.minDays,
        maxDays: r.maxDays,
        minCbm: r.minCbm,
        orderFrequency: r.orderFrequency,
        orderFrequencyDetail: r.orderFrequencyDetail,
        isDefault: r.isDefault,
        rates: r.rates,
      })),
    })),
    categoryMap,
  });

  // The lane a category's rate is previewed against: the default one, else the
  // first that exists. A preview beside the ticks is the whole point of this
  // section — a levy typed into the wrong column shows up here, not on a bill.
  const allRoutes = points.flatMap((p) => p.routes);
  const previewRoute = allRoutes.find((r) => r.isDefault) ?? allRoutes[0] ?? null;

  /** What the ticked classes come to per m³ on that lane. Null when it won't carry them. */
  const previewRate = (categoryId: string): number | null => {
    if (!previewRoute) return null;
    const keys = categoryMap[categoryId] ?? [];
    const chosen = keys.length > 0 ? keys : classes.filter((c) => c.isDefault).map((c) => c.key);
    if (chosen.length === 0) return null;
    let total = 0;
    for (const key of chosen) {
      const cell = previewRoute.rates[key];
      if (cell === null || cell === undefined) return null; // N/A on this lane
      total += cell;
    }
    return total > 0 ? Math.round(total * 100) / 100 : null;
  };

  const symbol = currencies.find((c) => c.code === currency)?.symbol || currency;
  // What a typed rate comes to in cedis, at today's fetched exchange rate. The
  // admin types what the forwarder quoted and reads back what a buyer pays,
  // which is the only figure either of them can sanity-check.
  const fx = rateToGhs[currency] ?? 1;
  const inCedis = (amount: number) =>
    `GH₵${(Math.round(amount * fx * 100) / 100).toLocaleString("en-GH", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="payload" value={payload} />

      {/* --- Basic information ---------------------------------------------- */}
      <Section icon={Building2} title="Basic information" hint="Who they are, and where to reach them in Ghana.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Forwarder name" htmlFor="f-name">
            <input id="f-name" value={name} onChange={(e) => setName(e.target.value)} className={inputClass} required />
          </Field>
          <Field label="Short code" htmlFor="f-code" hint="Used on rate sheets and exports.">
            <input
              id="f-code"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              className={inputClass}
              required
            />
          </Field>
        </div>
        <Field label="Address in Ghana" htmlFor="f-address">
          <textarea
            id="f-address"
            rows={2}
            value={ghanaAddress}
            onChange={(e) => setGhanaAddress(e.target.value)}
            className={inputClass}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Contact person" htmlFor="f-contact">
            <input id="f-contact" value={contactName} onChange={(e) => setContactName(e.target.value)} className={inputClass} />
          </Field>
          <Field label="Phone" htmlFor="f-phone">
            <input id="f-phone" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} className={inputClass} />
          </Field>
          <Field label="Email" htmlFor="f-email">
            <input id="f-email" type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} className={inputClass} />
          </Field>
        </div>
      </Section>

      {/* --- Collection abroad ------------------------------------------------ */}
      <Section
        icon={Globe2}
        title="Collection abroad"
        hint="Where suppliers dispatch goods to before the consignment leaves for Ghana. Sellers are shown this address."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Country of collection" htmlFor="f-origin">
            <select
              id="f-origin"
              value={originCountry}
              onChange={(e) => setOriginCountry(e.target.value)}
              className={inputClass}
            >
              <option value="">Choose…</option>
              {FOREIGN_COUNTRIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.flag} {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="City" htmlFor="f-collection-city">
            <input
              id="f-collection-city"
              value={collectionCity}
              onChange={(e) => setCollectionCity(e.target.value)}
              className={inputClass}
            />
          </Field>
        </div>
        <Field label="Collection address" htmlFor="f-collection-address" hint="Their warehouse in the collection country.">
          <textarea
            id="f-collection-address"
            rows={2}
            value={collectionAddress}
            onChange={(e) => setCollectionAddress(e.target.value)}
            className={inputClass}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Currency they quote in"
            htmlFor="f-currency"
            hint={
              currency === "GHS"
                ? "Every rate below is typed in this currency."
                : `Every rate below is typed in ${currency} and converted at today's rate — 1 ${currency} = ${inCedis(1)}. Rates are fetched daily, so nothing here is retyped when the cedi moves.`
            }
          >
            <select id="f-currency" value={currency} onChange={(e) => setCurrency(e.target.value)} className={inputClass}>
              {currencies.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} — {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Status" htmlFor="f-active">
            <select
              id="f-active"
              value={isActive ? "1" : "0"}
              onChange={(e) => setIsActive(e.target.value === "1")}
              className={inputClass}
            >
              <option value="1">Active — sellers may list on them</option>
              <option value="0">Inactive</option>
            </select>
          </Field>
        </div>
      </Section>

      {/* --- Classes of goods ------------------------------------------------- */}
      <Section
        icon={Layers}
        title="Classes of goods"
        hint="Their own classes — the rows of every rate grid below. A special levy is a class too: give “All electrical appliances” its own row and its own rate, then place the categories it applies to in that class as well as their normal one. The rates add up."
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-niki-ink/50">
              <tr>
                <th className="pb-2 pr-3 font-semibold">Class</th>
                <th className="pb-2 pr-3 font-semibold">Default</th>
                <th className="pb-2" />
              </tr>
            </thead>
            <tbody>
              {classes.map((c) => (
                <tr key={c.key} className="align-top">
                  <td className="py-1.5 pr-3">
                    <input
                      value={c.name}
                      onChange={(e) => patchClass(c.key, { name: e.target.value })}
                      placeholder="Class name"
                      className={inputClass}
                    />
                  </td>
                  <td className="py-1.5 pr-3">
                    <input
                      type="radio"
                      name="defaultClass"
                      checked={c.isDefault}
                      onChange={() => patchClass(c.key, { isDefault: true })}
                      className="mt-3 h-4 w-4"
                    />
                  </td>
                  <td className="py-1.5">
                    <RemoveButton onClick={() => removeClass(c.key)} disabled={classes.length <= 1} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <AddButton onClick={addClass} label="Add class" />
      </Section>

      {/* --- Points, and a grid for each -------------------------------------- */}
      <Section
        icon={MapPin}
        title="Consolidation points in Ghana"
        hint="Each is this forwarder's own warehouse, and no other forwarder may use it. One grid per point: their modes across the top, their classes down the side, and a rate per cubic metre in each cell."
      >
        <div className="space-y-6">
          {points.map((p, index) => (
            <div key={p.key} className="rounded-2xl bg-niki-surface p-5 ring-1 ring-niki-edge">
              <div className="flex items-center justify-between gap-3">
                <h4 className="text-sm font-bold text-niki-ink">
                  Consolidation point {index + 1}
                </h4>
                <RemoveButton
                  onClick={() => setPoints((prev) => prev.filter((x) => x.key !== p.key))}
                  disabled={points.length <= 1}
                  label="Remove point"
                />
              </div>

              <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Field label="Point name" htmlFor={`p-name-${p.key}`}>
                  <input
                    id={`p-name-${p.key}`}
                    value={p.name}
                    onChange={(e) => patchPoint(p.key, { name: e.target.value })}
                    className={inputClass}
                  />
                </Field>
                <Field label="Code" htmlFor={`p-code-${p.key}`}>
                  <input
                    id={`p-code-${p.key}`}
                    value={p.code}
                    onChange={(e) => patchPoint(p.key, { code: e.target.value.toUpperCase() })}
                    className={inputClass}
                  />
                </Field>
                <Field label="City" htmlFor={`p-city-${p.key}`}>
                  <input
                    id={`p-city-${p.key}`}
                    value={p.city}
                    onChange={(e) => patchPoint(p.key, { city: e.target.value })}
                    className={inputClass}
                  />
                </Field>
                <Field
                  label="Sits at pickup station"
                  htmlFor={`p-hub-${p.key}`}
                  hint="Collection there is free."
                >
                  <select
                    id={`p-hub-${p.key}`}
                    value={p.hubPickupId}
                    onChange={(e) => patchPoint(p.key, { hubPickupId: e.target.value })}
                    className={inputClass}
                  >
                    <option value="">Not a pickup station</option>
                    {pickupPoints.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>

              <div className="mt-4">
                <Field label="Address" htmlFor={`p-address-${p.key}`}>
                  <input
                    id={`p-address-${p.key}`}
                    value={p.address}
                    onChange={(e) => patchPoint(p.key, { address: e.target.value })}
                    className={inputClass}
                  />
                </Field>
              </div>

              {/* The grid */}
              <div className="mt-5 overflow-x-auto rounded-xl bg-white ring-1 ring-niki-edge">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-niki-edge">
                      <th className="w-52 px-3 py-3 text-xs font-semibold uppercase tracking-wide text-niki-ink/50">
                        {originCountry || "Origin"} → {p.name || "this point"}
                      </th>
                      {p.routes.map((r) => (
                        <th key={r.key} className="min-w-[190px] px-3 py-3 align-top">
                          <div className="space-y-2">
                            <select
                              value={r.mode}
                              onChange={(e) => patchRoute(p.key, r.key, { mode: e.target.value })}
                              className={inputClass}
                              aria-label="Freight mode"
                            >
                              {FREIGHT_MODES.map((m) => (
                                <option key={m} value={m}>
                                  {FREIGHT_MODE_LABELS[m]}
                                </option>
                              ))}
                            </select>
                            <input
                              value={r.name}
                              onChange={(e) => patchRoute(p.key, r.key, { name: e.target.value })}
                              placeholder="Column label (optional)"
                              className={inputClass}
                            />
                            <div className="flex items-center justify-between gap-2">
                              <label className="flex items-center gap-1.5 text-xs font-medium text-niki-ink/70">
                                <input
                                  type="radio"
                                  name="defaultRoute"
                                  checked={r.isDefault}
                                  onChange={() => patchRoute(p.key, r.key, { isDefault: true })}
                                  className="h-3.5 w-3.5"
                                />
                                Default
                              </label>
                              <RemoveButton
                                onClick={() =>
                                  patchPoint(p.key, {
                                    routes: p.routes.filter((x) => x.key !== r.key),
                                  })
                                }
                                disabled={p.routes.length <= 1}
                              />
                            </div>
                          </div>
                        </th>
                      ))}
                      <th className="px-3 py-3 align-top">
                        <AddButton
                          onClick={() =>
                            patchPoint(p.key, { routes: [...p.routes, newRoute(currency, classes)] })
                          }
                          label="Add mode"
                        />
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-niki-edge">
                    <SettingRow label="Delivery estimate (days)">
                      {p.routes.map((r) => (
                        <td key={r.key} className="px-3 py-2">
                          <div className="flex items-center gap-1.5">
                            <input
                              type="number"
                              min={0}
                              value={r.minDays || ""}
                              onChange={(e) => patchRoute(p.key, r.key, { minDays: Number(e.target.value) || 0 })}
                              placeholder="from"
                              className={inputClass}
                              aria-label="Fewest days"
                            />
                            <span className="text-niki-ink/40">–</span>
                            <input
                              type="number"
                              min={0}
                              value={r.maxDays || ""}
                              onChange={(e) => patchRoute(p.key, r.key, { maxDays: Number(e.target.value) || 0 })}
                              placeholder="to"
                              className={inputClass}
                              aria-label="Most days"
                            />
                          </div>
                        </td>
                      ))}
                      <td />
                    </SettingRow>

                    <SettingRow label="Minimum CBM accepted">
                      {p.routes.map((r) => (
                        <td key={r.key} className="px-3 py-2">
                          <input
                            type="number"
                            min={0}
                            step="0.001"
                            value={r.minCbm || ""}
                            onChange={(e) => patchRoute(p.key, r.key, { minCbm: Number(e.target.value) || 0 })}
                            placeholder="0"
                            className={inputClass}
                            aria-label="Minimum CBM"
                          />
                        </td>
                      ))}
                      <td />
                    </SettingRow>

                    <SettingRow label="Order frequency">
                      {p.routes.map((r) => (
                        <td key={r.key} className="px-3 py-2">
                          <div className="space-y-1.5">
                            <select
                              value={r.orderFrequency}
                              onChange={(e) => patchRoute(p.key, r.key, { orderFrequency: e.target.value })}
                              className={inputClass}
                              aria-label="Order frequency"
                            >
                              <option value="">Not set</option>
                              {ORDER_FREQUENCIES.map((f) => (
                                <option key={f} value={f}>
                                  {ORDER_FREQUENCY_LABELS[f]}
                                </option>
                              ))}
                            </select>
                            {r.orderFrequency === "dates" ? (
                              <input
                                value={r.orderFrequencyDetail}
                                onChange={(e) =>
                                  patchRoute(p.key, r.key, { orderFrequencyDetail: e.target.value })
                                }
                                placeholder="Days of the month"
                                className={inputClass}
                                aria-label="Which dates"
                              />
                            ) : null}
                          </div>
                        </td>
                      ))}
                      <td />
                    </SettingRow>

                    {classes.map((c) => (
                      <tr key={c.key}>
                        <th className="px-3 py-2 text-left text-sm font-medium text-niki-ink">
                          {c.name || "Unnamed class"}
                        </th>
                        {p.routes.map((r) => (
                          <td key={r.key} className="px-3 py-2">
                            <div className="relative">
                              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-niki-ink/40">
                                {symbol}
                              </span>
                              <input
                                type="number"
                                min={0}
                                step="0.01"
                                value={r.rates[c.key] ?? ""}
                                onChange={(e) =>
                                  setCell(
                                    p.key,
                                    r.key,
                                    c.key,
                                    e.target.value === "" ? null : Number(e.target.value) || 0,
                                  )
                                }
                                placeholder="N/A"
                                className={`${inputClass} pl-8`}
                                aria-label={`${c.name || "class"} rate per CBM`}
                              />
                            </div>
                            {(r.rates[c.key] ?? 0) > 0 && currency !== "GHS" ? (
                              <span className="mt-1 block font-figures text-xs text-niki-ink/50">
                                = {inCedis(r.rates[c.key] as number)} / m³
                              </span>
                            ) : null}
                          </td>
                        ))}
                        <td />
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-xs text-niki-ink/50">
                A blank cell means this mode does not carry that class — sellers can&apos;t list it
                on this lane.
              </p>
            </div>
          ))}
        </div>
        <AddButton
          onClick={() => setPoints((prev) => [...prev, newPoint(currency, classes)])}
          label="Add consolidation point"
        />
      </Section>

      {/* --- Category mapping -------------------------------------------------- */}
      <Section
        icon={Tags}
        title="Our categories in their classes"
        hint="What a shopper browses is not what a container is priced by. Tick every class a category falls into — a fridge is a normal good and an appliance, and the forwarder charges for both, so the rates are added. A row left blank falls to their default class."
      >
        <div className="overflow-x-auto rounded-xl bg-white ring-1 ring-niki-edge">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-niki-edge text-xs uppercase tracking-wide text-niki-ink/50">
              <tr>
                <th className="px-3 py-3 font-semibold">Category</th>
                {classes.map((c) => (
                  <th key={c.key} className="px-3 py-3 font-semibold">
                    {c.name || "Unnamed"}
                  </th>
                ))}
                <th className="px-3 py-3 font-semibold">
                  Charged at
                  {previewRoute ? (
                    <span className="block font-normal normal-case tracking-normal text-niki-ink/40">
                      on {previewRoute.name.trim() || FREIGHT_MODE_LABELS[previewRoute.mode as FreightMode] || previewRoute.mode}
                    </span>
                  ) : null}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-niki-edge">
              {categories.map((cat) => (
                <tr key={cat.id}>
                  <th className="px-3 py-2 text-left text-sm font-medium text-niki-ink">
                    {cat.label}
                  </th>
                  {classes.map((c) => (
                    <td key={c.key} className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={(categoryMap[cat.id] ?? []).includes(c.key)}
                        onChange={() => toggleMapping(cat.id, c.key)}
                        className="h-4 w-4 rounded"
                        aria-label={`${cat.label} → ${c.name}`}
                      />
                    </td>
                  ))}
                  <td className="px-3 py-2 font-figures text-sm text-niki-ink/70">
                    {(() => {
                      const rate = previewRate(cat.id);
                      if (rate === null) return <span className="text-niki-ink/35">N/A</span>;
                      return (
                        <>
                          {symbol}
                          {rate} / m³
                          {currency !== "GHS" ? (
                            <span className="block text-xs text-niki-ink/45">{inCedis(rate)}</span>
                          ) : null}
                        </>
                      );
                    })()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      {/* --- Notes -------------------------------------------------------------- */}
      <Section icon={Table2} title="Standing notes" hint="Shown to admins and sellers. Never priced from.">
        <textarea
          rows={3}
          value={terms}
          onChange={(e) => setTerms(e.target.value)}
          className={inputClass}
          aria-label="Standing notes"
        />
      </Section>

      {/* Beside the button, because this form is several screens long: a
          result at the top is a result nobody scrolls back up to find. */}
      <FormFeedback error={state.error} success={state.ok ? "Saved ✓" : undefined} />

      <div className="w-56">
        <SubmitButton>{submitLabel}</SubmitButton>
      </div>
    </form>
  );
}

function Section({
  icon: Icon,
  title,
  hint,
  children,
}: {
  icon: typeof Building2;
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4 rounded-2xl bg-white p-6 ring-1 ring-niki-edge">
      <div>
        <h3 className="flex items-center gap-2 font-display text-base font-bold text-niki-ink">
          <Icon className="h-4 w-4 text-niki-orange" />
          {title}
        </h3>
        {hint ? <p className="mt-1 text-sm text-niki-ink/60">{hint}</p> : null}
      </div>
      {children}
    </section>
  );
}

function SettingRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <tr className="bg-niki-surface/60">
      <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-niki-ink/50">
        {label}
      </th>
      {children}
    </tr>
  );
}

function AddButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-3 flex items-center gap-1.5 rounded-full bg-niki-black px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-niki-black/85"
    >
      <Plus className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}

function RemoveButton({
  onClick,
  disabled,
  label,
}: {
  onClick: () => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-niki-danger transition-colors hover:bg-niki-danger/10 disabled:cursor-not-allowed disabled:opacity-30"
    >
      <Trash2 className="h-3.5 w-3.5" />
      {label ?? "Remove"}
    </button>
  );
}
