"use client";

import { useEffect, useRef } from "react";
import { AlertCircle, CheckCircle2 } from "lucide-react";

/**
 * What happened when you pressed the button, shown where you pressed it.
 *
 * Every form in the console used to put its result at the very top. On a short
 * form that is fine. On a long one — the forwarder's rate grid runs several
 * screens — you press Save at the bottom, the page appears to do nothing, and
 * the reason is sitting a thousand pixels above the fold where nobody thinks to
 * look. People concluded the button was broken.
 *
 * So the message lives beside the control that produced it, and it also brings
 * itself into view: `scrollIntoView` covers the case where the button is at the
 * bottom of the viewport and the message renders just below it, and the focus
 * move means a screen reader announces it and the next Tab starts from here
 * rather than back at the top of the document.
 *
 * `role="alert"` on the error and `role="status"` on the success are the
 * difference between "interrupt me, I got this wrong" and "for your
 * information, that worked".
 */
export function FormFeedback({
  error,
  success,
  className = "",
}: {
  error?: string;
  success?: string;
  /** Extra classes for the wrapper — spacing that belongs to the caller. */
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const message = error || success || "";

  useEffect(() => {
    if (!message) return;
    const node = ref.current;
    if (!node) return;
    // "nearest" rather than "center": the button that produced this is right
    // there, and yanking it to the middle of the screen loses that connection.
    node.scrollIntoView({ behavior: "smooth", block: "nearest" });
    node.focus({ preventScroll: true });
  }, [message]);

  if (!message) return null;

  return (
    <div
      ref={ref}
      tabIndex={-1}
      role={error ? "alert" : "status"}
      aria-live={error ? "assertive" : "polite"}
      className={`flex items-start gap-2 rounded-xl px-4 py-3 text-sm font-medium outline-none ${
        error
          ? "bg-niki-danger/10 text-niki-danger ring-1 ring-niki-danger/20"
          : "bg-niki-success/10 text-niki-success ring-1 ring-niki-success/20"
      } ${className}`}
    >
      {error ? (
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
      ) : (
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
      )}
      <span>{message}</span>
    </div>
  );
}
