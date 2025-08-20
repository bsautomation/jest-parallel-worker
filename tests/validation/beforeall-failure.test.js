/**
 * BeforeAll Hook Failure Scenarios
 * Test file where beforeAll fails - all tests should fail
 */

const fs = require('fs');
const path = require('path');

const logFile = path.join(__dirname, '../../logs/beforeall-failures.log');

describe('BeforeAll Failure Test', () => {
  const fileId = 'beforeall-fail';

  beforeAll(async () => {
    // Log the attempt
    const timestamp = new Date().toISOString();
    const logEntry = `${timestamp} - ${fileId} - beforeAll attempted - PID:${process.pid}\n`;
    
    // Ensure logs directory exists
    const logsDir = path.dirname(logFile);
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }
    
    fs.appendFileSync(logFile, logEntry);
    
    // Simulate setup work that fails
    await new Promise(resolve => setTimeout(resolve, 50));
    
    const failLog = `${new Date().toISOString()} - ${fileId} - beforeAll failing - PID:${process.pid}\n`;
    fs.appendFileSync(logFile, failLog);
    
    // This will cause beforeAll to fail
    throw new Error('BeforeAll setup failed - database connection error');
  });

  test('should fail because beforeAll failed', async () => {
    // This test should not execute due to beforeAll failure
    const timestamp = new Date().toISOString();
    const testLog = `${timestamp} - ${fileId} - test1 executed (should not happen) - PID:${process.pid}\n`;
    fs.appendFileSync(logFile, testLog);
    
    expect(true).toBe(true);
  });

  test('should also fail because beforeAll failed', async () => {
    // This test should not execute due to beforeAll failure
    const timestamp = new Date().toISOString();
    const testLog = `${timestamp} - ${fileId} - test2 executed (should not happen) - PID:${process.pid}\n`;
    fs.appendFileSync(logFile, testLog);
    
    expect(true).toBe(true);
  });

  test('all tests in this file should fail', async () => {
    // This test should not execute due to beforeAll failure
    const timestamp = new Date().toISOString();
    const testLog = `${timestamp} - ${fileId} - test3 executed (should not happen) - PID:${process.pid}\n`;
    fs.appendFileSync(logFile, testLog);
    
    expect(true).toBe(true);
  });
});
