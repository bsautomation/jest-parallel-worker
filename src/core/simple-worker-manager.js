const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { performance } = require('perf_hooks');
const { Logger } = require('../utils/logger');

/**
 * Simplified Worker Manager - NO JSON PARSING!
 * Uses Jest's natural output format and exit codes instead of complex JSON communication
 * Feature-complete with BrowserStack SDK support and all legacy worker-manager capabilities
 */
class SimpleWorkerManager {
  constructor(options = {}, logger, executionLogger) {
    this.options = options || {}; // Store full options for worker configuration
    this.maxWorkers = options.maxWorkers || require('os').cpus().length;
    
    // Timeout should already be in milliseconds from config processing
    // Default to 5 minutes (300000ms) if not provided
    this.timeout = options.timeout || (5 * 60 * 1000);
    
    this.logger = logger || options.logger || new Logger('SimpleWorkerManager', 'debug');
    this.executionLogger = executionLogger;
    
    this.results = [];
    this.activeWorkers = new Map();
    this.workQueue = [];
    this.completedWork = 0;
    this.totalWork = 0;
    this.reporterInstance = null;
    
    // Add execution timing tracking
    this.executionStartTime = null;
    this.executionEndTime = null;
    
    // Add real-time test status tracking
    this.testStatus = {
      total: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
      running: 0,
      completed: 0
    };
    
    this.lastStatusUpdate = 0;
    this.statusUpdateInterval = 1000; // Update every 1 second
    
    // BrowserStack build management
    // Generate a consistent BrowserStack build ID for all workers in this execution
    this.browserstackBuildId = this.generateBrowserStackBuildId();
    
    this.logger.debug(`SimpleWorkerManager initialized with ${this.maxWorkers} max workers and ${this.timeout}ms timeout`);
    if (this.browserstackBuildId) {
      this.logger.debug(`BrowserStack Build ID for unified builds: ${this.browserstackBuildId}`);
    }
  }

  // Generate or retrieve a consistent build ID for BrowserStack integration
  getBrowserStackBuildId() {
    return this.browserstackBuildId;
  }
  
  // Generate a new build ID based on timestamp and process info
  generateBrowserStackBuildId() {
    // Check if a build ID is already set in environment (from parent process or CI)
    if (process.env.BROWSERSTACK_BUILD_ID) {
      this.logger.debug(`Using existing BrowserStack build ID from environment: ${process.env.BROWSERSTACK_BUILD_ID}`);
      return process.env.BROWSERSTACK_BUILD_ID;
    }
    
    // Generate a new build ID based on timestamp and process info
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const randomSuffix = Math.random().toString(36).substring(2, 8);
    const buildId = `jest-parallel-${timestamp}-${randomSuffix}`;
    
    // Set the generated build ID in the environment so all subsequent processes use the same one
    process.env.BROWSERSTACK_BUILD_ID = buildId;
    
    this.logger.debug(`Generated new BrowserStack build ID: ${buildId}`);
    this.logger.debug(`Set BROWSERSTACK_BUILD_ID environment variable for unified builds`);
    return buildId;
  }

  // Helper method to format duration in human-readable format
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

  // Add real-time test status tracking methods
  initializeTestCounts(parsedFiles) {
    this.testStatus.total = parsedFiles.reduce((sum, file) => sum + (file.tests ? file.tests.length : 1), 0);
    this.testStatus.passed = 0;
    this.testStatus.failed = 0;
    this.testStatus.skipped = 0;
    this.testStatus.running = 0;
    this.testStatus.completed = 0;
    
    this.logTestStatus('INITIALIZED');
  }
  
  updateTestStatus(testResults) {
    if (!testResults || !Array.isArray(testResults)) {
      return;
    }
    
    // Count results from the latest batch
    const newPassed = testResults.filter(r => r.status === 'passed').length;
    const newFailed = testResults.filter(r => r.status === 'failed').length;
    const newSkipped = testResults.filter(r => r.status === 'skipped').length;
    
    // Update cumulative counts
    this.testStatus.passed += newPassed;
    this.testStatus.failed += newFailed;  
    this.testStatus.skipped += newSkipped;
    
    // Recalculate derived counts
    this.testStatus.completed = this.testStatus.passed + this.testStatus.failed + this.testStatus.skipped;
    this.testStatus.running = Math.max(0, this.testStatus.total - this.testStatus.completed);
    
    // Debug logging for test count validation
    this.logger.debug(`Test status update: +${newPassed} passed, +${newFailed} failed, +${newSkipped} skipped`);
    this.logger.debug(`Cumulative: ${this.testStatus.passed} passed, ${this.testStatus.failed} failed, ${this.testStatus.skipped} skipped, ${this.testStatus.completed}/${this.testStatus.total} total`);
    
    // Always log status update on each completion for real-time progress
    this.logTestStatus('PROGRESS');
    this.lastStatusUpdate = Date.now();
  }
  
