const Mocha = require('mocha');
const path = require('path');
const fs = require('fs');
const BaseAdapter = require('./base-adapter');

class MochaAdapter extends BaseAdapter {
  /**
   * Run a specific test with Mocha
   */
  async runTest({ testFile, testName, configPath, timeout = 5000 }) {
    return new Promise(resolve => {
      try {
        // Create new Mocha instance
        const mocha = new Mocha({
          timeout,
          reporter: 'spec'
        });
        
        // Load user config if provided
        if (configPath && fs.existsSync(configPath)) {
          try {
            const userConfig = require(configPath);
            
            // Apply any relevant config options
            if (userConfig.timeout) {
              mocha.timeout(userConfig.timeout);
            }
            
            if (userConfig.reporter) {
              mocha.reporter(userConfig.reporter);
            }
            
            // Add any other mocha options as needed
          } catch (err) {
            console.error(`Warning: Error loading Mocha config from ${configPath}:`, err.message);
          }
        }
        
        // Filter to run only the specific test
        const escTestName = this.escapeRegExp(testName);
        const grep = new RegExp(`^${escTestName}$`);
        mocha.grep(grep);
        
        // Add the test file
        mocha.addFile(testFile);
        
        // Run the test
        mocha.run(failures => {
          if (failures > 0) {
            resolve({
              success: false,
              errorMessage: `Test "${testName}" failed`
            });
          } else {
            resolve({
              success: true
            });
          }
          
          // Clean up the file from the require cache to avoid conflicts
          // on subsequent runs
          this.purgeCache(testFile);
        });
      } catch (error) {
        resolve({
          success: false,
          errorMessage: error.message || 'Unknown error'
        });
      }
    });
  }
  
  /**
   * Get test file patterns for Mocha
   */
  getDefaultPattern() {
    return "{test,tests}/**/*.{js,cjs,mjs}";
  }
  
  /**
   * Get test function names to look for when parsing
   */
  getTestFunctionNames() {
    return ['it', 'test', 'specify'];
  }
  
  /**
   * Get describe function names to look for when parsing
   */
  getDescribeFunctionNames() {
    return ['describe', 'context', 'suite'];
  }
  
  // Helper function to escape regex special characters
  escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  
  // Helper to purge a module from require cache
  purgeCache(filePath) {
    const resolvedPath = require.resolve(path.resolve(filePath));
    delete require.cache[resolvedPath];
  }
}

module.exports = MochaAdapter;