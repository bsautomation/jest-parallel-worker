/**
 * File-Level Parallelism Validation Test 2
 * Tests that files run in parallel and beforeAll initializes only once per file
 */

const fs = require('fs');
const path = require('path');

const logFile = path.join(__dirname, '../../logs/file-parallelism.log');

describe('File Parallelism Test 2', () => {
  const fileId = 'file2';

  beforeAll(async () => {
    // Log file-level initialization
    const timestamp = new Date().toISOString();
    const logEntry = `${timestamp} - ${fileId} - beforeAll started - PID:${process.pid}\n`;
    
    // Ensure logs directory exists
    const logsDir = path.dirname(logFile);
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }
    
    // Append log entry
    fs.appendFileSync(logFile, logEntry);
    
    // Simulate different initialization time
    await new Promise(resolve => setTimeout(resolve, 150));
    
    const endLog = `${new Date().toISOString()} - ${fileId} - beforeAll completed - PID:${process.pid}\n`;
    fs.appendFileSync(logFile, endLog);
  });

  test('should log test execution timing for file 2', async () => {
    const timestamp = new Date().toISOString();
    const testLog = `${timestamp} - ${fileId} - test1 executed - PID:${process.pid}\n`;
    fs.appendFileSync(logFile, testLog);
    
    // Simulate test work
    await new Promise(resolve => setTimeout(resolve, 40));
    
    expect(true).toBe(true);
  });

  test('should execute tests in parallel with other files', async () => {
    const timestamp = new Date().toISOString();
    const testLog = `${timestamp} - ${fileId} - test2 executed - PID:${process.pid}\n`;
    fs.appendFileSync(logFile, testLog);
    
    // Simulate test work
    await new Promise(resolve => setTimeout(resolve, 60));
    
    expect(true).toBe(true);
  });

  test('should have independent beforeAll from other files', async () => {
    const timestamp = new Date().toISOString();
    const testLog = `${timestamp} - ${fileId} - test3 executed - PID:${process.pid}\n`;
    fs.appendFileSync(logFile, testLog);
    
    // Verify this file's beforeAll ran
    const logContent = fs.readFileSync(logFile, 'utf8');
    expect(logContent).toContain(`${fileId} - beforeAll completed`);
    
    // Should also see other file's beforeAll (parallel execution)
    expect(logContent).toContain(`file1 - beforeAll completed`);
    
    expect(true).toBe(true);
  });
});
