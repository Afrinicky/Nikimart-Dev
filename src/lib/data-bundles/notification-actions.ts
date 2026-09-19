"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { dataDb } from "@/lib/data-db";
import { requireAdmin } from "@/lib/session";

/**
 * Marking notifications dealt with.
 *
 * Read is a decision, not a side effect of a page load. A notice that clears
 * itself the moment the bell is opened is a notice that can be lost by
 * glancing at it on a phone on the way to something else — so it stays unread
 * until somebody says otherwise, either by opening the thing it points at or
 * by clearing the queue outright.
 */

function revalidateNotifications() {
  revalidatePath("/admin/data");
  revalidatePath("/admin/data/notifications");
}

/** Mark one read — what opening the thing it points at does. */
export async function markNotificationRead(fd: FormData): Promise<void> {
  const admin = await requireAdmin();
  const id = String(fd.get("id") ?? "").trim();
  if (!id) return;
  try {
    await dataDb.dataNotification.updateMany({
      where: { id, readAt: null },
      data: { readAt: new Date(), readBy: admin.name ?? admin.email ?? admin.id },
    });
  } catch {
    // Gone, or not migrated.
  }
  revalidateNotifications();
}

/**
 * Open the thing a notification points at, and mark it read on the way.
 *
 * What a row in the bell does. Dealing with something is the honest signal
 * that it has been read — far better than the panel clearing itself the moment
 * it is opened, which loses a notice to a glance on the way to something else.
 */
export async function openNotification(fd: FormData): Promise<void> {
  const admin = await requireAdmin();
  const id = String(fd.get("id") ?? "").trim();
  if (!id) return;

  let href = "/admin/data/notifications";
  try {
    const row = await dataDb.dataNotification.findUnique({
      where: { id },
      select: { href: true },
    });
    if (row?.href) href = row.href;
    await dataDb.dataNotification.updateMany({
      where: { id, readAt: null },
      data: { readAt: new Date(), readBy: admin.name ?? admin.email ?? admin.id },
    });
  } catch {
    // Gone, or not migrated — still go somewhere sensible.
  }
  revalidateNotifications();
  // Outside the try: redirect() works by throwing, and a catch above would
  // swallow the navigation and leave the admin looking at the page they were on.
  redirect(href);
}

/** Put one back in the queue, for something read and not actually dealt with. */
export async function markNotificationUnread(fd: FormData): Promise<void> {
  await requireAdmin();
  const id = String(fd.get("id") ?? "").trim();
  if (!id) return;
  try {
    await dataDb.dataNotification.updateMany({
      where: { id },
      data: { readAt: null, readBy: "" },
    });
  } catch {
    // Gone, or not migrated.
  }
  revalidateNotifications();
}

/** Clear the queue. */
export async function markAllNotificationsRead(): Promise<void> {
  const admin = await requireAdmin();
  try {
    await dataDb.dataNotification.updateMany({
      where: { readAt: null },
      data: { readAt: new Date(), readBy: admin.name ?? admin.email ?? admin.id },
    });
  } catch {
    // Not migrated.
  }
  revalidateNotifications();
}