  async logTestStatus(phase) {
    const { total, passed, failed, skipped, running, completed } = this.testStatus;
    const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
    
    const statusMessage = `Tests: ${completed}/${total} (${percentage}%) | ✓ ${passed} passed | ✗ ${failed} failed | ○ ${skipped} skipped | ⟳ ${running} running`;
    
    // Log to console with color coding
    if (failed > 0) {
      this.logger.warn(`[${phase}] ${statusMessage}`);
    } else {
      this.logger.info(`[${phase}] ${statusMessage}`);
    }
    
    // Log to file with detailed information (if execution logger available)
    if (this.executionLogger) {
      await this.executionLogger.info('TEST-STATUS', `${phase}: ${statusMessage}`);
      
      // Log detailed breakdown to file
      if (phase === 'PROGRESS' && completed > 0) {
        const successRate = total > 0 ? ((passed / completed) * 100).toFixed(1) : '0.0';
        await this.executionLogger.info('TEST-METRICS', 
          `Success Rate: ${successRate}% | Completion: ${percentage}% | Throughput: ${completed} tests completed`
        );
      }
    }
  }
  
  async logFinalTestStatus() {
    await this.logTestStatus('FINAL');
    
    const { total, passed, failed, skipped } = this.testStatus;
    const successRate = total > 0 ? ((passed / total) * 100).toFixed(1) : '0.0';
    
    // Log comprehensive final summary (if execution logger available)
    if (this.executionLogger) {
      await this.executionLogger.info('TEST-SUMMARY', 
        `Final Results: ${total} total tests | ${passed} passed | ${failed} failed | ${skipped} skipped | Success Rate: ${successRate}%`
      );
      
      if (failed > 0) {
        await this.executionLogger.warn('TEST-SUMMARY', `${failed} test(s) failed - check individual test results for details`);
      } else {
        await this.executionLogger.success('TEST-SUMMARY', `All ${passed} tests passed successfully!`);
      }
    }
  }

  setReporter(reporter) {
    this.reporterInstance = reporter;
  }

  async processTestFiles(testFiles, options = {}) {
    // Handle both parsed file objects and simple file paths
    const filePaths = testFiles.map(f => typeof f === 'string' ? f : f.filePath);
    
    this.logger.info(`Processing ${filePaths.length} test files with simplified approach`);
    
    // Record execution start time (if not already set by interface methods)
    if (!this.executionStartTime) {
      this.executionStartTime = new Date();
      
      if (this.executionLogger) {
        await this.executionLogger.info('WORKER-MANAGER', `Starting simplified parallel execution with ${this.maxWorkers} workers`);
      }
      this.logger.info(`Execution started at: ${this.executionStartTime.toISOString()}`);
    }
    
    const startTime = performance.now();
    this.results = [];
    this.completedWork = 0;
    this.totalWork = filePaths.length;
    
    // Create work items - one per test file
    this.workQueue = filePaths.map((filePath, index) => ({
      id: `work-${index}`,
      filePath: filePath,
      strategy: options.strategy || 'file-parallelism'
    }));
    
    // Process work items with worker pool
    await this.processWorkQueue();
    
    const duration = performance.now() - startTime;
    this.executionEndTime = new Date();
    
    // Log final test status
    await this.logFinalTestStatus();
    
    this.logger.info(`Completed processing ${this.results.length} files in ${Math.round(duration)}ms`);
    
    return {
      results: this.results,
      summary: this.generateSummary(),
      duration: duration
    };
  }

  async processWorkQueue() {
    const promises = [];
    
    this.logger.debug(`Starting ${Math.min(this.maxWorkers, this.workQueue.length)} workers for ${this.workQueue.length} work items`);
    
    // Start workers immediately for all available work items (up to maxWorkers)
    const workersToStart = Math.min(this.maxWorkers, this.workQueue.length);
    for (let i = 0; i < workersToStart; i++) {
      const workItem = this.workQueue.shift();
      if (workItem) {
        this.logger.debug(`Starting immediate worker ${i + 1}/${workersToStart} for ${workItem.filePath}`);
        promises.push(this.executeTestFile(workItem));
      }
    }
    
    this.logger.info(`Started ${promises.length} parallel workers immediately`);
    
    // Wait for all work to complete
    await Promise.all(promises);
  }

