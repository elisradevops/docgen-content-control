jest.mock('../../services/logger', () => ({
  __esModule: true,
  default: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import logger from '../../services/logger';
import { logRelayedError } from '../../services/relayedError';

describe('logRelayedError', () => {
  beforeEach(() => jest.clearAllMocks());

  test('is a warning when the data provider already reported the failure at error level', () => {
    logRelayedError('azure/projects error: boom', { adoRequest: { reported: true } });
    expect(logger.warn).toHaveBeenCalledWith('azure/projects error: boom');
    expect(logger.error).not.toHaveBeenCalled();
  });

  test.each([
    ['an ADO error the provider did not report (printError=false)', { adoRequest: { reported: false } }],
    ['an error with no request description (older provider / not an ADO error)', new Error('x')],
    ['a non-object throw', 'oops'],
    ['undefined', undefined],
  ])('stays an error for %s', (_label, err) => {
    logRelayedError('azure/projects error: boom', err);
    expect(logger.error).toHaveBeenCalledWith('azure/projects error: boom');
    expect(logger.warn).not.toHaveBeenCalled();
  });
});
