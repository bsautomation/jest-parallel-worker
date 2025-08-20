// Test worker for running individual tests in isolation
const path = require('path');
const { execSync } = require('child_process');
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
    // Use shared runner to execute a single test by name via Jest filters
    const testFilePath = path.resolve(config.filePath);
    const escaped = config.testName.replace(/[.*+?^${}()|[\]\\]/g, '\\\\$&');
    const jestArgs = [
      testFilePath,
      '--testNamePattern', escaped,
      '--verbose',
      '--no-coverage',
      '--runInBand'
    ];

  const { status, testResults, stdout, stderr, exitCode, hookInfo } = await runJestWithJson({
      args: jestArgs,
      cwd: process.cwd(),
      filePath: config.filePath,
      timeout: config.timeout || 25000
    });

    result.status = status;
    result.output = stdout;
  // Attach hook info parsed from text output
  result.hookInfo = hookInfo;
  // Attach parsedOutput for reporter enrichment
  const workItem = { filePath: config.filePath, workerId: config.workerId };
  const combined = `${stderr || ''}\n${stdout || ''}`;
  const parsed = parseJestOutput(combined, workItem, silentLogger);
  result.parsedOutput = parsed;
    // Try to pick this test result
    const match = (testResults || []).find(t => t.name === config.testName || (t.testId || '').endsWith(`:${config.testName}`));
    if (match && match.status === 'failed') {
      result.error = match.error || 'Test failed';
      result.errorType = 'test_failure';
    }
    result.testResults = testResults;
  } catch (error) {
    result.status = 'failed';
    const jestOutput = error.stderr || error.stdout || error.toString();
    const workItem = { filePath: config.filePath, workerId: config.workerId };
    const parseResult = parseJestOutput(jestOutput, workItem, silentLogger);
    const testErrors = parseResult.parsedErrors.filter(e => 
      e.testName === config.testName || 
      e.testName?.includes(config.testName) ||
      config.testName.includes(e.testName || '')
    );
    if (testErrors.length > 0) {
      result.error = testErrors[0].errorMessage;
      result.source = testErrors[0].source;
      result.errorType = testErrors[0].errorType;
    } else if (parseResult.parsedErrors.length > 0) {
      result.error = parseResult.parsedErrors[0].errorMessage;
      result.source = parseResult.parsedErrors[0].source;
      result.errorType = parseResult.parsedErrors[0].errorType;
    } else {
      result.error = 'Test failed with no error details';
    }
    result.output = jestOutput;
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
