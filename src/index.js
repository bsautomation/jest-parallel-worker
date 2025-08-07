const { JestParallelRunner } = require('./core/runner');
const { TestParser } = require('./core/parser');
const { WorkerManager } = require('./core/worker-manager');
const { ReportGenerator } = require('./core/reporter');
const { Logger } = require('./utils/logger');
const { ExecutionLogger } = require('./core/execution-logger');

/**
 * Jest Parallel Worker SDK - Main SDK class for external usage
 */
class JestParallelSDK {
  constructor(options = {}) {
    this.options = {
      maxWorkers: options.maxWorkers || require('os').cpus().length,
      timeout: options.timeout || 30000,
      mode: options.mode || 'native-parallel',
      testMatch: options.testMatch || 'tests/**/*.test.js',
      forceConcurrent: options.forceConcurrent || false,
      verbose: options.verbose || false,
      outputDir: options.outputDir || 'reports',
      reporter: options.reporter || 'both',
      ...options
    };
    
    this.logger = new Logger({ verbose: this.options.verbose });
  }

  /**
   * Main execution method for running tests
   * @param {Object} customOptions - Override options for this run
   * @returns {Promise<Object>} Test results
   */
  async run(customOptions = {}) {
    const finalOptions = { ...this.options, ...customOptions };
    const runner = new JestParallelRunner(finalOptions);
    return await runner.run();
  }

  /**
   * Run tests with lifecycle hooks for external integrations
   * @param {Object} hooks - Lifecycle hooks
   * @returns {Promise<Object>} Test results
   */
  async runWithHooks(hooks = {}) {
    const {
      beforeAll = async () => {},
      beforeEach = async () => {},
      afterEach = async () => {},
      afterAll = async () => {},
      onProgress = () => {},
      onComplete = async () => {}
    } = hooks;

    try {
      await beforeAll();

      const runner = new JestParallelRunner({
        ...this.options,
        onProgress,
        onTestComplete: afterEach,
        onTestStart: beforeEach
      });

      const results = await runner.run();
      
      await afterAll();
      await onComplete(results);
      
      return results;
    } catch (error) {
      this.logger.error('Test execution failed:', error);
      throw error;
    }
  }

  /**
   * Configuration methods for fluent API
   */
  setTestMatch(pattern) {
    this.options.testMatch = pattern;
    return this;
  }

  setMode(mode) {
    this.options.mode = mode;
    return this;
  }

  setTimeout(milliseconds) {
    this.options.timeout = milliseconds;
    return this;
  }

  setMaxWorkers(workers) {
    this.options.maxWorkers = workers;
    return this;
  }

  setOutputDir(dir) {
    this.options.outputDir = dir;
    return this;
  }

  setReporter(reporter) {
    this.options.reporter = reporter;
    return this;
  }

  enableVerbose(verbose = true) {
    this.options.verbose = verbose;
    this.logger = new Logger({ verbose });
    return this;
  }

  enableForceConcurrent(force = true) {
    this.options.forceConcurrent = force;
    return this;
  }

  /**
   * Static factory methods
   */
  static create(options) {
    return new JestParallelSDK(options);
  }

  static async runTests(options) {
    const sdk = new JestParallelSDK(options);
    return await sdk.run();
  }

  /**
   * Get available execution modes
   */
  static getModes() {
    return ['native-parallel', 'parallel-test', 'parallel-file', 'jest-parallel'];
  }

  /**
   * Get available reporters
   */
  static getReporters() {
    return ['console', 'json', 'html', 'both'];
  }

  /**
   * Get default options
   */
  static getDefaultOptions() {
    return {
      mode: 'native-parallel',
      testMatch: 'tests/**/*.test.js',
      timeout: 30000,
      maxWorkers: require('os').cpus().length,
      reporter: 'both',
      outputDir: './reports',
      intraFileParallelism: true,
      customRunner: false,
      runnerConcurrency: 4,
      verbose: false
    };
  }

  /**
   * Validate configuration
   */
  validate() {
    const errors = [];
    
    if (!this.options.testMatch) {
      errors.push('testMatch is required');
    }
    
    if (!JestParallelSDK.getModes().includes(this.options.mode)) {
      errors.push(`Invalid mode: ${this.options.mode}. Valid modes: ${JestParallelSDK.getModes().join(', ')}`);
    }
    
    if (this.options.maxWorkers && this.options.maxWorkers < 1) {
      errors.push('maxWorkers must be >= 1');
    }
    
    if (this.options.timeout && this.options.timeout < 1000) {
      errors.push('timeout must be >= 1000ms');
    }
    
    return errors;
  }
}

// Export both the SDK and individual components for advanced usage
module.exports = {
  // Main SDK class
  JestParallelSDK,
  
  // Core components
  JestParallelRunner,
  TestParser,
  WorkerManager,
  ReportGenerator,
  ExecutionLogger,
  Logger,
  
  // Convenience exports
  default: JestParallelSDK,
  createRunner: (options) => new JestParallelSDK(options),
  
  // Static utilities
  runTests: JestParallelSDK.runTests,
  getModes: JestParallelSDK.getModes
};
