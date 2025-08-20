/**
 * Test-Level Parallelism Validation
 * Tests that individual tests within a file can run in parallel
 * Uses test.concurrent to enable intra-file parallelism
 */

const fs = require('fs');
const path = require('path');

const logFile = path.join(__dirname, '../../logs/test-parallelism.log');

describe('Test-Level Parallelism', () => {
  const fileId = 'test-level';

  beforeAll(async () => {
    // Log file-level initialization
    const timestamp = new Date().toISOString();
    const logEntry = `${timestamp} - ${fileId} - beforeAll started - PID:${process.pid}\n`;
    
    // Ensure logs directory exists
    const logsDir = path.dirname(logFile);
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }
    
    // Clear previous log
    fs.writeFileSync(logFile, '');
    
    // Append log entry
    fs.appendFileSync(logFile, logEntry);
    
    const endLog = `${new Date().toISOString()} - ${fileId} - beforeAll completed - PID:${process.pid}\n`;
    fs.appendFileSync(logFile, endLog);
  });

  // These tests should run concurrently within the same file
  test.concurrent('concurrent test 1 - should run in parallel', async () => {
    const startTime = Date.now();
    const timestamp = new Date().toISOString();
    const testLog = `${timestamp} - ${fileId} - concurrent-test-1 started - PID:${process.pid}\n`;
    fs.appendFileSync(logFile, testLog);
    
    // Simulate work that takes time
    await new Promise(resolve => setTimeout(resolve, 200));
    
    const endTime = Date.now();
    const endLog = `${new Date().toISOString()} - ${fileId} - concurrent-test-1 completed (${endTime - startTime}ms) - PID:${process.pid}\n`;
    fs.appendFileSync(logFile, endLog);
    
    expect(true).toBe(true);
  });

  test.concurrent('concurrent test 2 - should run in parallel', async () => {
    const startTime = Date.now();
    const timestamp = new Date().toISOString();
    const testLog = `${timestamp} - ${fileId} - concurrent-test-2 started - PID:${process.pid}\n`;
    fs.appendFileSync(logFile, testLog);
    
    // Simulate work that takes time
    await new Promise(resolve => setTimeout(resolve, 180));
    
    const endTime = Date.now();
    const endLog = `${new Date().toISOString()} - ${fileId} - concurrent-test-2 completed (${endTime - startTime}ms) - PID:${process.pid}\n`;
    fs.appendFileSync(logFile, endLog);
    
    expect(true).toBe(true);
  });

  test.concurrent('concurrent test 3 - should run in parallel', async () => {
    const startTime = Date.now();
    const timestamp = new Date().toISOString();
    const testLog = `${timestamp} - ${fileId} - concurrent-test-3 started - PID:${process.pid}\n`;
    fs.appendFileSync(logFile, testLog);
    
    // Simulate work that takes time
    await new Promise(resolve => setTimeout(resolve, 150));
    
    const endTime = Date.now();
    const endLog = `${new Date().toISOString()} - ${fileId} - concurrent-test-3 completed (${endTime - startTime}ms) - PID:${process.pid}\n`;
    fs.appendFileSync(logFile, endLog);
    
    expect(true).toBe(true);
  });

  test.concurrent('concurrent test 4 - should run in parallel', async () => {
    const startTime = Date.now();
    const timestamp = new Date().toISOString();
    const testLog = `${timestamp} - ${fileId} - concurrent-test-4 started - PID:${process.pid}\n`;
    fs.appendFileSync(logFile, testLog);
    
    // Simulate work that takes time
    await new Promise(resolve => setTimeout(resolve, 120));
    
    const endTime = Date.now();
    const endLog = `${new Date().toISOString()} - ${fileId} - concurrent-test-4 completed (${endTime - startTime}ms) - PID:${process.pid}\n`;
    fs.appendFileSync(logFile, endLog);
    
    expect(true).toBe(true);
  });

  // This regular test runs after all concurrent tests complete
  test('should verify concurrent execution happened', async () => {
    // Wait a bit to ensure all concurrent tests are done
    await new Promise(resolve => setTimeout(resolve, 100));
    
    const logContent = fs.readFileSync(logFile, 'utf8');
    const lines = logContent.split('\n');
    
    // Find start times of concurrent tests
    const startTimes = lines
      .filter(line => line.includes('started'))
      .map(line => {
        const match = line.match(/^(.+?) -/);
        return match ? new Date(match[1]).getTime() : 0;
      })
      .filter(time => time > 0);
    
    // Verify that tests started close together (indicating parallelism)
    if (startTimes.length >= 4) {
      const minTime = Math.min(...startTimes);
      const maxTime = Math.max(...startTimes);
      const timeDiff = maxTime - minTime;
      
      // Tests should start within 100ms of each other if running concurrently
      expect(timeDiff).toBeLessThan(100);
      
      console.log(`Concurrent test time spread: ${timeDiff}ms`);
    }
    
    expect(logContent).toContain('concurrent-test-1 started');
    expect(logContent).toContain('concurrent-test-2 started');
    expect(logContent).toContain('concurrent-test-3 started');
    expect(logContent).toContain('concurrent-test-4 started');
  });
});
