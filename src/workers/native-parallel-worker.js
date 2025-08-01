// Worker that runs tests in parallel without rewriting files
// Uses Jest's native capabilities for parallel execution
const path = require('path');
const { spawn } = require('child_process');

async function runTestsNatively(config) {
  const startTime = Date.now();
  
  try {
    // Determine the execution strategy based on config
    if (config.strategy === 'enhanced-file-parallelism') {
      // Run file with Jest's internal parallelism for intra-file parallelism
      return await runFileWithMaxParallelism(config, startTime);
    } else if (config.strategy === 'individual-tests' && config.testNames && config.testNames.length > 0) {
      // Run individual tests using Jest's testNamePattern (legacy approach)
      return await runIndividualTests(config, startTime);
    } else {
      // Run entire file with Jest's parallel capabilities
      return await runFileWithParallelism(config, startTime);
    }
  } catch (error) {
    return {
      status: 'failed',
      testResults: [{
        testId: `${config.filePath}:error`,
        testName: 'Execution Error',
        status: 'failed',
        duration: Date.now() - startTime,
        error: error.message,
        workerId: config.workerId,
        filePath: config.filePath
      }],
      error: error.message,
      workerId: config.workerId,
      filePath: config.filePath
    };
  }
}

async function runIndividualTests(config, startTime) {
  // Run specific tests using Jest's testNamePattern
  const results = [];
  
  for (const testName of config.testNames) {
    const testResult = await runSingleTest(config, testName, startTime);
    results.push(...testResult.testResults);
  }
  
  return {
    status: results.every(r => r.status === 'passed') ? 'passed' : 'failed',
    testResults: results,
    duration: Date.now() - startTime,
    workerId: config.workerId,
    filePath: config.filePath
  };
}

async function runIndividualTests(config, startTime) {
  // For intra-file parallelism with proper beforeAll/afterAll handling,
  // we need to run the file in a way that respects Jest's lifecycle hooks
  // but still achieves parallelism across different test files
  
  // The better approach is to run each test file in its own Jest process
  // but use Jest's internal parallelism for tests within the file
  // This is actually what the runFileWithParallelism function does
  
  // Redirect to file-level execution with Jest's internal parallelism
  return await runFileWithMaxParallelism(config, startTime);
}

async function runFileWithMaxParallelism(config, startTime) {
  // IMPORTANT NOTE: Jest's test.concurrent() has a limitation where concurrent tests
  // may start before beforeAll() completes, breaking the expected hook semantics.
  // For now, we fall back to standard file execution which preserves hook behavior
  // but limits intra-file parallelism to what the test file explicitly defines.
  
  // TODO: Implement proper intra-file parallelism that respects beforeAll/afterAll
  // This would require either:
  // 1. Custom Jest test runner that handles concurrent execution with proper hook sequencing
  // 2. Transform tests to use a custom parallel execution framework
  // 3. Use Jest's worker_threads API directly
  
  return await runFileWithParallelism(config, startTime);
}

