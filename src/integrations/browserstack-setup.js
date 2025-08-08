// BrowserStack Setup - Jest setup file for BrowserStack integration
const path = require('path');

// Initialize BrowserStack context for each test file
beforeAll(async () => {
  if (process.env.BROWSERSTACK_ENABLED === 'true') {
    // Set up global BrowserStack context
    global.BROWSERSTACK_CONTEXT = {
      buildId: process.env.BROWSERSTACK_BUILD_ID,
      workerId: process.env.BROWSERSTACK_WORKER_ID || process.pid,
      projectName: process.env.BROWSERSTACK_PROJECT_NAME,
      buildName: process.env.BROWSERSTACK_BUILD_NAME,
      startTime: Date.now(),
      testFile: expect.getState().testPath || 'unknown'
    };

    // Log BrowserStack context initialization
    console.log(`🌐 BrowserStack context initialized for worker ${global.BROWSERSTACK_CONTEXT.workerId}`);
    console.log(`📦 Build: ${global.BROWSERSTACK_CONTEXT.buildId}`);
  }
});

afterAll(async () => {
  if (global.BROWSERSTACK_CONTEXT) {
    const duration = Date.now() - global.BROWSERSTACK_CONTEXT.startTime;
    console.log(`🏁 BrowserStack context cleanup (${duration}ms)`);
    
    // Clean up test context
    global.BROWSERSTACK_CONTEXT = null;
  }
});

// Helper functions for test reporting
global.reportToBrowserStack = function(testName, status, duration = 0, error = null) {
  if (process.env.BROWSERSTACK_ENABLED !== 'true') {
    return;
  }

  try {
    const result = {
      buildId: process.env.BROWSERSTACK_BUILD_ID,
      workerId: process.env.BROWSERSTACK_WORKER_ID || process.pid,
      testPath: expect.getState().testPath || 'unknown',
      testName: testName,
      status: status,
      duration: duration,
      error: error,
      timestamp: new Date().toISOString()
    };

    // Send result (in a real implementation, this would queue for batch sending)
    console.log(`📊 BrowserStack: ${testName} - ${status} (${duration}ms)`);
    
    // Store in global context for potential batching
    if (global.BROWSERSTACK_CONTEXT) {
      if (!global.BROWSERSTACK_CONTEXT.results) {
        global.BROWSERSTACK_CONTEXT.results = [];
      }
      global.BROWSERSTACK_CONTEXT.results.push(result);
    }
  } catch (error) {
    console.warn('Failed to report to BrowserStack:', error.message);
  }
};

// Override test functions to automatically report results
if (process.env.BROWSERSTACK_ENABLED === 'true') {
  // Store original test functions
  const originalTest = global.test;
  const originalIt = global.it;

  // Create wrapper function for test reporting
  function wrapTestFunction(originalFn, testType) {
    return function(testName, testFn, timeout) {
      return originalFn(testName, async function(...args) {
        const startTime = Date.now();
        let status = 'passed';
        let error = null;

        try {
          // Execute the original test function
          const result = await testFn.apply(this, args);
          return result;
        } catch (testError) {
          status = 'failed';
          error = testError.message;
          throw testError;
        } finally {
          const duration = Date.now() - startTime;
          global.reportToBrowserStack(testName, status, duration, error);
        }
      }, timeout);
    };
  }

  // Wrap test functions
  global.test = wrapTestFunction(originalTest, 'test');
  global.it = wrapTestFunction(originalIt, 'it');

  // Handle concurrent tests
  if (originalTest.concurrent) {
    global.test.concurrent = wrapTestFunction(originalTest.concurrent, 'test.concurrent');
  }
  if (originalIt.concurrent) {
    global.it.concurrent = wrapTestFunction(originalIt.concurrent, 'it.concurrent');
  }

  // Preserve other test methods
  Object.keys(originalTest).forEach(key => {
    if (key !== 'concurrent' && typeof originalTest[key] === 'function') {
      global.test[key] = originalTest[key];
    }
  });

  Object.keys(originalIt).forEach(key => {
    if (key !== 'concurrent' && typeof originalIt[key] === 'function') {
      global.it[key] = originalIt[key];
    }
  });
}

module.exports = {
  setupBrowserStackContext: () => global.BROWSERSTACK_CONTEXT,
  reportToBrowserStack: global.reportToBrowserStack
};
