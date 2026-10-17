import { KeyRound, Lock, ShieldCheck, ShieldX } from "lucide-react";
import { SendCodeButton } from "@/components/pickup/SendCodeButton";
import { cn } from "@/lib/cn";

/**
 * Who took this parcel, or what is standing between it and being taken.
 *
 * The order dossier could tell an admin everything about a pickup order except
 * the one thing a dispute turns on: whether the person who walked out with the
 * goods was the person who paid for them. This is that, on the order itself,
 * so answering a complaint does not mean going to a different screen and
 * matching order numbers by eye.
 */

export interface CollectionPanelData {
  hasLiveCode: boolean;
  codeHint: string;
  codeSentAt: string | null;
  issued: number;
  attempts: number;
  attemptsLeft: number;
  locked: boolean;
  collectedAt: string | null;
  method: string;
  collectorName: string;
  collectorPhone: string;
  collectorIdType: string;
  collectorIdNumber: string;
  collectorRelation: string;
  overrideReason: string;
  releasedByName: string;
}

export function CollectionPanel({
  orderId,
  buyerPhoneMasked,
  collection,
}: {
  orderId: string;
  buyerPhoneMasked: string;
  collection: CollectionPanelData | null;
}) {
  const collected = Boolean(collection?.collectedAt);
  const override = collection?.method === "override";

  return (
    <section
      className={cn(
        "rounded-2xl p-5 ring-1",
        override
          ? "bg-amber-50/70 ring-amber-200"
          : collected
            ? "bg-niki-success/[0.07] ring-niki-success/25"
            : "bg-white ring-niki-edge",
      )}
    >
      <div className="flex items-center gap-2 text-niki-ink">
        {collected ? (
          override ? (
            <ShieldX className="h-4 w-4 text-amber-600" />
          ) : (
            <ShieldCheck className="h-4 w-4 text-niki-success" />
          )
        ) : (
          <KeyRound className="h-4 w-4 text-niki-orange" />
        )}
        <h2 className="font-display font-bold">Collection</h2>
      </div>

      {collected && collection ? (
        <dl className="mt-4 grid gap-x-6 gap-y-2.5 text-sm sm:grid-cols-2">
          <Row label="Collected by">
            {collection.collectorName}
            {collection.collectorRelation && collection.collectorRelation !== "buyer" ? (
              <span className="text-niki-ink/55"> · {collection.collectorRelation}</span>
            ) : (
              <span className="text-niki-ink/55"> · the buyer</span>
            )}
          </Row>
          <Row label="Their number">{collection.collectorPhone || "Not recorded"}</Row>
          <Row label="ID shown">
            {collection.collectorIdNumber
              ? `${collection.collectorIdType} ${collection.collectorIdNumber}`
              : "None recorded"}
          </Row>
          <Row label="When">
            {new Date(collection.collectedAt!).toLocaleString("en-GB", {
              day: "2-digit",
              month: "short",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </Row>
          <Row label="Released by">{collection.releasedByName || "Not recorded"}</Row>
          <Row label="Verified">
            {override ? (
              <span className="font-semibold text-amber-700">
                No — released without the code
              </span>
            ) : (
              <span className="font-semibold text-niki-success">Code checked at the counter</span>
            )}
          </Row>
          {override && collection.overrideReason ? (
            <div className="sm:col-span-2">
              <dt className="text-xs font-semibold uppercase tracking-wide text-niki-ink/50">
                Reason given
              </dt>
              <dd className="mt-1 rounded-xl bg-white/70 px-4 py-3 text-sm text-niki-ink/75 ring-1 ring-amber-200">
                {collection.overrideReason}
              </dd>
            </div>
          ) : null}
        </dl>
      ) : (
        <>
          <p className="mt-3 text-sm text-niki-ink/65">
            {collection?.hasLiveCode ? (
              <>
                A collection code is live and was sent to {buyerPhoneMasked}
                {collection.codeHint ? (
                  <>
                    {" "}
                    — it ends <span className="font-semibold text-niki-ink">{collection.codeHint}</span>
                  </>
                ) : null}
                . The counter cannot release the parcel without it.
              </>
            ) : (
              <>
                No collection code has been sent yet. One goes out automatically when the parcel is
                confirmed ready at its point, and can be sent again from here.
              </>
            )}
          </p>

          {collection?.locked ? (
            <p className="mt-2.5 flex items-start gap-1.5 rounded-xl bg-niki-danger/10 px-4 py-3 text-xs font-medium text-niki-danger">
              <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Locked after {collection.attempts} wrong codes. Sending a fresh one unlocks it.
            </p>
          ) : collection && collection.attempts > 0 ? (
            <p className="mt-2.5 text-xs font-medium text-amber-700">
              {collection.attempts} wrong {collection.attempts === 1 ? "code" : "codes"} tried ·{" "}
              {collection.attemptsLeft} left before it locks.
            </p>
          ) : null}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <SendCodeButton orderId={orderId} again={Boolean(collection?.hasLiveCode)} />
            {collection && collection.issued > 0 ? (
              <span className="text-xs text-niki-ink/45">
                Sent {collection.issued} {collection.issued === 1 ? "time" : "times"} so far
              </span>
            ) : null}
          </div>
        </>
      )}
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-niki-ink/50">{label}</dt>
      <dd className="mt-0.5 text-niki-ink/80">{children}</dd>
    </div>
  );
}
