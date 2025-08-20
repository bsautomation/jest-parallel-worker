/**
 * Mixed Test Results Scenario
 * Test file with a mix of passing and failing tests
 */

const fs = require('fs');
const path = require('path');

const logFile = path.join(__dirname, '../../logs/mixed-results.log');

describe('Mixed Test Results', () => {
  const fileId = 'mixed-results';
  let sharedData;

  beforeAll(async () => {
    // Log successful initialization
    const timestamp = new Date().toISOString();
    const logEntry = `${timestamp} - ${fileId} - beforeAll started - PID:${process.pid}\n`;
    
    // Ensure logs directory exists
    const logsDir = path.dirname(logFile);
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }
    
    // Clear previous log
    fs.writeFileSync(logFile, '');
    fs.appendFileSync(logFile, logEntry);
    
    // Successful setup
    await new Promise(resolve => setTimeout(resolve, 90));
    
    sharedData = {
      initialized: true,
      testData: {
        validNumbers: [1, 2, 3, 4, 5],
        config: { strict: true }
      }
    };
    
    const endLog = `${new Date().toISOString()} - ${fileId} - beforeAll completed (mixed results expected) - PID:${process.pid}\n`;
    fs.appendFileSync(logFile, endLog);
  });

  test('should PASS - basic math validation', async () => {
    const timestamp = new Date().toISOString();
    const testLog = `${timestamp} - ${fileId} - test1 executed - PID:${process.pid}\n`;
    fs.appendFileSync(logFile, testLog);
    
    await new Promise(resolve => setTimeout(resolve, 40));
    
    // This should pass
    expect(sharedData.testData.validNumbers.length).toBe(5);
    expect(2 + 2).toBe(4);
    
    const passLog = `${new Date().toISOString()} - ${fileId} - test1 PASSED - PID:${process.pid}\n`;
    fs.appendFileSync(logFile, passLog);
  });

  test('should FAIL - intentional assertion failure', async () => {
    const timestamp = new Date().toISOString();
    const testLog = `${timestamp} - ${fileId} - test2 executed - PID:${process.pid}\n`;
    fs.appendFileSync(logFile, testLog);
    
    await new Promise(resolve => setTimeout(resolve, 25));
    
    const failLog = `${new Date().toISOString()} - ${fileId} - test2 about to FAIL - PID:${process.pid}\n`;
    fs.appendFileSync(logFile, failLog);
    
    // This will fail
    expect(sharedData.testData.validNumbers).toHaveLength(10);
  });

  test('should PASS - array validation', async () => {
    const timestamp = new Date().toISOString();
    const testLog = `${timestamp} - ${fileId} - test3 executed - PID:${process.pid}\n`;
    fs.appendFileSync(logFile, testLog);
    
    await new Promise(resolve => setTimeout(resolve, 30));
    
    // This should pass
    expect(sharedData.testData.validNumbers).toContain(3);
    expect(sharedData.testData.config.strict).toBe(true);
    
    const passLog = `${new Date().toISOString()} - ${fileId} - test3 PASSED - PID:${process.pid}\n`;
    fs.appendFileSync(logFile, passLog);
  });

  test('should FAIL - string comparison error', async () => {
    const timestamp = new Date().toISOString();
    const testLog = `${timestamp} - ${fileId} - test4 executed - PID:${process.pid}\n`;
    fs.appendFileSync(logFile, testLog);
    
    await new Promise(resolve => setTimeout(resolve, 20));
    
    const failLog = `${new Date().toISOString()} - ${fileId} - test4 about to FAIL - PID:${process.pid}\n`;
    fs.appendFileSync(logFile, failLog);
    
    // This will fail - wrong comparison
    expect('hello').toBe('world');
  });

  test('should PASS - boolean validation', async () => {
    const timestamp = new Date().toISOString();
    const testLog = `${timestamp} - ${fileId} - test5 executed - PID:${process.pid}\n`;
    fs.appendFileSync(logFile, testLog);
    
    await new Promise(resolve => setTimeout(resolve, 15));
    
    // This should pass
    expect(sharedData.initialized).toBe(true);
    expect(typeof sharedData.testData).toBe('object');
    
    const passLog = `${new Date().toISOString()} - ${fileId} - test5 PASSED - PID:${process.pid}\n`;
    fs.appendFileSync(logFile, passLog);
  });

  test('should FAIL - undefined access', async () => {
    const timestamp = new Date().toISOString();
    const testLog = `${timestamp} - ${fileId} - test6 executed - PID:${process.pid}\n`;
    fs.appendFileSync(logFile, testLog);
    
    await new Promise(resolve => setTimeout(resolve, 10));
    
    const failLog = `${new Date().toISOString()} - ${fileId} - test6 about to FAIL - PID:${process.pid}\n`;
    fs.appendFileSync(logFile, failLog);
    
    // This will fail - accessing undefined property
    expect(sharedData.testData.nonExistent.value).toBeDefined();
  });

  test('should PASS - final validation', async () => {
    const timestamp = new Date().toISOString();
    const testLog = `${timestamp} - ${fileId} - test7 executed - PID:${process.pid}\n`;
    fs.appendFileSync(logFile, testLog);
    
    await new Promise(resolve => setTimeout(resolve, 35));
    
    // Read log and verify mixed results are recorded
    const logContent = fs.readFileSync(logFile, 'utf8');
    expect(logContent).toContain('beforeAll completed');
    expect(logContent).toContain('test1 PASSED');
    expect(logContent).toContain('test3 PASSED');
    expect(logContent).toContain('test5 PASSED');
    
    const passLog = `${new Date().toISOString()} - ${fileId} - test7 PASSED (validation complete) - PID:${process.pid}\n`;
    fs.appendFileSync(logFile, passLog);
  });
});
