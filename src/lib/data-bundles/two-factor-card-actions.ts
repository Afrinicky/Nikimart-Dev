import type { TwoFactorActions } from "@/components/auth/TwoFactorSettings";
import { dataLogoutAction } from "@/lib/data-bundles/sign-in-actions";
import {
  confirmDataTwoFactorSetup,
  disableDataTwoFactor,
  startDataTwoFactorSetup,
} from "@/lib/data-bundles/two-factor-actions";

/**
 * What the bundle consoles hand to the shared two-step card.
 *
 * Its own module so the settings page stays a list of what it renders rather
 * than a list of imports, and so there is one obvious place to look when
 * asking which database that switch writes.
 *
 * "Sign out everywhere" is the bundle sign-out: it clears this account's
 * `activeSessionId` here, which is what ends every token out there. Pointing
 * it at the mall's would have signed them out of a different business.
 */
export const BUNDLE_TWO_FACTOR_ACTIONS: TwoFactorActions = {
  start: startDataTwoFactorSetup,
  confirm: confirmDataTwoFactorSetup,
  disable: disableDataTwoFactor,
  signOutEverywhere: dataLogoutAction,
};
