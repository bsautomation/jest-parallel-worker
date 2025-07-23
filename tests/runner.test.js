const { JestParallelRunner } = require('../src/core/runner');
const { Logger } = require('../src/utils/logger');

describe('JestParallelRunner Integration', () => {
  let logger;

  beforeAll(() => {
    logger = new Logger(false, true); // silent mode for tests
  });

  it('should create runner with default options', () => {
    const runner = new JestParallelRunner({ logger });
    
    expect(runner.options.mode).toBe('parallel-test');
    expect(runner.options.timeout).toBe(30000);
    expect(runner.options.maxWorkers).toBe(4);
  });

  it('should override default options', () => {
    const customOptions = {
      mode: 'parallel-file',
      timeout: 60000,
      maxWorkers: 8,
      logger
    };
    
    const runner = new JestParallelRunner(customOptions);
    
    expect(runner.options.mode).toBe('parallel-file');
    expect(runner.options.timeout).toBe(60000);
    expect(runner.options.maxWorkers).toBe(8);
  });

  it('should format duration correctly', () => {
    const runner = new JestParallelRunner({ logger });
    
    expect(runner.formatDuration(500)).toBe('500ms');
    expect(runner.formatDuration(1500)).toBe('1.5s');
    expect(runner.formatDuration(65000)).toBe('1m 5s');
  });

  it('should handle run failure gracefully', async () => {
    const runner = new JestParallelRunner({
      testMatch: 'nonexistent/**/*.test.js',
      logger
    });

    await expect(runner.run()).rejects.toThrow();
  });

  // Note: Full integration test would require actual test files
  // This is handled by the example tests and CLI usage
});
