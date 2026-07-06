import { LogOut } from "lucide-react";
import { logoutAction } from "@/lib/auth-actions";

export function LogoutButton({ className }: { className?: string }) {
  return (
    <form action={logoutAction}>
      <button
        type="submit"
        className={
          className ??
          "flex items-center gap-2 rounded-full bg-niki-surface px-4 py-2 text-sm font-medium text-niki-ink/70 ring-1 ring-black/5 transition-colors hover:bg-niki-danger/10 hover:text-niki-danger"
        }
      >
        <LogOut className="h-4 w-4" />
        Sign out
      </button>
    </form>
  );
}
