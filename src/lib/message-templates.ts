/**
 * Every automatic message Nickimart sends, in one list an admin can edit.
 *
 * These used to be string literals scattered across a dozen files, which meant
 * changing a word people actually read required a developer and a deploy. They
 * are still written here — a default has to live somewhere, and somewhere in
 * the code is the only place that survives an empty database — but the text is
 * now a default rather than the last word.
 *
 * Two rules keep this honest:
 *
 *   • Only messages that are actually wired appear here. An admin editing a
 *     message that nothing sends is worse than not being able to edit it.
 *   • Placeholders are declared, so the editor can list them, fill a preview,
 *     and say plainly what happens to one that is misspelt: it is left alone,
 *     never blanked, because a message reading "sent to " is worse than one
 *     reading "sent to {{phone}}".
 *
 * Pure module: the registry, the renderer and the checks are used by the
 * server that sends and the client that edits.
 */

export type MessageScope = "data" | "retail";

export interface MessageVariable {
  name: string;
  /** What it stands for, in the admin's words. */
  note: string;
  /** A realistic value, for the preview. */
  example: string;
  /**
   * True where the sender legitimately has nothing to put here.
   *
   * A balance note on an order with no balance, a reason an admin didn't give:
   * the value is supplied, it is simply empty, and the placeholder has to
   * disappear rather than arrive in the message with its braces on. Declaring
   * it says so in the editor too, so an admin writing around it knows the
   * sentence has to read without it.
   */
  optional?: boolean;
}

export interface MessageTemplate {
  key: string;
  scope: MessageScope;
  /** The heading it sits under in the editor. */
  group: string;
  name: string;
  /** When it goes out, and to whom. */
  description: string;
  variables: MessageVariable[];
  sms: string;
  emailSubject?: string;
  /** Plain paragraphs; the send wraps them in the house shell. */
  emailBody?: string;
  /** False where the message has no email half at all. */
  hasEmail: boolean;
}

const REFERENCE: MessageVariable = {
  name: "reference",
  note: "The order reference",
  example: "ND-MU6TX665410",
};
const SITE: MessageVariable = { name: "site", note: "Nickimart's web address", example: "nickimart.com" };

