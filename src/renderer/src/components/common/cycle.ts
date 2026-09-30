/**
 * Returns the item `step` positions away from `current`, wrapping around at both
 * ends (roving focus in tab lists, toolbars and radio groups). When `current` is
 * not in the list, a positive step yields the first item and a negative step the
 * last one (Home / End). An empty list yields `current` itself.
 */
export function cycleItem<T>(items: readonly T[], current: T, step: number): T {
  const index = items.indexOf(current);
  const start = index === -1 && step < 0 ? 0 : index;
  return items[(((start + step) % items.length) + items.length) % items.length] ?? current;
}
