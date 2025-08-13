const { TestParser } = require('./parser');
const { WorkerManager } = require('./worker-manager');
const SimpleWorkerManager = require('./simple-worker-manager'); // NEW: Simplified approach
const { ReportGenerator } = require('./reporter');
const { ExecutionLogger } = require('./execution-logger');
const { Logger } = require('../utils/logger');
const CustomTestRunner = require('../custom-test-runner');

class JestParallelRunner {
  constructor(options) {
    this.options = {
      mode: 'parallel-test',
      testMatch: 'tests/**/*.test.js',
      timeout: 30000,
      maxWorkers: 4,
      reporter: 'both',
      outputDir: './reports',
      intraFileParallelism: true, // Default to true for native-parallel mode
      customRunner: false, // Default to false
      runnerConcurrency: 4, // Default concurrency for custom runner
      useSimpleWorkerManager: true, // NEW: Use simplified approach by default
      ...options
    };
    
    // Initialize execution logger
    this.executionLogger = new ExecutionLogger({
      logDir: this.options.logDir || './logs',
      enableConsole: true,
      enableFile: true
    });
    
    // Initialize logger - use provided logger or create default one
    this.logger = options.logger || new Logger('jest-parallel-runner');
    this.parser = new TestParser(this.logger);
    
    // Choose worker manager based on configuration
    if (this.options.useSimpleWorkerManager) {
      this.logger.info('Using SimpleWorkerManager (no JSON complexity!)');
      this.workerManager = new SimpleWorkerManager({
        maxWorkers: this.options.maxWorkers,
        logger: this.logger
      });
    } else {
      this.logger.info('Using legacy WorkerManager (complex JSON parsing)');
      this.workerManager = new WorkerManager(this.options, this.logger, this.executionLogger);
    }
    
    this.reportGenerator = new ReportGenerator(this.options, this.logger);
  }

  async run() {
    const startTime = Date.now();
    await this.executionLogger.info('STARTUP', `Starting Jest Parallel Worker in ${this.options.mode} mode`);
    
    try {
      // Step 1: Find and parse test files
      await this.executionLogger.info('DISCOVERY', 'Phase 1: Discovering and parsing test files...');
      const testFiles = await this.parser.findTestFiles(this.options.testMatch);
      
      if (testFiles.length === 0) {
        throw new Error(`No test files found matching pattern: ${this.options.testMatch}`);
      }
      
      await this.executionLogger.info('DISCOVERY', `Found ${testFiles.length} test files`);
      const parsedFiles = await this.parser.parseAllTestFiles(testFiles);
      const totalTests = parsedFiles.reduce((sum, file) => sum + file.tests.length, 0);
      
      await this.executionLogger.success('DISCOVERY', `Discovered ${totalTests} tests across ${parsedFiles.length} files`);
      
      // Step 2: Execute tests based on mode and options
      await this.executionLogger.info('EXECUTION', `Phase 2: Executing tests in ${this.options.mode} mode...`);
      let results = [];
      
      // Check if custom runner is enabled
      if (this.options.customRunner) {
        await this.executionLogger.info('EXECUTION', 'Using custom test runner for true intra-file parallelism');
        results = await this.runWithCustomRunner(testFiles);
      } else if (this.options.forceConcurrent && (this.options.mode === 'parallel-file' || this.options.mode === 'jest-parallel')) {
        await this.executionLogger.info('EXECUTION', 'Force concurrent enabled: transforming regular test()/it() calls to test.concurrent()');
        results = await this.workerManager.runConcurrentFiles(parsedFiles);
      } else {
        switch (this.options.mode) {
          case 'parallel-test':
            results = await this.workerManager.runParallelTests(parsedFiles);
            break;
          case 'parallel-file':
            results = await this.workerManager.runParallelFiles(parsedFiles);
            break;
          case 'jest-parallel':
            results = await this.workerManager.runJestParallel(parsedFiles);
            break;
          case 'native-parallel':
            results = await this.workerManager.runNativeParallel(parsedFiles, {
              intraFileParallelism: this.options.intraFileParallelism // Should be true by default
            });
            break;
          default:
            throw new Error(`Unknown execution mode: ${this.options.mode}`);
        }
      }
      
      const endTime = Date.now();
      this.logger.logMemoryUsage('after execution');
      
      // Step 3: Generate reports
      await this.executionLogger.info('REPORTING', 'Phase 3: Generating reports...');
      const summary = {
        startTime,
        endTime,
        duration: endTime - startTime,
        mode: this.options.forceConcurrent && (this.options.mode === 'parallel-file' || this.options.mode === 'jest-parallel') 
          ? `${this.options.mode}-concurrent` : this.options.mode,
        totalFiles: parsedFiles.length,
        totalTests,
        forceConcurrent: this.options.forceConcurrent
      };
      
      const reportData = await this.reportGenerator.generateReports(results, summary, this.options.mode);
      
      // Step 4: Generate execution summary and cleanup
      await this.executionLogger.generateExecutionSummary({
        results,
        summary: reportData.summary,
        metadata: reportData.metadata
      });
      
      this.workerManager.cleanup();
      await this.executionLogger.cleanup();
      
      await this.executionLogger.success('COMPLETION', `Test execution completed in ${this.formatDuration(endTime - startTime)}`);
      
      // Return summary for programmatic use
      return {
        summary: {
          passed: reportData.summary.passed,
          failed: reportData.summary.failed,
          skipped: reportData.summary.skipped,
          totalTests: reportData.summary.totalTests,
          totalDuration: reportData.summary.totalDuration,
          timeSaved: reportData.summary.timeSaved,
          timeSavedPercentage: reportData.summary.timeSavedPercentage
        },
        mode: this.options.mode,
        files: reportData.files || [],
        tests: reportData.tests || []
      };
      
    } catch (error) {
      await this.executionLogger.error('EXECUTION', `Test execution failed: ${error.message}`);
      this.workerManager.cleanup();
      await this.executionLogger.cleanup();
      throw error;
    }
  }