async function runFileWithConcurrentTransformation(config, startTime) {
  const fs = require('fs').promises;
  const path = require('path');
  const os = require('os');
  
  return new Promise(async (resolve, reject) => {
    let tempFilePath = null;
    
    try {
      // Read the original test file
      const originalContent = await fs.readFile(config.filePath, 'utf8');
      
      // Transform regular test() calls to test.concurrent() calls
      const transformedContent = transformTestsToConcurrent(originalContent);
      
      // Create a temporary file with the transformed content
      const tempDir = path.join(process.cwd(), 'tests'); // Use tests directory
      const fileName = path.basename(config.filePath);
      const tempFileName = `jest-parallel-${Date.now()}-${Math.random().toString(36).substr(2, 9)}-${fileName}`;
      tempFilePath = path.join(tempDir, tempFileName);
      
      await fs.writeFile(tempFilePath, transformedContent, 'utf8');
      
      // Calculate optimal concurrency for this file
      const testCount = config.testCount || 4;
      const maxConcurrency = Math.min(
        testCount, // One concurrent test per test if possible
        config.maxWorkers || 4, // Don't exceed configured max
        require('os').cpus().length // Don't exceed CPU cores
      );
      
      const jestArgs = [
        tempFilePath,
        '--verbose',
        '--no-coverage',
        '--passWithNoTests=false',
        '--forceExit',
        '--detectOpenHandles',
        '--maxConcurrency', maxConcurrency.toString()
      ];
      
      const worker = spawn('npx', ['jest', ...jestArgs], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { 
          ...process.env,
          NODE_OPTIONS: '--max-old-space-size=4096'
        },
        cwd: process.cwd()
      });
      
      let output = '';
      let errorOutput = '';
      let hasResolved = false;
      
      worker.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      worker.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });
      
      const handleExit = async (code) => {
        if (hasResolved) return;
        hasResolved = true;
        
        // Clean up the temporary file
        try {
          if (tempFilePath) {
            await fs.unlink(tempFilePath);
          }
        } catch (cleanupError) {
          // Ignore cleanup errors
        }
        
        // Debug output to understand what happened
        if (code !== 0) {
          console.error('Jest execution failed with code:', code);
          console.error('Error output:', errorOutput);
          console.error('Standard output:', output);
        }
        
        const testResults = parseJestOutput(errorOutput, config);
        
        resolve({
          status: code === 0 ? 'passed' : 'failed',
          testResults,
          output,
          errorOutput,
          duration: Date.now() - startTime,
          workerId: config.workerId,
          filePath: config.filePath,
          exitCode: code,
          strategy: 'enhanced-file-parallelism-concurrent',
          concurrency: maxConcurrency,
          tempFile: tempFilePath
        });
      };
      
      worker.on('close', handleExit);
      worker.on('exit', handleExit);
      
      worker.on('error', async (error) => {
        if (hasResolved) return;
        hasResolved = true;
        
        // Clean up the temporary file
        try {
          if (tempFilePath) {
            await fs.unlink(tempFilePath);
          }
        } catch (cleanupError) {
          // Ignore cleanup errors
        }
        
        reject(error);
      });
      
      // Set timeout
      const timeout = config.timeout || 25000;
      setTimeout(async () => {
        if (!worker.killed && !hasResolved) {
          worker.kill('SIGTERM');
          setTimeout(async () => {
            if (!worker.killed && !hasResolved) {
              hasResolved = true;
              worker.kill('SIGKILL');
              
              // Clean up the temporary file
              try {
                if (tempFilePath) {
                  await fs.unlink(tempFilePath);
                }
              } catch (cleanupError) {
                // Ignore cleanup errors
              }
              
              reject(new Error('Test execution timeout'));
            }
          }, 2000);
        }
      }, timeout);
      
    } catch (error) {
      // Clean up the temporary file in case of error
      try {
        if (tempFilePath) {
          await fs.unlink(tempFilePath);
        }
      } catch (cleanupError) {
        // Ignore cleanup errors
      }
      
      reject(error);
    }
  });
}

