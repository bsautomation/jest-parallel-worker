// Enhanced test worker that can run regular tests concurrently
const path = require('path');
const fs = require('fs').promises;
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

async function runTestsConcurrently(config) {
  const startTime = Date.now();
  const results = [];
  
  try {
    // Read and transform the test file to concurrent style
    const originalContent = await fs.readFile(config.filePath, 'utf8');
    const transformedContent = originalContent
      .replace(/\btest\s*\(/g, 'test.concurrent(')
      .replace(/\bit\s*\(/g, 'test.concurrent(');

    // Write to a temporary file in the same folder to preserve relative imports
    const originalDir = path.dirname(config.filePath);
    const tempFileName = `.jest-parallel-concurrent-${path.basename(config.filePath, '.test.js')}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}.test.js`;
    const tempFilePath = path.join(originalDir, tempFileName);
    await fs.writeFile(tempFilePath, transformedContent, 'utf8');

    // Run the temp file via the shared JSON-first runner
    const jestArgs = [
      tempFilePath,
      '--verbose',
      '--no-coverage',
      '--passWithNoTests=false',
      '--forceExit',
      '--detectOpenHandles'
    ];

    const { testResults, stdout, stderr, hookInfo } = await runJestWithJson({
      args: jestArgs,
      cwd: process.cwd(),
      filePath: config.filePath,
      hookFilePath: tempFilePath,
      timeout: config.timeout || 25000
    });

    // Clean up temp file
    await fs.unlink(tempFilePath).catch(() => {});

    // Map to prior shape (array of tests)
    const finalTestResults = (testResults || []).map(t => ({
      ...t,
      testId: t.testId || `${config.filePath}:${t.name}`,
      filePath: config.filePath,
      workerId: config.workerId
    }));

    return finalTestResults;
    
  } catch (error) {
    // Enhanced error handling for execution errors
    const errorDetails = {
      testId: `${config.filePath}:execution-error`,
      filePath: config.filePath,
      testName: 'File Execution Error',
      status: 'failed',
      duration: Date.now() - startTime,
      error: error.message,
      errorType: error.constructor.name,
      workerId: config.workerId
    };
    
    // Try to parse stack trace for better error location
    if (error.stack) {
      const stackLines = error.stack.split('\n');
      const relevantLine = stackLines.find(line => 
        line.includes(config.filePath) || line.includes('vm.js') || line.includes('runInContext')
      );
      if (relevantLine) {
        const locationMatch = relevantLine.match(/:(\d+):(\d+)/);
        if (locationMatch) {
          errorDetails.source = {
            line: parseInt(locationMatch[1], 10),
            column: parseInt(locationMatch[2], 10),
            file: config.filePath
          };
        }
      }
      errorDetails.stack = error.stack;
    }
    
  return [errorDetails];
  }
}

// Main execution
if (require.main === module) {
  const config = JSON.parse(process.argv[2]);
  
  runTestsConcurrently(config)
    .then(results => {
      console.log(JSON.stringify(results));
      process.exit(0);
    })
    .catch(error => {
      const result = [{
        testId: config.filePath,
        status: 'failed',
        error: error.message,
        duration: 0,
        workerId: config.workerId
      }];
      console.log(JSON.stringify(result));
      process.exit(1);
    });
}

module.exports = { runTestsConcurrently };
