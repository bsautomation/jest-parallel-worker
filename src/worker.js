const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Simplified approach: Use Jest programmatically for reliability
async function runSingleTest(testCase, jestConfig, jestArgs = []) {
  const startTime = Date.now();
  const currentPID = process.pid; // Capture the actual PID of this worker process
  
  // Capture initial memory usage
  const initialMemory = process.memoryUsage();
  
  // Log test start with memory info
  console.error(`[${new Date().toISOString()}] [PID: ${currentPID}] 🚀 STARTING: ${testCase.fullName} [Memory: ${formatBytes(initialMemory.heapUsed)}]`);
  
  // Start continuous memory monitoring
  const monitoringInterval = startMemoryMonitoring(currentPID, testCase.name);
  
  try {
    // Import Jest's runCLI function
    const { runCLI } = require('jest');
    
    // Save original stdout to restore later
    const originalStdoutWrite = process.stdout.write;
    const originalConsoleLog = console.log;
    let capturedOutput = '';
    
    // Redirect stdout and console.log to stderr during Jest execution
    process.stdout.write = function(chunk, encoding, callback) {
      capturedOutput += chunk;
      process.stderr.write(chunk, encoding, callback);
    };
    
    console.log = function(...args) {
      const message = args.join(' ') + '\n';
      capturedOutput += message;
      process.stderr.write(message);
    };
    
    // Log memory before test execution
    // (removed for cleaner output)
    
    // Configure Jest to run only this specific test from the original file
    const config = {
      testMatch: [testCase.file],
      testNamePattern: escapeRegex(testCase.name),
      verbose: false,
      silent: true,
      runInBand: true,
      cache: false,
      watchman: false,
      collectCoverage: false,
      testTimeout: 120000,
      forceExit: true,
      detectOpenHandles: false,
      maxWorkers: 1,
      // Redirect stdout to stderr to prevent contamination
      reporters: [['default', { silent: true }]],
      ...(jestConfig ? require(path.resolve(jestConfig)) : {})
    };

    // Run Jest programmatically
    const { results } = await runCLI(config, [process.cwd()]);
    
    // Restore original stdout and console.log
    process.stdout.write = originalStdoutWrite;
    console.log = originalConsoleLog;
    
    const duration = Date.now() - startTime;
    const success = results.success && results.numFailedTests === 0;
    
    // Capture final memory usage
    const finalMemory = process.memoryUsage();
    const memoryDelta = calculateMemoryDelta(initialMemory, finalMemory);
    
    // Log memory after test execution
    // (removed for cleaner output)
    
    // Log test completion with status and final memory
    const status = success ? '✅ PASSED' : '❌ FAILED';
    const finalHeap = formatBytes(finalMemory.heapUsed);
    console.error(`[${new Date().toISOString()}] [PID: ${currentPID}] ${status}: ${testCase.fullName} (${duration}ms) [Final Memory: ${finalHeap}]`);
    
    const result = {
      testCase,
      success,
      duration,
      pid: currentPID, // Include the actual PID
      memory: {
        initial: initialMemory,
        final: finalMemory,
        delta: memoryDelta,
        peak: finalMemory.heapUsed // Approximate peak usage
      },
      error: success ? undefined : new Error(`Test failed: ${testCase.fullName}`),
      output: capturedOutput || results.testResults[0]?.message || '',
      stderr: success ? '' : (results.testResults[0]?.failureMessage || ''),
      exitCode: success ? 0 : 1
    };
    
    // Immediately stop monitoring and prepare to exit
    clearInterval(monitoringInterval);
    
    return result;
  } catch (error) {
    // Restore stdout in case of error
    if (typeof originalStdoutWrite !== 'undefined') {
      process.stdout.write = originalStdoutWrite;
    }
    if (typeof originalConsoleLog !== 'undefined') {
      console.log = originalConsoleLog;
    }
    
    const duration = Date.now() - startTime;
    const errorMemory = process.memoryUsage();
    const memoryDelta = calculateMemoryDelta(initialMemory, errorMemory);
    
    // Log memory on error
    // (removed for cleaner output)
    
    // Log test error with memory
    const errorHeap = formatBytes(errorMemory.heapUsed);
    console.error(`[${new Date().toISOString()}] [PID: ${currentPID}] 💥 ERROR: ${testCase.fullName} (${duration}ms) [Memory: ${errorHeap}] - ${error.message}`);
    
    return {
      testCase,
      success: false,
      duration,
      pid: currentPID, // Include PID even on error
      memory: {
        initial: initialMemory,
        final: errorMemory,
        delta: memoryDelta,
        peak: errorMemory.heapUsed
      },
      error: error,
      output: '',
      stderr: error.message,
      exitCode: 1
    };
  } finally {
    // Stop memory monitoring
    clearInterval(monitoringInterval);
  }
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Memory logging utilities
function formatBytes(bytes) {
  // Handle edge cases where bytes might not be a number
  if (typeof bytes !== 'number' || isNaN(bytes)) {
    return '0 B';
  }
  
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = Math.abs(bytes); // Use absolute value for calculations
  let unitIndex = 0;
  
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  
  // Preserve the original sign
  const sign = bytes < 0 ? '-' : '';
  return `${sign}${size.toFixed(2)} ${units[unitIndex]}`;
}

function logMemoryUsage(stage, pid, memoryUsage, delta = null) {
  const timestamp = new Date().toISOString();
  const heapUsed = formatBytes(memoryUsage.heapUsed);
  const heapTotal = formatBytes(memoryUsage.heapTotal);
  const external = formatBytes(memoryUsage.external);
  const rss = formatBytes(memoryUsage.rss);
  
  console.error(`[${timestamp}] [PID: ${pid}] Memory ${stage}:`);
  console.error(`  RSS: ${rss}, Heap Used: ${heapUsed}, Heap Total: ${heapTotal}, External: ${external}`);
  
  if (delta) {
    const deltaHeap = formatBytes(Math.abs(delta.heapUsed));
    const deltaRss = formatBytes(Math.abs(delta.rss));
    const heapSign = delta.heapUsed >= 0 ? '+' : '-';
    const rssSign = delta.rss >= 0 ? '+' : '-';
    console.error(`  Delta: RSS ${rssSign}${deltaRss}, Heap ${heapSign}${deltaHeap}`);
  }
}

function calculateMemoryDelta(initial, final) {
  return {
    rss: final.rss - initial.rss,
    heapTotal: final.heapTotal - initial.heapTotal,
    heapUsed: final.heapUsed - initial.heapUsed,
    external: final.external - initial.external,
    arrayBuffers: (final.arrayBuffers || 0) - (initial.arrayBuffers || 0)
  };
}

// Continuous memory monitoring for worker processes (simplified)
function startMemoryMonitoring(pid, testName) {
  // Disabled for cleaner output - memory is logged at start and end
  return setInterval(() => {}, 60000); // Dummy interval
}

// Handle process communication
if (process.argv.includes('--run-test')) {
  const currentPID = process.pid;
  // Simplified worker startup (removed verbose logging)
  
  // This process was spawned to run a single test
  const testDataArg = process.argv.find(arg => arg.startsWith('--test-data='));
  if (testDataArg) {
    // Simplified parsing (removed verbose logging)
    
    try {
      const testData = JSON.parse(Buffer.from(testDataArg.split('=')[1], 'base64').toString());
      
      // Use the standard runner
      runSingleTest(testData.testCase, testData.jestConfig, testData.jestArgs)
        .then(result => {
          // Simplified success logging (removed verbose output)
          
          // CRITICAL: Send result to stdout with a marker for clean parsing
          const jsonResult = JSON.stringify(result);
          process.stdout.write(`__JEST_PARALLEL_RESULT_START__${jsonResult}__JEST_PARALLEL_RESULT_END__\n`);
          
          // Force immediate exit
          setTimeout(() => {
            process.exit(result.success ? 0 : 1);
          }, 100); // Give a bit more time for stdout to flush
        })
        .catch(error => {
          // Simplified error logging
          
          const errorResult = {
            testCase: testData.testCase,
            success: false,
            duration: 0,
            error: error.message,
            pid: currentPID,
            exitCode: 1
          };
          
          // Send error result to stdout (not stderr) so main process can parse it
          process.stdout.write(JSON.stringify(errorResult) + '\n');
          
          // Force exit with error code
          setTimeout(() => {
            process.exit(1);
          }, 50);
        });
        
    } catch (parseError) {
      // Simplified error handling
      forceExit(1);
    }
  } else {
    // Simplified error handling
    forceExit(1);
  }
} else {
  // Export for use in other modules (removed verbose logging)
  module.exports = {
    runSingleTest,
    runSingleTestWithEvents,
    escapeRegex
  };
}

// Force clean exit helper
function forceExit(code) {
  const currentPID = process.pid;
  console.error(`[${new Date().toISOString()}] [PID: ${currentPID}] 🚪 Forcing exit with code ${code}`);
  
  // Clear all timers and intervals
  if (typeof global !== 'undefined' && global._timeouts) {
    global._timeouts.forEach(clearTimeout);
  }
  if (typeof global !== 'undefined' && global._intervals) {
    global._intervals.forEach(clearInterval);
  }
  
  // Force garbage collection if available
  if (global.gc) {
    try {
      global.gc();
    } catch (e) {
      // Ignore GC errors
    }
  }
  
  // Close all file descriptors except stdio
  try {
    for (let fd = 3; fd < 256; fd++) {
      try {
        require('fs').closeSync(fd);
      } catch (e) {
        // Ignore close errors
      }
    }
  } catch (e) {
    // Ignore errors
  }
  
  // Multiple exit strategies to ensure the process terminates
  process.nextTick(() => process.exit(code));
  setTimeout(() => process.exit(code), 10);
  setImmediate(() => process.exit(code));
  
  // Final fallback - hard exit
  setTimeout(() => {
    console.error(`[${new Date().toISOString()}] [PID: ${currentPID}] 💀 Hard exit`);
    process.kill(process.pid, 'SIGKILL');
  }, 100);
}