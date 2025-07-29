// Test worker for running individual tests in isolation
const path = require('path');
const { execSync } = require('child_process');

function extractCleanErrorMessage(jestOutput) {
  if (!jestOutput) return 'Test failed with no error details';

  const lines = jestOutput.split('\n');
  const errorLines = [];
  let foundError = false;
  let errorStartIdx = -1;

  // 1. Find the first error-like line and its index
  for (let i = 0; i < lines.length; i++) {
    const trimmedLine = lines[i].trim();
    if (
      trimmedLine.startsWith('Error:') ||
      trimmedLine.includes('AssertionError') ||
      /timed out|timeout|Timeout/i.test(trimmedLine) ||
      trimmedLine.startsWith('expect(') ||
      trimmedLine.startsWith('Expected:') ||
      trimmedLine.startsWith('Received:') ||
      trimmedLine.includes('- Expected') ||
      trimmedLine.includes('+ Received') ||
      /threw|thrown|Exception|ReferenceError|TypeError|RangeError|SyntaxError/i.test(trimmedLine)
    ) {
      errorStartIdx = i;
      foundError = true;
      break;
    }
  }

  // 2. If found, collect a few lines of context after the error line
  if (foundError && errorStartIdx !== -1) {
    for (let j = errorStartIdx; j < Math.min(lines.length, errorStartIdx + 6); j++) {
      const l = lines[j].trim();
      if (l && !errorLines.includes(l)) errorLines.push(l);
      // Stop at stack trace or next test
      if (l.startsWith('at ') || l.startsWith('Test Suites:')) break;
    }
  }

  // 3. If nothing found, fallback to first non-empty error-like line
  if (!foundError) {
    for (let i = 0; i < lines.length; i++) {
      const trimmedLine = lines[i].trim();
      if (trimmedLine && (trimmedLine.toLowerCase().includes('error') || trimmedLine.toLowerCase().includes('fail') || trimmedLine.toLowerCase().includes('timeout'))) {
        errorLines.push(trimmedLine);
        foundError = true;
        break;
      }
    }
  }

  // 4. If still nothing, fallback to first non-empty line
  if (!foundError) {
    for (let i = 0; i < lines.length; i++) {
      const trimmedLine = lines[i].trim();
      if (trimmedLine) {
        errorLines.push(trimmedLine);
        break;
      }
    }
  }

  // Remove duplicate lines
  const uniqueLines = [...new Set(errorLines)];
  return uniqueLines.join('\n').trim() || 'Test assertion failed';
}

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
    
    // Extract clean error message from Jest output instead of using the full command error
    const jestOutput = error.stderr || error.stdout || error.toString();
    result.error = extractCleanErrorMessage(jestOutput);
    result.output = jestOutput;
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
