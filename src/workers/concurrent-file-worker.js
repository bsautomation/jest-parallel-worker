// Enhanced test worker that converts regular tests to concurrent execution
const path = require('path');
const fs = require('fs').promises;
const { spawn } = require('child_process');
const os = require('os');
const { parseJestOutput } = require('../parsers');

// Silent logger for workers to prevent stdout contamination
const silentLogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  log: () => {}
};

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
          
          // Parse the Jest output using centralized parser
          const workItem = {
            filePath: config.filePath,
            workerId: config.workerId
          };
          const parseResult = parseJestOutput(errorOutput, workItem, silentLogger);
          
          // Extract test results for backward compatibility
          const testResults = parseResult.testResults;
          
          resolve({
            status: code === 0 ? 'passed' : 'failed',
            testResults,
            output,
            errorOutput,
            duration: Date.now() - startTime,
            workerId: config.workerId,
            filePath: config.filePath,
            exitCode: code,
            
            // Enhanced error information from centralized parser
            parsedOutput: parseResult,
            
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
