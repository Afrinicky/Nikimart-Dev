/**
 * The two-column catalogue layout: category column, then the page.
 *
 * Why this is a function rather than a class name written out twice.
 *
 * The sidebar renders nothing when it has nothing to list — an unseeded
 * database, or a catalogue where every department is empty. A two-column grid
 * whose first child has vanished does not leave a gap: it promotes the *next*
 * child into the first column. The homepage hero became a 250px ribbon down
 * the left of an otherwise empty page, which is what a live site showed
 * between the first deploy and the seed.
 *
 * So the columns are declared only when there is a sidebar to put in them.
 * Without one the children stack and each takes the full width, which is also
 * what the layout does below the `lg` breakpoint.
 */
export function catalogueGridClass(hasSidebar: boolean, gapClass: string): string {
  return hasSidebar ? `lg:grid lg:grid-cols-[15.5rem_1fr] lg:items-start ${gapClass}` : "";
}