  async runWithCustomRunner(testFiles) {
    const customRunner = new CustomTestRunner({
      maxConcurrency: this.options.runnerConcurrency,
      timeout: this.options.timeout,
      verbose: this.options.verbose || false
    });

    const results = [];
    
    // Process each test file with the custom runner
    for (const testFile of testFiles) {
      try {
        await this.executionLogger.info('CUSTOM_RUNNER', `Running tests in ${testFile} with custom runner`);
        const fileResult = await customRunner.runTestFile(testFile);
        
        // Transform the custom runner result to match the expected format
        const transformedResult = {
          filePath: testFile,
          status: fileResult.status,
          duration: fileResult.duration,
          testCount: fileResult.testResults ? fileResult.testResults.length : 0,
          testResults: fileResult.testResults ? fileResult.testResults.map(test => ({
            testId: `${testFile}:${test.testName}`,
            testName: test.testName,
            name: test.testName,
            status: test.status,
            duration: test.duration,
            error: test.error || null
          })) : [],
          tests: fileResult.testResults ? fileResult.testResults.map(test => ({
            testId: `${testFile}:${test.testName}`,
            testName: test.testName,
            name: test.testName,
            status: test.status,
            duration: test.duration,
            error: test.error || null
          })) : [],
          hooks: {
            beforeAll: fileResult.beforeAllExecuted || false,
            afterAll: fileResult.afterAllExecuted || false
          },
          metadata: {
            customRunner: true,
            intraFileParallelism: true,
            concurrency: this.options.runnerConcurrency
          }
        };
        
        if (fileResult.error) {
          transformedResult.error = fileResult.error;
        }
        
        results.push(transformedResult);
        
        const passed = fileResult.testResults ? fileResult.testResults.filter(t => t.status === 'passed').length : 0;
        const failed = fileResult.testResults ? fileResult.testResults.filter(t => t.status === 'failed').length : 0;
        
        await this.executionLogger.success('CUSTOM_RUNNER', 
          `Completed ${testFile}: ${passed} passed, ${failed} failed in ${fileResult.duration}ms`);
        
      } catch (error) {
        await this.executionLogger.error('CUSTOM_RUNNER', `Failed to run ${testFile}: ${error.message}`);
        
        results.push({
          filePath: testFile,
          status: 'failed',
          duration: 0,
          tests: [],
          error: error.message,
          metadata: {
            customRunner: true,
            intraFileParallelism: true,
            concurrency: this.options.runnerConcurrency
          }
        });
      }
    }
    
    return results;
  }

  formatDuration(ms) {
    if (ms < 1000) {
      return `${ms}ms`;
    } else if (ms < 60000) {
      return `${(ms / 1000).toFixed(1)}s`;
    } else {
      const minutes = Math.floor(ms / 60000);
      const seconds = Math.floor((ms % 60000) / 1000);
      return `${minutes}m ${seconds}s`;
    }
  }

  // Static method for easy programmatic usage
  static async run(options = {}) {
    const { Logger } = require('../utils/logger');
    const logger = new Logger(options.verbose, options.silent);
    
    const runner = new JestParallelRunner({
      ...options,
      logger
    });
    
    return await runner.run();
  }
}

module.exports = { JestParallelRunner };
