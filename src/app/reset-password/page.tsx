import { redirect } from "next/navigation";

// Password reset now uses a 6-digit OTP on /forgot-password. Old link-based
// URLs land here and are sent to the OTP flow.
export default function ResetPasswordRedirect() {
  redirect("/forgot-password");
}
