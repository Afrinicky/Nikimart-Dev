import { LogOut } from "lucide-react";
import { logoutAction } from "@/lib/auth-actions";

/**
 * Sign out. `label` is a prop because the admin sidebar collapses to icons —
 * there the button keeps its title and loses its words, and a component that
 * hard-codes "Sign out" cannot do that.
 */
export function LogoutButton({
  className,
  label = "Sign out",
}: {
  className?: string;
  label?: string;
}) {
  return (
    <form action={logoutAction} className="contents">
      <button
        type="submit"
        title={label || "Sign out"}
        className={
          className ??
          "flex items-center gap-2 rounded-xl bg-niki-surface px-4 py-2 text-sm font-medium text-niki-ink/70 ring-1 ring-niki-edge-control transition-colors hover:bg-niki-danger/10 hover:text-niki-danger"
        }
      >
        <LogOut className="h-4 w-4" />
        {label || null}
      </button>
    </form>
  );
}
