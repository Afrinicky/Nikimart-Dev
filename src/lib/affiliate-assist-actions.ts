"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser, requireAdmin } from "@/lib/session";
import { notify, emailShell } from "@/lib/notifications";
import { siteUrl } from "@/lib/site";
import {
  assistName,
  isTopic,
  statusAfterMessage,
  type AssistRole,
} from "@/lib/affiliate-assist-rules";

/**
 * Everything written while an affiliate is helping a buyer.
 *
 * Three parties write into the same two tables, so every action here starts by
 * working out which of them is calling from the session and the thread —
 * never from the form. A thread id in a form is a claim the browser makes; who
 * is allowed to write in it is not.
 *
 * Two rules hold throughout. A message sets the thread's state rather than
 * asking the author to: writing hands the thread to the other side, which is
 * why no screen has a status dropdown. And the other side is told, through the
 * same best-effort SMS/email path the rest of the platform uses, because a
 * message nobody is told about is a message nobody answers.
 */

export type AssistState = { ok?: boolean; error?: string; threadId?: string };

const MAX_BODY = 4000;
const MAX_SUBJECT = 140;

function str(fd: FormData, key: string, limit = MAX_BODY): string {
  return String(fd.get(key) ?? "").trim().slice(0, limit);
}

// ---------------------------------------------------------------------------
// Who is calling
// ---------------------------------------------------------------------------

/** The affiliate account behind the signed-in user, or null. */
async function currentAffiliate() {
  const user = await requireUser();
  const affiliate = await prisma.affiliate
    .findUnique({
      where: { userId: user.id },
      select: { id: true, name: true, status: true, phone: true, email: true, code: true },
    })
    .catch(() => null);
  return { user, affiliate };
}

interface ThreadParties {
  id: string;
  kind: string;
  status: string;
  affiliateId: string;
  customerId: string | null;
  orderId: string | null;
  subject: string;
  topic: string;
  escalatedFromId: string | null;
  affiliate: { name: string; phone: string; email: string } | null;
  customer: { id: string; name: string | null; phone: string | null; email: string } | null;
  order: { orderNumber: string } | null;
}

async function loadThread(threadId: string): Promise<ThreadParties | null> {
  if (!threadId) return null;
  return prisma.affiliateThread
    .findUnique({
      where: { id: threadId },
      select: {
        id: true,
        kind: true,
        status: true,
        affiliateId: true,
        customerId: true,
        orderId: true,
        subject: true,
        topic: true,
        escalatedFromId: true,
        affiliate: { select: { name: true, phone: true, email: true } },
        customer: { select: { id: true, name: true, phone: true, email: true } },
        order: { select: { orderNumber: true } },
      },
    })
    .catch(() => null);
}

/**
 * The role the signed-in user holds in this thread.
 *
 * An admin is support in any thread. Everybody else is whichever party they
 * are, and null if they are neither — which is the answer that stops one
 * affiliate reading another's conversation.
 */
