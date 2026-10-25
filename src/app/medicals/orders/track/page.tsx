import type { Metadata } from "next";
import { ContentPage, ContentSection } from "@/components/medical/ui/ContentPage";
import { TrackForm } from "@/components/medical/quotations/TrackForm";
import { MedicalLink } from "@/components/medical/ui/MedicalLink";

export const metadata: Metadata = {
  title: "Track a request or order",
  robots: { index: false, follow: false },
};

/**
 * Finding something again when the confirmation email has been lost.
 *
 * The link in that email is still the quickest way back; this is for the
 * person who no longer has it, and for the colleague it was forwarded to.
 */
export default function TrackPage() {
  return (
    <ContentPage
      title="Track a request or order"
      lede="Enter the reference and the email address it was sent with."
      crumbs={[{ href: "/medicals", label: "Home" }, { label: "Track" }]}
    >
      <TrackForm />

      <ContentSection title="If you have an account">
        <p>
          Requests you sent while signed in are listed in{" "}
          <MedicalLink
            href="/medicals/account"
            className="medi-focus rounded font-semibold text-medi-teal-700 hover:underline"
          >
            your account
          </MedicalLink>
          . A request sent without signing in is not attached to an account —
          this page, or the link in its confirmation, is the way back to it.
        </p>
      </ContentSection>
    </ContentPage>
  );
}
