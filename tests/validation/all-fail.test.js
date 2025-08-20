/**
 * All Tests Fail Scenario
 * Test file where all tests fail for different reasons
 */

const fs = require('fs');
const path = require('path');

const logFile = path.join(__dirname, '../../logs/all-fail.log');

describe('All Tests Fail', () => {
  const fileId = 'all-fail';
  let sharedData;

  beforeAll(async () => {
    // Log initialization (this succeeds)
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
    await new Promise(resolve => setTimeout(resolve, 60));
    
    sharedData = {
      initialized: true,
      failureMode: true
    };
    
    const endLog = `${new Date().toISOString()} - ${fileId} - beforeAll completed (but tests will fail) - PID:${process.pid}\n`;
    fs.appendFileSync(logFile, endLog);
  });

  test('should fail with assertion error', async () => {
    const timestamp = new Date().toISOString();
    const testLog = `${timestamp} - ${fileId} - test1 executed - PID:${process.pid}\n`;
    fs.appendFileSync(logFile, testLog);
    
    await new Promise(resolve => setTimeout(resolve, 25));
    
    const failLog = `${new Date().toISOString()} - ${fileId} - test1 about to fail - PID:${process.pid}\n`;
    fs.appendFileSync(logFile, failLog);
    
    // This assertion will fail
    expect(2 + 2).toBe(5);
  });

  test('should fail with undefined reference', async () => {
    const timestamp = new Date().toISOString();
    const testLog = `${timestamp} - ${fileId} - test2 executed - PID:${process.pid}\n`;
    fs.appendFileSync(logFile, testLog);
    
    await new Promise(resolve => setTimeout(resolve, 15));
    
    const failLog = `${new Date().toISOString()} - ${fileId} - test2 about to fail - PID:${process.pid}\n`;
    fs.appendFileSync(logFile, failLog);
    
    // This will cause a reference error
    expect(nonExistentVariable).toBeDefined();
  });

  test('should fail with thrown error', async () => {
    const timestamp = new Date().toISOString();
    const testLog = `${timestamp} - ${fileId} - test3 executed - PID:${process.pid}\n`;
    fs.appendFileSync(logFile, testLog);
    
    await new Promise(resolve => setTimeout(resolve, 35));
    
    const failLog = `${new Date().toISOString()} - ${fileId} - test3 about to fail - PID:${process.pid}\n`;
    fs.appendFileSync(logFile, failLog);
    
    // Explicitly throw an error
    throw new Error('This test intentionally fails');
  });

  test('should fail with async rejection', async () => {
    const timestamp = new Date().toISOString();
    const testLog = `${timestamp} - ${fileId} - test4 executed - PID:${process.pid}\n`;
    fs.appendFileSync(logFile, testLog);
    
    await new Promise(resolve => setTimeout(resolve, 20));
    
    const failLog = `${new Date().toISOString()} - ${fileId} - test4 about to fail - PID:${process.pid}\n`;
    fs.appendFileSync(logFile, failLog);
    
    // Create a rejected promise
    await Promise.reject(new Error('Async operation failed'));
  });
});