  async executeTestFile(workItem) {
    const workerId = `worker-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.logger.info(`Starting ${workerId} for ${workItem.filePath}`);
    
    // Track active worker
    this.activeWorkers.set(workerId, { 
      startTime: Date.now(), 
      filePath: workItem.filePath,
      status: 'running'
    });
    
    // Log worker start (non-blocking)
    if (this.executionLogger) {
      this.executionLogger.logWorkerStart(workerId, workItem).catch(err => 
        console.error('Logging error:', err.message)
      );
    }
    
    const startTime = performance.now();
    
    try {
      // Run Jest directly on the test file - simple and reliable!
      const result = await this.runJestOnFile(workItem.filePath, workerId);
      
      const duration = performance.now() - startTime;
      
      // Create simple result from Jest output
      const processedResult = {
        status: this.determineTestStatus(result.exitCode, result.output, result.errorOutput),
        filePath: workItem.filePath,
        testResults: this.parseJestTestResults(result.output, result.errorOutput),
        output: result.output,
        errorOutput: result.errorOutput,
        duration: Math.round(duration),
        workerId: workerId,
        exitCode: result.exitCode,
        strategy: workItem.strategy
      };
      
      this.results.push(processedResult);
      this.completedWork++;
      
      // Update test status tracking
      this.updateTestStatus(processedResult.testResults);
      
      this.logger.info(`${workerId} completed ${workItem.filePath} - Status: ${processedResult.status}, Tests: ${processedResult.testResults.length}, Duration: ${processedResult.duration}ms`);
      
      // Log worker completion (non-blocking)
      if (this.executionLogger) {
        this.executionLogger.logWorkerComplete(workerId, { 
          exitCode: result.exitCode, 
          status: processedResult.status,
          duration: processedResult.duration,
          testCount: processedResult.testResults.length
        }).catch(err => console.error('Logging error:', err.message));
      }
      
      // Update progress if reporter available
      if (this.reporterInstance && this.reporterInstance.updateProgress) {
        this.reporterInstance.updateProgress(this.completedWork, this.totalWork, processedResult);
      }
      
    } catch (error) {
      const duration = performance.now() - startTime;
      this.logger.error(`${workerId} failed for ${workItem.filePath}: ${error.message}`);
      
      // Create error result
      const errorResult = {
        status: 'failed',
        filePath: workItem.filePath,
        testResults: [],
        output: '',
        errorOutput: error.message,
        duration: Math.round(duration),
        workerId: workerId,
        exitCode: 1,
        strategy: workItem.strategy,
        error: error.message
      };
      
      this.results.push(errorResult);
      this.completedWork++;
      
      // Log worker completion with error (non-blocking)
      if (this.executionLogger) {
        this.executionLogger.logWorkerComplete(workerId, { 
          exitCode: 1, 
          status: 'failed',
          duration: Math.round(duration),
          error: error.message
        }).catch(err => console.error('Logging error:', err.message));
      }
    } finally {
      // Remove from active workers tracking
      this.activeWorkers.delete(workerId);
      this.logger.debug(`${workerId} removed from active workers (${this.activeWorkers.size} remaining)`);
    }
  }

  async runJestOnFile(filePath, workerId) {
    return new Promise((resolve, reject) => {
      // Use relative path from current working directory (user's directory)
      const relativePath = path.relative(process.cwd(), filePath);
      
      // Generate or use existing BrowserStack build ID for unified builds
      const browserstackBuildId = this.getBrowserStackBuildId();
      
      // Check if BrowserStack SDK should be used
      const useBrowserStackSDK = this.options.browserstackSdk === true || 
                                process.env.BROWSERSTACK_SDK_ENABLED === 'true';
      
      let jestCommand, jestArgs;
      
      if (useBrowserStackSDK) {
        // Use BrowserStack Node SDK to wrap Jest execution
        jestCommand = 'npx';
        jestArgs = [
          'browserstack-node-sdk',
          'jest',
          // NO --config flag! Let Jest find user's jest.config.js/package.json automatically
          '--verbose',
          '--no-cache',
          '--forceExit',
          path.resolve(filePath)  // Use absolute path to test file from original directory
          // NO --json flag! We use only text output and exit codes
        ];
        
      } else {
        // Simple Jest command - pure text output, no JSON complexity!
        // Let Jest find the user's configuration automatically
        jestCommand = 'npx';
        jestArgs = [
          'jest',
          // NO --config flag! Let Jest find user's jest.config.js/package.json automatically
          '--verbose',
          '--no-cache',
          '--forceExit',
          relativePath            // Use relative path from user's directory
          // NO --json flag! We use only text output and exit codes
        ];
      }
      
      this.logger.info(`${workerId} executing: ${jestCommand} ${jestArgs.join(' ')}`);
      if (useBrowserStackSDK) {
        this.logger.info(`${workerId} using BrowserStack Node SDK for test reporting`);
      }
      this.logger.debug(`${workerId} working directory: ${process.cwd()}`);
      this.logger.debug(`${workerId} relative path: ${relativePath}`);
      if (browserstackBuildId) {
        this.logger.debug(`${workerId} using BrowserStack build ID: ${browserstackBuildId}`);
      }
      
      let output = '';
      let errorOutput = '';
      let isResolved = false;
      
      const child = spawn(jestCommand, jestArgs, {
        cwd: process.cwd(), // Use original working directory
        env: {
          ...process.env,
          NODE_ENV: 'test',
          NODE_OPTIONS: '--max-old-space-size=4096',
          // Jest-specific environment variables to help with shutdown
          JEST_DETECT_OPEN_HANDLES: 'true',
          JEST_FORCE_EXIT: 'true',
          // BrowserStack unified build configuration - FORCE SINGLE BUILD
          BROWSERSTACK_BUILD_ID: browserstackBuildId,
          BROWSERSTACK_BUILD_NAME: process.env.BROWSERSTACK_BUILD_NAME || process.env.BUILD_NAME || 'Jest Parallel Test Build',
          BROWSERSTACK_PROJECT_NAME: process.env.BROWSERSTACK_PROJECT_NAME || process.env.PROJECT_NAME || 'Jest Parallel Tests',
          // Enable BrowserStack SDK if configured
          BROWSERSTACK_SDK_ENABLED: this.options.browserstackSdk ? 'true' : 'false',
          // Pass BrowserStack credentials from browserstack.yml if they exist
          BROWSERSTACK_USERNAME: process.env.BROWSERSTACK_USERNAME,
          BROWSERSTACK_ACCESS_KEY: process.env.BROWSERSTACK_ACCESS_KEY,
          // Worker identification for debugging
          JEST_WORKER_ID: workerId,
          JEST_PARALLEL_WORKER: 'true'
        },
        stdio: ['pipe', 'pipe', 'pipe']
      });
      
      // Update active worker tracking with process info
      if (this.activeWorkers.has(workerId)) {
        this.activeWorkers.get(workerId).process = child;
        this.activeWorkers.get(workerId).pid = child.pid;
      }
      
      child.stdout.on('data', (data) => {
        output += data.toString();
        this.logger.debug(`${workerId} stdout chunk: ${data.toString().substring(0, 100)}...`);
      });
      
      child.stderr.on('data', (data) => {
        errorOutput += data.toString();
        this.logger.debug(`${workerId} stderr chunk: ${data.toString().substring(0, 100)}...`);
      });
      
      child.on('close', (code) => {
        if (!isResolved) {
          isResolved = true;
          this.logger.info(`${workerId} Jest process exited with code: ${code}`);
          
          // For BrowserStack SDK, give extra time for cleanup even on success
          if (useBrowserStackSDK && code === 0) {
            this.logger.debug(`${workerId} BrowserStack SDK detected, allowing 500ms for cleanup...`);
            // Add a small delay to allow BrowserStack SDK cleanup to complete
            setTimeout(() => {
              resolve({
                exitCode: code,
                output: output,
                errorOutput: errorOutput
              });
            }, 500); // Reduced to 500ms delay for BrowserStack cleanup
          } else {
            resolve({
              exitCode: code,
              output: output,
              errorOutput: errorOutput
            });
          }
        }
      });
      
      child.on('error', (error) => {
        if (!isResolved) {
          isResolved = true;
          this.logger.error(`${workerId} Jest process error: ${error.message}`);
          reject(error);
        }
      });
      
      // Set timeout for safety with more aggressive cleanup
      const timeoutId = setTimeout(() => {
        if (!isResolved && !child.killed) {
          isResolved = true;
          this.logger.warn(`${workerId} Jest process timeout after ${this.formatDuration(this.timeout)}, force killing...`);
          
          // More aggressive process cleanup for BrowserStack SDK
          try {
            // Send SIGTERM first to allow graceful shutdown
            child.kill('SIGTERM');
            
            // Wait a moment, then force kill if still running
            setTimeout(() => {
              if (!child.killed) {
                this.logger.warn(`${workerId} Force killing with SIGKILL after SIGTERM timeout`);
                child.kill('SIGKILL');
                
                // Also try to kill any child processes
                if (child.pid) {
                  try {
                    process.kill(-child.pid, 'SIGKILL'); // Kill process group
                  } catch (groupKillError) {
                    this.logger.debug(`${workerId} Error killing process group: ${groupKillError.message}`);
                  }
                }
              }
            }, 5000); // 5 second grace period for SIGTERM
            
          } catch (killError) {
            this.logger.warn(`${workerId} Error killing process: ${killError.message}`);
          }
          
          // Enhanced timeout logging with context
          if (this.executionLogger) {
            this.executionLogger.logWorkerTimeout(workerId, `Jest execution timeout after ${this.formatDuration(this.timeout)} - may be due to open handles in BrowserStack SDK`)
              .catch(err => console.error('Logging error:', err.message));
          }
          
          reject(new Error(`Jest process timeout after ${this.formatDuration(this.timeout)} - potential open handles preventing shutdown`));
        }
      }, this.timeout); // Use configured timeout
      
      // Clear timeout when process completes
      child.on('close', () => {
        clearTimeout(timeoutId);
      });
    });
  }

  // Helper method to determine test status based on exit code and output
  determineTestStatus(exitCode, output, errorOutput) {
    // If exit code is 0, definitely passed
    if (exitCode === 0) {
      return 'passed';
    }
    
    // If exit code is non-zero, check if it's due to Jest shutdown issues vs actual test failures
    const allOutput = (output + '\n' + errorOutput).toLowerCase();
    
    // Check for indicators that tests actually passed but Jest had shutdown issues
    const hasPassedTests = allOutput.includes('test suites: ') && allOutput.includes('passed');
    const hasNoFailedTests = !allOutput.includes('failed') || allOutput.includes('0 failed');
    const hasForceExitWarning = allOutput.includes('force exiting jest') || allOutput.includes('detectopenhandles');
    const hasCleanupErrors = allOutput.includes('enoent') || allOutput.includes('no such file or directory');
    
    // If all tests passed but Jest had shutdown issues, consider it passed
    if (hasPassedTests && hasNoFailedTests && (hasForceExitWarning || hasCleanupErrors)) {
      this.logger.info(`Worker detected Jest shutdown issue but all tests passed - treating as success`);
      return 'passed';
    }
    
    // Otherwise, it's a real failure
    return 'failed';
  }

  parseJestTestResults(output, errorOutput) {
    const results = [];
    
    // NO JSON PARSING! Use only Jest's text output and exit codes
    // This is completely reliable and avoids all JSON parsing complexity
    
    // Combine both output streams - Jest can output to both stdout and stderr
    const allOutput = (output + '\n' + errorOutput);
    const lines = allOutput.split('\n');
    
    this.logger.debug(`Parsing Jest text output - ${lines.length} lines from combined stdout/stderr`);
    
    // Track error messages for failed tests
    const errorMap = new Map(); // Map test names to their error messages
    let currentFailedTest = null;
    let collectingError = false;
    let errorLines = [];
    
    // First pass: collect error messages for failed tests
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmedLine = line.trim();
      
      // Look for failed test markers with bullet points like "● Test Suite › test name"
      const failureHeaderMatch = line.match(/^\s*●\s+(.+?)\s+›\s+(.+?)$/);
      if (failureHeaderMatch) {
        // Save previous error if collecting
        if (collectingError && currentFailedTest && errorLines.length > 0) {
          const errorMessage = errorLines.join('\n').trim();
          errorMap.set(currentFailedTest, errorMessage);
        }
        
        const testName = failureHeaderMatch[2].trim();
        currentFailedTest = testName;
        collectingError = true;
        errorLines = [];
        continue;
      }
      
      // Look for "Test suite failed to run" errors (afterAll, etc.)
      const testSuiteFailureMatch = line.match(/^\s*●\s+Test suite failed to run$/);
      if (testSuiteFailureMatch) {
        // Save previous error if collecting
        if (collectingError && currentFailedTest && errorLines.length > 0) {
          const errorMessage = errorLines.join('\n').trim();
          errorMap.set(currentFailedTest, errorMessage);
        }
        
        currentFailedTest = 'Test suite failed to run';
        collectingError = true;
        errorLines = [];
        continue;
      }
      
      // Look for simple bullet point errors without test suite structure
      const simpleFailureMatch = line.match(/^\s*●\s+(.+?)$/);
      if (simpleFailureMatch && !failureHeaderMatch && !testSuiteFailureMatch) {
        // Save previous error if collecting
        if (collectingError && currentFailedTest && errorLines.length > 0) {
          const errorMessage = errorLines.join('\n').trim();
          errorMap.set(currentFailedTest, errorMessage);
        }
        
        const testName = simpleFailureMatch[1].trim();
        currentFailedTest = testName;
        collectingError = true;
        errorLines = [];
        continue;
      }
      
      // If we're collecting error for a failed test
      if (collectingError && currentFailedTest) {
        // Stop collecting if we hit another test marker, test summary, or new test suite
        if (trimmedLine.startsWith('●') || 
            trimmedLine.includes('Test Suites:') || 
            trimmedLine.includes('Tests:') ||
            trimmedLine.includes('Snapshots:') || 
            trimmedLine.includes('Time:') ||
            trimmedLine.includes('Ran all test suites') ||
            trimmedLine.startsWith('PASS') ||
            trimmedLine.startsWith('FAIL') ||
            (trimmedLine.match(/^\s*✓/) && !trimmedLine.includes('at ')) ||
            (trimmedLine.match(/^\s*[✗✕×]/) && !trimmedLine.includes('at '))) {
          
          // Save the collected error
          if (errorLines.length > 0) {
            const errorMessage = errorLines.join('\n').trim();
            errorMap.set(currentFailedTest, errorMessage);
          }
          currentFailedTest = null;
          collectingError = false;
          errorLines = [];
          
          // Don't skip this line, it might be a test result
        } else {
          // Collect error line (skip empty lines at start)
          if (errorLines.length > 0 || trimmedLine.length > 0) {
            errorLines.push(line);
          }
          continue;
        }
      }
    }
    
    // Handle any remaining error collection
    if (collectingError && currentFailedTest && errorLines.length > 0) {
      const errorMessage = errorLines.join('\n').trim();
      errorMap.set(currentFailedTest, errorMessage);
    }
    
    this.logger.debug(`Collected ${errorMap.size} error messages for failed tests`);
    
    // Debug: Log all collected error keys for troubleshooting
    if (errorMap.size > 0) {
      const errorKeys = Array.from(errorMap.keys());
      this.logger.debug(`Error message keys collected: ${errorKeys.join(', ')}`);
    }
    
    // Second pass: Parse Jest's human-readable test results
    for (const line of lines) {
      const trimmedLine = line.trim();
      
      // Look for Jest test result patterns (✓, ✗, ○)
      // Passed tests: ✓ test name (duration)
      const passedMatch = line.match(/^\s*✓\s*(.+?)(?:\s+\((\d+)\s*ms\))?$/);
      if (passedMatch) {
        const testName = passedMatch[1].trim();
        const duration = passedMatch[2] ? parseInt(passedMatch[2]) : 0;
        
        if (testName && testName.length > 0) {
          results.push({
            name: testName,
            testName: testName,  // Add for compatibility with reporter
            status: 'passed',
            duration: duration,
            message: '',
            error: null
          });
          this.logger.debug(`Found passed test: ${testName} (${duration}ms)`);
        }
        continue;
      }
      
      // Failed tests: ✗ test name (duration)
      const failedMatch = line.match(/^\s*[✗✕×]\s*(.+?)(?:\s+\((\d+)\s*ms\))?$/);
      if (failedMatch) {
        const testName = failedMatch[1].trim();
        const duration = failedMatch[2] ? parseInt(failedMatch[2]) : 0;
        
        if (testName && testName.length > 0) {
          // Get the detailed error message if available - try multiple approaches
          let errorMessage = errorMap.get(testName);
          
          // If exact match not found, try partial matching
          if (!errorMessage) {
            for (const [key, value] of errorMap.entries()) {
              if (key.includes(testName) || testName.includes(key)) {
                errorMessage = value;
                this.logger.debug(`Found error message via partial match: "${testName}" matched with "${key}"`);
                break;
              }
            }
          }
          
          // If still no error message, try extracting from the combined output around this test
          if (!errorMessage) {
            errorMessage = this.extractTestSpecificError(allOutput, testName);
            if (errorMessage) {
              this.logger.debug(`Found error message via test-specific extraction for: "${testName}"`);
            }
          }
          
          // Final fallback with debug info
          if (!errorMessage) {
            this.logger.warn(`No error message found for failed test: "${testName}". Available error keys: [${Array.from(errorMap.keys()).join(', ')}]`);
            errorMessage = `Test failed: ${testName}`;
          }
          
          results.push({
            name: testName,
            testName: testName,  // Add for compatibility with reporter
            status: 'failed',
            duration: duration,
            message: errorMessage,
            error: errorMessage  // Add both for compatibility
          });
          this.logger.debug(`Found failed test: ${testName} (${duration}ms) - Error captured: ${errorMessage.length} chars`);
        }
        continue;
      }
      
      // Skipped tests: ○ test name
      const skippedMatch = line.match(/^\s*○\s*(.+?)$/);
      if (skippedMatch) {
        const testName = skippedMatch[1].trim();
        
        if (testName && testName.length > 0) {
          results.push({
            name: testName,
            testName: testName,  // Add for compatibility with reporter
            status: 'skipped',
            duration: 0,
            message: 'Test skipped',
            error: null
          });
          this.logger.debug(`Found skipped test: ${testName}`);
        }
        continue;
      }
    }
    
    // If we couldn't parse individual tests, create a summary based on file result
    if (results.length === 0) {
      this.logger.debug(`No individual test results found, checking for summary information`);
      
      // Look for Jest summary lines like "Tests: 3 passed, 2 failed, 5 total"
      const summaryMatch = allOutput.match(/Tests:\s*(\d+)\s*passed(?:,\s*(\d+)\s*failed)?(?:,\s*(\d+)\s*skipped)?(?:,\s*(\d+)\s*total)?/i);
      if (summaryMatch) {
        const passed = parseInt(summaryMatch[1]) || 0;
        const failed = parseInt(summaryMatch[2]) || 0;
        const skipped = parseInt(summaryMatch[3]) || 0;
        
        this.logger.debug(`Found Jest summary: ${passed} passed, ${failed} failed, ${skipped} skipped`);
        
        // Create generic test results based on summary
        for (let i = 0; i < passed; i++) {
          const testName = `Test ${i + 1} (passed)`;
          results.push({
            name: testName,
            testName: testName,
            status: 'passed',
            duration: 0,
            message: '',
            error: null
          });
        }
        for (let i = 0; i < failed; i++) {
          const testName = `Test ${i + 1} (failed)`;
          results.push({
            name: testName,
            testName: testName,
            status: 'failed',
            duration: 0,
            message: 'Test failed - see output for details',
            error: 'Test failed - see output for details'
          });
        }
        for (let i = 0; i < skipped; i++) {
          const testName = `Test ${i + 1} (skipped)`;
          results.push({
            name: testName,
            testName: testName,
            status: 'skipped',
            duration: 0,
            message: 'Test skipped',
            error: null
          });
        }
      } else {
        this.logger.debug(`No Jest summary found, creating single result based on overall outcome`);
        
        // Fallback: create single result based on general success/failure indicators
        const hasFailureIndicators = allOutput.includes('FAIL') || allOutput.includes('Failed') || 
                                    allOutput.includes('Error:') || allOutput.includes('✗');
        
        const errorMessage = hasFailureIndicators ? 
          this.extractGeneralErrorMessage(allOutput) : 
          'File execution passed';
        
        const testName = 'File execution';
        results.push({
          name: testName,
          testName: testName,
          status: hasFailureIndicators ? 'failed' : 'passed',
          duration: 0,
          message: errorMessage,
          error: hasFailureIndicators ? errorMessage : null
        });
      }
    }
    
    this.logger.debug(`Parsed ${results.length} test results using text-only parsing`);
    this.logger.debug(`Error messages captured for ${errorMap.size} failed tests`);
    return results;
  }

  // Helper method to extract test-specific error when errorMap lookup fails
  extractTestSpecificError(output, testName) {
    const lines = output.split('\n');
    let errorLines = [];
    let foundTest = false;
    let collectingError = false;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmedLine = line.trim();
      
      // Look for the specific failed test
      if (trimmedLine.includes(`✕ ${testName}`) || trimmedLine.includes(`✗ ${testName}`) || trimmedLine.includes(`× ${testName}`)) {
        foundTest = true;
        collectingError = true;
        continue;
      }
      
      // If we found the test, start collecting error information
      if (foundTest && collectingError) {
        // Stop collecting when we hit another test or summary
        if ((trimmedLine.startsWith('✓') || trimmedLine.startsWith('✕') || trimmedLine.startsWith('✗') || trimmedLine.startsWith('×')) && 
            !trimmedLine.includes(testName)) {
          break;
        }
        
        // Stop collecting at test summary or other major sections
        if (trimmedLine.includes('Test Suites:') || trimmedLine.includes('Tests:') || 
            trimmedLine.includes('Time:') || trimmedLine.includes('Ran all test suites')) {
          break;
        }
        
        // Collect relevant error lines
        if (trimmedLine.length > 0 && 
            (trimmedLine.includes('Error:') || trimmedLine.includes('TypeError:') || 
             trimmedLine.includes('ReferenceError:') || trimmedLine.includes('expect(') || 
             trimmedLine.includes('Expected:') || trimmedLine.includes('Received:') ||
             trimmedLine.includes('at ') || trimmedLine.includes('Failed:'))) {
          errorLines.push(trimmedLine);
        }
      }
    }
    
    if (errorLines.length > 0) {
      // Return the most relevant error lines (limit to avoid too much text)
      const errorMessage = errorLines.slice(0, 5).join(' | ');
      this.logger.debug(`Extracted test-specific error for "${testName}": ${errorMessage.substring(0, 100)}...`);
      return errorMessage;
    }
    
    return null;
  }

  // Helper method to extract general error message when specific test parsing fails
  extractGeneralErrorMessage(output) {
    // Look for common error patterns with more detail
    const errorPatterns = [
      /Error: (.+)/,
      /TypeError: (.+)/,
      /ReferenceError: (.+)/,
      /SyntaxError: (.+)/,
      /AssertionError: (.+)/,
      /FAIL (.+)/,
      /expect\(.*\)\.(.+)/,  // Jest assertion errors
      /received: (.+)/,       // Jest comparison errors
      /Expected: (.+)/,       // Jest expectation errors
    ];
    
    const lines = output.split('\n');
    const errorMessages = [];
    
    // Collect all error-like lines
    for (const line of lines) {
      const trimmedLine = line.trim();
      
      // Skip empty lines and Jest formatting
      if (!trimmedLine || trimmedLine.startsWith('●') || trimmedLine.startsWith('at ')) {
        continue;
      }
      
      for (const pattern of errorPatterns) {
        const match = trimmedLine.match(pattern);
        if (match) {
          errorMessages.push(match[0]); // Return the full error line
          break; // Only match first pattern per line
        }
      }
      
      // Also capture lines that look like error descriptions
      if (trimmedLine.includes('Expected') || trimmedLine.includes('Received') || 
          trimmedLine.includes('Difference:') || trimmedLine.includes('failed')) {
        errorMessages.push(trimmedLine);
      }
    }
    
    // Return the most informative error message(s)
    if (errorMessages.length > 0) {
      // If we have multiple error messages, join the first few
      return errorMessages.slice(0, 3).join(' | ');
    }
    
    return 'File execution failed - see output for details';
  }

  generateSummary() {
    const summary = {
      total: this.results.length,
      passed: 0,
      failed: 0,
      totalTests: 0,
      passedTests: 0,
      failedTests: 0,
      totalDuration: 0
    };
    
    for (const result of this.results) {
      if (result.status === 'passed') {
        summary.passed++;
      } else {
        summary.failed++;
      }
      
      summary.totalDuration += result.duration || 0;
      
      if (result.testResults) {
        summary.totalTests += result.testResults.length;
        summary.passedTests += result.testResults.filter(t => t.status === 'passed').length;
        summary.failedTests += result.testResults.filter(t => t.status === 'failed').length;
      }
    }
    
    return summary;
  }

  // Interface compatibility methods for existing runner
  async runConcurrentFiles(parsedFiles) {
    this.logger.info('Running concurrent files using simplified approach');
    
    // Initialize test status tracking with parsed file information
    this.initializeTestCounts(parsedFiles);
    
    const result = await this.processTestFiles(parsedFiles, { strategy: 'concurrent-files' });
    return result.results; // Return just the results array for compatibility
  }

  async runParallelTests(parsedFiles) {
    this.logger.info('Running parallel tests using simplified approach');
    
    // Initialize test status tracking with parsed file information
    this.initializeTestCounts(parsedFiles);
    
    const result = await this.processTestFiles(parsedFiles, { strategy: 'parallel-tests' });
    return result.results; // Return just the results array for compatibility
  }

  async runParallelFiles(parsedFiles) {
    this.logger.info('Running parallel files using simplified approach');
    
    // Initialize test status tracking with parsed file information
    this.initializeTestCounts(parsedFiles);
    
    const result = await this.processTestFiles(parsedFiles, { strategy: 'parallel-files' });
    return result.results; // Return just the results array for compatibility
  }

  async runJestParallel(parsedFiles) {
    this.logger.info('Running Jest parallel using simplified approach');
    
    // Initialize test status tracking with parsed file information
    this.initializeTestCounts(parsedFiles);
    
    const result = await this.processTestFiles(parsedFiles, { strategy: 'jest-parallel' });
    return result.results; // Return just the results array for compatibility
  }

  async runNativeParallel(parsedFiles, options = {}) {
    this.logger.info('Running native parallel using simplified approach');
    
    // Record execution start time
    this.executionStartTime = new Date();
    
    if (this.executionLogger) {
      await this.executionLogger.info('WORKER-MANAGER', `Starting simplified native parallel execution (no file rewriting)`);
    }
    this.logger.info(`Execution started at: ${this.executionStartTime.toISOString()}`);
    
    // Initialize test status tracking with parsed file information
    this.initializeTestCounts(parsedFiles);
    
    // Check if intra-file parallelism is enabled (default: true for native-parallel)
    const enableIntraFileParallelism = options.intraFileParallelism !== false;
    
    if (enableIntraFileParallelism && this.executionLogger) {
      await this.executionLogger.info('WORKER-MANAGER', `Enabling simplified intra-file parallelism with Jest's internal workers`);
    }
    
