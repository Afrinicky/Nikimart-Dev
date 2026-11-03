"use server";

import { revalidatePath } from "next/cache";
import { dataDb } from "@/lib/data-db";
import { requireDataUser } from "@/lib/data-bundles/session";
import { getAgentForUser } from "@/lib/data-bundles/agents";

/**
 * What an agent may change about the services on their own storefront.
 *
 * Three things, and nothing that belongs to anybody else: which services they
 * show, what they charge for each option, and how their flyer looks. The
 * catalogue itself is the admin's — an agent lists what Nickimart sells, at
 * their own price, exactly as they do with bundles.
 */

export type ServiceAgentState = { ok?: boolean; error?: string; message?: string };

function str(fd: FormData, key: string): string {
  return String(fd.get(key) ?? "").trim();
}

async function currentAgent() {
  const user = await requireDataUser();
  const agent = await getAgentForUser(user.id);
  if (!agent) throw new Error("Forbidden: this action is for agents.");
  return agent;
}

function refresh(slug: string) {
  revalidatePath("/agent/products");
  revalidatePath(`/store/${slug}`);
}

/** Show or hide one service on this agent's storefront. */
export async function setServiceVisible(fd: FormData): Promise<void> {
  const agent = await currentAgent();
  const serviceId = str(fd, "serviceId");
  if (!serviceId) return;
  const visible = str(fd, "visible") === "1";

  try {
    await dataDb.dataAgentService.upsert({
      where: { agentId_serviceId: { agentId: agent.id, serviceId } },
      update: { visible },
      create: { agentId: agent.id, serviceId, visible },
    });
    refresh(agent.slug);
  } catch {
    // not migrated — nothing to change
  }
}

/** Take every service off this storefront, or put the shelf back. */
export async function setServicesEnabled(fd: FormData): Promise<void> {
  const agent = await currentAgent();
  try {
    await dataDb.dataAgent.update({
      where: { id: agent.id },
      data: { servicesEnabled: str(fd, "enabled") === "1" },
    });
    refresh(agent.slug);
  } catch {
    // not migrated
  }
}

/**
 * Set what this agent charges for one option.
 *
 * Never below what Nickimart charges them: an agent who sells at a loss is
 * almost always a typo, and the commission arithmetic has nowhere to go. An
 * empty price puts the option back on Nickimart's own retail price, which is
 * the default every agent starts on.
 */
export async function saveServicePrice(
  _state: ServiceAgentState,
  fd: FormData,
): Promise<ServiceAgentState> {
  const agent = await currentAgent();
  const variantId = str(fd, "variantId");
  if (!variantId) return { error: "That option no longer exists." };

  const raw = str(fd, "price");

  try {
    const variant = await dataDb.dataServiceVariant.findUnique({
      where: { id: variantId },
      select: { agentPrice: true, price: true },
    });
    if (!variant) return { error: "That option no longer exists." };
    if (variant.agentPrice <= 0) return { error: "That option is not resold to agents." };

    if (raw === "") {
      await dataDb.dataAgentServicePrice.deleteMany({ where: { agentId: agent.id, variantId } });
      refresh(agent.slug);
      return { ok: true, message: "Back on the standard price." };
    }

    const price = Number(raw);
    if (!Number.isFinite(price) || price <= 0) return { error: "Enter a price." };
    if (price < variant.agentPrice) {
      return { error: `Your price can't be below GH₵${variant.agentPrice.toFixed(2)}.` };
    }

    const rounded = Math.round(price * 100) / 100;
    await dataDb.dataAgentServicePrice.upsert({
      where: { agentId_variantId: { agentId: agent.id, variantId } },
      update: { price: rounded },
      create: { agentId: agent.id, variantId, price: rounded },
    });
    refresh(agent.slug);
    return { ok: true, message: "Price saved." };
  } catch {
    return { error: "Couldn't save that price. Please try again." };
  }
}

/** This agent's own flyer design, layered over the admin's house design. */
export async function saveAgentServiceFlyerDesign(
  _state: ServiceAgentState,
  fd: FormData,
): Promise<ServiceAgentState> {
  const agent = await currentAgent();
  try {
    await dataDb.dataAgent.update({
      where: { id: agent.id },
      // An empty design is not a blank flyer; it is "use the house one".
      data: { serviceFlyerDesign: str(fd, "design") },
    });
    revalidatePath("/agent/products");
    return { ok: true, message: "Design saved." };
  } catch {
    return { error: "Couldn't save the design. Please try again." };
  }
}

/** Go back to the house design. */
export async function resetAgentServiceFlyerDesign(): Promise<void> {
  const agent = await currentAgent();
  try {
    await dataDb.dataAgent.update({
      where: { id: agent.id },
      data: { serviceFlyerDesign: "", serviceFlyerTheme: "" },
    });
    revalidatePath("/agent/products");
  } catch {
    // not migrated
  }
}

/** The colourway chosen in the share studio, remembered for next time. */
export async function saveAgentServiceFlyerTheme(fd: FormData): Promise<void> {
  const agent = await currentAgent();
  try {
    await dataDb.dataAgent.update({
      where: { id: agent.id },
      data: { serviceFlyerTheme: str(fd, "theme").slice(0, 40) },
    });
  } catch {
    // not migrated — the studio still drew it
  }
}
