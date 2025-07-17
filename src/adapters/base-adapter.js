/**
 * Base adapter interface for test frameworks
 */
class BaseAdapter {
  /**
   * Run a specific test within a file
   * 
   * @param {Object} options 
   * @param {string} options.testFile - Path to the test file
   * @param {string} options.testName - Name of the test to run
   * @param {string} options.configPath - Path to framework config file
   * @param {number} options.timeout - Test timeout in ms
   * @returns {Promise<{success: boolean, errorMessage?: string}>}
   */
  async runTest({ testFile, testName, configPath, timeout }) {
    throw new Error('Method runTest must be implemented by adapter');
  }
  
  /**
   * Get test file patterns for this framework
   * 
   * @returns {string} Default glob pattern for test files
   */
  getDefaultPattern() {
    return "**/__tests__/**/*.test.js";
  }
  
  /**
   * Get test function names to look for when parsing
   * 
   * @returns {Array<string>} Array of function names that define tests (e.g. ['it', 'test'])
   */
  getTestFunctionNames() {
    return ['it', 'test'];
  }
  
  /**
   * Get describe function names to look for when parsing
   * 
   * @returns {Array<string>} Array of function names that define test suites
   */
  getDescribeFunctionNames() {
    return ['describe'];
  }
}

module.exports = BaseAdapter;