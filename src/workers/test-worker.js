// Test worker for running individual tests in isolation
const path = require('path');
const { execSync } = require('child_process');
const { parseJestOutput } = require('../parsers');

// Silent logger for workers to prevent stdout contamination
const silentLogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  log: () => {}
};

async function runSingleTest(config) {
  const startTime = Date.now();
  const result = {
    testId: config.testId,
    filePath: config.filePath,
    testName: config.testName,
    workerId: config.workerId,
    status: 'unknown',
    duration: 0,
    error: null,
    output: '',
    startTime,
    endTime: null
  };

  try {
    // Use Jest CLI to run a single test
    const testFilePath = path.resolve(config.filePath);
    const testNamePattern = config.testName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // Escape regex
    
    const jestCommand = `npx jest --testMatch="**/${path.basename(testFilePath)}" --testNamePattern="${testNamePattern}" --verbose --no-coverage --runInBand`;
    
    const output = execSync(jestCommand, {
      encoding: 'utf8',
      cwd: process.cwd(),
      timeout: config.timeout,
      env: { ...process.env }
    });
    
    result.status = 'passed';
    result.output = output;

  } catch (error) {
    result.status = 'failed';
    
    // Use centralized Jest output parser for consistent error handling
    const jestOutput = error.stderr || error.stdout || error.toString();
    const workItem = {
      filePath: config.filePath,
      workerId: config.workerId
    };
    const parseResult = parseJestOutput(jestOutput, workItem, silentLogger);
    
    // Extract error details for this specific test
    const testErrors = parseResult.parsedErrors.filter(e => 
      e.testName === config.testName || 
      e.testName.includes(config.testName) ||
      config.testName.includes(e.testName)
    );
    
    if (testErrors.length > 0) {
      result.error = testErrors[0].errorMessage;
      result.source = testErrors[0].source;
      result.errorType = testErrors[0].errorType;
    } else if (parseResult.parsedErrors.length > 0) {
      // Fallback to first error if specific test error not found
      result.error = parseResult.parsedErrors[0].errorMessage;
      result.source = parseResult.parsedErrors[0].source;
      result.errorType = parseResult.parsedErrors[0].errorType;
    } else {
      // Fallback to simple extraction if parser doesn't find specific errors
      result.error = jestOutput.split('\n')
        .find(line => line.trim() && (line.includes('Error') || line.includes('Failed') || line.includes('expect'))) 
        || 'Test failed with no error details';
    }
    
    result.output = jestOutput;
    
    // Enhanced result information from centralized parser
    result.parsedErrors = parseResult.parsedErrors;
    result.hasParseErrors = parseResult.hasErrors;
    result.testResults = parseResult.testResults;
    result.hookInfo = parseResult.hookInfo;
  } finally {
    result.endTime = Date.now();
    result.duration = result.endTime - result.startTime;
  }

  return result;
}

// Main execution
if (require.main === module) {
  const config = JSON.parse(process.argv[2]);
  
  runSingleTest(config)
    .then(result => {
      console.log(JSON.stringify(result));
      process.exit(0);
    })
    .catch(error => {
      const result = {
        testId: config.testId,
        status: 'failed',
        error: error.message,
        duration: Date.now() - Date.now(),
        workerId: config.workerId
      };
      console.log(JSON.stringify(result));
      process.exit(1);
    });
}

module.exports = { runSingleTest };
