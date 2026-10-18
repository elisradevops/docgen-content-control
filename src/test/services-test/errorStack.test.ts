import { boundedStack } from '../../services/errorStack';

const withStack = (stack: string) => Object.assign(new Error('x'), { stack });

describe('boundedStack', () => {
  test('keeps frames only, without the header line that repeats the message', () => {
    const result = boundedStack(
      withStack('TypeError: x is not a function\n    at a (/app/dist/a.js:1:1)\n    at b (/app/dist/b.js:2:2)')
    );

    expect(result).toBe('    at a (/app/dist/a.js:1:1)\n    at b (/app/dist/b.js:2:2)');
    expect(result).not.toContain('TypeError');
  });

  test('drops the extra lines of a multi-line message', () => {
    const result = boundedStack(
      withStack('Error: first line\n         second line of the message\n    at a (/app/dist/a.js:1:1)')
    );

    expect(result).toBe('    at a (/app/dist/a.js:1:1)');
  });

  test('is bounded in frames and in size', () => {
    const many = withStack('Error: x\n' + Array.from({ length: 50 }, (_, i) => `    at fn${i} (/app/${'p'.repeat(400)}.js:1:1)`).join('\n'));
    const result = boundedStack(many) as string;

    expect(result.split('\n').length).toBeLessThanOrEqual(8);
    expect(result.length).toBeLessThanOrEqual(1500);
  });

  test('returns undefined for anything without a usable stack', () => {
    expect(boundedStack(undefined)).toBeUndefined();
    expect(boundedStack('a bare string')).toBeUndefined();
    expect(boundedStack({ stack: 42 })).toBeUndefined();
    expect(boundedStack(withStack('Error: no frames here'))).toBeUndefined();
  });
});
