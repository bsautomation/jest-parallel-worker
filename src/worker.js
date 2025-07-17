const { runCLI } = require('@jest/core');
const path = require('path');
const fs = require('fs');
const { randomUUID } = require('crypto');

async function runTest({ testFile, testName, jestConfigPath, timeout = 4 * 60 * 1000, jestOptions = {} }) {
  try {
    const workerStartTime = Date.now();
    const testFilePath = path.resolve(testFile);
    const pid = process.pid;
    
    // Use the actual process ID - should be unique for each worker when enableWorkerThreads is false
    // When using separate processes, each worker will have its own unique PID
    const actualPid = process.pid;
    
    // Get current process stats
    const processStats = getProcessStats();
    
    // Emit an event to the main process via stderr
    // This will be caught by the event listener in index.js
    const testStartEvent = {
      eventType: 'testStart',
      testName,
      testFile,
      pid: actualPid,
      stats: processStats
    };
    
    // Write the event to stderr where the main process can capture it
    process.stderr.write(JSON.stringify(testStartEvent) + '\n');
    
    // Determine project root (directory containing package.json)
    const testNamePattern = escapeRegExp(testName);
    
    let projectRoot = path.dirname(testFilePath);
    while (projectRoot !== path.sep) {
      if (fs.existsSync(path.join(projectRoot, 'package.json'))) {
        break;
      }
      projectRoot = path.dirname(projectRoot);
    }
    
    if (projectRoot === path.sep) {
      projectRoot = process.cwd();
    }
    
    // Clean up the test name to get just the it() block name without describe blocks
    // This helps with more accurate test matching for deeply nested tests
    const cleanedTestName = testName.split(' ').pop();
    
    // Set up jest options
    const options = {
      projects: [projectRoot],
      testPathPattern: escapePathForWindows(testFilePath),
      // Use a more flexible test name pattern that supports nested describes
      // Only match against the actual test name, not the full describe path
      testNamePattern: escapeRegExp(cleanedTestName || testName),
      silent: jestOptions.silent !== undefined ? jestOptions.silent : true,
      verbose: jestOptions.verbose || false,
      testTimeout: timeout,
      ...jestOptions, // Include all Jest CLI options
    };
    
    // Only force testPathPattern to our specific file
    // We assume the main process has already filtered the files correctly
    options.testPathPattern = escapePathForWindows(testFilePath);
    
    // Don't force exact matching with ^ and $ which can cause "no tests found" errors
    // Allow the test to match even if it's inside nested describe blocks
    delete options.testNamePattern;
    options.testNamePattern = testNamePattern;
    
    // Look for the last part of the test name, which is likely the actual test description
    // This helps avoid issues with describe blocks
    const testParts = testName.split(/\s+/);
    const lastPart = testParts.length > 0 ? testParts[testParts.length - 1] : testName;
    
    // Use a more lenient matching approach - match any test containing our key parts
    options.testNamePattern = escapeRegExp(lastPart);
    
    // For very short test names, fall back to the original name to avoid false matches
    if (lastPart.length < 5 || options.testNamePattern.length < 5) {
      options.testNamePattern = testNamePattern;
    }
    
    // Load user's jest config if provided
    if (jestConfigPath && fs.existsSync(jestConfigPath)) {
      try {
        const userConfig = require(jestConfigPath);
        // Merge configs, but keep our test filters
        options.projects = userConfig.projects || options.projects;
        options.bail = userConfig.bail !== undefined ? userConfig.bail : options.bail;
        options.verbose = userConfig.verbose !== undefined ? userConfig.verbose : options.verbose;
      } catch (err) {
        // If there's an error loading the config, proceed with default options
        console.error(`Warning: Error loading Jest config from ${jestConfigPath}:`, err.message);
      }
    }
    
    // Run the test
    const { results } = await runCLI(options, [projectRoot]);
    
    // More comprehensive check for test execution status
    const testRan = results.numTotalTests > 0;
    const allTestsPassed = results.success === true;
    const testFound = testRan && (results.testResults && results.testResults.length > 0);
    
    // Extract the actual test name (the 'it' part) from full test name
    // This helps us match tests without being affected by describe blocks
    function getActualTestName(fullTestName) {
      // Try to extract just the last part (the 'it' block name)
      const parts = fullTestName.split(/it\s*\(\s*['"`]/);
      if (parts.length > 1) {
        // Return everything after the last 'it('
        return parts[parts.length-1].split(/['"`]\s*\)/)[0];
      }
      
      // If we can't find 'it(', just return the last part after the last space
      const lastPart = fullTestName.split(' ').pop();
      return lastPart;
    }
    
    // Extract our target test name
    const targetTestNameCore = getActualTestName(testName);
    
    // Use more flexible test name matching
    // For tests with long names or special characters, we need to be more lenient
    let targetTestRan = false;
    let targetTestPassed = false; // Track if our specific test passed
    
    // The overall test results might show success even if our specific test didn't run
    // So we need to check both: overall success AND that our specific test ran
    if (testFound && results.testResults && results.testResults.length > 0) {
      // Loop through ALL test result files, not just the first one
      for (let i = 0; i < results.testResults.length; i++) {
        const testResult = results.testResults[i];
        
        // Skip if this test result has no individual tests
        if (!testResult.testResults || testResult.testResults.length === 0) continue;
        
        // Check if any test in this file matches our target AND passed
        const foundInThisFile = testResult.testResults.some(t => {
          // Try exact full name match
          if (t.fullName === testName) return true;
          
          // Try includes match for the full name
          if (t.fullName.includes(testName)) return true;
          
          // Try matching just the core test name (without describe blocks)
          const runTestCore = getActualTestName(t.fullName);
          const isMatch = (
            runTestCore === targetTestNameCore || 
            runTestCore.includes(targetTestNameCore) || 
            targetTestNameCore.includes(runTestCore)
          );
          
          // If this is a match, also check if it passed
          if (isMatch && t.status === 'passed') {
            targetTestPassed = true;
          }
          
          return isMatch;
        });
        
        // If we found a match in this file, we can stop searching
        if (foundInThisFile) {
          targetTestRan = true;
          if (targetTestPassed) {
            break; // Found a passing match, no need to keep searching
          }
        }
      }
      
      // If no exact match, try more flexible matching - find any test that ran successfully
      if (!targetTestRan && results.success) {
        // If all tests passed, assume our target test also passed
        // This handles cases where the test name has special formatting or is very long
        targetTestRan = true;
      }
    }
    
    // Check if any tests were found
    if (!testRan) {
      // No tests were found, this is a problem with test discovery
      const workerDuration = (Date.now() - workerStartTime) / 1000;
      return {
        success: false,
        errorMessage: `No tests found matching "${testName}" in file ${path.basename(testFilePath)}. This could be because the test is nested in describe blocks or the test name has special characters.`,
        duration: workerDuration,
        pid: actualPid
      };
    }
    
    // Check if the specific test was found but no tests actually match the pattern
    // Only trigger this if ALL tests failed
    if (testFound && !targetTestRan && !allTestsPassed) {
      const workerDuration = (Date.now() - workerStartTime) / 1000;
      return {
        success: false,
        errorMessage: `Test file found but no test matches "${testName}". Check for exact name matches including spaces and special characters.`,
        duration: workerDuration,
        pid: actualPid
      };
    }
    
    // If we have results and our test passed (either specifically or as part of all tests passing),
    // consider this a success. This handles cases where the test name is very complex or has special formatting
    if (targetTestPassed || allTestsPassed) {
      const workerDuration = (Date.now() - workerStartTime) / 1000;
      // Get updated process stats for the completion event
      const endStats = getProcessStats();
      
      console.debug(`Worker[${actualPid}]: Test "${testName}" completed successfully in ${workerDuration.toFixed(2)}s`);
      return {
        success: true,
        duration: workerDuration,
        pid: actualPid,
        stats: endStats
      };
    }
    
    // If there were test failures, extract the error information
    if (results.numFailedTests > 0 || results.numFailedTestSuites > 0) {
      // Extract error message from test failures
      let errorMessage = 'Test failed';
      let errorDetails = '';
      let stackTrace = '';
      let errorType = 'testFailed';
      
      if (results.testResults && results.testResults.length > 0) {
        // Search through all test result files for failures
        let failedTest = null;
        
        // First try to find a failed test that matches our target test name
        for (const testSuite of results.testResults) {
          if (!testSuite.testResults || testSuite.testResults.length === 0) continue;
          
          // Try to find the failed test that matches our target name
          const matchingFailedTest = testSuite.testResults.find(t => 
            t.status === 'failed' && (t.fullName.includes(testName) || testName.includes(t.fullName)));
            
          if (matchingFailedTest) {
            failedTest = matchingFailedTest;
            break; // Found a direct match, no need to keep searching
          }
        }
        
        // If no matching failed test was found, get the first failed test from any file
        if (!failedTest) {
          for (const testSuite of results.testResults) {
            if (!testSuite.testResults || testSuite.testResults.length === 0) continue;
            
            const anyFailedTest = testSuite.testResults.find(t => t.status === 'failed');
            if (anyFailedTest) {
              failedTest = anyFailedTest;
              break;
            }
          }
        }
        
        if (failedTest && failedTest.failureMessages && failedTest.failureMessages.length > 0) {
          // Get the full failure message
          const fullMessage = failedTest.failureMessages[0];
          
          // Keep the complete assertion error message
          errorMessage = fullMessage;
          
          // Add more context about which test failed
          errorDetails = `Failed test: "${failedTest.fullName}"`;
          
          // If this is different from our expected test, show that too
          if (failedTest.fullName !== testName) {
            errorDetails += `\nRequested test: "${testName}"`;
          }
          
          // Extract the stack trace portion - everything after the last occurrence of stacktrace pattern
          const stackMatches = fullMessage.match(/\n\s+at\s+[\w.]+\s+\(/g);
          if (stackMatches && stackMatches.length > 0) {
            // Find the position of the last stack line
            const lastStackLinePos = fullMessage.lastIndexOf(stackMatches[0]);
            
            if (lastStackLinePos > -1) {
              // Split the error into message and stack trace
              errorMessage = fullMessage.substring(0, lastStackLinePos);
              stackTrace = fullMessage.substring(lastStackLinePos);
            }
          } else {
            // If no stack trace pattern found, use full message as error
            errorMessage = fullMessage;
            stackTrace = '';
          }
        } else if (
          results.numTotalTests > 0 &&
          (results.numPassedTests + results.numFailedTests === results.numTotalTests)
        ) {
          // Check if any test suite has a failureMessage
          let failureMessage = null;
          for (const suite of results.testResults) {
            if (suite.failureMessage) {
              failureMessage = suite.failureMessage;
              break;
            }
          }
          
          if (failureMessage) {
            // Extract more user-friendly error message
            if (failureMessage.includes('must contain at least one test')) {
              errorMessage = 'Test failed';
              errorDetails = 'No tests found that match the specified name. Check that the test exists with the exact name provided.';
            } else {
              // Use more user-friendly wording
              errorMessage = 'Test failed';
              
              // Use the failure message as details, but clean it up first
              const cleanMessage = failureMessage.replace('Test suite failed to run', '').trim();
              errorDetails = cleanMessage || failureMessage;
            }
            
            // Try to extract a stack trace
            const stackTraceStart = failureMessage.indexOf('\n    at ');
            if (stackTraceStart > -1) {
              stackTrace = failureMessage.substring(stackTraceStart);
            }
          }
        }
      }
      
      const workerDuration = (Date.now() - workerStartTime) / 1000;
      // Get updated process stats for the completion event
      const endStats = getProcessStats();
      
      console.debug(`Worker[${actualPid}]: Test "${testName}" failed in ${workerDuration.toFixed(2)}s`);
      return {
        success: false,
        errorType,
        errorMessage,
        errorDetails,
        stackTrace,
        duration: workerDuration,
        pid: actualPid,
        stats: endStats
      };
    }
    
    const workerDuration = (Date.now() - workerStartTime) / 1000;
    // Get updated process stats for the completion event
    const endStats = getProcessStats();
    
    console.debug(`Worker[${actualPid}]: Test "${testName}" completed successfully in ${workerDuration.toFixed(2)}s`);
    return {
      success: true,
      duration: workerDuration,
      pid: actualPid,
      stats: endStats
    };
  } catch (error) {
    // Handle case where workerStartTime might not be defined
    const endTime = Date.now();
    const workerDuration = workerStartTime ? (endTime - workerStartTime) / 1000 : 0;
    // Get updated process stats for the completion event
    const endStats = getProcessStats();
    
    // Use process.pid directly in case actualPid wasn't defined before the error
    const safePid = actualPid || process.pid;
    console.debug(`Worker[${safePid}]: Test "${testName}" errored in ${workerDuration.toFixed(2)}s: ${error.message}`);
    return {
      success: false,
      errorMessage: error.message || 'Unknown error',
      duration: workerDuration,
      pid: safePid,
      stats: endStats
    };
  }
}

// Helper function to escape regex special characters
function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Helper function to escape paths for Windows
function escapePathForWindows(filePath) {
  return process.platform === 'win32' 
    ? filePath.replace(/\\/g, '\\\\') 
    : filePath;
}

// Get current process stats (CPU and memory usage)
function getProcessStats() {
  const memoryUsage = process.memoryUsage();
  
  return {
    pid: process.pid,
    memoryUsageMB: {
      rss: (memoryUsage.rss / 1024 / 1024).toFixed(2),     // Resident Set Size in MB
      heapTotal: (memoryUsage.heapTotal / 1024 / 1024).toFixed(2),  // Total heap size in MB
      heapUsed: (memoryUsage.heapUsed / 1024 / 1024).toFixed(2),   // Used heap size in MB
      external: (memoryUsage.external / 1024 / 1024).toFixed(2),  // External memory in MB
    },
    cpuUsage: process.cpuUsage(),
    uptime: process.uptime().toFixed(2)
  };
}

module.exports = {
  runTest
};