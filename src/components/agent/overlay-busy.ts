"use client";

/**
 * Whether something is already in front of the agent.
 *
 * Two things want the screen the moment somebody logs in for the first time:
 * the announcement they have to acknowledge, and the walkthrough that teaches
 * them the console. Both appeared at once — the tour's dim landed on top of the
 * notice, and "Got it" could not be clicked at all.
 *
 * So they queue. Whatever is showing marks the screen busy; anything that wants
 * it waits its turn. One line of shared state rather than either component
 * knowing the other exists.
 */

const open = new Set<string>();
const listeners = new Set<() => void>();

export const overlayBusy = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  get(): boolean {
    return open.size > 0;
  },
  /** Server snapshot: nothing is on screen until the browser says so. */
  none(): boolean {
    return false;
  },
  set(key: string, busy: boolean) {
    const had = open.size > 0;
    if (busy) open.add(key);
    else open.delete(key);
    if (had !== open.size > 0) listeners.forEach((l) => l());
  },
};
