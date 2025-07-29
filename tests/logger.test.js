const { Logger } = require('../src/utils/logger');

describe('Logger', () => {
  let originalConsole;
  let mockConsole;

  beforeEach(() => {
    originalConsole = {
      log: console.log,
      warn: console.warn,
      error: console.error
    };
    
    mockConsole = {
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    };
    
    console.log = mockConsole.log;
    console.warn = mockConsole.warn;
    console.error = mockConsole.error;
  });

  afterEach(() => {
    console.log = originalConsole.log;
    console.warn = originalConsole.warn;
    console.error = originalConsole.error;
  });

  it('should create logger with default settings', () => {
    const logger = new Logger();
    expect(logger.verbose).toBe(false);
    expect(logger.silent).toBe(false);
  });

  it('should respect silent mode', () => {
    const logger = new Logger(false, true);
    logger.log('test message');
    logger.info('test info');
    logger.success('test success');
    logger.warn('test warning');
    
    expect(mockConsole.log).not.toHaveBeenCalled();
    expect(mockConsole.warn).not.toHaveBeenCalled();
  });

  it('should always show errors even in silent mode', () => {
    const logger = new Logger(false, true);
    logger.error('test error');
    
    expect(mockConsole.error).toHaveBeenCalled();
  });

  it('should show debug messages only in verbose mode', () => {
    const verboseLogger = new Logger(true, false);
    const normalLogger = new Logger(false, false);
    
    verboseLogger.debug('verbose debug');
    normalLogger.debug('normal debug');
    
    expect(mockConsole.log).toHaveBeenCalledTimes(1);
  });

  it('should format worker messages correctly', () => {
    const logger = new Logger(false, false);
    logger.worker(1, 'test worker message');
    
    expect(mockConsole.log).toHaveBeenCalled();
    const logCall = mockConsole.log.mock.calls[0][0];
    expect(logCall).toContain('WORKER-1');
    expect(logCall).toContain('PID:');
    expect(logCall).toContain('MEM:');
  });

  it('should track memory usage', () => {
    const logger = new Logger();
    const memUsage = logger.getMemoryUsage();
    
    expect(memUsage).toHaveProperty('rss');
    expect(memUsage).toHaveProperty('heapTotal');
    expect(memUsage).toHaveProperty('heapUsed');
    expect(memUsage).toHaveProperty('external');
    expect(typeof memUsage.rss).toBe('number');
  });

  it('should format messages with timestamp and metadata', () => {
    const logger = new Logger(false, false);
    logger.info('test message');
    
    const logCall = mockConsole.log.mock.calls[0][0];
    expect(logCall).toContain('[INFO]');
    expect(logCall).toContain('test message');
    expect(logCall).toMatch(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/); // timestamp
    expect(logCall).toContain('PID:');
    expect(logCall).toContain('MEM:');
  });
});