async function roleIn(thread: ThreadParties): Promise<{ role: AssistRole; userId: string; name: string } | null> {
  const user = await requireUser();
  if (user.role === "ADMIN") {
    return { role: "support", userId: user.id, name: user.name ?? "Nickimart support" };
  }
  if (thread.customerId && thread.customerId === user.id) {
    return { role: "customer", userId: user.id, name: user.name ?? "Customer" };
  }
  const affiliate = await prisma.affiliate
    .findUnique({ where: { userId: user.id }, select: { id: true, name: true } })
    .catch(() => null);
  if (affiliate && affiliate.id === thread.affiliateId) {
    return { role: "affiliate", userId: user.id, name: affiliate.name };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Posting
// ---------------------------------------------------------------------------

function refresh(thread: { id: string; orderId: string | null }, orderNumber?: string | null) {
  revalidatePath("/affiliate");
  revalidatePath("/affiliate/messages");
  revalidatePath(`/affiliate/messages/${thread.id}`);
  revalidatePath("/affiliate/customers");
  revalidatePath("/affiliate/follow-ups");
  revalidatePath("/admin/affiliates/support");
  if (thread.orderId) revalidatePath(`/affiliate/orders/${thread.orderId}`);
  if (orderNumber) revalidatePath(`/orders/${orderNumber}`);
  revalidatePath("/orders");
}

/**
 * Write the message and move the thread with it.
 *
 * The author's own read mark is set at the same time: you have read a
 * conversation you have just written in, and leaving it unset would show an
 * affiliate their own message as something new.
 */
async function appendMessage(
  thread: ThreadParties,
  author: { role: AssistRole; userId: string; name: string },
  body: string,
  opts: { internal?: boolean; relayedFromId?: string | null } = {},
): Promise<void> {
  const now = new Date();
  const internal = Boolean(opts.internal);

  await prisma.affiliateMessage.create({
    data: {
      threadId: thread.id,
      authorId: author.userId,
      authorRole: author.role,
      authorName: author.name,
      body,
      internal,
      relayedFromId: opts.relayedFromId ?? null,
    },
  });

  // An internal note is nobody else's business, so it neither hands the thread
  // over nor shows up as the last thing said in it.
  const readMark =
    author.role === "affiliate"
      ? { affiliateReadAt: now }
      : author.role === "customer"
        ? { customerReadAt: now }
        : { supportReadAt: now };

  await prisma.affiliateThread.update({
    where: { id: thread.id },
    data: internal
      ? readMark
      : {
          ...readMark,
          lastMessageAt: now,
          lastMessageRole: author.role,
          lastMessageText: body.slice(0, 180),
          status: statusAfterMessage(thread.kind, author.role),
          ...(thread.status === "resolved" ? { resolvedAt: null, resolution: "" } : {}),
        },
  });
}

/** Tell the other side, best-effort. Never throws, never blocks the write. */
async function tell(
  thread: ThreadParties,
  author: AssistRole,
  body: string,
): Promise<void> {
  const site = siteUrl();
  const snippet = body.slice(0, 140);

  try {
    if (author === "affiliate" && thread.kind === "customer" && thread.customer) {
      const who = thread.affiliate?.name ?? "Your Nickimart helper";
      await notify(
        { phone: thread.customer.phone, email: thread.customer.email },
        {
          sms: `${who} (Nickimart) sent you a message${thread.order ? ` about ${thread.order.orderNumber}` : ""}: ${snippet}`,
          emailSubject: `A message from ${who}`,
          emailHtml: emailShell(
            `${escapeHtml(snippet)}<br><br><a href="${site}/orders">Reply on Nickimart</a>`,
            `${escapeHtml(who)} sent you a message`,
          ),
        },
      );
      return;
    }

    if (author === "customer" || (author === "support" && thread.kind === "support")) {
      const from = author === "customer" ? assistName(thread.customer?.name) : "Nickimart support";
      await notify(
        { phone: thread.affiliate?.phone ?? null, email: thread.affiliate?.email ?? null },
        {
          sms: `${from} replied${thread.order ? ` about ${thread.order.orderNumber}` : ""}: ${snippet}`,
          emailSubject: `${from} replied on Nickimart`,
          emailHtml: emailShell(
            `${escapeHtml(snippet)}<br><br><a href="${site}/affiliate/messages/${thread.id}">Open the conversation</a>`,
            `${escapeHtml(from)} replied`,
          ),
        },
      );
    }
  } catch {
    // Delivery is best-effort by design: the message is already saved and the
    // console shows it either way.
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * The one conversation for this affiliate, this customer and this order.
 *
 * Found rather than created wherever possible: a buyer with four threads about
 * one parcel has a worse time than one thread with four messages in it, and
 * the affiliate chasing it has nowhere to look.
 */
async function findOrCreateCustomerThread(input: {
  affiliateId: string;
  customerId: string;
  orderId: string | null;
  topic: string;
  subject: string;
  openedBy: AssistRole;
}): Promise<string> {
  const existing = await prisma.affiliateThread.findFirst({
    where: {
      affiliateId: input.affiliateId,
      kind: "customer",
      customerId: input.customerId,
      orderId: input.orderId,
    },
    select: { id: true },
  });
  if (existing) return existing.id;

  const created = await prisma.affiliateThread.create({
    data: {
      affiliateId: input.affiliateId,
      kind: "customer",
      customerId: input.customerId,
      orderId: input.orderId,
      topic: isTopic(input.topic) ? input.topic : "general",
      subject: input.subject.slice(0, MAX_SUBJECT),
      openedBy: input.openedBy,
      status: "open",
    },
    select: { id: true },
  });
  return created.id;
}

// ---------------------------------------------------------------------------
// The affiliate's side
// ---------------------------------------------------------------------------

/**
 * Start a conversation with somebody a link brought in, or add to the one that
 * is already open.
 *
 * Reuse is deliberate: a buyer with four threads about one parcel has a worse
 * time than one thread with four messages in it, and the affiliate chasing it
 * has nowhere to look. One conversation per customer per order, and one for
 * the customer themselves when it is not about an order.
 */
export async function openCustomerThread(_prev: AssistState, fd: FormData): Promise<AssistState> {
  const { user, affiliate } = await currentAffiliate();
  if (!affiliate) return { error: "Only an affiliate can do that." };
  if (affiliate.status === "suspended") {
    return { error: "Your affiliate account is on hold, so you can't start new conversations." };
  }

  const customerId = str(fd, "customerId", 60);
  const orderId = str(fd, "orderId", 60) || null;
  const body = str(fd, "body");
  const topic = str(fd, "topic", 40);
  if (!customerId) return { error: "Pick the customer first." };
  if (body.length < 2) return { error: "Write a message first." };

  // The link between them has to exist: an affiliate may write to somebody
  // their links brought in, and to nobody else.
  const [order, referral] = await Promise.all([
    orderId
      ? prisma.order.findFirst({
          where: { id: orderId, affiliateId: affiliate.id, userId: customerId },
          select: { id: true, orderNumber: true },
        })
      : Promise.resolve(null),
    prisma.affiliateReferral.findFirst({
      where: { affiliateId: affiliate.id, userId: customerId },
      select: { id: true },
    }),
  ]);
  const anyOrder = orderId
    ? order
    : await prisma.order.findFirst({
        where: { affiliateId: affiliate.id, userId: customerId },
        select: { id: true, orderNumber: true },
      });
  if (!anyOrder && !referral) {
    return { error: "That customer didn't come through your links." };
  }
  if (orderId && !order) return { error: "That order isn't one of yours." };

  const threadId = await findOrCreateCustomerThread({
    affiliateId: affiliate.id,
    customerId,
    orderId,
    topic,
    subject:
      str(fd, "subject", MAX_SUBJECT) ||
      (order ? `About ${order.orderNumber}` : "A message from your helper"),
    openedBy: "affiliate",
  });

  const thread = await loadThread(threadId);
  if (!thread) return { error: "Couldn't open that conversation." };

  await appendMessage(thread, { role: "affiliate", userId: user.id, name: affiliate.name }, body);
  await tell(thread, "affiliate", body);
  refresh(thread, thread.order?.orderNumber ?? null);
  return { ok: true, threadId };
}

/**
 * Add a message to a thread, as whoever is signed in.
 *
 * One action for all three parties rather than three that differ only in their
 * guard. The role comes from the thread and the session, so a customer cannot
 * post as their affiliate and an affiliate cannot post as Nickimart — which is
 * the thing that would make a "verified update" worthless.
 */
export async function postAssistMessage(_prev: AssistState, fd: FormData): Promise<AssistState> {
  const thread = await loadThread(str(fd, "threadId", 60));
  if (!thread) return { error: "That conversation no longer exists." };

  const author = await roleIn(thread);
  if (!author) return { error: "That conversation isn't yours." };

  const body = str(fd, "body");
  if (body.length < 2) return { error: "Write a message first." };

  // A customer never writes a note only they can see; the other two can.
  const internal = fd.get("internal") === "on" && author.role !== "customer";

  await appendMessage(thread, author, body, { internal });
  if (!internal) await tell(thread, author.role, body);
  refresh(thread, thread.order?.orderNumber ?? null);
  return { ok: true, threadId: thread.id };
}

/** Mark a conversation seen, so the badge is about what is actually new. */
export async function markThreadRead(threadId: string): Promise<void> {
  const thread = await loadThread(threadId);
  if (!thread) return;
  const author = await roleIn(thread);
  if (!author) return;

  const now = new Date();
  await prisma.affiliateThread
    .update({
      where: { id: thread.id },
      data:
        author.role === "affiliate"
          ? { affiliateReadAt: now }
          : author.role === "customer"
            ? { customerReadAt: now }
            : { supportReadAt: now },
    })
    .catch(() => null);
}

/** Settle a conversation. Anyone in it may; a new message reopens it. */
export async function resolveAssistThread(fd: FormData): Promise<void> {
  const thread = await loadThread(str(fd, "threadId", 60));
  if (!thread) return;
  const author = await roleIn(thread);
  if (!author) return;

  await prisma.affiliateThread
    .update({
      where: { id: thread.id },
      data: {
        status: "resolved",
        resolvedAt: new Date(),
        resolution: str(fd, "resolution", 300) || `Settled by ${author.role}`,
      },
    })
    .catch(() => null);
  refresh(thread, thread.order?.orderNumber ?? null);
}

/**
 * Hand a question to Nickimart.
 *
 * An affiliate can promise a buyer nothing about stock or a late parcel on
 * their own account, and the worst outcome of this whole feature would be
 * confident guesses relayed as fact. So an enquiry becomes a thread of its own
 * with support in it, linked back to the customer's question, and the answer
 * comes back where it can be passed on with Nickimart's name attached.
 */
export async function escalateThread(_prev: AssistState, fd: FormData): Promise<AssistState> {
  const { user, affiliate } = await currentAffiliate();
  if (!affiliate) return { error: "Only an affiliate can do that." };

  const fromId = str(fd, "threadId", 60) || null;
  const orderId = str(fd, "orderId", 60) || null;
  const body = str(fd, "body");
  const subject = str(fd, "subject", MAX_SUBJECT);
  const topic = str(fd, "topic", 40);
  const priority = ["normal", "high", "urgent"].includes(str(fd, "priority", 10))
    ? str(fd, "priority", 10)
    : "normal";
  if (body.length < 2) return { error: "Say what you need from support." };

  const from = fromId ? await loadThread(fromId) : null;
  if (fromId && (!from || from.affiliateId !== affiliate.id)) {
    return { error: "That conversation isn't yours." };
  }
  const order = orderId
    ? await prisma.order.findFirst({
        where: { id: orderId, affiliateId: affiliate.id },
        select: { id: true, orderNumber: true },
      })
    : null;
  if (orderId && !order) return { error: "That order isn't one of yours." };

  const created = await prisma.affiliateThread.create({
    data: {
      affiliateId: affiliate.id,
      kind: "support",
      customerId: from?.customerId ?? null,
      orderId: order?.id ?? from?.orderId ?? null,
      topic: isTopic(topic) ? topic : from?.topic ?? "general",
      subject: subject || from?.subject || "An enquiry from an affiliate",
      status: "waiting_support",
      priority,
      openedBy: "affiliate",
      escalatedFromId: from?.id ?? null,
    },
    select: { id: true },
  });

  const thread = await loadThread(created.id);
  if (!thread) return { error: "Couldn't raise that enquiry." };
  await appendMessage(thread, { role: "affiliate", userId: user.id, name: affiliate.name }, body);

  // Admins are told by email only. They have a queue with a count on it, and
  // an SMS per enquiry would train them to ignore it.
  try {
    const admins = await prisma.user.findMany({
      where: { role: "ADMIN" },
      select: { email: true },
      take: 20,
    });
    const site = siteUrl();
    await Promise.allSettled(
      admins.map((a) =>
        notify(
          { phone: null, email: a.email },
          {
            sms: "",
            emailSubject: `Affiliate enquiry${priority === "normal" ? "" : ` (${priority})`}: ${thread.subject}`,
            emailHtml: emailShell(
              `${escapeHtml(affiliate.name)} has raised an enquiry${order ? ` about ${order.orderNumber}` : ""}.<br><br>${escapeHtml(body.slice(0, 300))}<br><br><a href="${site}/admin/affiliates/support">Open the support queue</a>`,
              "An affiliate needs an answer",
            ),
          },
          "email",
        ),
      ),
    );
  } catch {
    // The queue is the system of record; the email is a courtesy.
  }

  refresh(thread, thread.order?.orderNumber ?? null);
  return { ok: true, threadId: created.id };
}

/**
 * Pass Nickimart's answer on to the customer, as Nickimart's answer.
 *
 * The copy points back at the message it came from, which is what lets the
 * customer's view mark it as verified. An affiliate can of course type the
 * same words themselves — but then it is their word, and the thread shows that
 * honestly.
 */
export async function relaySupportAnswer(_prev: AssistState, fd: FormData): Promise<AssistState> {
  const { user, affiliate } = await currentAffiliate();
  if (!affiliate) return { error: "Only an affiliate can do that." };

  const support = await loadThread(str(fd, "threadId", 60));
  if (!support || support.affiliateId !== affiliate.id) {
    return { error: "That enquiry isn't yours." };
  }

  const messageId = str(fd, "messageId", 60);
  const source = await prisma.affiliateMessage
    .findFirst({
      where: { id: messageId, threadId: support.id, authorRole: "support", internal: false },
      select: { id: true, body: true },
    })
    .catch(() => null);
  if (!source) return { error: "Pick the answer you want to pass on." };

  if (!support.customerId) {
    return { error: "This enquiry isn't attached to a customer, so there's nobody to pass it to." };
  }

  // Into the customer thread this was escalated from, or the one for this
  // customer and order — which is the same conversation the buyer is reading.
  const target =
    (support.escalatedFromId ? await loadThread(support.escalatedFromId) : null) ??
    (await loadThread(
      await findOrCreateCustomerThread({
        affiliateId: affiliate.id,
        customerId: support.customerId,
        orderId: support.orderId,
        topic: support.topic,
        subject: support.subject || "An update from Nickimart",
        openedBy: "affiliate",
      }),
    ));
  if (!target) return { error: "Couldn't find a conversation to pass this into." };

  const note = str(fd, "body");
  const body = note ? `${note}\n\n— Nickimart: ${source.body}` : source.body;

  await appendMessage(
    target,
    { role: "affiliate", userId: user.id, name: affiliate.name },
    body.slice(0, MAX_BODY),
    { relayedFromId: source.id },
  );
  await tell(target, "affiliate", body);
  refresh(target, target.order?.orderNumber ?? null);
  return { ok: true, threadId: target.id };
}

/** Tick an outstanding action off. It comes back if the state moves on. */
export async function handleFollowUp(fd: FormData): Promise<void> {
  const { affiliate } = await currentAffiliate();
  if (!affiliate) return;

  const key = str(fd, "key", 200);
  if (!key) return;

  await prisma.affiliateFollowUp
    .upsert({
      where: { affiliateId_key: { affiliateId: affiliate.id, key } },
      update: { handledAt: new Date(), note: str(fd, "note", 300) },
      create: {
        affiliateId: affiliate.id,
        key,
        kind: str(fd, "kind", 40),
        orderId: str(fd, "orderId", 60) || null,
        threadId: str(fd, "followThreadId", 60) || null,
        note: str(fd, "note", 300),
      },
    })
    .catch(() => null);

  revalidatePath("/affiliate");
  revalidatePath("/affiliate/follow-ups");
}

// ---------------------------------------------------------------------------
// The customer's side
// ---------------------------------------------------------------------------

/**
 * A buyer writing to the affiliate who referred them.
 *
 * Reached from their own order page, which is where somebody is standing when
 * they wonder where their parcel is. The thread is found or created from the
 * order, so the buyer never has to know what an affiliate is — only that
 * somebody recommended this to them and can be asked about it.
 */
export async function messageMyAffiliate(_prev: AssistState, fd: FormData): Promise<AssistState> {
  const user = await requireUser();
  const body = str(fd, "body");
  if (body.length < 2) return { error: "Write your message first." };

  const orderNumber = str(fd, "orderNumber", 40);
  const order = await prisma.order
    .findFirst({
      where: { orderNumber, userId: user.id },
      select: { id: true, orderNumber: true, affiliateId: true },
    })
    .catch(() => null);
  if (!order) return { error: "We couldn't find that order." };
  if (!order.affiliateId) return { error: "This order didn't come through a Nickimart helper." };

  const threadId = await findOrCreateCustomerThread({
    affiliateId: order.affiliateId,
    customerId: user.id,
    orderId: order.id,
    topic: str(fd, "topic", 40) || "delivery",
    subject: `About ${order.orderNumber}`,
    openedBy: "customer",
  });

  const thread = await loadThread(threadId);
  if (!thread) return { error: "Couldn't start that conversation." };

  await appendMessage(thread, { role: "customer", userId: user.id, name: user.name ?? "Customer" }, body);
  await tell(thread, "customer", body);
  refresh(thread, order.orderNumber);
  return { ok: true, threadId };
}

// ---------------------------------------------------------------------------
// Nickimart's side
// ---------------------------------------------------------------------------

/** Answer an affiliate's enquiry. */
export async function answerEnquiry(_prev: AssistState, fd: FormData): Promise<AssistState> {
  const admin = await requireAdmin();
  const thread = await loadThread(str(fd, "threadId", 60));
  if (!thread) return { error: "That enquiry no longer exists." };
  if (thread.kind !== "support") return { error: "That isn't an enquiry." };

  const body = str(fd, "body");
  if (body.length < 2) return { error: "Write an answer first." };

  await appendMessage(
    thread,
    { role: "support", userId: admin.id, name: admin.name ?? "Nickimart support" },
    body,
    { internal: fd.get("internal") === "on" },
  );
  if (fd.get("internal") !== "on") await tell(thread, "support", body);
  refresh(thread, thread.order?.orderNumber ?? null);
  return { ok: true, threadId: thread.id };
}

/** Move an enquiry up or down the queue. */
export async function setEnquiryPriority(fd: FormData): Promise<void> {
  await requireAdmin();
  const id = str(fd, "threadId", 60);
  const priority = str(fd, "priority", 10);
  if (!id || !["normal", "high", "urgent"].includes(priority)) return;
  await prisma.affiliateThread.update({ where: { id }, data: { priority } }).catch(() => null);
  revalidatePath("/admin/affiliates/support");
}

/** Close an enquiry, with a line on how it ended. */
export async function closeEnquiry(fd: FormData): Promise<void> {
  const admin = await requireAdmin();
  const thread = await loadThread(str(fd, "threadId", 60));
  if (!thread) return;

  await prisma.affiliateThread
    .update({
      where: { id: thread.id },
      data: {
        status: "resolved",
        resolvedAt: new Date(),
        resolution: str(fd, "resolution", 300) || `Closed by ${admin.name ?? "support"}`,
      },
    })
    .catch(() => null);
  refresh(thread, thread.order?.orderNumber ?? null);
}
