"use server";

import { createHash, randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { dataDb } from "@/lib/data-db";
import { requireAdmin } from "@/lib/session";
import { sendSms } from "@/lib/notifications";
import { formatMoney } from "@/lib/format";
import { siteUrl } from "@/lib/site";
import { getDataStoreConfig } from "@/lib/data-bundles/settings";
import { parseGhPhone } from "@/lib/data-bundles/gh-phone";
import { postLedgerEntry } from "@/lib/data-bundles/agent-ledger";
import { normaliseSlug, round2, slugProblem } from "@/lib/data-bundles/agents";
import { getAgentUser } from "@/lib/data-bundles/user-link";
import { reconcileWalletTopup } from "@/lib/data-bundles/wallet";
import { notifyTemplate, smsTemplate } from "@/lib/messages";
import { normalisePaymentMode, paymentModeLabel } from "@/lib/data-bundles/payment-mode";
import {
  checkReferralLink,
  linkReferral,
  releaseReferralRewards,
  settleSetupFee,
  resolveReferralCode,
} from "@/lib/data-bundles/referrals";

/**
 * Admin actions for the agent programme: suspend an agent, correct a
 * balance, process a MoMo withdrawal, publish an announcement.
 *
 * Every one guards with `requireAdmin()` — these move real money — and every
 * balance change goes through `postLedgerEntry`, so an adjustment is as
 * auditable as a commission.
 */

export type AgentAdminState = {
  ok?: boolean;
  error?: string;
  message?: string;
  /** A freshly issued setup link, for the admin to pass on. */
  setupUrl?: string;
};

const STORAGE_ERROR =
  "Couldn't save — the agent tables aren't set up on this database yet. " +
  "Run the Neon catch-up SQL (nikimart-neon-data-agents.sql), then try again.";

function str(fd: FormData, key: string): string {
  return String(fd.get(key) ?? "").trim();
}

function num(fd: FormData, key: string): number | null {
  const v = str(fd, key);
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function revalidateAgents(agentId?: string) {
  revalidatePath("/admin/data/agents");
  revalidatePath("/admin/data/withdrawals");
  if (agentId) revalidatePath(`/admin/data/agents/${agentId}`);
  revalidatePath("/agent");
  revalidatePath("/agent/wallet");
}

// ---------------------------------------------------------------------------
// Agent status
// ---------------------------------------------------------------------------

/**
 * Suspend or reactivate an agent. A suspended agent keeps their balance and
 * history but their storefront closes and they stop earning on new deliveries.
 */
export async function setAgentStatus(fd: FormData): Promise<void> {
  await requireAdmin();
  const id = str(fd, "agentId");
  const status = str(fd, "status");
  if (!id || !["active", "suspended"].includes(status)) return;

  try {
    const agent = await dataDb.dataAgent.update({
      where: { id },
      data: { status },
      select: { slug: true, storeName: true, supportPhone: true },
    });
    revalidateAgents(id);
    revalidatePath(`/store/${agent.slug}`);

    if (agent.supportPhone) {
      await sendSms(
        agent.supportPhone,
        status === "active"
          ? `Nickimart: your agent account (${agent.storeName}) is active again. Your store is back online.`
          : `Nickimart: your agent account (${agent.storeName}) has been suspended. Please contact support.`,
      );
    }
  } catch {
    // Agent gone, or tables not migrated — nothing to undo.
  }
}

// ---------------------------------------------------------------------------
// Balance adjustments
// ---------------------------------------------------------------------------

/**
 * Credit or debit an agent by hand — a goodwill credit, a correction, waiving
 * the rest of a setup fee. The narration is required because a ledger entry
 * nobody can explain later is worse than no entry at all.
 */
export async function adjustAgentBalance(
  _prev: AgentAdminState,
  fd: FormData,
): Promise<AgentAdminState> {
  await requireAdmin();

  const agentId = str(fd, "agentId");
  if (!agentId) return { error: "Missing agent." };

  const amount = num(fd, "amount");
  if (amount === null || amount === 0) {
    return { error: "Enter an amount — negative to debit, positive to credit." };
  }
  if (Math.abs(amount) > 100000) return { error: "That adjustment looks too large." };

  const narration = str(fd, "narration");
  if (narration.length < 4) return { error: "Say what this adjustment is for." };

  try {
    const balance = await postLedgerEntry({
      agentId,
      type: "ADJUSTMENT",
      amount: round2(amount),
      narration,
      reference: null,
    });
    // A credit is how a registration fee gets waived in practice, so check
    // whether this one just settled it — that opens the storefront now rather
    // than on the next nightly sweep, and does nothing at all when the
    // adjustment was for something else.
    //
    // Settling it is all it does. A fee an admin cleared by hand was written
    // off, not paid, and writing a fee off must not pay the recruiter a
    // referral reward for a registration nobody paid for: `settleSetupFee`
    // records that it was an adjustment that cleared it, and the reward stays
    // where it is. Real payments release rewards from their own settlement
    // paths, which is where they belong.
    if (amount > 0) await settleSetupFee(agentId);

    revalidateAgents(agentId);
    return {
      ok: true,
      message: `${amount > 0 ? "Credited" : "Debited"} ${formatMoney(Math.abs(round2(amount)))}. New balance ${formatMoney(balance ?? 0)}.`,
    };
  } catch {
    return { error: STORAGE_ERROR };
  }
}

/**
 * Credit a wallet top-up that Paystack captured but we never recorded.
 *
 * The admin pastes the reference; we ask Paystack whether it was really paid
 * and, if it was, credit exactly what was captured. Safer than an adjustment
 * typed from memory: the amount comes from the gateway, and the same dedupe key
 * the normal path uses means a reference already credited cannot be paid twice.
 */
export async function reconcileTopup(
  _prev: AgentAdminState,
  fd: FormData,
): Promise<AgentAdminState> {
  await requireAdmin();

  const reference = str(fd, "reference");
  if (!reference) return { error: "Paste the Paystack reference (NT-…)." };

  // An agent id on the form pins the credit to that agent, which is what makes
  // a top-up started before we kept records recoverable at all.
  const agentId = str(fd, "agentId") || null;

  const result = await reconcileWalletTopup(reference, { agentId });
  if (!result.ok) return { error: result.error };

  if (agentId) revalidateAgents(agentId);
  return { ok: true, message: result.message };
}

// ---------------------------------------------------------------------------
// Withdrawals
// ---------------------------------------------------------------------------

/**
 * Mark a withdrawal paid. The money already left the agent's balance when they
 * requested it, so this only records that the MoMo transfer was actually made.
 */
export async function processWithdrawal(fd: FormData): Promise<void> {
  const admin = await requireAdmin();
  const id = str(fd, "withdrawalId");
  if (!id) return;

  try {
    // Guarded so two admins working the queue can't both mark one paid.
    const claimed = await dataDb.dataAgentWithdrawal.updateMany({
      where: { id, status: "pending" },
      data: {
        status: "processed",
        processedBy: admin.name ?? admin.email ?? admin.id,
        processedAt: new Date(),
        adminNote: str(fd, "note"),
      },
    });
    if (claimed.count === 0) return;

    const row = await dataDb.dataAgentWithdrawal.findUnique({
      where: { id },
      select: { agentId: true, amount: true, momoPhone: true, agent: { select: { storeName: true } } },
    });
    revalidateAgents(row?.agentId);
    if (row) {
      await smsTemplate(row.momoPhone, "withdrawal.sent", {
        amount: formatMoney(row.amount),
        phone: row.momoPhone,
        store: row.agent?.storeName ?? "",
      });
    }
  } catch {
    // Not migrated — nothing to record.
  }
}

/**
 * Reject a withdrawal and put the money back. The reversal is a ledger entry of
 * its own rather than an edit, so the request and its refund both stay visible
 * on the agent's wallet.
 */
export async function rejectWithdrawal(fd: FormData): Promise<void> {
  const admin = await requireAdmin();
  const id = str(fd, "withdrawalId");
  if (!id) return;

  try {
    const claimed = await dataDb.dataAgentWithdrawal.updateMany({
      where: { id, status: "pending" },
      data: {
        status: "rejected",
        processedBy: admin.name ?? admin.email ?? admin.id,
        processedAt: new Date(),
        adminNote: str(fd, "note") || "Rejected",
      },
    });
    if (claimed.count === 0) return;

    const row = await dataDb.dataAgentWithdrawal.findUnique({
      where: { id },
      select: { agentId: true, amount: true, fee: true, momoPhone: true },
    });
    if (!row) return;

    await postLedgerEntry({
      agentId: row.agentId,
      type: "WITHDRAWAL_REVERSAL",
      amount: round2(row.amount + row.fee),
      narration: `Withdrawal to ${row.momoPhone} was rejected — amount returned to your balance`,
      reference: id,
    });

    revalidateAgents(row.agentId);
    await sendSms(
      row.momoPhone,
      `Nickimart: your withdrawal of ${formatMoney(row.amount)} could not be processed. The amount is back on your balance.`,
    );
  } catch {
    // Not migrated — nothing to reverse.
  }
}

// ---------------------------------------------------------------------------
// Announcements
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Support requests
// ---------------------------------------------------------------------------

export async function resolveSupportRequest(fd: FormData): Promise<void> {
  await requireAdmin();
  const id = str(fd, "id");
  if (!id) return;
  try {
    await dataDb.dataSupportRequest.update({
      where: { id },
      data: { status: "resolved", resolvedAt: new Date(), adminNote: str(fd, "note") },
    });
    revalidatePath("/admin/data/support");
  } catch {
    // Gone, or not migrated.
  }
}

// ---------------------------------------------------------------------------
// Managing an agent like any other account
// ---------------------------------------------------------------------------

/**
 * Issue a fresh setup link for an agent who still has no password.
 *
 * The link normally goes out by SMS and email on approval. When neither is
 * configured — or the text simply never arrived, which happens — there was no
 * second chance: the account existed, nobody could sign in to it, and the only
 * way out was a database edit. This is that second chance.
 */
export async function reissueSetupLink(fd: FormData): Promise<AgentAdminState> {
  await requireAdmin();
  const agentId = str(fd, "agentId");
  if (!agentId) return { error: "Missing agent." };

  let agent;
  try {
    agent = await dataDb.dataAgent.findUnique({
      where: { id: agentId },
      select: { id: true, storeName: true, slug: true, userId: true },
    });
  } catch {
    return { error: "Couldn't read that agent." };
  }
  if (!agent) return { error: "That agent no longer exists." };
  // The person behind the agent is in the retail database, so this is a second
  // hop rather than an include.
  const user = await getAgentUser(agent.userId);
  if (user?.canSignIn) {
    return { error: "This agent already has a password — send them to Forgot password instead." };
  }

  const token = randomBytes(32).toString("hex");
  const setupUrl = `${siteUrl()}/agent-setup?token=${token}`;

  try {
    // The link belongs to an application, which is where the token lives. If
    // the agent was created some other way, make a record to hang it on.
    const existing = await dataDb.dataAgentApplication.findFirst({
      where: { agentId },
      select: { id: true },
    });
    const data = {
      setupTokenHash: createHash("sha256").update(token).digest("hex"),
      setupExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60_000),
    };
    if (existing) {
      await dataDb.dataAgentApplication.update({ where: { id: existing.id }, data });
    } else {
      await dataDb.dataAgentApplication.create({
        data: {
          fullName: agent.storeName,
          phone: user?.phone ?? "",
          email: user?.email ?? "",
          desiredSlug: agent.slug,
          status: "approved",
          agentId,
          ...data,
        },
      });
    }
  } catch {
    return { error: "Couldn't issue a new link. Please try again." };
  }

  await notifyTemplate(
    { phone: user?.phone ?? null, email: user?.email ?? null },
    "agent.setupLink",
    { name: user?.name ?? agent.storeName, link: setupUrl },
  );

  revalidateAgents(agentId);
  return { ok: true, setupUrl, message: "New link issued — valid for 7 days." };
}

/**
 * Record a referrer for an agent who has none.
 *
 * The one gap the signup form leaves: someone recruited by an existing agent
 * who didn't type their code, and finds out afterwards. An admin can put it
 * right — but only while there is nothing there. A referrer that already exists
 * is permanent, because changing it moves earnings that have already been paid
 * to somebody else, and because "my upline changed" is a complaint no ledger
 * can answer. checkReferralLink is what refuses the rest: self-referral, a
 * suspended referrer, and a pair that already refer each other.
 */
export async function setAgentReferrer(
  _prev: AgentAdminState,
  fd: FormData,
): Promise<AgentAdminState> {
  await requireAdmin();
  const agentId = str(fd, "agentId");
  const code = str(fd, "referralCode").toUpperCase();
  if (!agentId) return { error: "Missing agent." };
  if (!code) return { error: "Enter the referrer's agent code." };

  const agent = await dataDb.dataAgent
    .findUnique({ where: { id: agentId }, select: { userId: true, storeName: true } })
    .catch(() => null);
  if (!agent) return { error: "That agent no longer exists." };

  const resolved = await resolveReferralCode(code);
  if (!resolved.ok) return { error: resolved.message };

  // The recruit's own contact details, so the same-person guard has something
  // to compare against — they are in the retail database, not on the agent row.
  const recruitUser = await getAgentUser(agent.userId);
  const allowed = await checkReferralLink({
    referrerId: resolved.agentId,
    agentId,
    recruitUserId: agent.userId,
    recruitEmail: recruitUser?.email ?? null,
    recruitPhone: recruitUser?.phone ?? null,
  });
  if (!allowed.ok) return { error: allowed.reason };

  if (!(await linkReferral(agentId, allowed.referrerId))) {
    return { error: "That agent already has a referrer." };
  }

  // The fee may have been paid long ago, in which case the reward is owed the
  // moment the relationship exists.
  await releaseReferralRewards(agentId);

  revalidateAgents(agentId);
  return { ok: true, message: `${resolved.storeName} (${resolved.code}) is now recorded as the referrer.` };
}

/**
 * Decide how the people this agent recruits settle their registration fee.
 *
 * The exception mechanism behind "everyone pays up front, except the people
 * these three bring in". Blank puts them back on the programme's own rule,
 * which is not the same as choosing the rule that happens to be set today —
 * one follows the programme as it changes, the other stays where it is put.
 *
 * It is an exception, not an override: the programme setting decides whether
 * exceptions are heard at all, so switching them off at the top puts the whole
 * network back on one rule without anybody having to come here and unpick it.
 */
export async function setAgentRecruitPaymentMode(
  _prev: AgentAdminState,
  fd: FormData,
): Promise<AgentAdminState> {
  await requireAdmin();
  const agentId = str(fd, "agentId");
  if (!agentId) return { error: "Missing agent." };

  const raw = str(fd, "recruitPaymentMode");
  const mode = raw ? normalisePaymentMode(raw) : null;
  if (raw && !mode) return { error: "Choose how their recruits pay." };

  try {
    await dataDb.dataAgent.update({
      where: { id: agentId },
      data: { recruitPaymentMode: mode },
    });
  } catch {
    return { error: STORAGE_ERROR };
  }

  revalidateAgents(agentId);
  revalidatePath("/become-an-agent");

  // Read back rather than echoed: the only answer worth showing an admin is
  // what the row now actually says, because "saved" and "stored" coming apart
  // is exactly the failure this control has to rule out.
  const stored = await dataDb.dataAgent
    .findUnique({ where: { id: agentId }, select: { recruitPaymentMode: true } })
    .catch(() => null);
  const saved = normalisePaymentMode(stored?.recruitPaymentMode);

  return {
    ok: true,
    message: saved
      ? `Saved. Their recruits: ${paymentModeLabel(saved).toLowerCase()}.`
      : "Saved. Their recruits follow the programme.",
  };
}

/**
 * Set the registration waiver this agent's own recruits get.
 *
 * The lever behind "bring three people in and their registration is on us":
 * a percentage off the registration fee for anybody who joins with this
 * agent's code, set per agent because it is a reward for recruiting well
 * rather than a rule of the programme. Leaving it blank puts them back on the
 * programme default, which is different from setting it to 0% — one follows
 * the default as it changes, the other never waives anything.
 *
 * It applies to registrations made from now on. A recruit already approved
 * carries the waiver they were quoted, on their own row, and nothing here
 * rewrites it.
 */
export async function setAgentReferralWaiver(
  _prev: AgentAdminState,
  fd: FormData,
): Promise<AgentAdminState> {
  await requireAdmin();
  const agentId = str(fd, "agentId");
  if (!agentId) return { error: "Missing agent." };

  const waiver = optionalPercent(fd, "referralWaiverPercent");
  if ("error" in waiver) {
    return { error: "Enter a waiver between 0 and 100 percent, or leave it blank." };
  }
  const share = optionalPercent(fd, "referralSharePercent");
  if ("error" in share) {
    return { error: "Enter a share between 0 and 100 percent, or leave it blank." };
  }

  try {
    await dataDb.dataAgent.update({
      where: { id: agentId },
      data: {
        referralWaiverPercent: waiver.value,
        referralSharePercent: share.value,
      },
    });
  } catch {
    return { error: STORAGE_ERROR };
  }

  revalidateAgents(agentId);
  revalidatePath("/become-an-agent");

  // Both halves in one line, because they only make sense together: what a
  // recruit is charged, and how much of it comes back here.
  const charged =
    waiver.value === null
      ? "Recruits follow the default waiver"
      : waiver.value >= 100
        ? "Recruits register free"
        : waiver.value > 0
          ? `Recruits get ${waiver.value}% off`
          : "Recruits pay the full fee";
  const kept =
    share.value === null
      ? "and this agent keeps the default share of it."
      : share.value > 0
        ? `and this agent keeps ${share.value}% of what they pay.`
        : "and this agent keeps none of it.";

  return { ok: true, message: `${charged} ${kept}` };
}

/**
 * A percentage field that may be left blank.
 *
 * Blank is not zero anywhere in the referral programme: blank follows the
 * programme default as it changes, zero is a decision that outlives it. The
 * two have to stay distinguishable all the way from the form to the column,
 * so an empty field becomes null rather than 0.
 */
function optionalPercent(
  fd: FormData,
  key: string,
): { value: number | null } | { error: true } {
  const raw = str(fd, key);
  if (raw === "") return { value: null };
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || n > 100) return { error: true };
  return { value: round2(n) };
}