export const MESSAGE_TEMPLATES: MessageTemplate[] = [
  // --- Data bundles: the buyer ---------------------------------------------
  {
    key: "bundle.dispatched",
    scope: "data",
    group: "Bundle orders",
    name: "Bundle on its way",
    description: "To the buyer, the moment a paid order reaches the provider.",
    variables: [
      { name: "size", note: "The bundle size", example: "5GB" },
      { name: "network", note: "The network", example: "MTN" },
      { name: "recipient", note: "The number being credited", example: "0241234567" },
      REFERENCE,
      SITE,
    ],
    sms: "Nickimart Data: {{size}} {{network}} for {{recipient}} is on its way. Ref {{reference}}. Track it at {{site}}/data-bundles/orders",
    emailSubject: "Your {{size}} {{network}} bundle — {{reference}}",
    emailBody:
      "Your {{size}} {{network}} bundle for {{recipient}} is on its way.\n\n" +
      "Reference {{reference}}. You can follow it at {{site}}/data-bundles/orders.",
    hasEmail: true,
  },
  {
    key: "bundle.recipient",
    scope: "data",
    group: "Bundle orders",
    name: "Bundle on its way (to the recipient)",
    description:
      "To the number being credited, when somebody bought a bundle for somebody else. SMS only.",
    variables: [
      { name: "size", note: "The bundle size", example: "5GB" },
      { name: "network", note: "The network", example: "MTN" },
      REFERENCE,
    ],
    sms: "Nickimart Data: {{size}} {{network}} is being credited to this number. Ref {{reference}}.",
    hasEmail: false,
  },
  {
    key: "bundle.delivered",
    scope: "data",
    group: "Bundle orders",
    name: "Bundle delivered",
    description: "To the buyer, when the provider confirms the bundle landed.",
    variables: [
      { name: "size", note: "The bundle size", example: "5GB" },
      { name: "network", note: "The network", example: "MTN" },
      { name: "recipient", note: "The number credited", example: "0241234567" },
      REFERENCE,
    ],
    sms: "Nickimart Data: {{size}} {{network}} has been delivered to {{recipient}}. Ref {{reference}}. Thank you!",
    emailSubject: "Delivered — {{size}} {{network}} ({{reference}})",
    emailBody:
      "Your {{size}} {{network}} bundle has been delivered to {{recipient}}.\n\n" +
      "Reference {{reference}}. Thank you for buying from Nickimart.",
    hasEmail: true,
  },
  {
    key: "bundle.failed",
    scope: "data",
    group: "Bundle orders",
    name: "Bundle could not be delivered",
    description: "To the buyer, when the provider fails an order that was paid for.",
    variables: [
      { name: "size", note: "The bundle size", example: "5GB" },
      { name: "network", note: "The network", example: "MTN" },
      { name: "recipient", note: "The number it was for", example: "0241234567" },
      { name: "amount", note: "What they paid", example: "GH₵20.80" },
      REFERENCE,
    ],
    sms: "Nickimart Data: we could not deliver {{size}} {{network}} to {{recipient}} (ref {{reference}}). Our team is on it — you will be credited or refunded {{amount}}.",
    emailSubject: "Action needed — {{reference}}",
    emailBody:
      "We could not deliver {{size}} {{network}} to {{recipient}}.\n\n" +
      "Reference {{reference}}. Our team is on it, and you will be credited or " +
      "refunded {{amount}}.",
    hasEmail: true,
  },

  // --- Data bundles: the agent ---------------------------------------------
  {
    key: "agent.credentials",
    scope: "data",
    group: "Agents",
    name: "Agent sign-in details",
    description:
      "To somebody an agent registered, once their registration is settled. Carries the password they sign in with, so it is sent once and never again.",
    variables: [
      { name: "name", note: "Their first name", example: "Ama" },
      { name: "store", note: "Their store name", example: "Ama Telecom" },
      { name: "username", note: "The email they sign in with", example: "ama@example.com" },
      { name: "password", note: "The password we generated", example: "KTVR-MPQX-47" },
      { name: "link", note: "The sign-in link", example: "https://nickimart.com/login" },
    ],
    sms: "Nickimart: your data agent account is ready. Sign in at {{link}} with {{username}} and the password {{password}}. You'll be asked to change it.",
    emailSubject: "Your Nickimart agent sign-in details",
    emailBody:
      "Hi {{name}},\n\nYour Nickimart data agent account is ready. Your store will " +
      "be {{store}}, once we've approved it.\n\nUsername: {{username}}\nPassword: " +
      "{{password}}\n\nSign in at {{link}}. We'll ask you to choose your own " +
      "password straight away — this one only works until you do.\n\nDon't share " +
      "these details with anyone.",
    hasEmail: true,
  },
  {
    key: "agent.approved",
    scope: "data",
    group: "Agents",
    name: "Agent application approved",
    description: "To an applicant when an admin approves their storefront.",
    variables: [
      { name: "name", note: "Their first name", example: "Ama" },
      { name: "store", note: "Their store name", example: "Ama Telecom" },
      { name: "storeLink", note: "Their public store address", example: "nickimart.com/store/ama" },
      { name: "code", note: "Their agent code", example: "NKM4821" },
      { name: "link", note: "The sign-in link", example: "https://nickimart.com/login" },
      {
        name: "feeNote",
        note: "What we say about their registration fee — written for us from what they were charged. Empty when there was no fee.",
        example: "Opening the store cost GH₵30, charged to your balance rather than to you.",
        optional: true,
      },
      {
        name: "howToGetIn",
        note: "How they sign in — depends on whether they chose a password",
        example: "Sign in with the password you chose.",
      },
    ],
    sms: "Nickimart: your agent application is approved. Your store is live at {{storeLink}} and your agent code is {{code}}. {{howToGetIn}}",
    emailSubject: "Your Nickimart agent account is approved",
    emailBody:
      "Hi {{name}},\n\nWelcome aboard — your application has been approved and " +
      "{{store}} is live at {{storeLink}}.\n\nYour agent code is {{code}}. " +
      "{{howToGetIn}} ({{link}})\n\n{{feeNote}}",
    hasEmail: true,
  },
  {
    key: "agent.rejected",
    scope: "data",
    group: "Agents",
    name: "Agent application declined",
    description: "To an applicant when an admin turns the application down.",
    variables: [
      { name: "name", note: "Their first name", example: "Ama" },
      {
        name: "reason",
        note: "What the admin wrote, if anything. Empty when they gave no reason.",
        example: "the store name is taken",
        optional: true,
      },
    ],
    sms: "Nickimart: we couldn't approve your agent application. {{reason}} Reply to this message if you'd like to talk it through.",
    emailSubject: "About your Nickimart agent application",
    emailBody:
      "Hi {{name}},\n\nWe couldn't approve your agent application. {{reason}}\n\n" +
      "Reply to this email if you'd like to talk it through.",
    hasEmail: true,
  },
  {
    key: "agent.setupLink",
    scope: "data",
    group: "Agents",
    name: "Password setup link",
    description: "When an admin reissues a link for an agent who cannot sign in.",
    variables: [
      { name: "name", note: "Their name", example: "Ama" },
      { name: "link", note: "The one-time link", example: "https://nickimart.com/agent-setup?token=…" },
    ],
    sms: "Nickimart: set your agent password here — {{link}}",
    emailSubject: "Set your Nickimart agent password",
    emailBody:
      "Hi {{name}},\n\nSet your Nickimart agent password here: {{link}}\n\n" +
      "The link works once and lasts seven days.",
    hasEmail: true,
  },
  {
    key: "afa.submitted",
    scope: "data",
    group: "Bundle orders",
    name: "AFA registration submitted",
    description: "To the applicant, once their AFA registration reaches the provider.",
    variables: [REFERENCE],
    sms: "Nickimart Data: your AFA registration (ref {{reference}}) has been submitted. We'll text you once it's approved.",
    hasEmail: false,
  },
  {
    key: "agent.reactivated",
    scope: "data",
    group: "Agents",
    name: "Agent account reactivated",
    description: "To an agent when an admin lifts a suspension.",
    variables: [{ name: "store", note: "Their store name", example: "Ama Telecom" }],
    sms: "Nickimart: your agent account ({{store}}) is active again. Your store is back online.",
    hasEmail: false,
  },
  {
    key: "agent.suspended",
    scope: "data",
    group: "Agents",
    name: "Agent account suspended",
    description: "To an agent when an admin suspends their storefront.",
    variables: [{ name: "store", note: "Their store name", example: "Ama Telecom" }],
    sms: "Nickimart: your agent account ({{store}}) has been suspended. Please contact support.",
    hasEmail: false,
  },
  {
    key: "withdrawal.rejected",
    scope: "data",
    group: "Agents",
    name: "Payout rejected",
    description: "To an agent when an admin turns a withdrawal down and returns the money.",
    variables: [{ name: "amount", note: "What they asked for", example: "GH\u20b5120.00" }],
    sms: "Nickimart: your withdrawal of {{amount}} could not be processed. The amount is back on your balance.",
    hasEmail: false,
  },
  {
    key: "bundle.payment-claim",
    scope: "data",
    group: "Orders",
    name: "Payment claim (to the admins)",
    description:
      "To every admin when a buyer says they were debited for an order that still reads unpaid. " +
      "The bundle is held until one of them confirms it, so this is the thing waiting on a person.",
    variables: [
      { name: "reference", note: "The order reference", example: "ND-MUY57SGF303" },
      { name: "amount", note: "What the order costs", example: "GH₵16.60" },
      { name: "bundle", note: "What was ordered", example: "3GB MTN" },
      { name: "recipient", note: "The number the data is for", example: "0554636968" },
      { name: "contact", note: "The number they say they paid with", example: "0554636968" },
      { name: "link", note: "The order in the console", example: "https://nickimart.com/admin/data/orders?q=ND-…" },
    ],
    sms: "Nickimart: {{contact}} says they were debited {{amount}} for {{reference}} ({{bundle}}) and it still reads unpaid. Confirm or reject it at {{link}}",
    emailSubject: "Payment claim — {{amount}} on {{reference}}",
    emailBody:
      "{{contact}} says {{amount}} left their wallet for order {{reference}} — {{bundle}} to {{recipient}} — " +
      "but the order still reads awaiting payment.\n\n" +
      "Check the reference in Paystack, then confirm or reject the claim here: {{link}}\n\n" +
      "The bundle will not be sent until somebody confirms it.",
    hasEmail: true,
  },
  {
    key: "withdrawal.requested",
    scope: "data",
    group: "Agents",
    name: "Withdrawal requested (to the admins)",
    description:
      "To every admin, the moment an agent asks for a payout. The money has already left their balance, so this is the thing waiting on a person.",
    variables: [
      { name: "amount", note: "What they asked for", example: "GH₵140.00" },
      { name: "store", note: "Their store name", example: "Ama Telecom" },
      { name: "agent", note: "The agent's own name", example: "Ama Mensah" },
      { name: "phone", note: "The MoMo number to pay", example: "0241234567" },
      { name: "network", note: "The MoMo network", example: "MTN" },
      { name: "link", note: "The request in the console", example: "https://nickimart.com/admin/data/withdrawals/abc" },
    ],
    sms: "Nickimart: {{store}} has requested a withdrawal of {{amount}} to {{phone}} ({{network}}). Review it at {{link}}",
    emailSubject: "Withdrawal request — {{amount}} from {{store}}",
    emailBody:
      "{{store}} ({{agent}}) has requested a withdrawal of {{amount}}.\n\n" +
      "Send it to {{phone}} on {{network}}, then mark it sent here: {{link}}",
    hasEmail: true,
  },
  {
    key: "withdrawal.sent",
    scope: "data",
    group: "Agents",
    name: "Payout sent",
    description: "To an agent when an admin marks their withdrawal sent on MoMo.",
    variables: [
      { name: "amount", note: "What was sent", example: "GH₵140.00" },
      { name: "phone", note: "The MoMo number", example: "0241234567" },
      { name: "store", note: "Their store name", example: "Ama Telecom" },
    ],
    sms: "Nickimart: {{amount}} has been sent to {{phone}}. Thank you for selling with us.",
    emailSubject: "Your Nickimart payout of {{amount}}",
    emailBody:
      "{{amount}} has been sent to {{phone}} on mobile money.\n\nThank you for " +
      "selling with Nickimart, {{store}}.",
    hasEmail: true,
  },

  // --- Retail ---------------------------------------------------------------
  {
    key: "order.confirmed",
    scope: "retail",
    group: "Orders",
    name: "Order confirmed",
    description: "To the customer when an order is paid for.",
    variables: [
      { name: "name", note: "Their first name", example: "Kofi" },
      { name: "orderNumber", note: "The order number", example: "NM-00042" },
      { name: "total", note: "The order total", example: "GH₵340.00" },
      SITE,
    ],
    sms: "Nickimart: thanks {{name}} — order {{orderNumber}} is confirmed. Total {{total}}. Track it at {{site}}/account.",
    emailSubject: "Order {{orderNumber}} confirmed",
    emailBody:
      "Thanks {{name}} — order {{orderNumber}} is confirmed.\n\nTotal {{total}}. " +
      "You can follow it in your account at {{site}}/account.",
    hasEmail: true,
  },
  {
    key: "order.arrived",
    scope: "retail",
    group: "Orders",
    name: "Order has arrived in Ghana",
    description: "To the customer when an order shipped from abroad lands.",
    variables: [
      { name: "name", note: "Their first name", example: "Kofi" },
      { name: "orderNumber", note: "The order number", example: "NM-00042" },
      { name: "point", note: "Their pickup point", example: "Adum Pickup" },
      { name: "landedAt", note: "Where in Ghana it landed", example: "Tema Port" },
      {
        name: "balanceNote",
        note: "What is still owed on collection, when shipping was left until then. Empty otherwise.",
        example: "Shipping of GH₵120.00 is due when you collect.",
        optional: true,
      },
    ],
    sms: "Nickimart: good news {{name}} — order {{orderNumber}} has arrived in Ghana at {{landedAt}}. {{balanceNote}} We'll tell you the moment it reaches {{point}}.",
    emailSubject: "Order {{orderNumber}} has arrived in Ghana",
    emailBody:
      "Hi {{name}}, your order {{orderNumber}} has landed in Ghana at " +
      "{{landedAt}}.\n\n{{balanceNote}}\n\nIt now travels to {{point}}. We'll let " +
      "you know as soon as it's ready to collect.",
    hasEmail: true,
  },
  {
    key: "order.status",
    scope: "retail",
    group: "Orders",
    name: "Order status changed",
    description:
      "To the customer on every other step of the journey — the ones that aren't arrival or hand-over.",
    variables: [
      { name: "orderNumber", note: "The order number", example: "NM-00042" },
      { name: "status", note: "The step it has reached", example: "In transit" },
    ],
    sms: "Nickimart: your order {{orderNumber}} is now \"{{status}}\". Track it in your account.",
    emailSubject: "Order {{orderNumber}}: {{status}}",
    emailBody: "Your order {{orderNumber}} status is now {{status}}.",
    hasEmail: true,
  },
  {
    key: "order.pickupCode",
    scope: "retail",
    group: "Orders",
    name: "Collection code",
    description:
      "To the customer when their order is ready to collect. Carries the code the counter asks for.",
    variables: [
      { name: "name", note: "Their first name", example: "Kofi" },
      { name: "orderNumber", note: "The order number", example: "NM-00042" },
      { name: "point", note: "Where to collect it", example: "Adum Pickup — Kumasi" },
      { name: "code", note: "The one-time collection code", example: "418 263" },
      {
        name: "hours",
        note: "The point's collection hours. Empty when it hasn't set any.",
        example: "Mon-Sat, 8am-6pm",
        optional: true,
      },
    ],
    sms: "Nickimart: {{name}}, order {{orderNumber}} is ready to collect at {{point}}. {{hours}} Your collection code is {{code}} — show it at the counter. Don't share it with anyone you aren't sending.",
    emailSubject: "Order {{orderNumber}} is ready to collect",
    emailBody:
      "Hi {{name}},\n\nOrder {{orderNumber}} is ready to collect at {{point}}. {{hours}}\n\n" +
      "Your collection code is {{code}}.\n\nShow it at the counter. The code is what proves the " +
      "parcel is yours, so only give it to somebody you are sending to collect on your behalf — " +
      "they will be asked for their name and ID as well.",
    hasEmail: true,
  },
  {
    key: "order.collected",
    scope: "retail",
    group: "Orders",
    name: "Collected by someone else",
    description:
      "To the customer the moment their parcel is released to somebody collecting on their behalf.",
    variables: [
      { name: "orderNumber", note: "The order number", example: "NM-00042" },
      { name: "point", note: "Where it was handed over", example: "Adum Pickup" },
      { name: "collector", note: "Who collected it", example: "Yaw Mensah" },
    ],
    sms: "Nickimart: order {{orderNumber}} was collected at {{point}} by {{collector}}. If that wasn't arranged by you, call us straight away.",
    emailSubject: "Order {{orderNumber}} was collected",
    emailBody:
      "Order {{orderNumber}} was collected at {{point}} by {{collector}}.\n\n" +
      "If that was not arranged by you, call us straight away.",
    hasEmail: true,
  },
  {
    key: "order.delivered",
    scope: "retail",
    group: "Orders",
    name: "Order handed over",
    description: "To the customer when their order is collected or delivered.",
    variables: [
      { name: "name", note: "Their first name", example: "Kofi" },
      { name: "orderNumber", note: "The order number", example: "NM-00042" },
      { name: "point", note: "Where it was handed over", example: "Adum Pickup" },
    ],
    sms: "Nickimart: order {{orderNumber}} has been handed over at {{point}}. Thank you for shopping with us.",
    emailSubject: "Order {{orderNumber}} delivered",
    emailBody:
      "Hi {{name}},\n\nOrder {{orderNumber}} has been handed over at {{point}}.\n\n" +
      "Thank you for shopping with Nickimart.",
    hasEmail: true,
  },
];

