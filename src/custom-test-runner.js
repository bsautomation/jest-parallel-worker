// Custom test runner for true intra-file parallelism using vm module
const vm = require('vm');
const path = require('path');
const fs = require('fs').promises;

class CustomTestRunner {
  constructor(options = {}) {
    this.maxConcurrency = options.maxConcurrency || 4;
    this.timeout = options.timeout || 30000;
    this.verbose = options.verbose || false;
  }

  async executeTest(test, context, timeout) {
    return new Promise(async (resolve) => {
      let completed = false;
      let timeoutId;

      const complete = (result) => {
        if (completed) return;
        completed = true;
        if (timeoutId) clearTimeout(timeoutId);
        resolve(result);
      };

      // Set timeout
      timeoutId = setTimeout(() => {
        console.error(`[CustomTestRunner] Test "${test.name}" timed out after ${timeout}ms`);
        complete({
          status: 'failed',
          error: `Test "${test.name}" timed out after ${timeout}ms`
        });
      }, timeout);

      try {
        // Check if test function expects a done callback
        if (test.fn.length > 0) {
          // Async test with done callback
          const done = (error) => {
            if (error) {
              console.error(`[CustomTestRunner] Test "${test.name}" failed (done callback):`, error);
              complete({ status: 'failed', error: error.message || error });
            } else {
              complete({ status: 'passed' });
            }
          };

          try {
            test.fn(done);
          } catch (err) {
            console.error(`[CustomTestRunner] Exception thrown in async test "${test.name}":`, err);
            complete({ status: 'failed', error: err.message });
          }
        } else {
          // Sync or promise-based test
          try {
            const result = await test.fn();
            complete({ status: 'passed' });
          } catch (err) {
            console.error(`[CustomTestRunner] Exception thrown in test "${test.name}":`, err);
            complete({ status: 'failed', error: err.message });
          }
        }
      } catch (error) {
        console.error(`[CustomTestRunner] Unexpected error in executeTest for "${test.name}":`, error);
        complete({ status: 'failed', error: error.message });
      }
    });
  }

  async runTestFile(filePath) {
    const startTime = Date.now();
    
    try {
      if (this.verbose) {
        console.log(`🔄 Running test file with custom runner: ${filePath}`);
      }

      // Check if this file uses advanced Jest features that our runner doesn't support
      let content;
      try {
        content = await fs.readFile(filePath, 'utf8');
      } catch (err) {
        console.error(`[CustomTestRunner] Failed to read file: ${filePath}`, err);
        return {
          status: 'failed',
          testResults: [],
          error: `Failed to read file: ${err.message}`,
          duration: Date.now() - startTime,
          filePath
        };
      }
      if (this.usesAdvancedFeatures(content)) {
        if (this.verbose) {
          console.log(`⚠️ File ${path.basename(filePath)} uses advanced Jest features, skipping custom runner`);
        }
        return {
          status: 'skipped',
          testResults: [],
          duration: Date.now() - startTime,
          filePath,
          reason: 'Uses advanced Jest features not supported by custom runner'
        };
      }

      // Use vm to execute the test file in a controlled context
      let result;
      try {
        result = await this.executeTestFileInVM(filePath, content);
      } catch (err) {
        console.error(`[CustomTestRunner] Error executing test file in VM: ${filePath}`, err);
        return {
          status: 'failed',
          testResults: [],
          error: `VM execution error: ${err.message}`,
          duration: Date.now() - startTime,
          filePath
        };
      }
      
      return {
        status: result.success ? 'passed' : 'failed',
        testResults: result.testResults || [],
        duration: Date.now() - startTime,
        filePath,
        beforeAllExecuted: result.beforeAllExecuted,
        afterAllExecuted: result.afterAllExecuted,
        error: result.error
      };

    } catch (error) {
      console.error(`[CustomTestRunner] Unexpected error in runTestFile for ${filePath}:`, error);
      return {
        status: 'failed',
        testResults: [],
        error: error.message,
        duration: Date.now() - startTime,
        filePath
      };
    }
  }

