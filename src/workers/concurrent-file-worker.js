// Enhanced test worker that converts regular tests to concurrent execution
const path = require('path');
const fs = require('fs').promises;
const { spawn } = require('child_process');
const os = require('os');

async function runTestsAsConcurrent(config) {
  const startTime = Date.now();
  
  try {
    // Read the original test file
    const originalContent = await fs.readFile(config.filePath, 'utf8');
    
    // Transform test() and it() calls to test.concurrent()
    const transformedContent = originalContent
      .replace(/\btest\s*\(/g, 'test.concurrent(')
      .replace(/\bit\s*\(/g, 'test.concurrent(');
    
    // Create a temporary file with the transformed content in the same directory as the original file
    // This preserves relative import paths
    const originalDir = path.dirname(config.filePath);
    const tempFileName = `.jest-parallel-${path.basename(config.filePath, '.test.js')}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}.test.js`;
    const tempFilePath = path.join(originalDir, tempFileName);
    
    await fs.writeFile(tempFilePath, transformedContent, 'utf8');
    
    // Run Jest on the temporary file
    // Use the full path relative to project root for more precise matching
    const relativeToProject = path.relative(process.cwd(), tempFilePath);
    const jestArgs = [
      '--testMatch', `**/${tempFileName}`,
      '--verbose',
      '--no-coverage', 
      '--passWithNoTests=false',
      '--forceExit', // Ensure Jest exits cleanly
      '--detectOpenHandles' // Help debug hanging processes
    ];
    
    // Try to find Jest - first check if it's available locally, then globally
    let jestCommand = 'npx';
    let jestRunArgs = ['jest', ...jestArgs];
    
    // Alternative: try global jest if npx fails
    const worker = spawn(jestCommand, jestRunArgs, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { 
        ...process.env, // This preserves ALL environment variables including PROFILE
        NODE_OPTIONS: '--max-old-space-size=4096',
        // Ensure Jest can find the correct config
        PWD: process.cwd()
      },
      cwd: process.cwd()
    });
    
    let output = '';
    let errorOutput = '';
    
    worker.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    worker.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });
    
    // Handle worker errors (e.g., Jest not found)
    worker.on('error', (error) => {
      if (hasResolved) return;
      hasResolved = true;
      
      // If Jest command failed, provide helpful error message
      reject(new Error(`Jest execution failed: ${error.message}. 
        This usually means:
        1. Jest is not installed (run: npm install --save-dev jest)
        2. Jest is not in PATH
        3. Working directory is incorrect
        
        Current working directory: ${process.cwd()}
        Command attempted: ${jestCommand} ${jestRunArgs.join(' ')}`));
    });
    
    return new Promise((resolve, reject) => {
      let hasResolved = false;
      
      const handleExit = async (code) => {
        if (hasResolved) return;
        hasResolved = true;
        
        try {
          // Clean up temporary file
          await fs.unlink(tempFilePath).catch(() => {}); // Ignore cleanup errors
          
          // If Jest failed, include stderr in the result for debugging
          if (code !== 0) {
            // Only log critical information for failed executions
            console.error(`Jest execution failed with code ${code} for ${config.filePath}`);
          }
          
          // Parse the Jest output to extract individual test results
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
            // Include Jest output for debugging test count mismatch
            debugInfo: {
              jestStdout: output.substring(0, 500), // First 500 chars of stdout
              jestStderr: errorOutput.substring(0, 1000), // First 1000 chars of stderr
              testsFound: testResults.length,
              jestExitCode: code
            },
            // Include more debugging info for failed executions
            ...(code !== 0 && {
              jestCommand: `${jestCommand} ${jestRunArgs.join(' ')}`,
              tempFileName: tempFileName,
              workingDirectory: process.cwd()
            })
          });
        } catch (error) {
          reject(error);
        }
      };
      
      worker.on('close', handleExit);
      worker.on('exit', handleExit);
      
      worker.on('error', (error) => {
        if (hasResolved) return;
        hasResolved = true;
        reject(error);
      });
      
      // Set timeout with grace period
      const timeout = config.timeout || 25000; // Default to 25s (5s less than worker timeout)
      setTimeout(() => {
        if (!worker.killed && !hasResolved) {
          worker.kill('SIGTERM');
          setTimeout(() => {
            if (!worker.killed && !hasResolved) {
              hasResolved = true;
              worker.kill('SIGKILL');
              reject(new Error('Test execution timeout - Jest process killed'));
            }
          }, 2000);
        }
      }, timeout);
    });
    
  } catch (error) {
    return {
      status: 'failed',
      testResults: [{
        testId: `${config.filePath}:error`,
        testName: 'Transformation Error',
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

function parseJestOutput(output, config) {
  const testResults = [];
  const lines = output.split('\n');
  let currentSuite = '';
  let currentFailedTest = null;
  let collectingError = false;
  let errorLines = [];
  
  // Check for common Jest error patterns
  const hasNoTestsError = output.includes('No tests found') || output.includes('0 passed');
  const hasConfigError = output.includes('Cannot resolve configuration') || output.includes('Module not found');
  const hasSyntaxError = output.includes('SyntaxError') || output.includes('Unexpected token');
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmedLine = line.trim();
    
    // If we're collecting error messages for a failed test
    if (collectingError && currentFailedTest) {
      // Stop collecting when we hit another test result or section boundary
      if (trimmedLine.startsWith('✓') || trimmedLine.startsWith('✗') || trimmedLine.startsWith('✕') || 
          trimmedLine.startsWith('○') || trimmedLine.includes('Test Suites:') ||
          trimmedLine.includes('Tests:') || trimmedLine.includes('Snapshots:') ||
          trimmedLine.includes('Time:') || trimmedLine.includes('Ran all test suites') ||
          (trimmedLine === '' && errorLines.length > 2)) { // Stop on empty line if we have some content
        // Finish collecting error for current failed test
        if (errorLines.length > 0) {
          currentFailedTest.error = errorLines.join('\n').trim();
        }
        currentFailedTest = null;
        collectingError = false;
        errorLines = [];
      } else {
        // Collect error line (more selective filtering)
        if (trimmedLine.length > 0 && 
            !trimmedLine.includes('at Object.') && 
            !trimmedLine.includes('at TestScheduler.') &&
            !trimmedLine.includes('at ') && // Skip stack trace lines
            !trimmedLine.includes('node_modules') &&
            !trimmedLine.includes('node:internal') &&
            !trimmedLine.includes('Error:') && // Skip error type declarations
            !trimmedLine.match(/^\d+\s*\|\s*/) && // Skip line number indicators
            !trimmedLine.startsWith('●') && // Skip Jest markers
            !trimmedLine.includes('FAIL') &&
            !trimmedLine.includes('PASS') &&
            // Include assertion errors and meaningful error content
            (trimmedLine.includes('expect') || 
             trimmedLine.includes('Expected') || 
             trimmedLine.includes('Received') ||
             trimmedLine.includes('AssertionError') ||
             trimmedLine.includes('Error occurred') ||
             trimmedLine.includes('ReferenceError') ||
             trimmedLine.includes('TypeError') ||
             errorLines.length === 0)) { // Always include first line
          errorLines.push(trimmedLine);
        }
      }
    }
    
    // Look for test suite names (more robust detection)
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
    
    // Enhanced test result parsing - look for multiple patterns
    
    // Pattern 1: ✓ test name (time) - more robust capture
    const testMatch = line.match(/^\s*✓\s+(.+?)\s*\((\d+(?:\.\d+)?)\s*m?s\)/);
    if (testMatch) {
      const [, testName, duration] = testMatch;
      testResults.push({
        testId: `${config.filePath}:${testName.trim()}`,
        testName: testName.trim(),
        suite: currentSuite,
        status: 'passed',
        duration: parseFloat(duration),
        error: null,
        workerId: config.workerId,
        filePath: config.filePath
      });
    } else {
      // Pattern 2: ✓ test name (no timing) - more robust capture
      const quickTestMatch = line.match(/^\s*✓\s+(.+?)$/);
      if (quickTestMatch) {
        const [, testName] = quickTestMatch;
        // Make sure we're not capturing timing info accidentally
        if (!testName.includes('(') && !testName.includes('ms') && testName.trim().length > 0) {
          testResults.push({
            testId: `${config.filePath}:${testName.trim()}`,
            testName: testName.trim(),
            suite: currentSuite,
            status: 'passed',
            duration: 0,
            error: null,
            workerId: config.workerId,
            filePath: config.filePath
          });
        }
      }
    }
    
    // Pattern 3: ✗ or ✕ failed test (Jest uses different characters) - more robust capture
    const failedTestMatch = line.match(/^\s*[✗✕]\s+(.+?)(?:\s*\((\d+(?:\.\d+)?)\s*m?s\))?$/);
    if (failedTestMatch) {
      const [, testName, duration] = failedTestMatch;
      
      const failedTest = {
        testId: `${config.filePath}:${testName.trim()}`,
        testName: testName.trim(),
        suite: currentSuite,
        status: 'failed',
        duration: duration ? parseFloat(duration) : 0,
        error: null, // Will be populated if we find error details
        workerId: config.workerId,
        filePath: config.filePath
      };
      
      testResults.push(failedTest);
      
      // Start collecting error messages for this failed test
      currentFailedTest = failedTest;
      collectingError = true;
      errorLines = [];
    }
    
    // Pattern 4: ○ skipped test
    const skippedTestMatch = line.match(/^\s*○\s+(.+?)(?:\s*\(skipped\))?/);
    if (skippedTestMatch) {
      const [, testName] = skippedTestMatch;
      testResults.push({
        testId: `${config.filePath}:${testName.trim()}`,
        testName: testName.trim(),
        suite: currentSuite,
        status: 'skipped',
        duration: 0,
        error: null,
        workerId: config.workerId,
        filePath: config.filePath
      });
    }
  }
  
  // Handle case where we were collecting error for the last failed test
  if (collectingError && currentFailedTest && errorLines.length > 0) {
    currentFailedTest.error = errorLines.join('\n').trim();
  }
  
  return testResults;
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
  
  // Ensure we always output something, even if there's an unhandled error
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
  
  runTestsAsConcurrent(config)
    .then(result => {
      if (isShuttingDown) return;
      // Ensure we output valid JSON and flush stdout properly
      const jsonOutput = JSON.stringify(result);
      process.stdout.write(jsonOutput + '\n');
      
      // Explicitly end stdout and wait for drain
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
      
      // Explicitly end stdout and wait for drain
      process.stdout.end(() => {
        process.exit(1);
      });
    });
}

module.exports = { runTestsAsConcurrent };
