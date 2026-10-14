/**
 * What a workspace is, and which one a path belongs to.
 *
 * Split out from lib/workspaces — which reads the database and is therefore
 * server-only — because the switcher that renders these is a client component
 * and needs the type and the matching rule. A pure module can cross that line;
 * a server-only one cannot, and importing one from a client component fails the
 * build rather than at runtime, which is the right place for it to fail.
 */

export type WorkspaceIcon = "store" | "signal" | "gift" | "shield" | "user";

export interface Workspace {
  key: string;
  label: string;
  /** What it is, in three or four words, for the switcher's menu. */
  hint: string;
  href: string;
  icon: WorkspaceIcon;
}

/**
 * Which workspace a path belongs to.
 *
 * Longest match wins, so "/admin/data" is the bundle console rather than the
 * retail one it sits inside.
 */
export function activeWorkspace(pathname: string, spaces: Workspace[]): string | null {
  let best: Workspace | null = null;
  for (const space of spaces) {
    if (pathname === space.href || pathname.startsWith(`${space.href}/`)) {
      if (!best || space.href.length > best.href.length) best = space;
    }
  }
  return best?.key ?? null;
}
