// Test worker for running individual tests in isolation
const path = require('path');
const { execSync } = require('child_process');

function extractCleanErrorMessage(jestOutput) {
  if (!jestOutput) return 'Test failed with no error details';
  
  const lines = jestOutput.split('\n');
  const errorLines = [];
  let inErrorSection = false;
  let collectingAssertion = false;
  
  for (const line of lines) {
    const trimmedLine = line.trim();
    
    // Start collecting when we find the actual error description
    if (trimmedLine.includes('expect(') && (trimmedLine.includes('toBe') || trimmedLine.includes('toEqual') || trimmedLine.includes('toContain'))) {
      inErrorSection = true;
      collectingAssertion = true;
      errorLines.push(trimmedLine);
      continue;
    }
    
    // Look for the main error message lines
    if (trimmedLine.startsWith('Expected:') || trimmedLine.startsWith('Received:')) {
      errorLines.push(trimmedLine);
      continue;
    }
    
    // Handle diff format lines
    if (trimmedLine.includes('- Expected') || trimmedLine.includes('+ Received')) {
      errorLines.push(trimmedLine);
      continue;
    }
    
    // Handle object diff lines
    if (inErrorSection && (trimmedLine.startsWith('Object {') || 
        trimmedLine.match(/^\s*[-+]\s*"/) || 
        trimmedLine.match(/^\s*[-+]\s*}/))) {
      errorLines.push(trimmedLine);
      continue;
    }
    
    // Collect useful assertion error details
    if (collectingAssertion && (
        trimmedLine.includes('equality') ||
        trimmedLine.includes('indexOf') ||
        trimmedLine.startsWith('>')
    )) {
      errorLines.push(trimmedLine);
      continue;
    }
    
    // Stop collecting when we hit code location or stack trace
    if (trimmedLine.includes('at Object.') || trimmedLine.includes('at ') || 
        trimmedLine.includes(') {') || trimmedLine.includes('Test Suites:')) {
      break;
    }
  }
  
  // If we didn't find specific assertion errors, look for general error patterns
  if (errorLines.length === 0) {
    for (const line of lines) {
      const trimmedLine = line.trim();
      if (trimmedLine.includes('Error:') || trimmedLine.includes('AssertionError') ||
          trimmedLine.includes('ReferenceError') || trimmedLine.includes('TypeError')) {
        errorLines.push(trimmedLine);
        break;
      }
    }
  }
  
  // Fall back to a simple error message if nothing specific was found
  if (errorLines.length === 0) {
    return 'Test assertion failed';
  }
  
  return errorLines.join('\n').trim();
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
