// BrowserStack Reporter - Jest custom reporter for BrowserStack integration
class BrowserStackReporter {
  constructor(globalConfig, options) {
    this.globalConfig = globalConfig;
    this.options = options || {};
    this.testResults = [];
    this.buildId = process.env.BROWSERSTACK_BUILD_ID;
    this.workerId = process.env.BROWSERSTACK_WORKER_ID || process.pid;
    this.enabled = process.env.BROWSERSTACK_ENABLED === 'true';
  }

  /**
   * Called when a test file starts
   */
  onTestFileStart(test) {
    if (!this.enabled) return;

    // Log test file start
    console.log(`📝 BrowserStack: Starting test file ${test.path}`);
  }

  /**
   * Called when a test file completes
   */
  onTestFileResult(test, testResult, aggregatedResult) {
    if (!this.enabled) return;

    // Process individual test results
    testResult.testResults.forEach(result => {
      const formattedResult = {
        buildId: this.buildId,
        workerId: this.workerId,
        testPath: testResult.testFilePath,
        testName: result.fullName || result.title,
        status: this.mapJestStatusToBrowserStack(result.status),
        duration: result.duration || 0,
        error: result.failureMessages && result.failureMessages.length > 0 
          ? result.failureMessages.join('\n') 
          : null,
        timestamp: new Date().toISOString(),
        suite: test.path
      };

      this.testResults.push(formattedResult);
    });

    // Log file completion
    const passed = testResult.testResults.filter(r => r.status === 'passed').length;
    const failed = testResult.testResults.filter(r => r.status === 'failed').length;
    const skipped = testResult.testResults.filter(r => r.status === 'pending' || r.status === 'skipped').length;
    
    console.log(`📊 BrowserStack: File completed - ${passed} passed, ${failed} failed, ${skipped} skipped`);
  }

  /**
   * Called when all tests complete
   */
  onRunComplete(contexts, results) {
    if (!this.enabled) return;

    console.log(`📊 BrowserStack: Test run completed - ${this.testResults.length} results collected`);
    
    // Send results to BrowserStack
    this.sendResultsToBrowserStack()
      .then(() => {
        console.log('✅ BrowserStack: Results sent successfully');
      })
      .catch(error => {
        console.error('❌ BrowserStack: Failed to send results:', error.message);
      });
  }

  /**
   * Map Jest test status to BrowserStack status
   */
  mapJestStatusToBrowserStack(jestStatus) {
    switch (jestStatus) {
      case 'passed':
        return 'passed';
      case 'failed':
        return 'failed';
      case 'pending':
      case 'skipped':
      case 'disabled':
        return 'skipped';
      default:
        return 'failed';
    }
  }

  /**
   * Send accumulated results to BrowserStack
   */
  async sendResultsToBrowserStack() {
    if (!this.enabled || this.testResults.length === 0) {
      return;
    }

    try {
      // Use BrowserStack client if available
      const BrowserStackClient = require('./browserstack-client');
      const client = new BrowserStackClient();
      
      if (client.isAvailable()) {
        const result = await client.reportTestResults(this.testResults);
        
        if (!result.success) {
          throw new Error(result.error);
        }
      } else {
        // Fallback: just log the results
        console.log(`📊 BrowserStack: Would report ${this.testResults.length} test results`);
        this.testResults.forEach(result => {
          const status = result.status === 'passed' ? '✅' : 
                        result.status === 'failed' ? '❌' : '⏭️';
          console.log(`  ${status} ${result.testName} (${result.duration}ms)`);
        });
      }
    } catch (error) {
      console.error('❌ BrowserStack Reporter Error:', error.message);
      throw error;
    }
  }

  /**
   * Get reporter statistics
   */
  getStats() {
    return {
      enabled: this.enabled,
      buildId: this.buildId,
      workerId: this.workerId,
      resultsCollected: this.testResults.length,
      passed: this.testResults.filter(r => r.status === 'passed').length,
      failed: this.testResults.filter(r => r.status === 'failed').length,
      skipped: this.testResults.filter(r => r.status === 'skipped').length
    };
  }
}

module.exports = BrowserStackReporter;
