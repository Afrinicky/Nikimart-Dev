// Relative, with the extension: pulled in by a *.test.ts run through Node's
// type stripping, which resolves neither the "@/…" alias nor a missing
// extension. Nothing here is ever emitted, so it costs nothing at runtime.

/**
 * Who may settle a registration fee how — the whole chain of command, as a
 * pure module.
 *
 * There are three voices in this decision and they are not equal:
 *
 *   1. The admin's programme setting. Up front, from commission, or the
 *      recruit's choice. This is the default for everybody.
 *   2. An exception the admin has written against one recruiting agent —
 *      "everyone pays up front, except the people Ama brings in". It is only
 *      heard when the admin has opened that door; closing it puts the whole
 *      network back on the programme setting in one move, without anybody
 *      having to go and unpick the per-agent rows.
 *   3. The recruit, or the agent registering them, choosing between the two —
 *      and only where whoever is above them left it open.
 *
 * Keeping the order in one function is the point. It used to be decided in
 * three places that each knew part of it, which is how a console ends up with
 * a setting that does nothing.
 */

/**
 * How a new agent may settle the registration fee.
 *
 *   UPFRONT    — they pay before the store opens, and it does not open until
 *                the payment is confirmed.
 *   COMMISSION — it is debited on approval and clears out of their commission.
 *   BOTH       — whoever is registering chooses.
 */
export type PaymentMode = "UPFRONT" | "COMMISSION" | "BOTH";

/** Read a stored value as a mode. Anything unrecognised means "the default". */
export function normalisePaymentMode(raw: string | null | undefined): PaymentMode | null {
  const value = (raw ?? "").trim().toUpperCase();
  if (value === "UPFRONT" || value === "COMMISSION" || value === "BOTH") return value;
  return null;
}

/** The programme's own mode, with BOTH as the fallback. */
export function programPaymentMode(raw: string | null | undefined): PaymentMode {
  return normalisePaymentMode(raw) ?? "BOTH";
}

/**
 * What the people one agent recruits may do.
 *
 * `agentMode` is that agent's own exception, and null — which is what every
 * agent carries unless an admin has said otherwise — means they follow the
 * programme. `perAgentOverrides` is the admin's switch above it: with it off,
 * exceptions are ignored rather than deleted, so turning it back on restores
 * every one of them.
 */
export function resolveRecruitPaymentMode(input: {
  programMode: PaymentMode;
  agentMode: string | null | undefined;
  perAgentOverrides: boolean;
}): PaymentMode {
  if (!input.perAgentOverrides) return input.programMode;
  return normalisePaymentMode(input.agentMode) ?? input.programMode;
}

/**
 * How this registration fee will actually be settled.
 *
 * The mode decides what is on offer and this is where that decision is
 * enforced — a browser that posts "BALANCE" under an up-front mode is simply
 * not believed. A fee of zero settles as neither: there is nothing to collect,
 * and asking somebody to pay GH₵0 through a card form is not a flow.
 */
export function settleMethodFor(
  mode: PaymentMode,
  chosen: string | undefined | null,
  fee: number,
): "BALANCE" | "UPFRONT" {
  if (fee <= 0) return "BALANCE";
  if (mode === "UPFRONT") return "UPFRONT";
  if (mode === "COMMISSION") return "BALANCE";
  return (chosen ?? "").trim().toUpperCase() === "UPFRONT" ? "UPFRONT" : "BALANCE";
}

/** Whether the payer is offered a choice at all. */
export function canChoosePaymentMethod(mode: PaymentMode, fee: number): boolean {
  return mode === "BOTH" && fee > 0;
}

/** How the mode reads on screen, for an admin choosing one. */
export function paymentModeLabel(mode: PaymentMode): string {
  if (mode === "UPFRONT") return "Pay up front";
  if (mode === "COMMISSION") return "Pay from commission";
  return "Either — they choose";
}