export function templatesFor(scope: MessageScope): MessageTemplate[] {
  return MESSAGE_TEMPLATES.filter((t) => t.scope === scope);
}

export function templateGroups(scope: MessageScope): string[] {
  return [...new Set(templatesFor(scope).map((t) => t.group))];
}

export function findTemplate(key: string): MessageTemplate | undefined {
  return MESSAGE_TEMPLATES.find((t) => t.key === key);
}

/**
 * Fill the placeholders in one piece of text.
 *
 * Two different things look alike here and must not be treated alike:
 *
 *   • A placeholder the sender said nothing about — a typo, a value the code
 *     forgot to pass. That is left exactly as written. "sent to 0241234567" is
 *     the goal; "sent to {{phone}}" is a visible mistake somebody reports;
 *     "sent to " is a mistake nobody notices, which is the worst of the three.
 *
 *   • A placeholder the sender supplied *as empty*, because there is honestly
 *     nothing to say: no balance outstanding, no reason given for a rejection.
 *     That one is removed. It used to be left alone, which is how a customer
 *     was told their order had landed "in Ghana at Sunyani CSL Consolidation.
 *     {{balanceNote}} We'll tell you the moment…".
 *
 * The difference is whether the key is present in `vars` at all, so a sender
 * with nothing to say has to say so — `balanceNote: ""` rather than leaving it
 * out — and a forgotten value still shows up loudly.
 *
 * Removing a placeholder leaves the hole it was sitting in: a doubled space
 * mid-sentence, or a paragraph of its own that is now blank. `tidyMessage`
 * closes those, so the sentence reads as though the clause was never there.
 */
