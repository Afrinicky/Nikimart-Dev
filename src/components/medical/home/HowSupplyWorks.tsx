import { MedicalLink } from "@/components/medical/ui/MedicalLink";

/**
 * How buying from this business actually goes.
 *
 * Three steps, numbered — and numbered here for the one reason a number earns
 * its place: this is a sequence, and the order carries information. Step two
 * cannot happen before step one. That is different from putting 01 / 02 / 03
 * above About, Process and Pricing, which is scaffolding pretending to be
 * structure.
 *
 * Laid out on a rule rather than in three cards. Three identical bordered
 * boxes with an icon at the top of each is the single most recognisable shape
 * of a generated page, and these are not three parallel things — they are one
 * thing happening in order, which a connecting line says and three boxes do
 * not.
 */

const STEPS = [
  {
    title: "Send us the list",
    body: "Add what you need to a quotation request — catalogue numbers, quantities, and anything you could not find. No account needed to ask.",
  },
  {
    title: "We price it",
    body: "We check stock, cost anything we have to bring in, and send a quotation with prices, lead times and payment terms. It holds until the date on it.",
  },
  {
    title: "You order against it",
    body: "Accept the quotation and it becomes an order at those prices — nothing re-entered, nothing re-quoted. Pay outright or over an agreed schedule.",
  },
];

export function HowSupplyWorks() {
  return (
    <section aria-labelledby="how-supply-works">
      <div className="max-w-2xl">
        <h2 id="how-supply-works" className="medi-h2">
          Most of this catalogue is sold on a quotation
        </h2>
        <p className="medi-prose mt-2.5 text-medi-body">
          Laboratories and hospitals buy against a document their finance office
          can approve, not out of a shopping cart. So that is the path we built
          first — and the things you can simply buy, you can simply buy.
        </p>
      </div>

      <ol className="mt-10 grid gap-x-8 gap-y-9 sm:grid-cols-3">
        {STEPS.map((step, index) => (
          <li key={step.title} className="relative">
            {/* The rule runs through the numeral and on toward the next step,
                stopping at the last. It is the whole reason this reads as a
                sequence rather than as three unrelated paragraphs. */}
            <div className="flex items-center gap-3">
              <span className="font-figures flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-medi-mint-100 text-[0.8125rem] font-bold text-medi-teal-800">
                {index + 1}
              </span>
              <span
                aria-hidden
                className={
                  index === STEPS.length - 1
                    ? "hidden"
                    : "hidden h-px flex-1 bg-medi-rule sm:block"
                }
              />
            </div>
            <h3 className="medi-h3 mt-4">{step.title}</h3>
            <p className="medi-prose mt-1.5 text-[0.875rem] text-medi-body">{step.body}</p>
          </li>
        ))}
      </ol>

      <p className="mt-8 text-[0.875rem] text-medi-body">
        <MedicalLink
          href="/medicals/help/ordering"
          className="medi-focus rounded font-semibold text-medi-teal-700 underline-offset-4 hover:underline"
        >
          How ordering works in full
        </MedicalLink>
      </p>
    </section>
  );
}