function transformTestsToConcurrent(content) {
  // Transform regular test() and it() calls to test.concurrent() and it.concurrent()
  // This regex handles various whitespace and formatting scenarios
  
  let transformed = content;
  
  // Transform test() calls
  transformed = transformed.replace(
    /(\s*)(test|it)\s*\(\s*(['"`][^'"`]*['"`]\s*,\s*)/g,
    '$1$2.concurrent($3'
  );
  
  // Handle cases where test() is already concurrent (avoid double transformation)
  transformed = transformed.replace(
    /(test|it)\.concurrent\.concurrent\(/g,
    '$1.concurrent('
  );
  
  // Add a comment to indicate transformation
  const header = `// This file has been automatically transformed by jest-parallel-worker for intra-file parallelism\n// Original file: ${arguments[1] || 'unknown'}\n// All test() and it() calls have been converted to test.concurrent() and it.concurrent()\n\n`;
  
  return header + transformed;
}

async function runTestsInParallel(config, startTime) {
  // This function is no longer used with the concurrent transformation approach
  // but kept for backwards compatibility
  return await runFileWithConcurrentTransformation(config, startTime);
}

async function runSingleTestOptimized(config, startTime) {
  // This function is no longer used with the concurrent transformation approach
  // but kept for backwards compatibility
  return await runFileWithParallelism(config, startTime);
}

// Helper function to escape regex special characters
function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function runFileWithParallelism(config, startTime) {
  return new Promise((resolve, reject) => {
    // Calculate optimal worker count for this file
    const testCount = config.testCount || 4; // Default assumption
    const maxWorkersForFile = Math.min(
      Math.max(2, Math.ceil(testCount / 2)), // At least 2, but scale with test count
      config.maxWorkers || 4 // Don't exceed configured max
    );
    
    const jestArgs = [
      // Use the full file path for more reliable test discovery
      config.filePath,
      '--verbose',
      '--no-coverage',
      '--passWithNoTests=false',
      '--forceExit',
      '--detectOpenHandles',
      '--maxWorkers', maxWorkersForFile.toString(),
      // Override testMatch to include any test files regardless of location
      '--testMatch', '**/*.test.js',
      '--testMatch', '**/*.spec.js'
      // No --runInBand to enable Jest's internal parallelism
    ];
    
    const worker = spawn('npx', ['jest', ...jestArgs], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { 
        ...process.env,
        NODE_OPTIONS: '--max-old-space-size=4096'
      },
      cwd: process.cwd()
    });
    
    let output = '';
    let errorOutput = '';
    let hasResolved = false;
    
    worker.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    worker.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });
    
    const handleExit = (code) => {
      if (hasResolved) return;
      hasResolved = true;
      
      const testResults = parseJestOutput(errorOutput, config);
      
      resolve({
        status: code === 0 ? 'passed' : 'failed',
        testResults,
        output,
        errorOutput,
        duration: Date.now() - startTime,
        workerId: config.workerId,
        filePath: config.filePath,
        exitCode: code,
        strategy: 'file-parallelism',
        jestWorkers: maxWorkersForFile
      });
    };
    
    worker.on('close', handleExit);
    worker.on('exit', handleExit);
    
    worker.on('error', (error) => {
      if (hasResolved) return;
      hasResolved = true;
      reject(error);
    });
    
    // Set timeout
    const timeout = config.timeout || 25000;
    setTimeout(() => {
      if (!worker.killed && !hasResolved) {
        worker.kill('SIGTERM');
        setTimeout(() => {
          if (!worker.killed && !hasResolved) {
            hasResolved = true;
            worker.kill('SIGKILL');
            reject(new Error('Test execution timeout'));
          }
        }, 2000);
      }
    }, timeout);
  });
}

function parseJestOutput(output, config, specificTestName = null) {
  const testResults = [];
  const lines = output.split('\n');
  let currentSuite = '';
  let currentFailedTest = null;
  let collectingError = false;
  let errorLines = [];
  let beforeAllFailure = null; // Track beforeAll hook failures
  
  // First pass: collect test results (pass/fail status) and detect hook failures
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmedLine = line.trim();
    
    // Detect beforeAll hook failures
    const beforeAllMatch = line.match(/●\s+(.+?)\s+›\s+beforeAll/i);
    if (beforeAllMatch) {
      const suiteName = beforeAllMatch[1].trim();
      beforeAllFailure = {
        suite: suiteName,
        type: 'beforeAll',
        message: 'beforeAll hook failed',
        errorLines: []
      };
      console.log(`🚨 DETECTED beforeAll hook failure in suite: "${suiteName}"`);
      continue;
    }
    
    // Detect beforeEach hook failures
    const beforeEachMatch = line.match(/●\s+(.+?)\s+›\s+beforeEach/i);
    if (beforeEachMatch) {
      const suiteName = beforeEachMatch[1].trim();
      console.log(`🚨 DETECTED beforeEach hook failure in suite: "${suiteName}"`);
      continue;
    }
    
    // Detect afterAll hook failures
    const afterAllMatch = line.match(/●\s+(.+?)\s+›\s+afterAll/i);
    if (afterAllMatch) {
      const suiteName = afterAllMatch[1].trim();
      console.log(`🚨 DETECTED afterAll hook failure in suite: "${suiteName}"`);
      continue;
    }
    
    // Detect afterEach hook failures
    const afterEachMatch = line.match(/●\s+(.+?)\s+›\s+afterEach/i);
    if (afterEachMatch) {
      const suiteName = afterEachMatch[1].trim();
      console.log(`🚨 DETECTED afterEach hook failure in suite: "${suiteName}"`);
      continue;
    }
    
    // Look for test suite names
    if (trimmedLine && !trimmedLine.startsWith('✓') && !trimmedLine.startsWith('✗') && 
        !trimmedLine.includes('PASS') && !trimmedLine.includes('FAIL') && 
        !trimmedLine.includes('Test Suites:') && !trimmedLine.includes('Tests:') &&
        !trimmedLine.includes('Snapshots:') && !trimmedLine.includes('Time:') &&
        !trimmedLine.includes('Ran all test suites') && !trimmedLine.startsWith('RUNS') &&
        !trimmedLine.includes('Determining test suites') && !trimmedLine.includes('.test.js') &&
        !trimmedLine.startsWith('at ') && !trimmedLine.includes('Error:') && 
        !trimmedLine.includes('console.') && !trimmedLine.startsWith('●')) {
      
      if (!line.startsWith('    ') && !line.startsWith('  ●') && trimmedLine.length > 0) {
        currentSuite = trimmedLine;
      }
    }
    
    // Parse test results
    // Pattern 1: ✓ test name (time)
    const testMatch = line.match(/^\s*✓\s+(.+?)\s*\((\d+(?:\.\d+)?)\s*m?s\)/);
    if (testMatch) {
      const [, testName, duration] = testMatch;
      const cleanTestName = testName.trim();
      
      // Skip empty or invalid test names
      if (cleanTestName && cleanTestName !== '\n' && cleanTestName.length > 0) {
        // If we're looking for a specific test, only include it
        if (!specificTestName || cleanTestName === specificTestName) {
          testResults.push({
            testId: `${config.filePath}:${cleanTestName}`,
            testName: cleanTestName,
            suite: currentSuite,
            status: 'passed',
            duration: parseFloat(duration),
            error: null,
            source: null,
            workerId: config.workerId,
            filePath: config.filePath
          });
        }
      }
    } else {
      // Pattern 2: ✓ test name (no timing)
      const quickTestMatch = line.match(/^\s*✓\s+(.+?)$/);
      if (quickTestMatch) {
        const [, testName] = quickTestMatch;
        const cleanTestName = testName.trim();
        
        if (!testName.includes('(') && !testName.includes('ms') && cleanTestName.length > 0 && cleanTestName !== '\n') {
          if (!specificTestName || cleanTestName === specificTestName) {
            testResults.push({
              testId: `${config.filePath}:${cleanTestName}`,
              testName: cleanTestName,
              suite: currentSuite,
              status: 'passed',
              duration: 0, // Very fast test, under 1ms
              error: null,
              source: null,
              workerId: config.workerId,
              filePath: config.filePath
            });
          }
        }
      }
    }
    
    // Parse failed tests
    // Pattern 1: ✗ test name (time) or ✗ test name
    const failedMatchWithTime = line.match(/^\s*[✗✕×]\s+(.+?)\s+\((\d+(?:\.\d+)?)\s*m?s\)$/);
    const failedMatchNoTime = line.match(/^\s*[✗✕×]\s+(.+?)$/);
    
    let failedMatch = null;
    if (failedMatchWithTime) {
      failedMatch = failedMatchWithTime;
    } else if (failedMatchNoTime && !failedMatchNoTime[1].includes('(') && !failedMatchNoTime[1].includes('ms')) {
      failedMatch = [failedMatchNoTime[0], failedMatchNoTime[1], null];
    }
    
    if (failedMatch) {
      const [, testName, duration] = failedMatch;
      const cleanTestName = testName.trim();
      
      if (cleanTestName && cleanTestName !== '\n' && cleanTestName.length > 0) {
        if (!specificTestName || cleanTestName === specificTestName) {
          testResults.push({
            testId: `${config.filePath}:${cleanTestName}`,
            testName: cleanTestName,
            suite: currentSuite,
            status: 'failed',
            duration: duration ? parseFloat(duration) : 0,
            error: null,
            source: null,
            workerId: config.workerId,
            filePath: config.filePath
          });
        }
      }
    }
    
    // Parse skipped tests
    const skippedMatch = line.match(/^\s*○\s+(.+?)$/);
    if (skippedMatch) {
      const [, testName] = skippedMatch;
      const cleanTestName = testName.trim();
      
      if (cleanTestName && cleanTestName !== '\n' && cleanTestName.length > 0) {
        if (!specificTestName || cleanTestName === specificTestName) {
          testResults.push({
            testId: `${config.filePath}:${cleanTestName}`,
            testName: cleanTestName,
            suite: currentSuite,
            status: 'skipped',
            duration: 0,
            error: null,
            source: null,
            workerId: config.workerId,
            filePath: config.filePath
          });
        }
      }
    }
  }
  
  // Second pass: assign error messages to failed tests
  const failedTests = testResults.filter(t => t.status === 'failed');
  parseIndividualErrors(output, failedTests);
  
  return testResults;
}

