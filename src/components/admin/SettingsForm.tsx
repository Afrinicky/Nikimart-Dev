"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Field, inputClass } from "@/components/ui/Field";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { SingleImageField } from "@/components/admin/SingleImageField";
import { updateSettings, type SettingsState } from "@/lib/settings-actions";
import type { Settings } from "@/lib/settings";

export function SettingsForm({ settings }: { settings: Settings }) {
  const [state, formAction] = useActionState<SettingsState, FormData>(updateSettings, {});
  const saved = state.ok === true;

  return (
    <form action={formAction} className="space-y-8" noValidate>
      {state.error ? (
        <p role="alert" className="rounded-xl bg-niki-danger/10 px-4 py-3 text-sm font-medium text-niki-danger">{state.error}</p>
      ) : null}

      <section className="rounded-2xl bg-white p-6 ring-1 ring-niki-edge">
        <h2 className="font-display text-lg font-bold text-niki-ink">Shipping</h2>
        <p className="mt-1 text-sm text-niki-ink/60">
          Orders are collected at Nickimart pickup points and priced by CBM. Set the per-route ₵/CBM rates,
          international rates, and the arrival hub in the{" "}
          <Link href="/admin/shipping" className="font-semibold text-niki-orange hover:underline">Shipping</Link> tab.
        </p>
      </section>

      <section className="rounded-2xl bg-white p-6 ring-1 ring-niki-edge">
        <h2 className="font-display text-lg font-bold text-niki-ink">Platform commission</h2>
        <p className="mt-1 text-sm text-niki-ink/60">
          The percentage Nickimart earns on every sale. Sellers list for free and this cut is deducted from
          each item automatically. Override it per category in Categories.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <Field label="Default commission (%)" htmlFor="commissionRate" hint={state.fieldErrors?.commissionRate ?? "Applied to items whose category has no override"}>
            <input id="commissionRate" name="commissionRate" type="number" min="0" max="100" step="0.1" defaultValue={settings.commissionRate} className={inputClass} />
          </Field>
        </div>
      </section>

      <section className="rounded-2xl bg-white p-6 ring-1 ring-niki-edge">
        <h2 className="font-display text-lg font-bold text-niki-ink">Affiliate programme</h2>
        <p className="mt-1 text-sm text-niki-ink/60">
          Affiliates only earn on products enrolled in the programme. Sellers enrol their own products
          at their own expense; you can enrol any product at Nickimart&apos;s expense from the product
          page, capped at half the platform commission on that item. Set the per-category default in{" "}
          <Link href="/admin/categories" className="font-semibold text-niki-orange hover:underline">Categories</Link>.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <Field label="Default commission (%)" htmlFor="affiliateRate" hint="Used when neither the product nor its category sets a rate">
            <input id="affiliateRate" name="affiliateRate" type="number" min="0" max="100" step="0.1" defaultValue={settings.affiliateRate} className={inputClass} />
          </Field>
          <Field label="Headline rate (%)" htmlFor="affiliateMaxRate" hint="The 'up to' figure shown in public affiliate copy">
            <input id="affiliateMaxRate" name="affiliateMaxRate" type="number" min="0" max="100" step="0.1" defaultValue={settings.affiliateMaxRate} className={inputClass} />
          </Field>
          <Field label="Headline text" htmlFor="affiliatePitch" hint="{rate} is replaced with the headline rate">
            <input id="affiliatePitch" name="affiliatePitch" defaultValue={settings.affiliatePitch} className={inputClass} />
          </Field>
        </div>
      </section>

      <section className="rounded-2xl bg-white p-6 ring-1 ring-niki-edge">
        <h2 className="font-display text-lg font-bold text-niki-ink">Staff notifications</h2>
        <p className="mt-1 text-sm text-niki-ink/60">
          How sellers, freight agents, pickup operators, and admins are alerted about new orders and jobs.
          Buyers are always alerted by both SMS and email.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <Field label="Channel" htmlFor="staffNotifyChannel" hint="Requires the matching Arkesel (SMS) / email keys to be set">
            <select id="staffNotifyChannel" name="staffNotifyChannel" defaultValue={settings.staffNotifyChannel} className={inputClass}>
              <option value="both">SMS &amp; Email</option>
              <option value="sms">SMS only</option>
              <option value="email">Email only</option>
            </select>
          </Field>
        </div>
      </section>

      <section className="rounded-2xl bg-white p-6 ring-1 ring-niki-edge">
        <h2 className="font-display text-lg font-bold text-niki-ink">Global shipping</h2>
        <p className="mt-1 text-sm text-niki-ink/60">Estimated days for imported items to arrive in Ghana.</p>
        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Field label="China (days)" htmlFor="leadDaysCN">
            <input id="leadDaysCN" name="leadDaysCN" type="number" min="0" defaultValue={settings.leadDaysCN} className={inputClass} />
          </Field>
          <Field label="Dubai (days)" htmlFor="leadDaysAE">
            <input id="leadDaysAE" name="leadDaysAE" type="number" min="0" defaultValue={settings.leadDaysAE} className={inputClass} />
          </Field>
          <Field label="USA (days)" htmlFor="leadDaysUS">
            <input id="leadDaysUS" name="leadDaysUS" type="number" min="0" defaultValue={settings.leadDaysUS} className={inputClass} />
          </Field>
          <Field label="Europe (days)" htmlFor="leadDaysEU">
            <input id="leadDaysEU" name="leadDaysEU" type="number" min="0" defaultValue={settings.leadDaysEU} className={inputClass} />
          </Field>
        </div>
      </section>

      <section className="rounded-2xl bg-white p-6 ring-1 ring-niki-edge">
        <h2 className="font-display text-lg font-bold text-niki-ink">Contact & support</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Support email" htmlFor="supportEmail">
            <input id="supportEmail" name="supportEmail" type="email" defaultValue={settings.supportEmail} className={inputClass} />
          </Field>
          <Field label="Support phone" htmlFor="supportPhone">
            <input id="supportPhone" name="supportPhone" defaultValue={settings.supportPhone} className={inputClass} />
          </Field>
          <Field label="Business hours" htmlFor="businessHours">
            <input id="businessHours" name="businessHours" defaultValue={settings.businessHours} className={inputClass} />
          </Field>
          <Field label="Live chat status" htmlFor="liveChatStatus" hint="Shown under “Live chat” on the Help page">
            <input id="liveChatStatus" name="liveChatStatus" defaultValue={settings.liveChatStatus} className={inputClass} />
          </Field>
          <Field
            label="“Buy Data Bundles” link"
            htmlFor="dataBundlesUrl"
            hint="Where the sidebar and footer shortcuts send customers. /data-bundles is this store; paste another store\u2019s address to send them there. Empty hides the shortcuts."
          >
            <input id="dataBundlesUrl" name="dataBundlesUrl" defaultValue={settings.dataBundlesUrl} className={inputClass} placeholder="/data-bundles" />
          </Field>
        </div>
      </section>

      <section className="rounded-2xl bg-white p-6 ring-1 ring-niki-edge">
        <h2 className="font-display text-lg font-bold text-niki-ink">Social media</h2>
        <p className="mt-1 text-sm text-niki-ink/60">Nickimart&apos;s own handles — full URLs. Shown as icons in the footer. Leave blank to hide.</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Facebook URL" htmlFor="socialFacebook">
            <input id="socialFacebook" name="socialFacebook" type="url" defaultValue={settings.socialFacebook} placeholder="https://facebook.com/…" className={inputClass} />
          </Field>
          <Field label="Instagram URL" htmlFor="socialInstagram">
            <input id="socialInstagram" name="socialInstagram" type="url" defaultValue={settings.socialInstagram} placeholder="https://instagram.com/…" className={inputClass} />
          </Field>
          <Field label="X (Twitter) URL" htmlFor="socialTwitter">
            <input id="socialTwitter" name="socialTwitter" type="url" defaultValue={settings.socialTwitter} placeholder="https://x.com/…" className={inputClass} />
          </Field>
          <Field label="TikTok URL" htmlFor="socialTiktok">
            <input id="socialTiktok" name="socialTiktok" type="url" defaultValue={settings.socialTiktok} placeholder="https://tiktok.com/@…" className={inputClass} />
          </Field>
          <Field label="YouTube URL" htmlFor="socialYoutube">
            <input id="socialYoutube" name="socialYoutube" type="url" defaultValue={settings.socialYoutube} placeholder="https://youtube.com/@…" className={inputClass} />
          </Field>
          <Field label="WhatsApp link" htmlFor="socialWhatsapp" hint="e.g. https://wa.me/233…">
            <input id="socialWhatsapp" name="socialWhatsapp" type="url" defaultValue={settings.socialWhatsapp} placeholder="https://wa.me/233…" className={inputClass} />
          </Field>
        </div>
      </section>

      <section className="rounded-2xl bg-white p-6 ring-1 ring-niki-edge">
        <h2 className="font-display text-lg font-bold text-niki-ink">Footer & brand</h2>
        <div className="mt-4 space-y-4">
          <SingleImageField
            name="logoUrl"
            label="Brand logo"
            initial={settings.logoUrl}
            hint="Shown in the header, footer, and menus. Leave empty to use the bundled logo. A square PNG works best."
            previewClass="h-16 w-16"
          />
          <Field label="Footer tagline" htmlFor="footerTagline">
            <input id="footerTagline" name="footerTagline" defaultValue={settings.footerTagline} className={inputClass} />
          </Field>
          <Field label="Footer note" htmlFor="footerNote">
            <input id="footerNote" name="footerNote" defaultValue={settings.footerNote} className={inputClass} />
          </Field>
          <Field label="Copyright name" htmlFor="copyrightName">
            <input id="copyrightName" name="copyrightName" defaultValue={settings.copyrightName} className={inputClass} />
          </Field>
          <Field label="Restrictions notice" htmlFor="restrictionsText" hint="Shown at the bottom of the footer">
            <textarea id="restrictionsText" name="restrictionsText" rows={3} defaultValue={settings.restrictionsText} className={inputClass} />
          </Field>
        </div>
      </section>

      <div className="flex items-center gap-3">
        <div className="w-44">
          <SubmitButton>Save settings</SubmitButton>
        </div>
        {saved ? <span className="text-sm font-medium text-niki-success">Saved ✓</span> : null}
      </div>
    </form>
  );
}
