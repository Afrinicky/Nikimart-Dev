import "server-only";
import bcrypt from "bcryptjs";
import { dataDb } from "@/lib/data-db";
import { siteUrl } from "@/lib/site";
import { temporaryPassword } from "@/lib/data-bundles/temp-password";
import { notifyTemplate } from "@/lib/messages";

/**
 * Sending somebody the account they never signed up for.
 *
 * An agent registered from another agent's console has not filled in a form,
 * so there is nobody to have chosen a password. Rather than send them a link
 * to come and choose one — which is a second errand, and one that expires —
 * they are sent a username and a working password, and the console makes them
 * replace it the first time they use it.
 *
 * Two rules hold this together, and both are about the same risk: a password
 * that exists before anybody has paid for the registration it belongs to.
 *
 *   • Nothing goes out until the registration is settled. For a fee clearing
 *     from commission that is the moment it is registered; for one being paid
 *     at a gateway it is the moment the money lands, and not when the checkout
 *     opens.
 *   • It goes out exactly once. The guarded write below is what makes that
 *     true: a webhook and a redirect settling the same payment within a second
 *     of each other would otherwise generate two passwords and send both, and
 *     only the second would work.
 *
 * The plaintext lives in this function and in the message. It is never stored.
 */

export async function issueAgentCredentials(applicationId: string): Promise<boolean> {
  const application = await dataDb.dataAgentApplication
    .findUnique({
      where: { id: applicationId },
      select: {
        id: true,
        firstName: true,
        fullName: true,
        email: true,
        phone: true,
        storeName: true,
        desiredSlug: true,
        note: true,
        passwordIsTemporary: true,
        credentialsSentAt: true,
      },
    })
    .catch(() => null);

  // Nothing to do for a public signup: that applicant chose their own password
  // and already knows it.
  if (!application?.passwordIsTemporary) return false;
  if (application.credentialsSentAt) return false;

  const password = temporaryPassword();
  const claimed = await dataDb.dataAgentApplication
    .updateMany({
      where: { id: applicationId, credentialsSentAt: null, passwordIsTemporary: true },
      data: { passwordHash: await bcrypt.hash(password, 10), credentialsSentAt: new Date() },
    })
    .catch(() => ({ count: 0 }));
  // Somebody else got there first; their password is the one that works and
  // the one that was sent.
  if (claimed.count === 0) return false;

  // The words are the admin's — see the Messages tab. Only the facts are
  // supplied here, and the password is one of them, which is why this send
  // happens exactly once.
  await notifyTemplate(
    { phone: application.phone, email: application.email },
    "agent.credentials",
    {
      name: application.firstName || application.fullName,
      store: application.storeName || application.desiredSlug,
      username: application.email,
      password,
      link: `${siteUrl()}/login?callbackUrl=%2Fagent`,
    },
  );

  return true;
}
