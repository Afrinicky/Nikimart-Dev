"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/session";
import { sendSms } from "@/lib/notifications";
import { formatMoney } from "@/lib/format";
import { postLedgerEntry } from "@/lib/data-bundles/agent-ledger";
import { round2 } from "@/lib/data-bundles/agents";

/**
 * Admin actions for the sub-agent programme: suspend an agent, correct a
 * balance, process a MoMo withdrawal, publish an announcement.
 *
 * Every one guards with `requireAdmin()` — these move real money — and every
 * balance change goes through `postLedgerEntry`, so an adjustment is as
 * auditable as a commission.
 */

export type AgentAdminState = { ok?: boolean; error?: string; message?: string };

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
    const agent = await prisma.dataAgent.update({
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
          ? `NikiMart: your agent account (${agent.storeName}) is active again. Your store is back online.`
          : `NikiMart: your agent account (${agent.storeName}) has been suspended. Please contact support.`,
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
    revalidateAgents(agentId);
    return {
      ok: true,
      message: `${amount > 0 ? "Credited" : "Debited"} ${formatMoney(Math.abs(round2(amount)))}. New balance ${formatMoney(balance ?? 0)}.`,
    };
  } catch {
    return { error: STORAGE_ERROR };
  }
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
    const claimed = await prisma.dataAgentWithdrawal.updateMany({
      where: { id, status: "pending" },
      data: {
        status: "processed",
        processedBy: admin.name ?? admin.email ?? admin.id,
        processedAt: new Date(),
        adminNote: str(fd, "note"),
      },
    });
    if (claimed.count === 0) return;

    const row = await prisma.dataAgentWithdrawal.findUnique({
      where: { id },
      select: { agentId: true, amount: true, momoPhone: true },
    });
    revalidateAgents(row?.agentId);
    if (row) {
      await sendSms(
        row.momoPhone,
        `NikiMart: ${formatMoney(row.amount)} has been sent to ${row.momoPhone}. Thank you for selling with us.`,
      );
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
    const claimed = await prisma.dataAgentWithdrawal.updateMany({
      where: { id, status: "pending" },
      data: {
        status: "rejected",
        processedBy: admin.name ?? admin.email ?? admin.id,
        processedAt: new Date(),
        adminNote: str(fd, "note") || "Rejected",
      },
    });
    if (claimed.count === 0) return;

    const row = await prisma.dataAgentWithdrawal.findUnique({
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
      `NikiMart: your withdrawal of ${formatMoney(row.amount)} could not be processed. The amount is back on your balance.`,
    );
  } catch {
    // Not migrated — nothing to reverse.
  }
}

// ---------------------------------------------------------------------------
// Announcements
// ---------------------------------------------------------------------------

export async function saveAnnouncement(
  _prev: AgentAdminState,
  fd: FormData,
): Promise<AgentAdminState> {
  await requireAdmin();

  const title = str(fd, "title");
  const body = str(fd, "body");
  if (title.length < 3) return { error: "Give the announcement a title." };
  if (body.length < 5) return { error: "Write the announcement." };

  const tone = ["info", "warning", "success"].includes(str(fd, "tone")) ? str(fd, "tone") : "info";
  const id = str(fd, "id");

  try {
    if (id) {
      await prisma.dataAnnouncement.update({
        where: { id },
        data: { title, body, tone, isPinned: fd.get("isPinned") === "on" },
      });
    } else {
      await prisma.dataAnnouncement.create({
        data: { title, body, tone, isPinned: fd.get("isPinned") === "on" },
      });
    }
    revalidatePath("/admin/data/announcements");
    revalidatePath("/agent/notifications");
    return { ok: true, message: id ? "Announcement updated." : "Announcement published." };
  } catch {
    return { error: STORAGE_ERROR };
  }
}

export async function setAnnouncementActive(fd: FormData): Promise<void> {
  await requireAdmin();
  const id = str(fd, "id");
  if (!id) return;
  try {
    await prisma.dataAnnouncement.update({
      where: { id },
      data: { isActive: str(fd, "isActive") === "1" },
    });
    revalidatePath("/admin/data/announcements");
    revalidatePath("/agent/notifications");
  } catch {
    // Gone, or not migrated.
  }
}

export async function deleteAnnouncement(fd: FormData): Promise<void> {
  await requireAdmin();
  const id = str(fd, "id");
  if (!id) return;
  try {
    await prisma.dataAnnouncement.delete({ where: { id } });
    revalidatePath("/admin/data/announcements");
    revalidatePath("/agent/notifications");
  } catch {
    // Already gone.
  }
}

// ---------------------------------------------------------------------------
// Support requests
// ---------------------------------------------------------------------------

export async function resolveSupportRequest(fd: FormData): Promise<void> {
  await requireAdmin();
  const id = str(fd, "id");
  if (!id) return;
  try {
    await prisma.dataSupportRequest.update({
      where: { id },
      data: { status: "resolved", resolvedAt: new Date(), adminNote: str(fd, "note") },
    });
    revalidatePath("/admin/data/support");
  } catch {
    // Gone, or not migrated.
  }
}