const editSchema = z.object({
  storeName: z.string().trim().min(2, "Give the store a name.").max(60),
  slug: z.string().trim().min(3, "Choose a store link."),
  supportPhone: z.string().trim().optional(),
  supportWhatsapp: z.string().trim().optional(),
  storeTagline: z.string().trim().max(120).optional(),
  storeAbout: z.string().trim().max(600).optional(),
  whatsappGroup: z.string().trim().max(200).optional(),
  storeOpen: z.enum(["open", "closed"]),
  status: z.enum(["active", "suspended"]),
  afaEnabled: z.enum(["on", "off"]),
  afaPrice: z.string().trim().optional(),
  ownerName: z.string().trim().max(80).optional(),
  ownerPhone: z.string().trim().optional(),
});

/** Edit an agent's store details on their behalf. */
export async function updateAgentDetails(
  _prev: AgentAdminState,
  fd: FormData,
): Promise<AgentAdminState> {
  await requireAdmin();
  const agentId = str(fd, "agentId");
  if (!agentId) return { error: "Missing agent." };

  const parsed = editSchema.safeParse({
    storeName: fd.get("storeName"),
    slug: fd.get("slug"),
    supportPhone: fd.get("supportPhone") ?? "",
    supportWhatsapp: fd.get("supportWhatsapp") ?? "",
    storeTagline: fd.get("storeTagline") ?? "",
    storeAbout: fd.get("storeAbout") ?? "",
    whatsappGroup: fd.get("whatsappGroup") ?? "",
    storeOpen: fd.get("storeOpen") ?? "open",
    status: fd.get("status") ?? "active",
    afaEnabled: fd.get("afaEnabled") ?? "off",
    afaPrice: fd.get("afaPrice") ?? "",
    ownerName: fd.get("ownerName") ?? "",
    ownerPhone: fd.get("ownerPhone") ?? "",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check the form." };
  }
  const data = parsed.data;

  const slug = normaliseSlug(data.slug);
  const problem = slugProblem(slug);
  if (problem) return { error: problem };

  // Both are optional, but a stored number has to be a real one.
  let support = "";
  if (data.supportPhone) {
    const check = parseGhPhone(data.supportPhone);
    if (!check.ok) return { error: `Support number: ${check.message}` };
    support = check.local;
  }
  let whatsapp = "";
  if (data.supportWhatsapp) {
    const check = parseGhPhone(data.supportWhatsapp);
    if (!check.ok) return { error: `WhatsApp number: ${check.message}` };
    whatsapp = check.local;
  }

  const group = data.whatsappGroup?.trim() ?? "";
  if (group && !/^https?:\/\//i.test(group)) {
    return { error: "The WhatsApp group link should start with https://" };
  }

  // An AFA price of zero means "not selling it"; anything else has to clear
  // Nickimart's own price or the agent would be selling below cost.
  const store = await getDataStoreConfig();
  const afaPrice = round2(Number(data.afaPrice || 0));
  if (!Number.isFinite(afaPrice) || afaPrice < 0) return { error: "Enter a valid AFA price." };
  if (afaPrice > 0 && afaPrice < store.afaPrice) {
    return { error: `The AFA price can't be below ${formatMoney(store.afaPrice)}.` };
  }

  let ownerPhone = "";
  if (data.ownerPhone) {
    const check = parseGhPhone(data.ownerPhone);
    if (!check.ok) return { error: `Owner's number: ${check.message}` };
    ownerPhone = check.local;
  }

  try {
    const clash = await dataDb.dataAgent.findFirst({
      where: { slug, NOT: { id: agentId } },
      select: { id: true },
    });
    if (clash) return { error: `“${slug}” is already taken by another store.` };

    const agent = await dataDb.dataAgent.update({
      where: { id: agentId },
      data: {
        storeName: data.storeName,
        slug,
        supportPhone: support,
        supportWhatsapp: whatsapp,
        storeTagline: data.storeTagline ?? "",
        storeAbout: data.storeAbout ?? "",
        whatsappGroup: group,
        storeOpen: data.storeOpen === "open",
        status: data.status,
        afaEnabled: data.afaEnabled === "on",
        afaPrice,
      },
      select: { userId: true },
    });

    // The person behind the store, edited here so an admin does not have to go
    // hunting for them under Users for a phone number.
    if (data.ownerName || ownerPhone) {
      await prisma.user.update({
        where: { id: agent.userId },
        data: {
          ...(data.ownerName ? { name: data.ownerName } : {}),
          ...(ownerPhone ? { phone: ownerPhone } : {}),
        },
      });
    }
  } catch {
    return { error: "Couldn't save those details. Please try again." };
  }

  revalidateAgents(agentId);
  revalidatePath(`/store/${slug}`);
  return { ok: true, message: "Agent details saved." };
}

/**
 * Close an agent's storefront for good.
 *
 * The person keeps their Nickimart account — being an agent is something a user
 * has, not something they are, so this removes the storefront and leaves them
 * a customer. Their prices, ledger and withdrawal history go with it; orders
 * they sold stay, unattributed, because those are the customers' records too.
 *
 * Refused while money is unsettled. A negative balance is an unpaid setup fee
 * and a positive one is commission owed; deleting either would quietly write
 * off somebody's money, which is not a thing a delete button should do.
 */
export async function deleteAgent(_prev: AgentAdminState, fd: FormData): Promise<AgentAdminState> {
  await requireAdmin();
  const agentId = str(fd, "agentId");
  if (!agentId) return { error: "Missing agent." };

  try {
    const agent = await dataDb.dataAgent.findUnique({
      where: { id: agentId },
      select: { id: true, storeName: true, balance: true },
    });
    if (!agent) return { error: "That agent no longer exists." };

    if (Math.abs(agent.balance) >= 0.01) {
      return {
        error:
          agent.balance > 0
            ? `${agent.storeName} is still owed ${formatMoney(agent.balance)}. Pay it out or adjust the balance to zero first.`
            : `${agent.storeName} still owes ${formatMoney(-agent.balance)}. Write it off with a balance adjustment first.`,
      };
    }

    const pending = await dataDb.dataAgentWithdrawal.count({
      where: { agentId, status: "pending" },
    });
    if (pending > 0) {
      return { error: "There's a withdrawal still waiting. Process or reject it first." };
    }

    await dataDb.dataAgent.delete({ where: { id: agentId } });
  } catch {
    return { error: "Couldn't remove that agent. Please try again." };
  }

  revalidateAgents(agentId);
  // Outside the try: this page is about the agent that no longer exists, so
  // staying on it means staring at a 404. redirect() works by throwing, and a
  // catch above would swallow it.
  redirect("/admin/data/agents?removed=1");
}
