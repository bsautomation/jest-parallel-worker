// Test to verify beforeAll/afterAll hook behavior
let beforeAllCounter = 0;
let afterAllCounter = 0;
let beforeEachCounter = 0;
let afterEachCounter = 0;

// Track execution order and times
const executionLog = [];

describe('Hook Behavior Test Suite', () => {
  beforeAll(() => {
    beforeAllCounter++;
    const timestamp = new Date().toISOString();
    const logEntry = `beforeAll executed #${beforeAllCounter} at ${timestamp}`;
    executionLog.push(logEntry);
    console.log(`[HOOK] ${logEntry}`);
    
    // Add a small delay to make timing visible
    return new Promise(resolve => setTimeout(resolve, 100));
  });

  afterAll(() => {
    afterAllCounter++;
    const timestamp = new Date().toISOString();
    const logEntry = `afterAll executed #${afterAllCounter} at ${timestamp}`;
    executionLog.push(logEntry);
    console.log(`[HOOK] ${logEntry}`);
    
    // Log final counters
    console.log(`[HOOK] Final counters - beforeAll: ${beforeAllCounter}, afterAll: ${afterAllCounter}, beforeEach: ${beforeEachCounter}, afterEach: ${afterEachCounter}`);
  });

  beforeEach(() => {
    beforeEachCounter++;
    const timestamp = new Date().toISOString();
    const logEntry = `beforeEach executed #${beforeEachCounter} at ${timestamp}`;
    executionLog.push(logEntry);
    console.log(`[HOOK] ${logEntry}`);
  });

  afterEach(() => {
    afterEachCounter++;
    const timestamp = new Date().toISOString();
    const logEntry = `afterEach executed #${afterEachCounter} at ${timestamp}`;
    executionLog.push(logEntry);
    console.log(`[HOOK] ${logEntry}`);
  });

  it('should verify beforeAll ran only once - test 1', () => {
    console.log(`[TEST 1] beforeAllCounter: ${beforeAllCounter}`);
    expect(beforeAllCounter).toBe(1);
    expect(executionLog.length).toBeGreaterThan(0);
  });

  it('should verify beforeAll ran only once - test 2', () => {
    console.log(`[TEST 2] beforeAllCounter: ${beforeAllCounter}`);
    expect(beforeAllCounter).toBe(1); // Should still be 1
    expect(beforeEachCounter).toBeGreaterThanOrEqual(2); // Should be 2 by now
  });

  it('should verify beforeAll ran only once - test 3', () => {
    console.log(`[TEST 3] beforeAllCounter: ${beforeAllCounter}`);
    expect(beforeAllCounter).toBe(1); // Should still be 1
    expect(beforeEachCounter).toBeGreaterThanOrEqual(3); // Should be 3 by now
  });

  it('should verify hook execution order', () => {
    console.log(`[TEST 4] Execution log:`, executionLog);
    
    // Verify beforeAll was the first hook to execute
    expect(executionLog[0]).toContain('beforeAll executed #1');
    
    // Verify we have beforeEach calls
    const beforeEachLogs = executionLog.filter(log => log.includes('beforeEach'));
    expect(beforeEachLogs.length).toBeGreaterThanOrEqual(4);
    
    // Verify only one beforeAll execution
    const beforeAllLogs = executionLog.filter(log => log.includes('beforeAll'));
    expect(beforeAllLogs.length).toBe(1);
  });

  it('should have consistent hook counters across all tests', () => {
    console.log(`[TEST 5] Current counters - beforeAll: ${beforeAllCounter}, beforeEach: ${beforeEachCounter}`);
    
    // beforeAll should only run once for the entire file
    expect(beforeAllCounter).toBe(1);
    
    // beforeEach should run once per test (5 tests total)
    expect(beforeEachCounter).toBe(5);
  });
});
