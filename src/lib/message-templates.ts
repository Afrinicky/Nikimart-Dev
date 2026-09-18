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
        note: "What we say about their registration fee — written for us from what they were charged",
        example: "Opening the store cost GH₵30, charged to your balance rather than to you.",
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
      { name: "reason", note: "What the admin wrote, if anything", example: "the store name is taken" },
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
 * A placeholder with no value is left exactly as written rather than blanked.
 * A message reading "sent to 0241234567" is the goal; "sent to {{phone}}" is a
 * visible mistake somebody will report; "sent to " is a mistake nobody
 * notices, which is the worst of the three.
 */
export function renderMessage(text: string, vars: Record<string, string | number>): string {
  return text.replace(/\{\{\s*([a-zA-Z][a-zA-Z0-9_]*)\s*\}\}/g, (whole, name: string) => {
    const value = vars[name];
    return value === undefined || value === null || value === "" ? whole : String(value);
  });
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