export function renderMessage(text: string, vars: Record<string, string | number>): string {
  let blanked = false;
  const out = text.replace(/\{\{\s*([a-zA-Z][a-zA-Z0-9_]*)\s*\}\}/g, (whole, name: string) => {
    if (!Object.prototype.hasOwnProperty.call(vars, name)) return whole;
    const value = vars[name];
    if (value === undefined || value === null) return whole;
    const filled = String(value);
    if (filled === "") blanked = true;
    return filled;
  });
  return blanked ? tidyMessage(out) : out;
}

/**
 * Close the gap a removed placeholder leaves behind.
 *
 * Only ever run over text that actually lost something, because it is a blunt
 * instrument: it collapses runs of spaces and runs of blank lines, which is
 * right for repairing a hole and wrong as a general tidy-up of what an admin
 * deliberately typed.
 */
export function tidyMessage(text: string): string {
  return text
    // " . " and " ," — the space that belonged to the clause that went.
    .replace(/[ \t]+([.,;:!?])/g, "$1")
    // Two spaces where a word used to be.
    .replace(/[ \t]{2,}/g, " ")
    // A line that is now only whitespace is no line at all.
    .replace(/[ \t]+$/gm, "")
    .replace(/^[ \t]+$/gm, "")
    // A paragraph that emptied leaves three newlines where two belong.
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** The placeholders a piece of text actually uses. */
export function placeholdersIn(text: string): string[] {
  const found = new Set<string>();
  for (const m of text.matchAll(/\{\{\s*([a-zA-Z][a-zA-Z0-9_]*)\s*\}\}/g)) found.add(m[1]);
  return [...found];
}

/**
 * Placeholders in the text that the template does not supply.
 *
 * What the editor warns about: a typo in a placeholder name is invisible until
 * the message goes out with a brace in it, and by then it has gone out.
 */
export function unknownPlaceholders(template: MessageTemplate, text: string): string[] {
  const known = new Set(template.variables.map((v) => v.name));
  return placeholdersIn(text).filter((p) => !known.has(p));
}

/** Example values, for the preview. */
export function exampleVars(template: MessageTemplate): Record<string, string> {
  return Object.fromEntries(template.variables.map((v) => [v.name, v.example]));
}

/**
 * Ghana's networks bill an SMS per 160 characters, or per 70 once anything
 * outside the basic alphabet is in it — and a cedi sign is outside it. Worth
 * saying out loud in the editor, because the difference is the whole cost of a
 * broadcast.
 */
export function smsSegments(text: string): { length: number; segments: number; unicode: boolean } {
  const unicode = /[^\x00-\x7F]/.test(text);
  const per = unicode ? 70 : 160;
  const length = text.length;
  return { length, segments: Math.max(1, Math.ceil(length / per)), unicode };
}