  usesAdvancedFeatures(content) {
    // Check for advanced Jest features that our custom runner doesn't support
    const advancedFeatures = [
      'spawn(',           // Child process spawning
      'done)',           // Async done callbacks in function signature  
      'jest.mock(',      // Jest mocking
      'jest.spyOn(',     // Jest spies
      'jest.fn(',        // Jest function mocking
      'jest.setTimeout', // Custom timeouts
      'child_process',   // Child process module
      '.concurrent',     // Jest concurrent tests
      'await expect'     // Complex async expect patterns
    ];
    
    return advancedFeatures.some(feature => content.includes(feature));
  }

  async executeTestFileInVM(filePath, content) {
    if (!content) {
      content = await fs.readFile(filePath, 'utf8');
    }
    
    // Create a simple expect function that works like Jest's expect
    const expect = (actual) => {
      const expectObj = {
        toBe: (expected) => {
          if (actual !== expected) {
            throw new Error(`Expected ${JSON.stringify(actual)} to be ${JSON.stringify(expected)}`);
          }
          return { pass: true };
        },
        toEqual: (expected) => {
          if (JSON.stringify(actual) !== JSON.stringify(expected)) {
            throw new Error(`Expected ${JSON.stringify(actual)} to equal ${JSON.stringify(expected)}`);
          }
          return { pass: true };
        },
        toContain: (expected) => {
          if (typeof actual === 'string') {
            if (!actual.includes(expected)) {
              throw new Error(`Expected "${actual}" to contain "${expected}"`);
            }
          } else if (Array.isArray(actual)) {
            if (!actual.includes(expected)) {
              throw new Error(`Expected array ${JSON.stringify(actual)} to contain ${JSON.stringify(expected)}`);
            }
          } else {
            throw new Error(`toContain() can only be used with strings or arrays, but got ${typeof actual}`);
          }
          return { pass: true };
        },
        toBeNull: () => {
          if (actual !== null) {
            throw new Error(`Expected ${JSON.stringify(actual)} to be null`);
          }
          return { pass: true };
        },
        toBeUndefined: () => {
          if (actual !== undefined) {
            throw new Error(`Expected ${JSON.stringify(actual)} to be undefined`);
          }
          return { pass: true };
        },
        toBeTruthy: () => {
          if (!actual) {
            throw new Error(`Expected ${JSON.stringify(actual)} to be truthy`);
          }
          return { pass: true };
        },
        toBeFalsy: () => {
          if (actual) {
            throw new Error(`Expected ${JSON.stringify(actual)} to be falsy`);
          }
          return { pass: true };
        },
        toThrow: (expectedError) => {
          if (typeof actual !== 'function') {
            throw new Error('toThrow() requires a function');
          }
          try {
            actual();
            throw new Error('Expected function to throw an error');
          } catch (error) {
            if (expectedError && !error.message.includes(expectedError)) {
              throw new Error(`Expected function to throw error containing "${expectedError}", but got "${error.message}"`);
            }
          }
          return { pass: true };
        },
        toHaveLength: (expectedLength) => {
          if (!actual || typeof actual.length !== 'number') {
            throw new Error(`Expected ${JSON.stringify(actual)} to have a length property`);
          }
          if (actual.length !== expectedLength) {
            throw new Error(`Expected ${JSON.stringify(actual)} to have length ${expectedLength}, but got ${actual.length}`);
          }
          return { pass: true };
        },
        toHaveProperty: (propertyPath, expectedValue) => {
          if (!actual || typeof actual !== 'object') {
            throw new Error(`Expected ${JSON.stringify(actual)} to be an object`);
          }
          
          const keys = propertyPath.split('.');
          let current = actual;
          
          for (const key of keys) {
            if (current === null || current === undefined || !(key in current)) {
              throw new Error(`Expected ${JSON.stringify(actual)} to have property "${propertyPath}"`);
            }
            current = current[key];
          }
          
          if (expectedValue !== undefined && current !== expectedValue) {
            throw new Error(`Expected property "${propertyPath}" to be ${JSON.stringify(expectedValue)}, but got ${JSON.stringify(current)}`);
          }
          
          return { pass: true };
        }
      };
      
      // Add promise-based matchers
      if (actual && typeof actual.then === 'function') {
        expectObj.rejects = {
          toThrow: async (expectedError) => {
            try {
              await actual;
              throw new Error('Expected promise to reject');
            } catch (error) {
              if (expectedError && !error.message.includes(expectedError)) {
                throw new Error(`Expected promise to reject with error containing "${expectedError}", but got "${error.message}"`);
              }
            }
            return { pass: true };
          }
        };
      }
      
      return expectObj;
    };
    
    // Create execution context
    const context = {
      console,
      require: (moduleName) => {
        if (moduleName === '@jest/globals') {
          return {
            describe: context.describe,
            it: context.it,
            test: context.test,
            expect: expect,
            beforeAll: context.beforeAll,
            afterAll: context.afterAll,
            beforeEach: context.beforeEach,
            afterEach: context.afterEach,
            jest: context.jest
          };
        }
        // Try to resolve module relative to the test file's directory
        try {
          const resolvedPath = require.resolve(moduleName, { paths: [path.dirname(filePath)] });
          return require(resolvedPath);
        } catch (err) {
          // Fallback to global require (may still fail, but will show error)
          try {
            return require(moduleName);
          } catch (e) {
            console.error(`[CustomTestRunner] Failed to require module '${moduleName}' from '${filePath}':`, e);
            throw e;
          }
        }
      },
      module: { exports: {} },
      __filename: filePath,
      __dirname: path.dirname(filePath),
      process,
      Buffer,
      global: {},
      expect,
      setTimeout,
      clearTimeout,
      setInterval,
      clearInterval,
      Promise,
      Date,
      browser: {}, // Inject a global 'browser' object (empty by default)
      // Test runner state
      tests: [],
      beforeAllHooks: [],
      afterAllHooks: [],
      beforeEachHooks: [],
      afterEachHooks: [],
      // Execution results
      testResults: [],
      beforeAllExecuted: false,
      afterAllExecuted: false,
      // Jest globals
      describe: (name, fn) => {
        if (typeof fn === 'function') {
          fn();
        }
      },
      test: (name, testFn, timeout) => {
        context.tests.push({ name, fn: testFn, timeout });
      },
      it: (name, testFn, timeout) => {
        context.tests.push({ name, fn: testFn, timeout });
      },
      // Jest object with common methods (stubbed for compatibility)
      jest: {
        mock: () => {}, // Stub - mocking not supported in custom runner
        spyOn: () => ({ mockReturnValue: () => {}, mockImplementation: () => {} }), // Stub
        fn: () => ({ mockReturnValue: () => {}, mockImplementation: () => {} }), // Stub
        setTimeout: () => {}, // Stub
        clearAllMocks: () => {}, // Stub
        resetAllMocks: () => {}, // Stub
        restoreAllMocks: () => {} // Stub
      },
      beforeAll: (hookFn) => {
        context.beforeAllHooks.push(hookFn);
      },
      afterAll: (hookFn) => {
        context.afterAllHooks.push(hookFn);
      },
      beforeEach: (hookFn) => {
        context.beforeEachHooks.push(hookFn);
      },
      afterEach: (hookFn) => {
        context.afterEachHooks.push(hookFn);
      }
    };

    // Make context circular reference work and ensure expect is available globally
    context.global = context;
    context.global.expect = expect;
    
    // Create VM context
    const vmContext = vm.createContext(context);
    
    try {
      // Execute the test file to collect tests and hooks
      try {
        vm.runInContext(content, vmContext, {
          filename: filePath,
          timeout: this.timeout
        });
      } catch (err) {
        console.error(`[CustomTestRunner] VM runInContext failed for ${filePath}:`, err);
        throw err;
      }

      if (this.verbose) {
        console.log(`📋 Found ${context.tests.length} tests in ${path.basename(filePath)}`);
      }

      // Execute beforeAll hooks
      if (context.beforeAllHooks.length > 0) {
        for (const hook of context.beforeAllHooks) {
          try {
            await hook();
          } catch (err) {
            console.error(`[CustomTestRunner] Error in beforeAll hook:`, err);
            throw err;
          }
        }
        context.beforeAllExecuted = true;
        if (this.verbose) {
          console.log('✅ beforeAll hooks executed');
        }
      }

      // Execute tests in parallel
      if (this.verbose) {
        console.log(`🏃‍♂️ Running ${context.tests.length} tests in parallel...`);
      }

      const testPromises = context.tests.map(async (test, index) => {
        const testStartTime = Date.now();

        try {
          if (this.verbose) {
            console.log(`⚡ Starting test ${index + 1}: "${test.name}" at ${new Date().toISOString()}`);
          }

          // Execute beforeEach hooks
          for (const hook of context.beforeEachHooks) {
            try {
              await hook();
            } catch (err) {
              console.error(`[CustomTestRunner] Error in beforeEach hook for test "${test.name}":`, err);
              throw err;
            }
          }

          // Execute the test
          const testTimeout = test.timeout || 30000; // Default 30s timeout
          const testResult = await this.executeTest(test, context, testTimeout);

          if (testResult.status === 'failed') {
            throw new Error(testResult.error);
          }

          // Execute afterEach hooks
          for (const hook of context.afterEachHooks) {
            try {
              await hook();
            } catch (err) {
              console.error(`[CustomTestRunner] Error in afterEach hook for test "${test.name}":`, err);
              throw err;
            }
          }

          const duration = Date.now() - testStartTime;
          if (this.verbose) {
            console.log(`✅ Completed test ${index + 1}: "${test.name}" in ${duration}ms`);
          }

          return {
            testName: test.name,
            status: 'passed',
            duration
          };
        } catch (error) {
          const duration = Date.now() - testStartTime;
          console.error(`[CustomTestRunner] Test failed: "${test.name}"`, error);
          if (this.verbose) {
            console.log(`❌ Failed test ${index + 1}: "${test.name}" - ${error.message}`);
          }

          return {
            testName: test.name,
            status: 'failed',
            error: error.message,
            duration
          };
        }
      });

      // Wait for all tests to complete
      try {
        context.testResults = await Promise.all(testPromises);
      } catch (err) {
        console.error(`[CustomTestRunner] Error while running tests in parallel:`, err);
        throw err;
      }

      // Execute afterAll hooks
      if (context.afterAllHooks.length > 0) {
        for (const hook of context.afterAllHooks) {
          try {
            await hook();
          } catch (err) {
            console.error(`[CustomTestRunner] Error in afterAll hook:`, err);
            throw err;
          }
        }
        context.afterAllExecuted = true;
        if (this.verbose) {
          console.log('✅ afterAll hooks executed');
        }
      }

      const passed = context.testResults.filter(r => r.status === 'passed').length;
      const failed = context.testResults.filter(r => r.status === 'failed').length;

      if (this.verbose) {
        console.log(`🎯 Test execution completed: ${passed} passed, ${failed} failed`);
      }

      return {
        success: failed === 0,
        testResults: context.testResults,
        beforeAllExecuted: context.beforeAllExecuted,
        afterAllExecuted: context.afterAllExecuted
      };

    } catch (error) {
      console.error(`[CustomTestRunner] VM execution failed:`, error);
      return {
        success: false,
        error: error.message,
        testResults: [],
        beforeAllExecuted: false,
        afterAllExecuted: false
      };
    }
  }
}

module.exports = CustomTestRunner;
