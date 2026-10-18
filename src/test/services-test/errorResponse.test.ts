// The body api-gate reads when a generation request fails. Only the body carries the reason across the
// hop, so it must hold the message, the code and the top frames however the failure was thrown (an
// Error, or - before it was fixed - a bare string).
import { errorMessage, errorResponseBody } from '../../services/errorResponse';

describe('errorMessage', () => {
  test('reads an Error, a bare string and a bare object', () => {
    expect(errorMessage(new Error('boom'))).toBe('boom');
    expect(errorMessage('a bare string failure')).toBe('a bare string failure');
    expect(errorMessage({ a: 1 })).toBe('[object Object]');
  });
});

describe('errorResponseBody', () => {
  test('carries the message, code and top frames of a thrown Error, plus the step and extra fields', () => {
    const error = Object.assign(
      new Error('issue uploading to minio due to : The specified bucket does not exist'),
      { code: 'NoSuchBucket' }
    );

    const body = errorResponseBody(error, 'generate-content-control', {
      contentControlTitle: 'required-states-and-modes',
      runId: 'run-1',
    });

    expect(body).toMatchObject({
      message: 'issue uploading to minio due to : The specified bucket does not exist',
      code: 'NoSuchBucket',
      step: 'generate-content-control',
      contentControlTitle: 'required-states-and-modes',
      runId: 'run-1',
    });
    expect(body.stack).toMatch(/^\s+at /);
    expect(body.stack).not.toContain('bucket does not exist');
    expect(body.stack!.split('\n').length).toBeLessThanOrEqual(8);
  });

  test('still carries a message when something other than an Error was thrown, and no stack', () => {
    const body = errorResponseBody('a bare string failure', 'generate-doc-template');

    expect(body.message).toBe('a bare string failure');
    expect(body.stack).toBeUndefined();
    expect(body.code).toBeUndefined();
    expect(body.step).toBe('generate-doc-template');
  });

  test('extra fields never overwrite the message or the stack', () => {
    const body = errorResponseBody(new Error('real'), 'step', { runId: 'r' });

    expect(body.message).toBe('real');
    expect(Object.keys(body)).toEqual(expect.arrayContaining(['message', 'code', 'stack', 'step', 'runId']));
  });
});
