// Enhanced test worker that can run regular tests concurrently
const path = require('path');
const fs = require('fs').promises;
const vm = require('vm');
const { parseJestOutput } = require('../parsers');

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
    // Read the test file content
    const testFileContent = await fs.readFile(config.filePath, 'utf8');
    
    // Create a sandbox environment for running tests
    const testPromises = [];
    
    // Mock Jest environment
    const mockJestEnv = {
      describe: (name, fn) => {
        // Execute the describe block to collect tests
        fn();
      },
      test: (name, testFn) => {
        // Convert regular test to promise for concurrent execution
        const testPromise = new Promise(async (resolve, reject) => {
          const testStartTime = Date.now();
          try {
            // If test function is async, await it; otherwise run it
            if (testFn.constructor.name === 'AsyncFunction') {
              await testFn();
            } else {
              testFn();
            }
            resolve({
              name,
              status: 'passed',
              duration: Date.now() - testStartTime,
              error: null
            });
          } catch (error) {
            // Enhanced error handling with more details
            const errorInfo = {
              name,
              status: 'failed',
              duration: Date.now() - testStartTime,
              error: error.message,
              errorType: error.constructor.name,
              stack: error.stack
            };
            
            // Try to extract source location from stack if available
            if (error.stack) {
              const stackLines = error.stack.split('\n');
              const testFileStackLine = stackLines.find(line => 
                line.includes(config.filePath) || line.includes(path.basename(config.filePath))
              );
              if (testFileStackLine) {
                const locationMatch = testFileStackLine.match(/:(\d+):(\d+)/);
                if (locationMatch) {
                  errorInfo.source = {
                    line: parseInt(locationMatch[1], 10),
                    column: parseInt(locationMatch[2], 10),
                    file: config.filePath
                  };
                }
              }
            }
            
            resolve(errorInfo);
          }
        });
        testPromises.push(testPromise);
      },
      it: null, // Will be set to test
      expect: require('jest-extended').expect || global.expect || require('@jest/globals').expect,
      beforeAll: (fn) => {
        // Store beforeAll functions to run before tests
        if (!mockJestEnv._beforeAll) mockJestEnv._beforeAll = [];
        mockJestEnv._beforeAll.push(fn);
      },
      afterAll: (fn) => {
        // Store afterAll functions to run after tests
        if (!mockJestEnv._afterAll) mockJestEnv._afterAll = [];
        mockJestEnv._afterAll.push(fn);
      },
      beforeEach: (fn) => {
        // Store beforeEach functions
        if (!mockJestEnv._beforeEach) mockJestEnv._beforeEach = [];
        mockJestEnv._beforeEach.push(fn);
      },
      afterEach: (fn) => {
        // Store afterEach functions
        if (!mockJestEnv._afterEach) mockJestEnv._afterEach = [];
        mockJestEnv._afterEach.push(fn);
      }
    };
    
    // Set it as alias for test
    mockJestEnv.it = mockJestEnv.test;
    
    // Create a VM context with the mock environment
    const context = vm.createContext({
      ...mockJestEnv,
      console,
      require,
      process,
      global,
      Buffer,
      setTimeout,
      setInterval,
      clearTimeout,
      clearInterval,
      Date,
      Promise
    });
    
    // Execute the test file in the context to collect all tests
    vm.runInContext(testFileContent, context, {
      filename: config.filePath
    });
    
    // Run beforeAll hooks
    if (context._beforeAll) {
      for (const beforeAllFn of context._beforeAll) {
        if (beforeAllFn.constructor.name === 'AsyncFunction') {
          await beforeAllFn();
        } else {
          beforeAllFn();
        }
      }
    }
    
    // Run all tests concurrently
    const finalTestResults = await Promise.all(testPromises.map(async (testPromise, index) => {
      // Run beforeEach hooks for each test
      if (context._beforeEach) {
        for (const beforeEachFn of context._beforeEach) {
          if (beforeEachFn.constructor.name === 'AsyncFunction') {
            await beforeEachFn();
          } else {
            beforeEachFn();
          }
        }
      }
      
      const result = await testPromise;
      
      // Run afterEach hooks for each test
      if (context._afterEach) {
        for (const afterEachFn of context._afterEach) {
          if (afterEachFn.constructor.name === 'AsyncFunction') {
            await afterEachFn();
          } else {
            afterEachFn();
          }
        }
      }
      
      return {
        ...result,
        testId: `${config.filePath}:${result.name}`,
        filePath: config.filePath,
        workerId: config.workerId
      };
    }));
    
    // Run afterAll hooks
    if (context._afterAll) {
      for (const afterAllFn of context._afterAll) {
        if (afterAllFn.constructor.name === 'AsyncFunction') {
          await afterAllFn();
        } else {
          afterAllFn();
        }
      }
    }
    
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
