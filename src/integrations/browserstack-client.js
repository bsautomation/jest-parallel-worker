// BrowserStack Client - Handles direct SDK interactions
const path = require('path');

class BrowserStackClient {
  constructor(options = {}) {
    this.options = {
      source: 'jest-parallel-worker',
      buildName: process.env.BUILD_NAME || options.buildName || 'jest-parallel-build',
      projectName: process.env.PROJECT_NAME || options.projectName || 'jest-parallel-tests',
      ...options
    };
    
    this.sdk = null;
    this.buildId = null;
    this.isInitialized = false;
    
    // Try to load BrowserStack SDK
    try {
      const { BrowserStackSdk } = require('browserstack-node-sdk');
      this.sdk = new BrowserStackSdk(this.options);
    } catch (error) {
      console.warn('BrowserStack SDK not available:', error.message);
      this.sdk = null;
    }
  }

  /**
   * Check if BrowserStack is available and configured
   */
  isAvailable() {
    return !!(
      this.sdk &&
      process.env.BROWSERSTACK_USERNAME &&
      process.env.BROWSERSTACK_ACCESS_KEY
    );
  }

  /**
   * Initialize BrowserStack session and create build
   */
  async initialize() {
    if (!this.isAvailable()) {
      return { success: false, error: 'BrowserStack SDK or credentials not available' };
    }

    try {
      // Create a new build
      this.buildId = await this.createBuild();
      this.isInitialized = true;
      
      // Set environment variables for worker processes
      process.env.BROWSERSTACK_BUILD_ID = this.buildId;
      process.env.BROWSERSTACK_ENABLED = 'true';
      
      return {
        success: true,
        buildId: this.buildId,
        dashboardUrl: `https://automate.browserstack.com/dashboard/v2/builds/${this.buildId}`
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Create a new build in BrowserStack
   */
  async createBuild() {
    try {
      const buildInfo = {
        name: this.options.buildName,
        project: this.options.projectName,
        start_time: new Date().toISOString(),
        tags: ['jest-parallel-worker', 'parallel-testing']
      };

      // Use the SDK to create build
      if (this.sdk && typeof this.sdk.createBuild === 'function') {
        const buildResponse = await this.sdk.createBuild(buildInfo);
        return buildResponse.build_id || buildResponse.id || this.generateFallbackBuildId();
      } else {
        // Fallback for different SDK versions
        return this.generateFallbackBuildId();
      }
    } catch (error) {
      console.warn('Failed to create BrowserStack build, using fallback:', error.message);
      return this.generateFallbackBuildId();
    }
  }

  /**
   * Generate fallback build ID when SDK is not available
   */
  generateFallbackBuildId() {
    return `jest-parallel-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  }

  /**
   * Report test results to BrowserStack
   */
  async reportTestResults(testResults) {
    if (!this.isInitialized || !this.sdk) {
      return { success: false, error: 'BrowserStack not initialized' };
    }

    try {
      // Format test results for BrowserStack
      const formattedResults = testResults.map(result => ({
        buildId: this.buildId,
        testPath: result.filePath || result.testPath,
        testName: result.testName || result.name,
        status: result.status,
        duration: result.duration || 0,
        error: result.error || null,
        timestamp: new Date().toISOString()
      }));

      // Send results to BrowserStack if SDK supports it
      if (this.sdk && typeof this.sdk.reportTestResults === 'function') {
        await this.sdk.reportTestResults(formattedResults);
      }

      return { success: true, resultsCount: formattedResults.length };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Mark session with status
   */
  async markSession(sessionId, status, reason = '') {
    if (!this.isInitialized || !this.sdk) {
      return { success: false, error: 'BrowserStack not initialized' };
    }

    try {
      if (this.sdk && typeof this.sdk.markSessionStatus === 'function') {
        await this.sdk.markSessionStatus(sessionId, status, reason);
      }
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Finalize build with final status
   */
  async finalizeBuild(buildStatus) {
    if (!this.isInitialized || !this.buildId) {
      return { success: false, error: 'BrowserStack build not initialized' };
    }

    try {
      const finalStatus = {
        build_id: this.buildId,
        status: buildStatus.status || (buildStatus.failed === 0 ? 'passed' : 'failed'),
        totalTests: buildStatus.totalTests || 0,
        passedTests: buildStatus.passed || 0,
        failedTests: buildStatus.failed || 0,
        skippedTests: buildStatus.skipped || 0,
        duration: buildStatus.duration || 0,
        end_time: new Date().toISOString()
      };

      // Finalize build if SDK supports it
      if (this.sdk && typeof this.sdk.finalizeBuild === 'function') {
        await this.sdk.finalizeBuild(this.buildId, finalStatus);
      }

      return {
        success: true,
        buildId: this.buildId,
        dashboardUrl: `https://automate.browserstack.com/dashboard/v2/builds/${this.buildId}`
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Cleanup and close BrowserStack session
   */
  async cleanup() {
    try {
      if (this.sdk && typeof this.sdk.cleanup === 'function') {
        await this.sdk.cleanup();
      }
      
      // Clear environment variables
      delete process.env.BROWSERSTACK_BUILD_ID;
      delete process.env.BROWSERSTACK_ENABLED;
      
      this.isInitialized = false;
      this.buildId = null;
      
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Get build information
   */
  getBuildInfo() {
    return {
      buildId: this.buildId,
      isInitialized: this.isInitialized,
      isAvailable: this.isAvailable(),
      dashboardUrl: this.buildId ? `https://automate.browserstack.com/dashboard/v2/builds/${this.buildId}` : null,
      options: this.options
    };
  }
}

module.exports = BrowserStackClient;
