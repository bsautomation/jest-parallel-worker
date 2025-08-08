// BrowserStack Integration Manager - Orchestrates BrowserStack lifecycle
const BrowserStackClient = require('./browserstack-client');

class BrowserStackManager {
  constructor(options = {}) {
    this.options = {
      enabled: this.checkIfEnabled(),
      buildName: process.env.BUILD_NAME || options.buildName || 'jest-parallel-build',
      projectName: process.env.PROJECT_NAME || options.projectName || 'jest-parallel-tests',
      autoReport: options.autoReport !== false, // Default to true
      ...options
    };
    
    this.client = null;
    this.buildInfo = null;
    this.testResults = [];
    this.logger = options.logger || console;
  }

  /**
   * Check if BrowserStack integration should be enabled
   */
  checkIfEnabled() {
    return !!(
      process.env.BROWSERSTACK_USERNAME &&
      process.env.BROWSERSTACK_ACCESS_KEY &&
      (process.env.BROWSERSTACK_ENABLED === 'true' || process.env.BROWSERSTACK_ENABLED === true)
    );
  }

  /**
   * Initialize BrowserStack integration
   */
  async initialize() {
    if (!this.options.enabled) {
      this.logger.info('🔄 BrowserStack integration disabled or credentials not found');
      return { success: true, enabled: false };
    }

    try {
      this.client = new BrowserStackClient({
        buildName: this.options.buildName,
        projectName: this.options.projectName
      });

      if (!this.client.isAvailable()) {
        this.logger.warn('⚠️  BrowserStack SDK not available or credentials missing');
        return { success: true, enabled: false };
      }

      const result = await this.client.initialize();
      
      if (result.success) {
        this.buildInfo = {
          buildId: result.buildId,
          dashboardUrl: result.dashboardUrl,
          startTime: new Date().toISOString()
        };

        this.logger.info(`🌐 BrowserStack Build: ${result.buildId}`);
        this.logger.info(`📊 Dashboard: ${result.dashboardUrl}`);
        
        return { 
          success: true, 
          enabled: true, 
          buildId: result.buildId,
          dashboardUrl: result.dashboardUrl 
        };
      } else {
        this.logger.warn(`⚠️  BrowserStack initialization failed: ${result.error}`);
        return { success: true, enabled: false, error: result.error };
      }
    } catch (error) {
      this.logger.error(`❌ BrowserStack initialization error: ${error.message}`);
      return { success: true, enabled: false, error: error.message };
    }
  }

  /**
   * Add test result for reporting
   */
  addTestResult(testResult) {
    if (!this.isEnabled()) {
      return;
    }

    const formattedResult = {
      filePath: testResult.filePath || testResult.testPath,
      testName: testResult.testName || testResult.name || testResult.title,
      status: testResult.status,
      duration: testResult.duration || 0,
      error: testResult.error || testResult.failureMessage || null,
      timestamp: new Date().toISOString(),
      workerId: testResult.workerId || process.env.BROWSERSTACK_WORKER_ID
    };

    this.testResults.push(formattedResult);

    // Auto-report if enabled
    if (this.options.autoReport && this.testResults.length % 10 === 0) {
      this.reportBatch().catch(error => {
        this.logger.warn(`Failed to auto-report batch: ${error.message}`);
      });
    }
  }

  /**
   * Add multiple test results
   */
  addTestResults(testResults) {
    if (!Array.isArray(testResults)) {
      return;
    }

    testResults.forEach(result => this.addTestResult(result));
  }

  /**
   * Report accumulated test results in batches
   */
  async reportBatch() {
    if (!this.isEnabled() || this.testResults.length === 0) {
      return { success: true, reported: 0 };
    }

    try {
      const batchSize = 50; // Report in batches of 50
      const batch = this.testResults.splice(0, batchSize);
      
      const result = await this.client.reportTestResults(batch);
      
      if (result.success) {
        this.logger.debug(`📊 Reported ${batch.length} test results to BrowserStack`);
      } else {
        this.logger.warn(`⚠️  Failed to report test results: ${result.error}`);
        // Re-add failed results back to queue
        this.testResults.unshift(...batch);
      }

      return result;
    } catch (error) {
      this.logger.error(`❌ Error reporting test results: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Report all remaining test results
   */
  async reportAll() {
    if (!this.isEnabled()) {
      return { success: true, enabled: false };
    }

    const results = [];
    while (this.testResults.length > 0) {
      const result = await this.reportBatch();
      results.push(result);
      
      if (!result.success) {
        break;
      }
    }

    return {
      success: results.every(r => r.success),
      batches: results.length,
      totalReported: results.reduce((sum, r) => sum + (r.reported || 0), 0)
    };
  }

  /**
   * Finalize the BrowserStack build
   */
  async finalize(executionSummary) {
    if (!this.isEnabled()) {
      return { success: true, enabled: false };
    }

    try {
      // Report any remaining test results
      await this.reportAll();

      // Finalize the build
      const buildStatus = {
        status: executionSummary.failed === 0 ? 'passed' : 'failed',
        totalTests: executionSummary.totalTests || 0,
        passed: executionSummary.passed || 0,
        failed: executionSummary.failed || 0,
        skipped: executionSummary.skipped || 0,
        duration: executionSummary.totalDuration || 0
      };

      const result = await this.client.finalizeBuild(buildStatus);
      
      if (result.success) {
        this.logger.success(`✅ BrowserStack build finalized: ${buildStatus.status}`);
        this.logger.info(`📊 Final Dashboard: ${result.dashboardUrl}`);
        
        return {
          success: true,
          buildId: result.buildId,
          dashboardUrl: result.dashboardUrl,
          status: buildStatus.status
        };
      } else {
        this.logger.warn(`⚠️  Failed to finalize BrowserStack build: ${result.error}`);
        return { success: false, error: result.error };
      }
    } catch (error) {
      this.logger.error(`❌ Error finalizing BrowserStack build: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Cleanup BrowserStack resources
   */
  async cleanup() {
    if (!this.isEnabled()) {
      return { success: true };
    }

    try {
      const result = await this.client.cleanup();
      this.client = null;
      this.buildInfo = null;
      this.testResults = [];
      
      return result;
    } catch (error) {
      this.logger.error(`❌ Error cleaning up BrowserStack: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Check if BrowserStack integration is enabled and initialized
   */
  isEnabled() {
    return this.options.enabled && this.client && this.client.isInitialized;
  }

  /**
   * Get current BrowserStack status
   */
  getStatus() {
    return {
      enabled: this.options.enabled,
      initialized: this.isEnabled(),
      buildInfo: this.buildInfo,
      pendingResults: this.testResults.length,
      options: this.options
    };
  }

  /**
   * Get build information for external use
   */
  getBuildInfo() {
    if (!this.isEnabled()) {
      return null;
    }

    return {
      ...this.buildInfo,
      ...this.client.getBuildInfo()
    };
  }

  /**
   * Create a worker context for child processes
   */
  getWorkerContext() {
    if (!this.isEnabled()) {
      return {};
    }

    return {
      BROWSERSTACK_ENABLED: 'true',
      BROWSERSTACK_BUILD_ID: this.buildInfo?.buildId,
      BROWSERSTACK_PROJECT_NAME: this.options.projectName,
      BROWSERSTACK_BUILD_NAME: this.options.buildName
    };
  }
}

module.exports = BrowserStackManager;
