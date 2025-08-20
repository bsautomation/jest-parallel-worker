// Worker that runs tests in parallel without rewriting files
// Uses Jest's native capabilities for parallel execution
const path = require('path');
const { spawn } = require('child_process');
const { parseJestOutput, formatForConsole } = require('../parsers');

// Silent logger for workers to prevent stdout contamination
const silentLogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  log: () => {}
};

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
    const testResult = await runSingleTestOptimized(config, testName, startTime);
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
        
        // Parse Jest output using centralized parser
        const workItem = {
          filePath: config.filePath,
          workerId: config.workerId
        };
        // Parse both stdout and stderr, with priority to stdout for test results
        const outputToParse = output || errorOutput;
        const parseResult = parseJestOutput(outputToParse, workItem, silentLogger);
        
        // Extract test results for backward compatibility
        const testResults = parseResult.testResults;
        const hookInfo = parseResult.hookInfo;
        
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
          tempFile: tempFilePath,
          hookInfo: hookInfo,
          // Enhanced result information from centralized parser
          parsedErrors: parseResult.parsedErrors,
          suiteContext: parseResult.suiteContext,
          hasParseErrors: parseResult.hasErrors,
          parseErrorStats: {
            failed: parseResult.testResults?.failed?.length || 0,
            hooks: parseResult.hookInfo?.failedHooks?.length || 0,
            skipped: parseResult.testResults?.skipped?.length || 0,
            passed: parseResult.testResults?.passed?.length || 0
          }
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

async function runSingleTestOptimized(config, testName, startTime) {
  // Create a modified config for the specific test
  const testConfig = {
    ...config,
    testName: testName,
    strategy: 'single-test'
  };
  
  return await runFileWithParallelism(testConfig, startTime);
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
      
      // Parse Jest output using centralized parser
      const workItem = {
        filePath: config.filePath,
        workerId: config.workerId
      };
      // Parse both stdout and stderr, with priority to stdout for test results
      const outputToParse = output || errorOutput;
      const parseResult = parseJestOutput(outputToParse, workItem, silentLogger);
      
      // Extract test results for backward compatibility
      const testResults = parseResult.testResults;
      const hookInfo = parseResult.hookInfo;
      
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
        jestWorkers: maxWorkersForFile,
        hookInfo: hookInfo,
        // Enhanced result information from centralized parser
        parsedErrors: parseResult.parsedErrors,
        suiteContext: parseResult.suiteContext,
        hasParseErrors: parseResult.hasErrors,
        parseErrorStats: {
          failed: parseResult.testResults?.failed?.length || 0,
          hooks: parseResult.hookInfo?.failedHooks?.length || 0,
          skipped: parseResult.testResults?.skipped?.length || 0,
          passed: parseResult.testResults?.passed?.length || 0
        }
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
