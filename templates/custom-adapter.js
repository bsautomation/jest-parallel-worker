/**
 * Example custom adapter for test-parallel-worker
 * 
 * To create your own adapter:
 * 1. Create a new npm package named test-parallel-adapter-{framework}
 * 2. Use this template as a starting point
 * 3. Implement the required methods
 */

const { BaseAdapter } = require('test-parallel-worker/src/adapters/base-adapter');

class CustomAdapter extends BaseAdapter {
  /**
   * Run a specific test with your framework
   * @param {Object} options Test options
   * @param {string} options.testFile Path to the test file
   * @param {string} options.testName Name of the test to run
   * @param {string} options.configPath Path to framework config file
   * @param {number} options.timeout Test timeout in milliseconds
   * @returns {Promise<{success: boolean, errorMessage?: string}>}
   */
  async runTest({ testFile, testName, configPath, timeout }) {
    // Implement your test execution logic
    // Return { success: true } if test passes
    // Return { success: false, errorMessage: 'reason' } if test fails
    throw new Error('Method runTest must be implemented');
  }
  
  /**
   * Get the default file pattern for your framework's test files
   * @returns {string} Glob pattern
   */
  getDefaultPattern() {
    return "**/*.{test,spec}.js";
  }
  
  /**
   * Get the function names that define tests in your framework
   * @returns {Array<string>} Array of function names
   */
  getTestFunctionNames() {
    return ['it', 'test'];
  }
  
  /**
   * Get the function names that define test suites in your framework
   * @returns {Array<string>} Array of function names
   */
  getDescribeFunctionNames() {
    return ['describe', 'suite'];
  }
  
  /**
   * Helper function to escape regex special characters
   */
  escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}

module.exports = CustomAdapter;