function parseIndividualErrors(output, failedTests) {
  const lines = output.split('\n');
  let currentErrorTest = null;
  let errorLines = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmedLine = line.trim();
    
    // Look for test-specific error headers: "● Suite › test name"
    const errorHeaderMatch = line.match(/^\s*●\s+(.+?)\s*›\s*(.+?)$/);
    if (errorHeaderMatch) {
      // Save previous error if we were collecting one
      if (currentErrorTest && errorLines.length > 0) {
        const errorMessage = errorLines.join('\n').trim();
        currentErrorTest.error = errorMessage;
        currentErrorTest.source = extractSourceInfo(errorMessage);
      }
      
      // Find the matching failed test
      const [, suite, testName] = errorHeaderMatch;
      const cleanTestName = testName.trim();
      currentErrorTest = failedTests.find(t => t.testName === cleanTestName);
      errorLines = [];
    } else if (currentErrorTest && (
      trimmedLine.includes('expect(') || 
      trimmedLine.includes('Expected:') || 
      trimmedLine.includes('Received:') || 
      trimmedLine.includes('at Object.') ||
      trimmedLine.includes('at ') ||
      trimmedLine.startsWith('>') ||
      /^\d+\s*\|/.test(trimmedLine) ||
      trimmedLine.includes('|') ||
      trimmedLine.includes('^')
    )) {
      // Collect error details
      errorLines.push(line);
    } else if (trimmedLine.startsWith('●') || trimmedLine.includes('Test Suites:')) {
      // End of current error section
      if (currentErrorTest && errorLines.length > 0) {
        const errorMessage = errorLines.join('\n').trim();
        currentErrorTest.error = errorMessage;
        currentErrorTest.source = extractSourceInfo(errorMessage);
      }
      currentErrorTest = null;
      errorLines = [];
    } else if (currentErrorTest && errorLines.length > 0) {
      // Continue collecting error lines
      errorLines.push(line);
    }
  }
  
  // Handle any remaining error
  if (currentErrorTest && errorLines.length > 0) {
    const errorMessage = errorLines.join('\n').trim();
    currentErrorTest.error = errorMessage;
    currentErrorTest.source = extractSourceInfo(errorMessage);
  }
}

