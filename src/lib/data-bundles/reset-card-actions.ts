import type { OtpResetActions } from "@/components/auth/OtpResetFlow";
import {
  requestDataResetOtp,
  resetDataPasswordWithOtp,
} from "@/lib/data-bundles/reset-actions";

/**
 * What the bundle side hands to the shared reset flow.
 *
 * Its own module so the page stays a list of what it renders, and so there is
 * one obvious place to look when asking which database a reset writes.
 */
export const BUNDLE_RESET_ACTIONS: OtpResetActions = {
  request: requestDataResetOtp,
  reset: resetDataPasswordWithOtp,
  signInHref: "/agent-login",
};
