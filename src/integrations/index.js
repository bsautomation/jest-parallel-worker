// BrowserStack Integration Module - Main entry point
const BrowserStackClient = require('./browserstack-client');
const BrowserStackManager = require('./browserstack-manager');
const BrowserStackReporter = require('./browserstack-reporter');

// Main integration facade
class BrowserStackIntegration {
  constructor(options = {}) {
    this.options = {
      enabled: this.checkIfEnabled(),
      buildName: process.env.BUILD_NAME || options.buildName,
      projectName: process.env.PROJECT_NAME || options.projectName,
      autoReport: options.autoReport !== false,
      logger: options.logger || console,
      ...options
    };

    this.manager = new BrowserStackManager(this.options);
    this.isInitialized = false;
  }

  /**
   * Check if BrowserStack should be enabled
   */
  checkIfEnabled() {
    return !!(
      process.env.BROWSERSTACK_USERNAME &&
      process.env.BROWSERSTACK_ACCESS_KEY
    );
  }

  /**
   * Initialize BrowserStack integration
   */
  async initialize() {
    if (!this.options.enabled) {
      return { success: true, enabled: false, message: 'BrowserStack integration disabled' };
    }

    try {
      const result = await this.manager.initialize();
      this.isInitialized = result.enabled;
      
      if (result.enabled) {
        this.options.logger.info('🌐 BrowserStack integration initialized successfully');
        return {
          success: true,
          enabled: true,
          buildId: result.buildId,
          dashboardUrl: result.dashboardUrl
        };
      } else {
        this.options.logger.warn('⚠️  BrowserStack integration could not be enabled');
        return { success: true, enabled: false, error: result.error };
      }
    } catch (error) {
      this.options.logger.error('❌ BrowserStack initialization failed:', error.message);
      return { success: false, enabled: false, error: error.message };
    }
  }

  /**
   * Report test results
   */
  reportTestResults(testResults) {
    if (!this.isInitialized) {
      return;
    }

    if (Array.isArray(testResults)) {
      this.manager.addTestResults(testResults);
    } else {
      this.manager.addTestResult(testResults);
    }
  }

  /**
   * Finalize the build
   */
  async finalize(executionSummary) {
    if (!this.isInitialized) {
      return { success: true, enabled: false };
    }

    return await this.manager.finalize(executionSummary);
  }

  /**
   * Cleanup resources
   */
  async cleanup() {
    if (!this.isInitialized) {
      return { success: true };
    }

    return await this.manager.cleanup();
  }

  /**
   * Get current status
   */
  getStatus() {
    return {
      enabled: this.options.enabled,
      initialized: this.isInitialized,
      ...this.manager.getStatus()
    };
  }

  /**
   * Get build information
   */
  getBuildInfo() {
    return this.manager.getBuildInfo();
  }

  /**
   * Get worker environment variables
   */
  getWorkerEnvironment() {
    return this.manager.getWorkerContext();
  }

  /**
   * Create Jest configuration for BrowserStack reporting
   */
  getJestConfig() {
    if (!this.isInitialized) {
      return {};
    }

    return {
      reporters: [
        'default',
        [require.resolve('./browserstack-reporter'), {}]
      ],
      setupFilesAfterEnv: [
        require.resolve('./browserstack-setup')
      ]
    };
  }

  /**
   * Static factory method
   */
  static create(options = {}) {
    return new BrowserStackIntegration(options);
  }

  /**
   * Static method to check if BrowserStack is available
   */
  static isAvailable() {
    return !!(
      process.env.BROWSERSTACK_USERNAME &&
      process.env.BROWSERSTACK_ACCESS_KEY
    );
  }
}

module.exports = {
  BrowserStackIntegration,
  BrowserStackClient,
  BrowserStackManager,
  BrowserStackReporter,
  
  // Convenience exports
  default: BrowserStackIntegration,
  create: BrowserStackIntegration.create,
  isAvailable: BrowserStackIntegration.isAvailable
};