    this.logger.info(`Created ${parsedFiles.length} simplified file-level work items with Jest internal parallelism`);
    
    const result = await this.processTestFiles(parsedFiles, { 
      strategy: 'native-parallel',
      intraFileParallelism: enableIntraFileParallelism,
      ...options 
    });
    return result.results; // Return just the results array for compatibility
  }

  // Legacy compatibility
  cleanup() {
    return this.shutdown();
  }

  async shutdown() {
    this.logger.info('Shutting down SimpleWorkerManager');
    
    // Kill any remaining active workers
    for (const [workerId, workerInfo] of this.activeWorkers) {
      if (workerInfo.process && !workerInfo.process.killed) {
        this.logger.warn(`Force killing active worker: ${workerId} (PID: ${workerInfo.pid})`);
        try {
          workerInfo.process.kill('SIGKILL');
          // Also try to kill process group
          if (workerInfo.pid) {
            process.kill(-workerInfo.pid, 'SIGKILL');
          }
        } catch (error) {
          this.logger.warn(`Error killing worker ${workerId}: ${error.message}`);
        }
      }
    }
    
    this.activeWorkers.clear();
    this.logger.info('SimpleWorkerManager shutdown complete');
  }

  // Add method to check for hanging workers
  checkHangingWorkers() {
    const now = Date.now();
    const hangingThreshold = this.timeout * 1.5; // 1.5x the normal timeout
    
    for (const [workerId, workerInfo] of this.activeWorkers) {
      const elapsed = now - workerInfo.startTime;
      if (elapsed > hangingThreshold) {
        this.logger.warn(`Worker ${workerId} appears to be hanging (${this.formatDuration(elapsed)} elapsed)`);
        
        if (workerInfo.process && !workerInfo.process.killed) {
          this.logger.warn(`Force killing hanging worker: ${workerId}`);
          try {
            workerInfo.process.kill('SIGKILL');
          } catch (error) {
            this.logger.warn(`Error killing hanging worker ${workerId}: ${error.message}`);
          }
        }
      }
    }
  }
}

module.exports = SimpleWorkerManager;
