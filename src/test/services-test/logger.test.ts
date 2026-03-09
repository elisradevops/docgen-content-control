import logger from '../../services/logger';

describe('logger service', () => {
  it('creates a logger instance and formats a basic log line', () => {
    expect(logger).toBeDefined();
    expect(typeof (logger as any).info).toBe('function');
    logger.info('logger-format-smoke');
  });
});
