// Generic, structural counters over a content control's output — the manifest's steps[]
// outputSummary layer. Deliberately type-agnostic: every content-control type returns
// { title, wordObjects: [...] } from generateContentControl (controllers/index.ts), and
// this walks that shape once at the single dispatch point rather than asking each of the
// 9 factories to report its own semantic counters. See the run-manifest plan for why:
// a structural number ("0 rows" vs "412 rows") is exact about what the diff engine ranks
// on, and keeps the manifest's uniform-shape property — a new content-control type gets a
// counter for free instead of every factory needing to remember to add one.

export interface OutputSummary {
  sectionCount: number;
  rowCount: number;
  itemsOut: number;
  bytes: number;
  emptyResult: boolean;
}

const MAX_DEPTH = 8;

// Bounded, cycle-safe walk counting arrays (as row-like containers) and scalar leaves (as
// items). Never throws — this is monitoring metadata riding alongside a real document
// generation and must not be able to affect it.
function walk(value: unknown, depth: number, seen: WeakSet<object>, counts: { rows: number; items: number }): void {
  if (depth > MAX_DEPTH || value === null || value === undefined) return;
  if (typeof value !== 'object') {
    counts.items += 1;
    return;
  }
  if (seen.has(value as object)) return;
  seen.add(value as object);

  if (Array.isArray(value)) {
    if (value.length > 0) counts.rows += value.length;
    for (const entry of value) walk(entry, depth + 1, seen, counts);
    return;
  }
  for (const key of Object.keys(value as Record<string, unknown>)) {
    try {
      walk((value as Record<string, unknown>)[key], depth + 1, seen, counts);
    } catch {
      // A throwing getter on generated output is not a reason to lose the rest of the summary.
    }
  }
}

export function computeOutputSummary(contentControlData: unknown): OutputSummary {
  try {
    const wordObjects = (contentControlData as any)?.wordObjects;
    const sectionCount = Array.isArray(wordObjects) ? wordObjects.length : 0;

    const counts = { rows: 0, items: 0 };
    walk(wordObjects, 0, new WeakSet<object>(), counts);

    let bytes = 0;
    try {
      bytes = JSON.stringify(contentControlData)?.length || 0;
    } catch {
      // Circular output would already have broken writeToJson downstream; 0 is an honest
      // "couldn't measure it", not a fabricated size.
    }

    return {
      sectionCount,
      rowCount: counts.rows,
      itemsOut: counts.items,
      bytes,
      emptyResult: sectionCount === 0 || (counts.rows === 0 && counts.items === 0),
    };
  } catch {
    return { sectionCount: 0, rowCount: 0, itemsOut: 0, bytes: 0, emptyResult: true };
  }
}
