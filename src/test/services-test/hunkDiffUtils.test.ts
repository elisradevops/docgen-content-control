import { alignByKey, pairAdjacentReplacements, buildHunks, Aligned } from '../../services/hunkDiffUtils';

describe('hunkDiffUtils', () => {
  describe('alignByKey', () => {
    it('matches items in order by an exact key', () => {
      const baseline = [{ id: 'a', v: 1 }, { id: 'b', v: 2 }, { id: 'c', v: 3 }];
      const compareTo = [{ id: 'a', v: 1 }, { id: 'b', v: 20 }, { id: 'c', v: 3 }];
      const aligned = alignByKey(baseline, compareTo, (x) => x.id);
      expect(aligned.map((a) => a.status)).toEqual(['matched', 'matched', 'matched']);
      expect(aligned[1].baseline).toEqual({ id: 'b', v: 2 });
      expect(aligned[1].compareTo).toEqual({ id: 'b', v: 20 });
    });

    it('reports a pure removal and a pure addition', () => {
      const baseline = [{ id: 'a' }, { id: 'b' }];
      const compareTo = [{ id: 'a' }, { id: 'c' }];
      const aligned = alignByKey(baseline, compareTo, (x) => x.id);
      expect(aligned.map((a) => a.status)).toEqual(['matched', 'removed', 'added']);
      expect(aligned[1].baseline).toEqual({ id: 'b' });
      expect(aligned[2].compareTo).toEqual({ id: 'c' });
    });

    it('survives an insertion earlier in the sequence without misaligning later items', () => {
      // Mirrors the real-world case this was built for: a step inserted elsewhere in a test
      // case must not shift which later step a stable id matches to.
      const baseline = [{ id: '1' }, { id: '2' }, { id: '3' }];
      const compareTo = [{ id: '1' }, { id: 'new' }, { id: '2' }, { id: '3' }];
      const aligned = alignByKey(baseline, compareTo, (x) => x.id);
      const matchedThree = aligned.find((a) => a.status === 'matched' && a.baseline?.id === '3');
      expect(matchedThree?.compareTo).toEqual({ id: '3' });
      expect(aligned.some((a) => a.status === 'added' && a.compareTo?.id === 'new')).toBe(true);
    });

    it('disambiguates duplicate keys within one side by occurrence instead of crashing or cross-wiring', () => {
      const baseline = [{ id: 'x', v: 'first' }, { id: 'x', v: 'second' }];
      const compareTo = [{ id: 'x', v: 'first' }, { id: 'x', v: 'second-edited' }];
      const aligned = alignByKey(baseline, compareTo, (x) => x.id);
      expect(aligned[0].status).toBe('matched');
      expect(aligned[0].baseline?.v).toBe('first');
      expect(aligned[0].compareTo?.v).toBe('first');
      // second occurrence of the duplicate key still gets its own, correctly-ordered match
      expect(aligned[1].status).toBe('matched');
      expect(aligned[1].baseline?.v).toBe('second');
      expect(aligned[1].compareTo?.v).toBe('second-edited');
    });

    it('does not collide a shorter key with a longer key that happens to look like key+occurrence', () => {
      // If keys were disambiguated with a printable separator like ' ' instead of NUL, key
      // "foo" at occurrence 1 ("foo 1") could collide with a distinct key "foo 1" at its own
      // occurrence 1 ("foo 1 1" vs "foo 1" only differ if a printable separator is reused as
      // part of real content) - NUL-separation keeps these fully distinct regardless.
      const baseline = [{ id: 'foo' }, { id: 'foo 1' }];
      const compareTo = [{ id: 'foo' }, { id: 'foo 1' }];
      const aligned = alignByKey(baseline, compareTo, (x) => x.id);
      // Both items independently and correctly match their own counterpart, rather than being
      // cross-wired or merged into one group.
      expect(aligned.filter((a) => a.status === 'matched')).toHaveLength(2);
      const matchedFoo = aligned.find((a) => a.baseline?.id === 'foo');
      expect(matchedFoo?.compareTo).toEqual({ id: 'foo' });
      const matchedFooOne = aligned.find((a) => a.baseline?.id === 'foo 1');
      expect(matchedFooOne?.compareTo).toEqual({ id: 'foo 1' });
    });

    it('treats a missing/empty key as its own group rather than throwing', () => {
      const baseline = [{ id: '' }, { id: '' }];
      const compareTo = [{ id: '' }];
      expect(() => alignByKey(baseline, compareTo, (x) => x.id)).not.toThrow();
      const aligned = alignByKey(baseline, compareTo, (x) => x.id);
      expect(aligned.filter((a) => a.status === 'matched')).toHaveLength(1);
      expect(aligned.filter((a) => a.status === 'removed')).toHaveLength(1);
    });
  });

  describe('pairAdjacentReplacements', () => {
    it('merges an adjacent removed+added pair into one replaced entry', () => {
      const aligned: Aligned<string>[] = [
        { status: 'matched', baseline: 'same', compareTo: 'same' },
        { status: 'removed', baseline: 'old row' },
        { status: 'added', compareTo: 'new row' },
      ];
      const merged = pairAdjacentReplacements(aligned);
      expect(merged).toEqual([
        { status: 'matched', baseline: 'same', compareTo: 'same' },
        { status: 'replaced', baseline: 'old row', compareTo: 'new row' },
      ]);
    });

    it('leaves a removed and an added entry separate when they are not adjacent', () => {
      const aligned: Aligned<string>[] = [
        { status: 'removed', baseline: 'gone' },
        { status: 'matched', baseline: 'same', compareTo: 'same' },
        { status: 'added', compareTo: 'new' },
      ];
      expect(pairAdjacentReplacements(aligned).map((a) => a.status)).toEqual(['removed', 'matched', 'added']);
    });
  });

  describe('buildHunks', () => {
    const item = (status: Aligned<number>['status'], v: number): Aligned<number> & { changed?: boolean } => ({
      status,
      baseline: v,
      compareTo: v,
    });

    it('shows a single change with context on each side and collapses a long unchanged run', () => {
      // 10 matched items, only index 5 changed.
      const items = Array.from({ length: 10 }, (_, i) => ({ ...item('matched', i), changed: i === 5 }));
      const hunks = buildHunks(items, (it: any) => it.changed, { contextSize: 1 });
      expect(hunks.map((h) => h.type)).toEqual(['collapsed', 'shown', 'collapsed']);
      expect(hunks[0].items).toHaveLength(4); // indices 0-3
      expect(hunks[1].items.map((it: any) => it.baseline)).toEqual([4, 5, 6]); // context, change, context
      expect(hunks[2].items).toHaveLength(3); // indices 7-9
    });

    it('merges overlapping context windows from two nearby changes into one hunk', () => {
      // Gaps of 4 on each side of the two changes keep the collapsed runs at/above
      // minCollapse, isolating the window-merge behavior from the separate short-run folding.
      const items = Array.from({ length: 12 }, (_, i) => ({
        ...item('matched', i),
        changed: i === 5 || i === 7,
      }));
      const hunks = buildHunks(items, (it: any) => it.changed, { contextSize: 1 });
      // context windows [4,6] and [6,8] touch at index 6 - one shown hunk, not two.
      expect(hunks.map((h) => h.type)).toEqual(['collapsed', 'shown', 'collapsed']);
      const shown = hunks.find((h) => h.type === 'shown')!;
      expect(shown.items.map((it: any) => it.baseline)).toEqual([4, 5, 6, 7, 8]);
    });

    it('stops context at the array boundary, folding a shorter-than-minCollapse trailing run in', () => {
      const items = [
        { ...item('matched', 0), changed: true },
        { ...item('matched', 1), changed: false },
        { ...item('matched', 2), changed: false },
      ];
      const hunks = buildHunks(items, (it: any) => it.changed, { contextSize: 1 });
      // Only 1 context item is pulled in by contextSize on the right (index 1); index 2 is a
      // trailing unchanged run of length 1, below minCollapse (3), so it folds into the same
      // shown hunk rather than becoming its own (not worth a marker to hide one item).
      expect(hunks).toHaveLength(1);
      expect(hunks[0].type).toBe('shown');
      expect(hunks[0].items.map((it: any) => it.baseline)).toEqual([0, 1, 2]);
    });

    it('does not collapse a short unchanged run (below minCollapse) - shows it instead', () => {
      // Two changes 2 apart: [changed, ctx, ctx, changed] - the 2-item gap is shorter than the
      // default minCollapse (3), so nothing collapses at all.
      const items = [
        { ...item('matched', 0), changed: true },
        { ...item('matched', 1), changed: false },
        { ...item('matched', 2), changed: false },
        { ...item('matched', 3), changed: true },
      ];
      const hunks = buildHunks(items, (it: any) => it.changed, { contextSize: 1 });
      expect(hunks).toHaveLength(1);
      expect(hunks[0].type).toBe('shown');
      expect(hunks[0].items).toHaveLength(4);
    });

    it('collapses the entire list to one marker when nothing changed anywhere, regardless of size', () => {
      // A short (2-row) but fully unchanged table nested in a field: even though its length is
      // below minCollapse, there is no "shown" content anywhere to fold this run into, so
      // duplicating it in full would serve no purpose - it must still collapse.
      const items = [
        { ...item('matched', 0), changed: false },
        { ...item('matched', 1), changed: false },
      ];
      const hunks = buildHunks(items, (it: any) => it.changed, { contextSize: 1 });
      expect(hunks).toHaveLength(1);
      expect(hunks[0].type).toBe('collapsed');
      expect(hunks[0].items).toHaveLength(2);
    });

    it('always shows removed/added/replaced items regardless of isChanged', () => {
      const items: Array<Aligned<number>> = [
        { status: 'matched', baseline: 0, compareTo: 0 },
        { status: 'removed', baseline: 1 },
        { status: 'matched', baseline: 2, compareTo: 2 },
      ];
      const hunks = buildHunks(items, () => false, { contextSize: 0 });
      const removedHunk = hunks.find((h) => h.items.some((it) => it.status === 'removed'));
      expect(removedHunk?.type).toBe('shown');
    });
  });
});
