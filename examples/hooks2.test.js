// Second test file to verify file isolation
let beforeAllCounter = 0;
let afterAllCounter = 0;

// Track execution with file identifier
const executionLog = [];

describe('Hook Behavior Test Suite - File 2', () => {
  beforeAll(() => {
    beforeAllCounter++;
    const timestamp = new Date().toISOString();
    const logEntry = `[FILE2] beforeAll executed #${beforeAllCounter} at ${timestamp}`;
    executionLog.push(logEntry);
    console.log(`[HOOK] ${logEntry}`);
    
    return new Promise(resolve => setTimeout(resolve, 50));
  });

  afterAll(() => {
    afterAllCounter++;
    const timestamp = new Date().toISOString();
    const logEntry = `[FILE2] afterAll executed #${afterAllCounter} at ${timestamp}`;
    executionLog.push(logEntry);
    console.log(`[HOOK] ${logEntry}`);
    
    console.log(`[HOOK] [FILE2] Final counters - beforeAll: ${beforeAllCounter}, afterAll: ${afterAllCounter}`);
  });

  it('should have separate beforeAll counter from other files', () => {
    console.log(`[FILE2-TEST1] beforeAllCounter in this file: ${beforeAllCounter}`);
    // This file should have its own counter starting from 0
    expect(beforeAllCounter).toBe(1);
  });

  it('should verify file isolation', () => {
    console.log(`[FILE2-TEST2] beforeAllCounter in this file: ${beforeAllCounter}`);
    expect(beforeAllCounter).toBe(1); // Should still be 1 for this file
    
    // Verify our execution log is separate
    const file2Logs = executionLog.filter(log => log.includes('[FILE2]'));
    expect(file2Logs.length).toBeGreaterThan(0);
  });

  it('should maintain consistent hook behavior per file', () => {
    console.log(`[FILE2-TEST3] Execution log for this file:`, executionLog);
    expect(beforeAllCounter).toBe(1);
    
    // Verify we have exactly one beforeAll for this file
    const beforeAllLogs = executionLog.filter(log => log.includes('[FILE2] beforeAll'));
    expect(beforeAllLogs.length).toBe(1);
  });
});
