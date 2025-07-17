const { runCLI } = require('@jest/core');
const path = require('path');
const fs = require('fs');
const BaseAdapter = require('./base-adapter');

class JestAdapter extends BaseAdapter {
  /**
   * Run a specific test with Jest
   */
  async runTest({ testFile, testName, configPath, timeout = 4 * 60 * 1000 }) {
    try {
      // Determine project root (directory containing package.json)
      const testFilePath = path.resolve(testFile);
      const testNamePattern = this.escapeRegExp(testName);
      
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
      
      // Set up jest options
      const options = {
        projects: [projectRoot],
        testPathPattern: this.escapePathForWindows(testFilePath),
        testNamePattern: `^${testNamePattern}$`,
        silent: true, // Suppress console output during test run
        verbose: false,
        testTimeout: timeout
      };
      
      // Load user's jest config if provided
      if (configPath && fs.existsSync(configPath)) {
        try {
          const userConfig = require(configPath);
          // Merge configs, but keep our test filters
          options.projects = userConfig.projects || options.projects;
          options.bail = userConfig.bail !== undefined ? userConfig.bail : options.bail;
          options.verbose = userConfig.verbose !== undefined ? userConfig.verbose : options.verbose;
        } catch (err) {
          // If there's an error loading the config, proceed with default options
          console.error(`Warning: Error loading Jest config from ${configPath}:`, err.message);
        }
      }
      
      // Run the test
      const { results } = await runCLI(options, [projectRoot]);
      
      if (results.numFailedTests > 0 || results.numFailedTestSuites > 0) {
        // Extract error message from test failures
        let errorMessage = 'Test failed';
        
        if (results.testResults && results.testResults.length > 0) {
          const testSuite = results.testResults[0];
          const failedTest = testSuite.testResults.find(t => 
            t.status === 'failed' && t.fullName === testName);
            
          if (failedTest && failedTest.failureMessages && failedTest.failureMessages.length > 0) {
            errorMessage = failedTest.failureMessages[0];
          }
        }
        
        return {
          success: false,
          errorMessage
        };
      }
      
      return {
        success: true
      };
    } catch (error) {
      return {
        success: false,
        errorMessage: error.message || 'Unknown error'
      };
    }
  }
  
  /**
   * Get test file patterns for Jest
   */
  getDefaultPattern() {
    return "**/__tests__/**/*.test.{js,jsx,ts,tsx}";
  }
  
  // Helper function to escape regex special characters
  escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  
  // Helper function to escape paths for Windows
  escapePathForWindows(filePath) {
    return process.platform === 'win32' 
      ? filePath.replace(/\\/g, '\\\\') 
      : filePath;
  }
}

module.exports = JestAdapter;