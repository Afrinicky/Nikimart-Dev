"use client";

import { useActionState } from "react";
import { AlertTriangle, Gauge } from "lucide-react";
import { Field, inputClass } from "@/components/ui/Field";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { Toggle } from "@/components/ui/Toggle";
import { FormFeedback } from "@/components/ui/FormFeedback";
import { updateSettings, type SettingsState } from "@/lib/settings-actions";
import type { Settings } from "@/lib/settings";

/**
 * The switches that decide what the site spends compute on.
 *
 * Written to be read by somebody deciding under pressure — an email saying the
 * allowance is 90% gone, two weeks of the month left, and no appetite for a
 * bigger plan. So each switch says what it costs and what is lost by turning
 * it off, in that order, and the panic switch is at the top with the list of
 * exactly what it does underneath it.
 *
 * Nothing here can take the shop offline. Browsing, searching, the cart and
 * checkout are untouched by every setting on this page; what these govern is
 * the work done for scrapers, crawlers and idle tabs.
 */
export function PerformanceSettingsForm({ settings }: { settings: Settings }) {
  const [state, formAction] = useActionState<SettingsState, FormData>(updateSettings, {});
  const saved = state.ok === true;
  const low = (settings.lowComputeMode ?? "0").trim() === "1";

  return (
    <form action={formAction} className="space-y-6" noValidate>
      <section
        className={
          low
            ? "rounded-2xl bg-niki-orange/5 p-6 ring-2 ring-niki-orange"
            : "rounded-2xl bg-white p-6 ring-1 ring-niki-edge"
        }
      >
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-niki-black text-niki-orange">
            <Gauge className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h2 className="font-display text-lg font-bold text-niki-ink">Low compute mode</h2>
            <p className="mt-1 text-sm text-niki-ink/60">
              One switch for the end of a tight month. It forces the cheapest setting for
              everything on this page at once, without changing what you have chosen below — turn
              it off and your own choices come back exactly as they were.
            </p>
          </div>
        </div>

        <div className="mt-4">
          <Toggle
            name="lowComputeMode"
            value={settings.lowComputeMode}
            defaultOn={false}
            label="Run the site as cheaply as it can"
            hint={
              <>
                While this is on: link-preview cards are plain, the chat bubble is hidden, orders
                screens stop refreshing themselves, crawlers are shut out of everything but the
                homepage, the sitemap is empty, catalogue pages show 48 products, and the nightly
                bundle sweep is skipped. Shopping, search, the cart and checkout are untouched.
                Exchange rates keep updating and short registration links keep working, because
                stopping either of those costs more than it saves.
              </>
            }
          />
        </div>

        {low ? (
          <p className="mt-4 flex items-start gap-2 rounded-xl bg-niki-orange/10 px-4 py-3 text-xs leading-relaxed text-niki-ink/75">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-niki-orange" />
            <span>
              Low compute mode is on, so the switches below are being overridden. They are still
              yours to set — they take effect again the moment you turn this off.
            </span>
          </p>
        ) : null}
      </section>

      <section className="rounded-2xl bg-white p-6 ring-1 ring-niki-edge">
        <h2 className="font-display text-lg font-bold text-niki-ink">Link previews</h2>
        <p className="mt-1 text-sm text-niki-ink/60">
          The picture that shows when somebody shares a Nickimart link on WhatsApp or Facebook.
          Drawing one runs a layout engine and an image encoder, which is the most expensive thing
          this site does for a single request — and it is done for a scraper, not for a shopper.
        </p>
        <div className="mt-4 space-y-4">
          <Toggle
            name="ogImagesEnabled"
            value={settings.ogImagesEnabled}
            label="Draw a card for each link"
            hint="Off: every shared link previews with the same plain Nickimart card. Links still work and still show a picture — it is just always the same one."
          />
          <Toggle
            name="ogProductPhotoEnabled"
            value={settings.ogProductPhotoEnabled}
            label="Put the product's own photograph in its card"
            hint="Off: a shared product link shows the Nickimart card instead of the product. This is the half of the work that decodes and re-encodes a photograph, so it is the cheaper thing to turn off first."
          />
        </div>
      </section>

      <section className="rounded-2xl bg-white p-6 ring-1 ring-niki-edge">
        <h2 className="font-display text-lg font-bold text-niki-ink">Orders screens</h2>
        <p className="mt-1 text-sm text-niki-ink/60">
          Orders screens re-ask the server for themselves while somebody is watching, so a status
          that changes upstream appears without a reload. Each of those is a full render of the
          page, including the call out to the bundle provider.
        </p>
        <div className="mt-4 space-y-4">
          <Toggle
            name="liveOrderRefreshEnabled"
            value={settings.liveOrderRefreshEnabled}
            label="Refresh orders screens automatically"
            hint="Off: an orders screen is current as of the moment it was opened, and staff reload it themselves. Nothing is lost except the waiting."
          />
          <div className="grid gap-4 sm:grid-cols-3">
            <Field
              label="First refresh after (seconds)"
              htmlFor="liveOrderRefreshSeconds"
              hint="The gap doubles from here up to five minutes, and resets whenever somebody returns to the tab. 10–600."
            >
              <input
                id="liveOrderRefreshSeconds"
                name="liveOrderRefreshSeconds"
                type="number"
                min="10"
                max="600"
                step="5"
                defaultValue={settings.liveOrderRefreshSeconds}
                className={inputClass}
              />
            </Field>
          </div>
        </div>
      </section>

      <section className="rounded-2xl bg-white p-6 ring-1 ring-niki-edge">
        <h2 className="font-display text-lg font-bold text-niki-ink">Live chat</h2>
        <p className="mt-1 text-sm text-niki-ink/60">
          The help bubble on the storefront. Messages travel browser-to-service, so a conversation
          costs nothing here — but every visitor who opens it asks this site for a token first.
        </p>
        <div className="mt-4">
          <Toggle
            name="liveChatEnabled"
            value={settings.liveChatEnabled}
            label="Show the chat bubble on the storefront"
            hint="Off: the bubble is hidden and no tokens are issued. Worth turning off whenever nobody is actually watching the inbox — an unanswered chat is worse than none. Existing conversations stay in the console."
          />
        </div>
      </section>

      <section className="rounded-2xl bg-white p-6 ring-1 ring-niki-edge">
        <h2 className="font-display text-lg font-bold text-niki-ink">Crawlers and search engines</h2>
        <p className="mt-1 text-sm text-niki-ink/60">
          Search engines, AI crawlers and SEO scrapers walk the site continuously. The pages they
          cost the most on are the ones no shopper asks for: a search result for a word they
          invented, a filter combination that matches nothing. Those cannot be cached, so each one
          is rendered from scratch.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field
            label="How much of the site crawlers may walk"
            htmlFor="crawlerPolicy"
            hint="Leave this on Balanced unless the allowance is nearly gone."
          >
            <select
              id="crawlerPolicy"
              name="crawlerPolicy"
              defaultValue={(settings.crawlerPolicy ?? "lean").trim() || "lean"}
              className={inputClass}
            >
              <option value="lean">Balanced — everything cacheable, no searches or filters</option>
              <option value="open">Open — also let them walk searches and filters</option>
              <option value="closed">Closed — the homepage only</option>
            </select>
          </Field>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-niki-ink/50">
          <strong className="font-semibold text-niki-ink/70">Open</strong> indexes more and costs
          more. <strong className="font-semibold text-niki-ink/70">Closed</strong> will cost you
          search traffic within days and take weeks to recover — it is for buying time to the end
          of a month, not a setting to leave on.
        </p>
        <div className="mt-5 space-y-4 border-t border-niki-edge pt-5">
          <Toggle
            name="sitemapEnabled"
            value={settings.sitemapEnabled}
            label="Publish a sitemap"
            hint="A sitemap points crawlers at the pages that are cached, instead of leaving them to guess. Keeping it on is usually cheaper than turning it off."
          />
          <div className="grid gap-4 sm:grid-cols-3">
            <Field
              label="Products listed in it"
              htmlFor="sitemapProductLimit"
              hint="Zero lists the categories and shops only, and lets crawlers find products by following those — far fewer URLs handed out at once."
            >
              <input
                id="sitemapProductLimit"
                name="sitemapProductLimit"
                type="number"
                min="0"
                max="50000"
                step="100"
                defaultValue={settings.sitemapProductLimit}
                className={inputClass}
              />
            </Field>
          </div>
        </div>
      </section>

      <section className="rounded-2xl bg-white p-6 ring-1 ring-niki-edge">
        <h2 className="font-display text-lg font-bold text-niki-ink">Catalogue pages</h2>
        <p className="mt-1 text-sm text-niki-ink/60">
          The All Products page reads its filters from the address, so it cannot be cached and
          every view of it is built from scratch. This is the ceiling on how much gets built.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <Field
            label="Products per page"
            htmlFor="cataloguePageLimit"
            hint="Shoppers are told when there are more and are pointed at search and the category tabs. 12–500."
          >
            <input
              id="cataloguePageLimit"
              name="cataloguePageLimit"
              type="number"
              min="12"
              max="500"
              step="12"
              defaultValue={settings.cataloguePageLimit}
              className={inputClass}
            />
          </Field>
        </div>
      </section>

      <section className="rounded-2xl bg-white p-6 ring-1 ring-niki-edge">
        <h2 className="font-display text-lg font-bold text-niki-ink">Short registration links</h2>
        <p className="mt-1 text-sm text-niki-ink/60">
          One-word links like nickimart.com/join. They are matched by a route that sits at the very
          root of the site, which means it is also what answers every automated scan probing for
          /wp-login.php and the like — and those arrive around the clock.
        </p>
        <div className="mt-4">
          <Toggle
            name="inviteShortLinksEnabled"
            value={settings.inviteShortLinksEnabled}
            label="Answer one-word registration links"
            hint="Off: every short path is refused outright, with no lookup at all. The long links the console issues (/become-an-agent?invite=CODE) keep working — but any advert already printed with a short path on it stops."
          />
        </div>
      </section>

      <section className="rounded-2xl bg-white p-6 ring-1 ring-niki-edge">
        <h2 className="font-display text-lg font-bold text-niki-ink">Scheduled jobs</h2>
        <p className="mt-1 text-sm text-niki-ink/60">
          What runs overnight without anybody asking. Automatic backups have their own switch in
          the bundle console.
        </p>
        <div className="mt-4 space-y-4">
          <Toggle
            name="dataBundleSweepEnabled"
            value={settings.dataBundleSweepEnabled}
            label="Nightly bundle sweep"
            hint="Asks the provider about every bundle order that stalled, so a customer who paid and got nothing is chased without anybody noticing first. Off: a stalled order waits for somebody to spot it in the console. This is the last switch on this page to reach for."
          />
          <Toggle
            name="fxAutoRefreshEnabled"
            value={settings.fxAutoRefreshEnabled}
            label="Nightly exchange-rate pull"
            hint="One call a night. Off: yesterday's cedi rate stands, and it is wrong in the direction that costs money — a day of imported listings priced at a rate that has moved. Leave this on."
          />
        </div>
      </section>

      <FormFeedback error={state.error} />
      <div className="flex items-center gap-3">
        <div className="w-60">
          <SubmitButton>Save performance settings</SubmitButton>
        </div>
        {saved ? <span className="text-sm font-medium text-niki-success">Saved ✓</span> : null}
      </div>
    </form>
  );
}