function extractSourceInfo(errorMessage) {
  if (!errorMessage) return null;
  
  // Look for Jest stack trace patterns:
  // "at Object.toBe (tests/error-demo.test.js:9:15)"
  // "at Object.toContain (tests/error-demo.test.js:13:21)"
  const stackTracePattern = /at\s+[\w.]+\s+\(([^:]+):(\d+):(\d+)\)/;
  const match = errorMessage.match(stackTracePattern);
  
  if (match) {
    const [, filePath, lineNumber, columnNumber] = match;
    return {
      file: filePath,
      line: parseInt(lineNumber, 10),
      column: parseInt(columnNumber, 10),
      location: `${filePath}:${lineNumber}:${columnNumber}`
    };
  }
  
  // Alternative pattern for simpler stack traces
  // "at tests/error-demo.test.js:9:15"
  const simpleStackPattern = /at\s+([^:]+):(\d+):(\d+)/;
  const simpleMatch = errorMessage.match(simpleStackPattern);
  
  if (simpleMatch) {
    const [, filePath, lineNumber, columnNumber] = simpleMatch;
    return {
      file: filePath,
      line: parseInt(lineNumber, 10),
      column: parseInt(columnNumber, 10),
      location: `${filePath}:${lineNumber}:${columnNumber}`
    };
  }
  
  // Look for code context indicators (lines starting with ">")
  const codeContextPattern = />\s*(\d+)\s*\|/;
  const codeMatch = errorMessage.match(codeContextPattern);
  
  if (codeMatch) {
    const lineNumber = parseInt(codeMatch[1], 10);
    return {
      file: null, // File path not available in this pattern
      line: lineNumber,
      column: null,
      location: `line ${lineNumber}`
    };
  }
  
  return null;
}

