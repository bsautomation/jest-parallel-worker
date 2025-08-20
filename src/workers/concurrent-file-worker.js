// Enhanced test worker that converts regular tests to concurrent execution
const path = require('path');
const fs = require('fs').promises;
const { spawn } = require('child_process');
const os = require('os');
const { parseJestOutput } = require('../parsers');
const { runJestWithJson } = require('./utils/jestRunner');

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
    
    // Run Jest on the temporary file using the shared JSON-first runner
    const jestArgs = [
      tempFilePath,
      '--verbose',
      '--no-coverage', 
      '--passWithNoTests=false',
      '--forceExit',
      '--detectOpenHandles'
    ];

    const { status, testResults, stdout, stderr, exitCode, hookInfo } = await runJestWithJson({
      args: jestArgs,
      cwd: process.cwd(),
      filePath: config.filePath,
      hookFilePath: tempFilePath,
      timeout: config.timeout || 25000
    });

    // Clean up temporary file
    await fs.unlink(tempFilePath).catch(() => {});

    return {
      status,
      testResults,
      output: stdout,
      errorOutput: stderr,
      duration: Date.now() - startTime,
      workerId: config.workerId,
      filePath: config.filePath,
      exitCode,
      hookInfo,
      parsedOutput: parseJestOutput(`${stderr || ''}\n${stdout || ''}`, { filePath: config.filePath, workerId: config.workerId }, silentLogger)
    };
    
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
