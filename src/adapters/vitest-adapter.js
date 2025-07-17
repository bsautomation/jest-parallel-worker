const { execa } = require('execa');
const path = require('path');
const BaseAdapter = require('./base-adapter');

class VitestAdapter extends BaseAdapter {
  /**
   * Run a specific test with Vitest
   */
  async runTest({ testFile, testName, configPath, timeout = 5000 }) {
    try {
      const testFilePath = path.resolve(testFile);
      const args = [
        'vitest',
        'run',
        testFilePath,
        '--testNamePattern',
        `^${this.escapeRegExp(testName)}$`,
        '--reporter',
        'json',
        '--no-color',
        '--silent',
        '--timeout',
        timeout
      ];
      
      if (configPath) {
        args.push('--config', configPath);
      }

      const { stdout } = await execa('npx', args, {
        reject: false,
        timeout: timeout + 5000  // Add a little extra for process overhead
      });
      
      try {
        const result = JSON.parse(stdout);
        const success = result.testResults.every(suite => 
          suite.assertionResults.every(test => test.status === 'passed')
        );
        
        if (!success) {
          const failedTest = result.testResults
            .flatMap(suite => suite.assertionResults)
            .find(test => test.status === 'failed' && test.title === testName);
          
          const errorMessage = failedTest ? 
            (failedTest.failureMessages[0] || 'Test failed') : 
            'Test failed';
          
          return {
            success: false,
            errorMessage
          };
        }
        
        return {
          success: true
        };
      } catch (parseError) {
        return {
          success: false,
          errorMessage: `Failed to parse Vitest output: ${parseError.message}`
        };
      }
    } catch (error) {
      return {
        success: false,
        errorMessage: error.message || 'Unknown error'
      };
    }
  }
  
  /**
   * Get test file patterns for Vitest
   */
  getDefaultPattern() {
    return "**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}";
  }
  
  // Helper function to escape regex special characters
  escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}

module.exports = VitestAdapter;