// Main execution
if (require.main === module) {
  let config;
  let isShuttingDown = false;
  
  // Handle graceful shutdown
  const handleShutdown = (signal) => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    
    const result = {
      status: 'failed',
      testResults: [],
      error: `Worker interrupted by ${signal}`,
      duration: 0,
      workerId: config ? config.workerId : 'unknown',
      filePath: config ? config.filePath : 'unknown'
    };
    process.stdout.write(JSON.stringify(result) + '\n');
    process.stdout.end(() => {
      process.exit(1);
    });
  };
  
  process.on('SIGTERM', () => handleShutdown('SIGTERM'));
  process.on('SIGINT', () => handleShutdown('SIGINT'));
  
  try {
    config = JSON.parse(process.argv[2]);
  } catch (error) {
    const errorResult = {
      status: 'failed',
      testResults: [],
      error: `Invalid configuration: ${error.message}`,
      duration: 0,
      workerId: 'unknown',
      filePath: 'unknown'
    };
    process.stdout.write(JSON.stringify(errorResult) + '\n');
    process.stdout.end(() => {
      process.exit(1);
    });
  }
  
  // Error handlers
  process.on('uncaughtException', (error) => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    const result = {
      status: 'failed',
      testResults: [],
      error: `Uncaught exception: ${error.message}`,
      duration: 0,
      workerId: config.workerId,
      filePath: config.filePath
    };
    process.stdout.write(JSON.stringify(result) + '\n');
    process.stdout.end(() => {
      process.exit(1);
    });
  });
  
  process.on('unhandledRejection', (reason) => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    const result = {
      status: 'failed',
      testResults: [],
      error: `Unhandled rejection: ${reason}`,
      duration: 0,
      workerId: config.workerId,
      filePath: config.filePath
    };
    process.stdout.write(JSON.stringify(result) + '\n');
    process.stdout.end(() => {
      process.exit(1);
    });
  });
  
  runTestsNatively(config)
    .then(result => {
      if (isShuttingDown) return;
      const jsonOutput = JSON.stringify(result);
      process.stdout.write(jsonOutput + '\n');
      
      process.stdout.end(() => {
        process.exit(result.status === 'passed' ? 0 : 1);
      });
    })
    .catch(error => {
      if (isShuttingDown) return;
      const result = {
        status: 'failed',
        testResults: [],
        error: error.message,
        duration: 0,
        workerId: config.workerId,
        filePath: config.filePath
      };
      const jsonOutput = JSON.stringify(result);
      process.stdout.write(jsonOutput + '\n');
      
      process.stdout.end(() => {
        process.exit(1);
      });
    });
}

module.exports = { runTestsNatively };
