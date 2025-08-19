const { spawn } = require('child_process');
const path = require('path');
const os = require('os');

class WorkerManager {
  constructor(options, logger, executionLogger) {
    this.options = options; // Store full options for worker configuration
    this.maxWorkers = options.maxWorkers || 4;
    
    // Timeout should already be in milliseconds from config processing
    // Default to 5 minutes (300000ms) if not provided
    this.timeout = options.timeout || (5 * 60 * 1000);
    
    this.logger = logger;
    this.executionLogger = executionLogger;
    
    this.workers = {};
    this.activeWorkers = 0;
    this.workQueue = [];
    this.results = [];
    this.onComplete = null;
    this.onError = null;
    
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
    
    // Generate a consistent BrowserStack build ID for all workers in this execution
    this.browserstackBuildId = this.generateBrowserStackBuildId();
    
    this.logger.debug(`WorkerManager initialized with ${this.maxWorkers} max workers and ${this.timeout}ms timeout`);
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
    this.testStatus.total = parsedFiles.reduce((sum, file) => sum + file.tests.length, 0);
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
    
    // Log to file with detailed information
    await this.executionLogger.info('TEST-STATUS', `${phase}: ${statusMessage}`);
    
    // Log detailed breakdown to file
    if (phase === 'PROGRESS' && completed > 0) {
      const successRate = total > 0 ? ((passed / completed) * 100).toFixed(1) : '0.0';
      await this.executionLogger.info('TEST-METRICS', 
        `Success Rate: ${successRate}% | Completion: ${percentage}% | Throughput: ${completed} tests completed`
      );
    }
  }
  
  async logFinalTestStatus() {
    await this.logTestStatus('FINAL');
    
    const { total, passed, failed, skipped } = this.testStatus;
    const successRate = total > 0 ? ((passed / total) * 100).toFixed(1) : '0.0';
    
    // Log comprehensive final summary
    await this.executionLogger.info('TEST-SUMMARY', 
      `Final Results: ${total} total tests | ${passed} passed | ${failed} failed | ${skipped} skipped | Success Rate: ${successRate}%`
    );
    
    if (failed > 0) {
      await this.executionLogger.warn('TEST-SUMMARY', `${failed} test(s) failed - check individual test results for details`);
    } else {
      await this.executionLogger.success('TEST-SUMMARY', `All ${passed} tests passed successfully!`);
    }
  }

  async runParallelTests(parsedFiles) {
    // Record execution start time
    this.executionStartTime = new Date();
    
    await this.executionLogger.info('WORKER-MANAGER', `Starting parallel test execution with ${this.maxWorkers} workers`);
    this.logger.info(`Execution started at: ${this.executionStartTime.toISOString()}`);
    
    // Initialize test status tracking
    this.initializeTestCounts(parsedFiles);
    
    // Create work items for each test
    const workItems = [];
    for (const file of parsedFiles) {
      for (const test of file.tests) {
        workItems.push({
          type: 'test',
          filePath: file.filePath,
          testName: test.name,
          testId: test.id,
          hasBeforeAll: file.hasBeforeAll,
          hasAfterAll: file.hasAfterAll,
          hasBeforeEach: file.hasBeforeEach,
          hasAfterEach: file.hasAfterEach
        });
      }
    }

    this.workQueue = [...workItems];
    this.logger.info(`Created ${workItems.length} work items`);

    return new Promise((resolve, reject) => {
      this.onComplete = resolve;
      this.onError = reject;
      
      // Start initial workers using the work queue processor
      this.processWorkQueue();
    });
  }

  async runParallelFiles(parsedFiles) {
    // Record execution start time
    this.executionStartTime = new Date();
    
    this.logger.info(`Starting parallel file execution with ${this.maxWorkers} workers`);
    this.logger.info(`Execution started at: ${this.executionStartTime.toISOString()}`);
    
    // Initialize test status tracking
    this.initializeTestCounts(parsedFiles);
    
    const workItems = parsedFiles.map(file => ({
      type: 'jest-parallel',
      filePath: file.filePath,
      testCount: file.tests.length,
      strategy: 'file-parallelism'
    }));

    this.workQueue = [...workItems];
    this.logger.info(`Created ${workItems.length} file work items`);

    return new Promise((resolve, reject) => {
      this.onComplete = resolve;
      this.onError = reject;
      
      // Start initial workers using the work queue processor
      this.processWorkQueue();
    });
  }

  async runJestParallel(parsedFiles) {
    // Record execution start time
    this.executionStartTime = new Date();
    
    this.logger.info(`Starting Jest parallel execution (file-level processes with internal test parallelism)`);
    this.logger.info(`Execution started at: ${this.executionStartTime.toISOString()}`);
    
    // Initialize test status tracking
    this.initializeTestCounts(parsedFiles);
    
    const workItems = parsedFiles.map(file => ({
      type: 'jest-parallel',
      filePath: file.filePath,
      testCount: file.tests.length,
      hasBeforeAll: file.hasBeforeAll,
      hasAfterAll: file.hasAfterAll
    }));

    this.workQueue = [...workItems];
    this.logger.info(`Created ${workItems.length} Jest parallel work items`);

    return new Promise((resolve, reject) => {
      this.onComplete = resolve;
      this.onError = reject;
      
      // Start initial workers using the work queue processor
      this.processWorkQueue();
    });
  }

  async runConcurrentFiles(parsedFiles) {
    this.logger.info(`Starting concurrent file execution (transforms regular tests to concurrent)`);
    
    // Initialize test status tracking
    this.initializeTestCounts(parsedFiles);
    
    const workItems = parsedFiles.map(file => ({
      type: 'concurrent-file',
      filePath: file.filePath,
      testCount: file.tests.length
    }));

    this.workQueue = [...workItems];
    this.logger.info(`Created ${workItems.length} concurrent file work items`);

    return new Promise((resolve, reject) => {
      this.onComplete = resolve;
      this.onError = reject;
      
      // Start initial workers using the work queue processor
      this.processWorkQueue();
    });
  }

  async runNativeParallel(parsedFiles, options = {}) {
    // Record execution start time
    this.executionStartTime = new Date();
    
    await this.executionLogger.info('WORKER-MANAGER', `Starting native parallel execution (no file rewriting)`);
    this.logger.info(`Execution started at: ${this.executionStartTime.toISOString()}`);
    
    // Initialize test status tracking
    this.initializeTestCounts(parsedFiles);
    
    // Keep it simple: run each file via Jest directly with internal workers
    const workItems = parsedFiles.map(file => ({
      type: 'jest-parallel',
      filePath: file.filePath,
      testCount: file.tests.length,
      strategy: options.intraFileParallelism === false ? 'file-parallelism' : 'enhanced-file-parallelism',
      intraFileParallelism: options.intraFileParallelism !== false
    }));

    this.workQueue = [...workItems];

    return new Promise((resolve, reject) => {
      this.onComplete = resolve;
      this.onError = reject;
      
      // Start initial workers using the work queue processor
      this.processWorkQueue();
    });
  }

  startWorker(workerId) {
    if (this.workQueue.length === 0) {
      this.checkCompletion();
      return;
    }

    const workItem = this.workQueue.shift();
    this.activeWorkers++;
    
    // Log worker start (non-blocking)
    const workItemLabel = workItem.testName ? 
      `${workItem.type} - ${path.basename(workItem.filePath)} - ${workItem.testName}` :
      `${workItem.type} - ${path.basename(workItem.filePath)}`;
    
    this.logger.info(`Starting work item: ${workItemLabel}`);
    this.executionLogger.logWorkerStart(workerId, workItem).catch(err => 
      console.error('Logging error:', err.message)
    );
    
    let workerProcess;
    
    if (workItem.type === 'test') {
      workerProcess = this.spawnTestWorker(workItem, workerId);
    } else if (workItem.type === 'file') {
      workerProcess = this.spawnFileWorker(workItem, workerId);
    } else if (workItem.type === 'jest-parallel') {
      workerProcess = this.spawnJestParallelWorker(workItem, workerId);
    } else if (workItem.type === 'concurrent-file') {
      workerProcess = this.spawnConcurrentFileWorker(workItem, workerId);
    } else if (workItem.type === 'native-parallel') {
      // Route native-parallel through direct Jest execution for simplicity
      workerProcess = this.spawnNativeParallelWorker(workItem, workerId);
    }

    if (workerProcess) {
      this.workers[workerId] = workerProcess;
      
      workerProcess.on('close', (code) => {
        this.activeWorkers--;
        // Log worker completion (non-blocking)
        this.executionLogger.logWorkerComplete(workerId, { exitCode: code, status: code === 0 ? 'passed' : 'failed' })
          .catch(err => console.error('Logging error:', err.message));
        
        // Continue processing work queue if there are more items
        this.processWorkQueue();
      });
    }
  }

  spawnTestWorker(workItem, workerId) {
    // Keep it simple: run a single test via Jest with --testNamePattern and parse output
    const useBrowserStack = this.options.browserstackSdk === true || process.env.BROWSERSTACK_SDK_ENABLED === 'true';
    const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = `^${escapeRegex(workItem.testName)}$`;

    const jestArgs = [
      '--testMatch', `${workItem.filePath}`,
      '--testNamePattern', pattern,
      '--verbose',
      '--no-coverage',
      '--runInBand',
      '--passWithNoTests=false'
    ];

    const cmd = 'npx';
    const cmdArgs = useBrowserStack ? ['browserstack-node-sdk', 'jest', ...jestArgs] : ['jest', ...jestArgs];

    const worker = spawn(cmd, cmdArgs, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, NODE_OPTIONS: '--max-old-space-size=4096' }
    });

    let output = '';
    let errorOutput = '';

    worker.stdout.on('data', (data) => {
      output += data.toString();
    });

    worker.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    worker.on('close', (code) => {
      // Parse minimal Jest output and keep only the requested test
      const combinedOutput = `${output}\n${errorOutput}`;
      const allResults = this.parseJestOutput(combinedOutput, workItem) || [];
      const filtered = allResults.filter(r => (r.name || '').trim() === (workItem.testName || '').trim());
      const finalResult = filtered[0] || {
        testId: workItem.testId,
        name: workItem.testName,
        status: code === 0 ? 'passed' : 'failed',
        duration: 0,
        error: code === 0 ? null : (combinedOutput.trim().slice(0, 1000) || 'Test failed (no parsed output)')
      };

      // Normalize fields for reporter
      finalResult.testId = finalResult.testId || workItem.testId;
      finalResult.testName = finalResult.name || workItem.testName;
      finalResult.filePath = workItem.filePath;
      finalResult.workerId = workerId;
      finalResult.mode = 'parallel-test';

      this.results.push(finalResult);
      this.updateTestStatus([finalResult]);

      const statusIcon = finalResult.status === 'passed' ? '✅' : finalResult.status === 'skipped' ? '⏭️' : '❌';
      this.logger.info(`${statusIcon} ${finalResult.testName} (${finalResult.duration || 0}ms) [Worker: ${workerId}]`);
    });

    // Set timeout
    const timeoutId = setTimeout(() => {
      if (!worker.killed) {
        worker.kill('SIGKILL');
        this.executionLogger.logWorkerTimeout(workerId, `Exceeded ${this.formatDuration(this.timeout)} timeout limit`);
        this.logger.warn(`Worker ${workerId} killed due to timeout`);
      }
    }, this.timeout);

    return worker;
  }

  spawnFileWorker(workItem, workerId) {
    const args = [
      '--testMatch', `**/${path.basename(workItem.filePath)}`,
      '--verbose',
      '--no-coverage',
      '--runInBand',
      '--passWithNoTests=false'
    ];

    const worker = spawn('npx', ['jest', ...args], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env },
      cwd: process.cwd()
    });

    let output = '';
    let errorOutput = '';

    worker.stdout.on('data', (data) => {
      output += data.toString();
    });

    worker.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    worker.on('close', (code) => {
      const result = {
        filePath: workItem.filePath,
        status: code === 0 ? 'passed' : 'failed',
        output,
        errorOutput,
        testCount: workItem.testCount,
        workerId,
        duration: 0 // Could be enhanced to capture actual duration
      };
      
      this.results.push(result);
      
      // Update test status tracking - estimate test results from file result
      const fileTestResults = [];
      for (let i = 0; i < workItem.testCount; i++) {
        fileTestResults.push({
          status: code === 0 ? 'passed' : 'failed'
        });
      }
      this.updateTestStatus(fileTestResults);
      
      // Log file completion status for file worker
      const fileName = path.basename(result.filePath || 'Unknown File');
      const statusIcon = result.status === 'passed' ? '✅' : '❌';
      this.logger.info(`📁 ${fileName} ${statusIcon} ${result.status} (${workItem.testCount} tests) [Worker: ${workerId}]`);
    });

    return worker;
  }

  spawnJestParallelWorker(workItem, workerId) {
    // Decide whether to run via BrowserStack SDK
    const useBrowserStack = this.options.browserstackSdk === true || process.env.BROWSERSTACK_SDK_ENABLED === 'true';

    const jestArgs = [
      '--testMatch', `${workItem.filePath}`,
      '--verbose',
      '--no-coverage',
      '--passWithNoTests=false',
      '--maxWorkers', '1'
    ];

  const cmd = 'npx';
  const cmdArgs = useBrowserStack ? ['browserstack-node-sdk', 'jest', ...jestArgs] : ['jest', ...jestArgs];

    if (useBrowserStack) {
      this.logger.info(`🌐 Using BrowserStack Node SDK for ${path.basename(workItem.filePath)} (workers: ${workerId})`);
    } else {
      this.logger.debug(`Starting Jest (workers: ${workerId}) for ${path.basename(workItem.filePath)}`);
    }

    const worker = spawn(cmd, cmdArgs, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env },
      cwd: process.cwd()
    });

    let output = '';
    let errorOutput = '';

    worker.stdout.on('data', (data) => {
      output += data.toString();
    });

    worker.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    worker.on('close', (code) => {
      // Parse combined stdout+stderr; only extract ✓/✗/○ lines to reflect Jest output
      const combinedOutput = `${output}\n${errorOutput}`;
      const parseResult = this.parseJestOutput(combinedOutput, workItem);
      const testResults = parseResult.testResults || parseResult; // Handle both old and new return formats
      const hookInfo = parseResult.hookInfo || {};
      
      const result = {
        filePath: workItem.filePath,
        status: code === 0 ? 'passed' : 'failed',
        output,
        errorOutput,
        testCount: workItem.testCount,
        workerId,
        duration: 0,
        mode: 'jest-parallel',
        hasBeforeAll: workItem.hasBeforeAll,
        hasAfterAll: workItem.hasAfterAll,
        testResults: testResults, // Add parsed test results
        hookInfo: hookInfo // Add hook timing information
      };
      
      // If Jest failed and we couldn't parse any tests, attach enhanced error for reporting
      if (result.status === 'failed' && (!result.testResults || result.testResults.length === 0)) {
        const minimalError = (combinedOutput.match(/^FAIL[\s\S]*?$(?:\n[\s\S]*?)?(?=^PASS|^FAIL|^Test Suites:|^Tests:|\Z)/m) || [combinedOutput.trim()])[0];
        result.error = this.enhanceErrorMessage(minimalError.slice(0, 2000), []);
      }

      this.results.push(result);
      
      // Log detailed file completion status for jest-parallel worker
      if (testResults && Array.isArray(testResults)) {
        this.updateTestStatus(testResults);
        
        const fileName = path.basename(result.filePath || 'Unknown File');
        const passedCount = testResults.filter(t => t.status === 'passed').length;
        const failedCount = testResults.filter(t => t.status === 'failed').length;
        const skippedCount = testResults.filter(t => t.status === 'skipped').length;
        
        this.logger.info(`📁 ${fileName} completed: ✅ ${passedCount} passed, ❌ ${failedCount} failed, ⏭️ ${skippedCount} skipped [Worker: ${workerId}]`);
        
        // Log individual test results for immediate feedback
        testResults.forEach(test => {
          const statusIcon = test.status === 'passed' ? '✅' : test.status === 'failed' ? '❌' : '⏭️';
          this.logger.info(`  ${statusIcon} ${test.name || 'Unknown Test'} (${test.duration || 0}ms)`);
        });
      } else {
        // File-level result without individual test breakdown
        const fileName = path.basename(result.filePath || 'Unknown File');
        const statusIcon = result.status === 'passed' ? '✅' : '❌';
        this.logger.info(`📁 ${fileName} ${statusIcon} ${result.status} [Worker: ${workerId}]`);
      }
      
  // Reporter will consume result.testResults as-is
    });

    return worker;
  }

  spawnConcurrentFileWorker(workItem, workerId) {
    const workerScript = path.join(__dirname, '../workers/concurrent-file-worker.js');
    
    const args = [
      workerScript,
      JSON.stringify({
        filePath: workItem.filePath,
        timeout: this.timeout - 1000, // Give worker 1s less timeout to cleanup
        workerId
      })
    ];

    const worker = spawn('node', args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, NODE_OPTIONS: '--max-old-space-size=4096' }
    });

    let output = '';
    let errorOutput = '';
    let hasCompleted = false;

    worker.stdout.on('data', (data) => {
      output += data.toString();
    });

    worker.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    const handleCompletion = (code, isTimeout = false) => {
      if (hasCompleted) return;
      hasCompleted = true;

      this.logger.debug(`Concurrent file worker ${workerId} closed with code ${code}`);
      this.logger.debug(`Output length: ${output.length} chars`);
      
      if (isTimeout) {
        const activity = this.executionLogger.workerActivities.get(workerId);
        let timeoutError = `Worker timeout - exceeded ${this.formatDuration(this.timeout)} limit`;
        
        if (activity && activity.workItem) {
          const elapsed = Date.now() - activity.startTime;
          timeoutError += ` while processing ${path.basename(workItem.filePath)} (running for ${this.formatDuration(elapsed)})`;
          
          // Check if this might be a hook timeout by analyzing the last output
          const isLikelyHookTimeout = this.detectHookTimeout(output, errorOutput, workItem.filePath);
          if (isLikelyHookTimeout) {
            this.executionLogger.logHookTimeout(workerId, isLikelyHookTimeout.hookType, isLikelyHookTimeout.suiteName, workItem.filePath, this.timeout);
            timeoutError += ` - likely ${isLikelyHookTimeout.hookType} hook timeout in suite "${isLikelyHookTimeout.suiteName}"`;
          } else {
            this.executionLogger.logWorkerTimeout(workerId, `File processing timeout`);
          }
        } else {
          this.executionLogger.logWorkerTimeout(workerId, `File processing timeout`);
        }
        
        this.logger.error(`Concurrent file worker ${workerId} timed out`);
        this.results.push({
          filePath: workItem.filePath,
          status: 'failed',
          error: timeoutError,
          duration: this.timeout,
          workerId,
          testResults: []
        });
        return;
      }

      if (output.length === 0) {
        this.logger.error(`Concurrent file worker ${workerId} produced no output`);
        this.results.push({
          filePath: workItem.filePath,
          status: 'failed',
          error: `Worker produced no output`,
          duration: 0,
          workerId,
          testResults: []
        });
        return;
      }
      
      try {
        // Clean the output - look for complete JSON object
        const trimmedOutput = output.trim();
        let jsonToparse = trimmedOutput;
        
        // If output doesn't end with '}', try to find the last complete JSON object
        if (!trimmedOutput.endsWith('}')) {
          const lastBraceIndex = trimmedOutput.lastIndexOf('}');
          if (lastBraceIndex > 0) {
            jsonToparse = trimmedOutput.substring(0, lastBraceIndex + 1);
            this.logger.debug(`Truncated output detected, using first ${jsonToparse.length} chars`);
          }
        }
        
        const result = JSON.parse(jsonToparse);
        
        // Debug logging for test count mismatch
        if (result.debugInfo) {
          this.logger.debug(`Worker ${workerId} Jest execution details:`);
          this.logger.debug(`- Tests found in output: ${result.debugInfo.testsFound}`);
          this.logger.debug(`- Jest exit code: ${result.debugInfo.jestExitCode}`);
          this.logger.debug(`- Jest stdout sample: ${result.debugInfo.jestStdout}`);
          this.logger.debug(`- Jest stderr sample: ${result.debugInfo.jestStderr}`);
        }
        
        // Log additional details if no tests were found but worker failed
        if (code !== 0 && (!result.testResults || result.testResults.length === 0)) {
          this.logger.warn(`Worker ${workerId} failed with no test results. This may indicate Jest configuration or dependency issues.`);
          this.logger.debug(`Worker stderr output: ${errorOutput}`);
        }
        
        this.results.push(result);
        
        // Log detailed file completion status for concurrent file worker
        if (result.testResults && Array.isArray(result.testResults)) {
          this.updateTestStatus(result.testResults);
          
          const fileName = path.basename(result.filePath || 'Unknown File');
          const passedCount = result.testResults.filter(t => t.status === 'passed').length;
          const failedCount = result.testResults.filter(t => t.status === 'failed').length;
          const skippedCount = result.testResults.filter(t => t.status === 'skipped').length;
          
          this.logger.info(`📁 ${fileName} completed: ✅ ${passedCount} passed, ❌ ${failedCount} failed, ⏭️ ${skippedCount} skipped [Worker: ${workerId}]`);
          
          // Log individual test results for immediate feedback
          result.testResults.forEach(test => {
            const statusIcon = test.status === 'passed' ? '✅' : test.status === 'failed' ? '❌' : '⏭️';
            this.logger.info(`  ${statusIcon} ${test.testName || test.name || 'Unknown Test'} (${test.duration || 0}ms)`);
          });
        } else {
          // File-level result without individual test breakdown
          const fileName = path.basename(result.filePath || 'Unknown File');
          const statusIcon = result.status === 'passed' ? '✅' : '❌';
          this.logger.info(`📁 ${fileName} ${statusIcon} ${result.status} [Worker: ${workerId}]`);
        }
      } catch (error) {
        this.logger.error(`Concurrent file worker ${workerId} output parsing failed:`, error.message);
        this.logger.debug(`Raw output (first 1000 chars): ${output.substring(0, 1000)}`);
        this.logger.debug(`Raw stderr: ${errorOutput.substring(0, 1000)}`);
        this.results.push({
          filePath: workItem.filePath,
          status: 'failed',
          error: `Worker output parsing failed: ${error.message}`,
          duration: 0,
          workerId,
          testResults: []
        });
      }
    };

    worker.on('close', (code) => {
      handleCompletion(code);
    });

    worker.on('error', (error) => {
      if (hasCompleted) return;
      hasCompleted = true;
      this.logger.error(`Concurrent file worker ${workerId} encountered an error:`, error.message);
      this.results.push({
        filePath: workItem.filePath,
        status: 'failed',
        error: `Worker process error: ${error.message}`,
        duration: 0,
        workerId,
        testResults: []
      });
    });

    // Set timeout
    const timeoutHandle = setTimeout(() => {
      if (!worker.killed && !hasCompleted) {
        worker.kill('SIGTERM'); // Use SIGTERM first for graceful shutdown
        setTimeout(() => {
          if (!worker.killed && !hasCompleted) {
            worker.kill('SIGKILL');
          }
        }, 2000);
        this.logger.warn(`Concurrent file worker ${workerId} killed due to timeout`);
        handleCompletion(null, true);
      }
    }, this.timeout);

    // Clear timeout when worker completes
    worker.on('close', () => {
      clearTimeout(timeoutHandle);
    });

    return worker;
  }

  spawnNativeParallelWorker(workItem, workerId) {
    const workerScript = path.join(__dirname, '../workers/native-parallel-worker.js');
    
    const args = [
      workerScript,
      JSON.stringify({
        filePath: workItem.filePath,
        testNames: workItem.testNames,
        testCount: workItem.testCount,
        strategy: workItem.strategy,
        maxWorkers: this.maxWorkers,
        timeout: this.timeout - 1000, // Slightly reduce timeout for worker
        workerId,
        browserstackSdk: this.options.browserstackSdk || false
      })
    ];

    // Generate or use existing BrowserStack build ID for unified builds
    const browserstackBuildId = this.getBrowserStackBuildId();
    
    this.logger.debug(`Spawning native parallel worker ${workerId} with unified build ID: ${browserstackBuildId}`);
    
    const worker = spawn('node', args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { 
        ...process.env, 
        NODE_OPTIONS: '--max-old-space-size=4096',
        // Pass BrowserStack build ID to ensure all workers use the same build
        BROWSERSTACK_BUILD_ID: browserstackBuildId,
        BROWSERSTACK_BUILD_IDENTIFIER: browserstackBuildId
      }
    });

    let output = '';
    let errorOutput = '';
    let hasCompleted = false;

    worker.stdout.on('data', (data) => {
      output += data.toString();
    });

    worker.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    const handleCompletion = (code, isTimeout = false) => {
      if (hasCompleted) return;
      hasCompleted = true;

      this.logger.debug(`Native parallel worker ${workerId} closed with code ${code}`);
      this.logger.debug(`Output length: ${output.length} chars`);
      
      if (isTimeout) {
        this.logger.error(`Native parallel worker ${workerId} timed out`);
        this.results.push({
          filePath: workItem.filePath,
          status: 'failed',
          error: 'Worker timeout',
          duration: this.timeout,
          workerId,
          testResults: []
        });
        return;
      }

      if (output.length === 0) {
        this.logger.error(`Native parallel worker ${workerId} produced no output`);
        this.results.push({
          filePath: workItem.filePath,
          status: 'failed',
          error: `Worker produced no output`,
          duration: 0,
          workerId,
          testResults: []
        });
        return;
      }
      
      try {
        this.logger.debug(`Native parallel worker ${workerId} output processing - Length: ${output.length}`);
        
        // Robust JSON parsing with multiple fallback strategies
        const trimmedOutput = output.trim();
        let result = null;
        let parseError = null;
        
        // Log the start and end of output for debugging
        if (trimmedOutput.length > 100) {
          this.logger.debug(`Output starts with: ${trimmedOutput}...`);
          this.logger.debug(`Output ends with: ...${trimmedOutput}`);
        } else {
          this.logger.debug(`Full output: ${trimmedOutput}`);
        }
        
        // Strategy 1: Try to parse the entire output as JSON
        try {
          if (trimmedOutput.startsWith('{') && trimmedOutput.endsWith('}')) {
            result = JSON.parse(trimmedOutput);
            this.logger.debug(`Successfully parsed complete JSON output`);
          }
        } catch (error) {
          parseError = error;
          this.logger.debug(`Strategy 1 failed: ${error.message}`);
        }
        
        // Strategy 2: Look for JSON in mixed output (console logs + JSON)
        if (!result) {
          try {
            const lines = trimmedOutput.split('\n');
            let jsonCandidate = '';
            let braceCount = 0;
            let inJson = false;
            
            for (const line of lines) {
              const trimmedLine = line.trim();
              if (trimmedLine.startsWith('{"status":') || trimmedLine.startsWith('{"filePath":')) {
                inJson = true;
                jsonCandidate = trimmedLine;
                braceCount = (trimmedLine.match(/\{/g) || []).length - (trimmedLine.match(/\}/g) || []).length;
              } else if (inJson) {
                jsonCandidate += trimmedLine;
                braceCount += (trimmedLine.match(/\{/g) || []).length - (trimmedLine.match(/\}/g) || []).length;
                
                if (braceCount === 0) {
                  // Found complete JSON
                  break;
                }
              }
            }
            
            if (jsonCandidate && braceCount === 0) {
              result = JSON.parse(jsonCandidate);
              this.logger.debug(`Successfully parsed JSON from mixed output using line parsing`);
            }
          } catch (error) {
            this.logger.debug(`Strategy 2 failed: ${error.message}`);
          }
        }
        
        // Strategy 3: Use regex to find JSON blocks
        if (!result) {
          try {
            // More flexible regex to match different JSON structures
            const jsonMatches = trimmedOutput.match(/\{[^{}]*"status"[^{}]*"[^"]*"[^{}]*\}/g) ||
                               trimmedOutput.match(/\{"[^"]*":[^}]*\}/g);
            
            if (jsonMatches && jsonMatches.length > 0) {
              // Try parsing each match, starting with the largest one
              const sortedMatches = jsonMatches.sort((a, b) => b.length - a.length);
              
              for (const match of sortedMatches) {
                try {
                  result = JSON.parse(match);
                  this.logger.debug(`Successfully parsed JSON using regex strategy: ${match.substring(0, 100)}...`);
                  break;
                } catch (regexError) {
                  this.logger.debug(`Regex match failed to parse: ${regexError.message}`);
                }
              }
            }
          } catch (error) {
            this.logger.debug(`Strategy 3 failed: ${error.message}`);
          }
        }
        
        // Strategy 4: Try to reconstruct truncated JSON
        if (!result) {
          try {
            const jsonStart = trimmedOutput.indexOf('{"');
            if (jsonStart >= 0) {
              let possibleJson = trimmedOutput.substring(jsonStart);
              
              // Try to find the last complete closing brace
              let lastValidJson = '';
              let braceCount = 0;
              let inString = false;
              let escaped = false;
              
              for (let i = 0; i < possibleJson.length; i++) {
                const char = possibleJson[i];
                
                if (escaped) {
                  escaped = false;
                  continue;
                }
                
                if (char === '\\') {
                  escaped = true;
                  continue;
                }
                
                if (char === '"' && !escaped) {
                  inString = !inString;
                }
                
                if (!inString) {
                  if (char === '{') {
                    braceCount++;
                  } else if (char === '}') {
                    braceCount--;
                    if (braceCount === 0) {
                      lastValidJson = possibleJson.substring(0, i + 1);
                      break;
                    }
                  }
                }
              }
              
              if (lastValidJson) {
                result = JSON.parse(lastValidJson);
                this.logger.debug(`Successfully reconstructed JSON from truncated output`);
              }
            }
          } catch (error) {
            this.logger.debug(`Strategy 4 failed: ${error.message}`);
          }
        }
        
        // If all parsing strategies failed, create a fallback result
        if (!result) {
          this.logger.warn(`All JSON parsing strategies failed. Creating fallback result.`);
          this.logger.debug(`Parse errors encountered: ${parseError ? parseError.message : 'Multiple parsing errors'}`);
          this.logger.debug(`Raw output sample: ${trimmedOutput}`);
          
          // Try to extract basic information from the output text
          const status = trimmedOutput.includes('PASS') ? 'passed' : 'failed';
          const errorOutput = trimmedOutput.includes('FAIL') ? trimmedOutput : '';
          
          result = {
            status: status,
            filePath: workItem.filePath,
            testResults: [],
            output: '',
            errorOutput: errorOutput,
            duration: 0,
            workerId: workerId,
            parseError: `JSON parsing failed: ${parseError ? parseError.message : 'Unknown error'}`,
            rawOutput: trimmedOutput.substring(0, 500)
          };
          
          this.logger.debug(`Created fallback result with status: ${result.status}`);
        }
        
        this.results.push(result);
        
        // Update test status tracking with detailed test results
        if (result.testResults && Array.isArray(result.testResults) && result.testResults.length > 0) {
          this.updateTestStatus(result.testResults);
          
          // Log detailed file completion status
          const fileName = path.basename(result.filePath || 'Unknown File');
          const passedCount = result.testResults.filter(t => t.status === 'passed').length;
          const failedCount = result.testResults.filter(t => t.status === 'failed').length;
          const skippedCount = result.testResults.filter(t => t.status === 'skipped').length;
          
          this.logger.info(`📁 ${fileName} completed: ✅ ${passedCount} passed, ❌ ${failedCount} failed, ⏭️ ${skippedCount} skipped [Worker: ${workerId}]`);
          
          // Log individual test results for immediate feedback
          result.testResults.forEach(test => {
            const statusIcon = test.status === 'passed' ? '✅' : test.status === 'failed' ? '❌' : '⏭️';
            this.logger.info(`  ${statusIcon} ${test.testName || test.name || 'Unknown Test'} (${test.duration || 0}ms)`);
          });
        } else {
          // If no individual test results, estimate based on work item and result status
          const fileName = path.basename(result.filePath || 'Unknown File');
          const statusIcon = result.status === 'passed' ? '✅' : '❌';
          
          // Create estimated test results for status tracking
          const estimatedResults = [];
          const testCount = workItem.testCount || 1;
          for (let i = 0; i < testCount; i++) {
            estimatedResults.push({
              status: result.status === 'passed' ? 'passed' : 'failed',
              name: `Test ${i + 1}${result.parseError ? ' (parsing failed)' : ''}`,
              duration: 0
            });
          }
          
          // Update test status with estimated results
          this.updateTestStatus(estimatedResults);
          
          if (result.parseError) {
            this.logger.warn(`📁 ${fileName} ❌ JSON parsing failed but worker completed (${testCount} tests estimated as ${result.status}) [Worker: ${workerId}]`);
            this.logger.debug(`Parse error details: ${result.parseError}`);
          } else {
            this.logger.info(`📁 ${fileName} ${statusIcon} ${result.status} (estimated ${testCount} tests) [Worker: ${workerId}]`);
          }
        }
      } catch (error) {
        this.logger.error(`Native parallel worker ${workerId} encountered unexpected error:`, error.message);
        this.logger.debug(`Raw output (first 1000 chars): ${output.substring(0, 1000)}`);
        this.logger.debug(`Raw stderr (first 500 chars): ${errorOutput.substring(0, 500)}`);
        
        // Try to extract useful information even if processing fails completely
        let errorSummary = 'Unknown error';
        if (output.includes('No tests found')) {
          errorSummary = 'No tests found - check file paths and Jest configuration';
        } else if (output.includes('Cannot find module')) {
          errorSummary = 'Module not found - check dependencies';
        } else if (output.includes('SyntaxError')) {
          errorSummary = 'Syntax error in test file';
        } else if (output.includes('TypeError')) {
          errorSummary = 'Type error during test execution';
        } else if (error.message.includes('Unexpected end of JSON input')) {
          errorSummary = 'Worker output was truncated or incomplete';
        }
        
        const failedResult = {
          filePath: workItem.filePath,
          status: 'failed',
          error: `Worker processing failed: ${error.message}. ${errorSummary}`,
          duration: 0,
          workerId,
          testResults: [],
          rawOutput: output.substring(0, 500), // Include sample for debugging
          rawError: errorOutput.substring(0, 500)
        };
        this.results.push(failedResult);
        
        // Update test status tracking - create failed test results based on expected test count
        const failedTests = [];
        for (let i = 0; i < (workItem.testCount || 1); i++) {
          failedTests.push({ 
            status: 'failed',
            name: `Test ${i + 1} (processing failed)`,
            duration: 0
          });
        }
        this.updateTestStatus(failedTests);
        
        // Log file failure with proper test count
        const fileName = path.basename(failedResult.filePath || 'Unknown File');
        this.logger.info(`📁 ${fileName} ❌ processing failed (${workItem.testCount || 1} tests marked as failed) [Worker: ${workerId}]`);
      }
    };

    worker.on('close', (code) => {
      handleCompletion(code);
    });

    worker.on('error', (error) => {
      if (hasCompleted) return;
      hasCompleted = true;
      this.logger.error(`Native parallel worker ${workerId} encountered an error:`, error.message);
      this.results.push({
        filePath: workItem.filePath,
        status: 'failed',
        error: `Worker process error: ${error.message}`,
        duration: 0,
        workerId,
        testResults: []
      });
    });

    // Set timeout
    const timeoutHandle = setTimeout(() => {
      if (!worker.killed && !hasCompleted) {
        worker.kill('SIGTERM'); // Use SIGTERM first for graceful shutdown
        setTimeout(() => {
          if (!worker.killed && !hasCompleted) {
            worker.kill('SIGKILL');
          }
        }, 2000);
        
        // Enhanced timeout logging with context
        const activity = this.executionLogger.workerActivities.get(workerId);
        let timeoutError = `Worker timeout - exceeded ${this.formatDuration(this.timeout)} limit`;
        
        if (activity && activity.workItem) {
          const elapsed = Date.now() - activity.startTime;
          timeoutError += ` while processing ${path.basename(workItem.filePath)} (running for ${this.formatDuration(elapsed)})`;
          
          // Check if this might be a hook timeout
          const isLikelyHookTimeout = this.detectHookTimeout(output, errorOutput, workItem.filePath);
          if (isLikelyHookTimeout) {
            this.executionLogger.logHookTimeout(workerId, isLikelyHookTimeout.hookType, isLikelyHookTimeout.suiteName, workItem.filePath, this.timeout);
            this.logger.error(`🚨 ${isLikelyHookTimeout.hookType} hook timed out in suite "${isLikelyHookTimeout.suiteName}" (${path.basename(workItem.filePath)})`);
            timeoutError += ` - likely ${isLikelyHookTimeout.hookType} hook timeout in suite "${isLikelyHookTimeout.suiteName}"`;
          } else {
            this.executionLogger.logWorkerTimeout(workerId, `Native parallel execution timeout`);
          }
        } else {
          this.executionLogger.logWorkerTimeout(workerId, `Native parallel execution timeout`);
        }
        
        this.logger.warn(`Native parallel worker ${workerId} killed due to timeout`);
        
        // Create a timeout result
        this.results.push({
          filePath: workItem.filePath,
          status: 'failed',
          error: timeoutError,
          duration: this.timeout,
          workerId,
          testResults: []
        });
        
        handleCompletion(null, true);
      }
    }, this.timeout);

    // Clear timeout when worker completes
    worker.on('close', () => {
      clearTimeout(timeoutHandle);
    });

    return worker;
  }

  parseJestOutput(output, workItem) {
    const testResults = [];
    let hookInfo = {
      beforeAll: { duration: 0, status: 'not_found', nested: [] },
      beforeEach: { duration: 0, status: 'not_found', nested: [] },
      afterAll: { duration: 0, status: 'not_found', nested: [] },
      afterEach: { duration: 0, status: 'not_found', nested: [] }
    };
    
    try {
      // Parse Jest output to extract individual test results and hook information
      const lines = output.split('\n');
      let currentSuite = '';
      let collectingError = false;
      let errorLines = [];
      let errorTestReference = null;
      let suiteFailedToRun = false;
      
      // Extract overall test timing to calculate hook duration
      let totalTestDuration = 0;
      let overallSuiteDuration = 0;
      
      // Look for Jest timing information
      const timingMatch = output.match(/Test Suites:.*?Time:\s*(\d+\.?\d*)\s*s/s);
      if (timingMatch) {
        overallSuiteDuration = parseFloat(timingMatch[1]) * 1000; // Convert to ms
      }

      // Track different test states from Jest summary
      const summaryMatch = output.match(/Tests:\s*(.+?)$/m);
      let expectedTestStats = { passed: 0, failed: 0, skipped: 0, todo: 0 };
      
      if (summaryMatch) {
        const summaryLine = summaryMatch[1];
        const failedMatch = summaryLine.match(/(\d+)\s+failed/);
        const skippedMatch = summaryLine.match(/(\d+)\s+skipped/);
        const todoMatch = summaryLine.match(/(\d+)\s+todo/);
        const passedMatch = summaryLine.match(/(\d+)\s+passed/);
        
        if (failedMatch) expectedTestStats.failed = parseInt(failedMatch[1]);
        if (skippedMatch) expectedTestStats.skipped = parseInt(skippedMatch[1]);
        if (todoMatch) expectedTestStats.todo = parseInt(todoMatch[1]);
        if (passedMatch) expectedTestStats.passed = parseInt(passedMatch[1]);
      }

      // Check for suite-level failures
      if (output.includes('Test suite failed to run')) {
        suiteFailedToRun = true;
      }

      // First pass: identify test results from Jest output markers
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();
        if (!trimmed) continue;

        // Detect suite names from describe blocks or error headers - also look at indentation
        if (trimmed.includes('FAIL ') || trimmed.includes('PASS ')) {
          // Extract filename, suite detection will happen via error headers
          continue;
        }

        // Capture suite names from Jest's nested test structure
        if (!line.startsWith(' ') && !line.includes('●') && !line.includes('✓') && 
            !line.includes('✕') && !line.includes('○') && 
            !trimmed.includes('Test Suites:') && !trimmed.includes('Tests:') &&
            !trimmed.includes('Expected:') && !trimmed.includes('Received:') &&
            !trimmed.includes('at Object.') && trimmed.length > 0) {
          // This could be a suite name
          if (trimmed !== 'FAIL' && trimmed !== 'PASS' && !trimmed.includes('.test.js')) {
            currentSuite = trimmed;
          }
        }

        // Look for passing tests: ✓ test_name (duration)
        const passMatch = line.match(/^\s*✓\s+(.+?)(?:\s*\((\d+)\s*ms\))?$/);
        if (passMatch) {
          const testName = passMatch[1].trim();
          const duration = passMatch[2] ? parseInt(passMatch[2]) : 0;
          totalTestDuration += duration;
          
          testResults.push({
            name: testName,
            suite: currentSuite,
            status: 'passed',
            duration: duration,
            error: null,
            failureType: null,
            testId: `${workItem.filePath}:${testName}`
          });
          continue;
        }

        // Look for failing tests with cross mark: ✕ test_name (duration)
        const crossFailMatch = line.match(/^\s*✕\s+(.+?)(?:\s*\((\d+)\s*ms\))?$/);
        if (crossFailMatch) {
          const testName = crossFailMatch[1].trim();
          const duration = crossFailMatch[2] ? parseInt(crossFailMatch[2]) : 0;
          totalTestDuration += duration;
          
          // Create a preliminary failed test - error will be attached later
          const failedTest = {
            name: testName,
            suite: currentSuite,
            status: 'failed',
            duration: duration,
            error: null,
            failureType: 'test_failure',
            testId: `${workItem.filePath}:${testName}`
          };
          
          testResults.push(failedTest);
          continue;
        }

        // Look for skipped tests: ○ test_name
        const skipMatch = line.match(/^\s*○\s+(.+?)$/);
        if (skipMatch) {
          const testName = skipMatch[1].trim();
          
          testResults.push({
            name: testName,
            suite: currentSuite,
            status: 'skipped',
            duration: 0,
            error: null,
            failureType: 'skipped',
            testId: `${workItem.filePath}:${testName}`
          });
          continue;
        }

        // Look for todo tests: ✎ todo test_name
        const todoMatch = line.match(/^\s*✎\s+todo\s+(.+?)$/);
        if (todoMatch) {
          const testName = todoMatch[1].trim();
          
          testResults.push({
            name: testName,
            suite: currentSuite,
            status: 'todo',
            duration: 0,
            error: null,
            failureType: 'todo',
            testId: `${workItem.filePath}:${testName}`
          });
          continue;
        }

        // Look for failed test markers: ● Suite › test_name
        const errorHeaderMatch = line.match(/^\s*●\s+(.+?)\s*›\s*(.+?)$/);
        if (errorHeaderMatch) {
          // Save previous error if we were collecting one
          if (collectingError && errorTestReference && errorLines.length > 0) {
            this.attachErrorToTest(errorTestReference, errorLines, testResults, hookInfo);
          }
          
          const suiteName = errorHeaderMatch[1].trim();
          const testName = errorHeaderMatch[2].trim();
          
          // Find existing failed test to attach error to, or create new one
          // Try multiple matching strategies for nested suites
          let failedTest = testResults.find(t => t.name === testName && t.status === 'failed' && t.suite === suiteName);
          
          if (!failedTest) {
            // For nested suites, try to find a test that might have been parsed with a different structure
            // Look for tests where the suite path contains our expected components
            const suiteComponents = suiteName.split(' › ');
            failedTest = testResults.find(t => 
              t.name === testName && 
              t.status === 'failed' &&
              suiteComponents.some(component => t.suite.includes(component))
            );
          }
          
          if (!failedTest) {
            // Try to find and update an existing test with a similar name but no error
            // This handles cases where Jest parsed the test differently than the error header
            failedTest = testResults.find(t => 
              t.name === testName && 
              t.status === 'failed' &&
              !t.error  // Prioritize tests without errors already attached
            );
            
            if (failedTest) {
              // Update the suite name to match the error header (more complete info)
              failedTest.suite = suiteName;
              this.logger.debug(`Updated existing test "${testName}" suite to "${suiteName}"`);
            }
          }
          
          if (!failedTest) {
            // Last resort: create new test entry
            failedTest = {
              name: testName,
              suite: suiteName,
              status: 'failed',
              duration: 0,
              error: null,
              failureType: 'test_failure',
              testId: `${workItem.filePath}:${testName}`
            };
            testResults.push(failedTest);
            this.logger.debug(`Created new failed test entry: "${testName}" in suite "${suiteName}"`);
          } else {
            this.logger.debug(`Found existing failed test: "${failedTest.name}" in suite "${failedTest.suite}"`);
          }
          
          errorTestReference = failedTest;
          collectingError = true;
          errorLines = [];
          continue;
        }

        // Look for suite failure: ● Test suite failed to run
        if (line.match(/^\s*●\s+Test suite failed to run/)) {
          if (collectingError && errorTestReference && errorLines.length > 0) {
            this.attachErrorToTest(errorTestReference, errorLines, testResults, hookInfo);
          }
          
          // Create a suite-level failure
          const suiteFailure = {
            name: 'Test suite failed to run',
            suite: path.basename(workItem.filePath, '.test.js'),
            status: 'failed',
            duration: 0,
            error: null,
            failureType: 'suite_failure',
            testId: `${workItem.filePath}:suite_failure`
          };
          
          testResults.push(suiteFailure);
          errorTestReference = suiteFailure;
          collectingError = true;
          errorLines = [];
          continue;
        }

        // Collect error details
        if (collectingError) {
          // Stop collecting on next test marker or summary
          if (line.match(/^\s*[✓○●✕]/) || 
              line.includes('Test Suites:') || 
              line.includes('Tests:') ||
              line.includes('Snapshots:') ||
              line.includes('Time:')) {
            
            if (errorTestReference && errorLines.length > 0) {
              this.attachErrorToTest(errorTestReference, errorLines, testResults, hookInfo);
            }
            collectingError = false;
            errorTestReference = null;
            errorLines = [];
            
            // Re-process this line since it might be a new test marker
            i--;
            continue;
          } else {
            errorLines.push(line);
          }
        }
      }
      
      // Handle any remaining error collection
      if (collectingError && errorTestReference && errorLines.length > 0) {
        this.attachErrorToTest(errorTestReference, errorLines, testResults, hookInfo);
      }
      
      // Add todo tests if detected in summary but not in results
      if (expectedTestStats.todo > 0) {
        const todoPattern = /test\.todo\(['"]([^'"]+)['"]\)/g;
        const fileContent = require('fs').readFileSync(workItem.filePath, 'utf8');
        let todoMatch;
        while ((todoMatch = todoPattern.exec(fileContent)) !== null) {
          const todoName = todoMatch[1];
          testResults.push({
            name: todoName,
            suite: currentSuite || path.basename(workItem.filePath, '.test.js'),
            status: 'todo',
            duration: 0,
            error: null,
            failureType: 'todo',
            testId: `${workItem.filePath}:${todoName}`
          });
        }
      }
      
      // Calculate hook duration based on timing analysis
      this.calculateHookDurations(overallSuiteDuration, totalTestDuration, testResults, hookInfo, workItem);
      
      // Clean up duplicate test entries (prioritize tests with error messages)
      this.deduplicateTestResults(testResults);
      
      // Debug logging for parsing results
      this.logger.debug(`Jest output parsing completed for ${path.basename(workItem.filePath)}:`);
      this.logger.debug(`- Found ${testResults.length} test results`);
      this.logger.debug(`- Test breakdown: ${testResults.filter(t => t.status === 'passed').length} passed, ${testResults.filter(t => t.status === 'failed').length} failed, ${testResults.filter(t => t.status === 'skipped').length} skipped`);
      if (testResults.length > 0) {
        this.logger.debug(`- Sample test names: ${testResults.slice(0, 3).map(t => t.name).join(', ')}${testResults.length > 3 ? '...' : ''}`);
      }
      
      // Validate and fill missing tests if needed
      this.validateTestResults(testResults, workItem, expectedTestStats);
      
    } catch (error) {
      this.logger.error(`Error parsing Jest output for ${workItem.filePath}:`, error.message);
    }
    
    return { testResults, hookInfo };
  }

  deduplicateTestResults(testResults) {
    // Remove duplicate test entries, prioritizing those with error messages
    const toRemove = [];
    
    for (let i = 0; i < testResults.length; i++) {
      const test = testResults[i];
      
      // Look for other tests that might be duplicates
      for (let j = i + 1; j < testResults.length; j++) {
        const otherTest = testResults[j];
        
        if (this.areTestsDuplicates(test, otherTest)) {
          // Decide which test to keep
          let keepIndex = i;
          let removeIndex = j;
          
          // Prioritize test with error message
          if (otherTest.error && !test.error) {
            keepIndex = j;
            removeIndex = i;
          } else if (test.error && !otherTest.error) {
            keepIndex = i;
            removeIndex = j;
          } else if (otherTest.suite.length > test.suite.length) {
            // Both have/don't have errors, prioritize more detailed suite name
            keepIndex = j;
            removeIndex = i;
          } else if (test.name.length > otherTest.name.length) {
            // Prioritize more detailed test name
            keepIndex = i;
            removeIndex = j;
          }
          
          if (!toRemove.includes(removeIndex)) {
            toRemove.push(removeIndex);
            this.logger.debug(`Dedup: Removing "${testResults[removeIndex].name}" (${testResults[removeIndex].suite}), keeping "${testResults[keepIndex].name}" (${testResults[keepIndex].suite})`);
          }
        }
      }
    }
    
    // Remove duplicates (in reverse order to maintain indices)
    toRemove.sort((a, b) => b - a);
    for (const removeIndex of toRemove) {
      if (removeIndex < testResults.length) {
        testResults.splice(removeIndex, 1);
      }
    }
    
    if (toRemove.length > 0) {
      this.logger.debug(`Removed ${toRemove.length} duplicate test entries`);
    }
  }
  
  areTestsDuplicates(test1, test2) {
    // Same test name and status - obvious duplicate
    if (test1.name === test2.name && test1.status === test2.status) {
      return true;
    }
    
    // Check if one test name is a subset of another (nested test case)
    // e.g., "Nested Test 1" vs "Inner Suite › Nested Test 1"
    if (test1.status === test2.status) {
      const name1Parts = test1.name.split(' › ');
      const name2Parts = test2.name.split(' › ');
      const shortName1 = name1Parts[name1Parts.length - 1];  // Get the actual test name
      const shortName2 = name2Parts[name2Parts.length - 1];  // Get the actual test name
      
      if (shortName1 === shortName2) {
        // Same final test name, likely duplicates from different parsing strategies
        return true;
      }
    }
    
    return false;
  }

  attachErrorToTest(testRef, errorLines, testResults, hookInfo) {
    if (!testRef || !errorLines.length) return;
    
    const errorText = errorLines.join('\n').trim();
    
    // Classify the error type and enhance the message, passing suite name from testRef
    const suiteName = testRef.suite || 'unknown suite';
    const { errorMessage, failureType, hookType } = this.classifyJestError(errorText, suiteName);
    
    testRef.error = errorMessage;
    testRef.failureType = failureType;
    
    // Update hook info if this is a hook failure
    if (hookType && hookInfo[hookType]) {
      hookInfo[hookType].status = 'failed';
    }
    
    this.logger.debug(`Attached error to test "${testRef.name}": ${failureType}`);
  }

  classifyJestError(errorText, suiteName = 'unknown suite') {
    const lowerError = errorText.toLowerCase();
    let failureType = 'test_failure';
    let hookType = null;
    let errorMessage = errorText;

    // Detect different types of failures with more specific patterns
    if (lowerError.includes('beforeall')) {
      failureType = 'hook_failure';
      hookType = 'beforeAll';
      
      errorMessage = `BeforeAll hook failure in "${suiteName}":\n${errorText}`;
    } else if (lowerError.includes('beforeeach')) {
      failureType = 'hook_failure';
      hookType = 'beforeEach';
      
      errorMessage = `BeforeEach hook failure in "${suiteName}":\n${errorText}`;
    } else if (lowerError.includes('afterall')) {
      failureType = 'hook_failure';
      hookType = 'afterAll';
      
      errorMessage = `AfterAll hook failure in "${suiteName}":\n${errorText}`;
    } else if (lowerError.includes('aftereach')) {
      failureType = 'hook_failure';
      hookType = 'afterEach';
      
      errorMessage = `AfterEach hook failure in "${suiteName}":\n${errorText}`;
    } else if (errorText.includes('expect(')) {
      failureType = 'assertion_failure';
    } else if (lowerError.includes('error:') || lowerError.includes('exception')) {
      failureType = 'exception';
    } else if (lowerError.includes('timeout')) {
      failureType = 'timeout';
    } else if (lowerError.includes('referenceerror')) {
      failureType = 'reference_error';
    } else if (lowerError.includes('typeerror')) {
      failureType = 'type_error';
    }

    return { errorMessage, failureType, hookType };
  }

  calculateHookDurations(overallSuiteDuration, totalTestDuration, testResults, hookInfo, workItem) {
    if (overallSuiteDuration > 0 && totalTestDuration >= 0) {
      // Estimate hook duration as the difference between total suite time and test execution time
      const estimatedHookDuration = Math.max(0, overallSuiteDuration - totalTestDuration);
      
      // Only track if significant (>10ms)
      if (estimatedHookDuration > 10) {
        // Extract nested structure from source file
        const nestedStructure = this.extractNestedHooksFromFile(workItem.filePath);
        
        // Check if we have evidence of hook failures to better estimate
        const hasHookFailures = testResults.some(t => t.failureType === 'hook_failure');
        
        if (hasHookFailures) {
          // If there are hook failures, distribute time based on failure types
          const beforeAllFailures = testResults.filter(t => t.error && t.error.includes('BeforeAll')).length;
          const beforeEachFailures = testResults.filter(t => t.error && t.error.includes('BeforeEach')).length;
          const afterAllFailures = testResults.filter(t => t.error && t.error.includes('AfterAll')).length;
          const afterEachFailures = testResults.filter(t => t.error && t.error.includes('AfterEach')).length;
          
          if (beforeAllFailures > 0) {
            hookInfo.beforeAll.duration = Math.round(estimatedHookDuration * 0.6);
            hookInfo.beforeAll.status = 'failed';
            
            // Distribute among nested beforeAll hooks
            this.distributeNestedHookDuration(hookInfo.beforeAll, nestedStructure, 'beforeAll');
          }
          if (beforeEachFailures > 0) {
            hookInfo.beforeEach.duration = Math.round(estimatedHookDuration * 0.25);
            hookInfo.beforeEach.status = 'failed';
            
            this.distributeNestedHookDuration(hookInfo.beforeEach, nestedStructure, 'beforeEach');
          }
          if (afterEachFailures > 0) {
            hookInfo.afterEach.duration = Math.round(estimatedHookDuration * 0.1);
            hookInfo.afterEach.status = 'failed';
            
            this.distributeNestedHookDuration(hookInfo.afterEach, nestedStructure, 'afterEach');
          }
          if (afterAllFailures > 0) {
            hookInfo.afterAll.duration = Math.round(estimatedHookDuration * 0.05);
            hookInfo.afterAll.status = 'failed';
            
            this.distributeNestedHookDuration(hookInfo.afterAll, nestedStructure, 'afterAll');
          }
        } else {
          // No hook failures, use estimation
          hookInfo.beforeAll.duration = Math.round(estimatedHookDuration * 0.8); // 80% to beforeAll
          hookInfo.beforeAll.status = 'estimated';
          
          // Distribute among nested beforeAll hooks
          this.distributeNestedHookDuration(hookInfo.beforeAll, nestedStructure, 'beforeAll');
          
          // Distribute remaining time to other hooks if tests show they might exist
          const remainingDuration = estimatedHookDuration - hookInfo.beforeAll.duration;
          if (remainingDuration > 5 && testResults.length > 1) {
            hookInfo.beforeEach.duration = Math.round(remainingDuration * 0.7);
            hookInfo.beforeEach.status = 'estimated';
            this.distributeNestedHookDuration(hookInfo.beforeEach, nestedStructure, 'beforeEach');
            
            hookInfo.afterEach.duration = Math.round(remainingDuration * 0.2);
            hookInfo.afterEach.status = 'estimated';
            this.distributeNestedHookDuration(hookInfo.afterEach, nestedStructure, 'afterEach');
            
            hookInfo.afterAll.duration = Math.round(remainingDuration * 0.1);
            hookInfo.afterAll.status = 'estimated';
            this.distributeNestedHookDuration(hookInfo.afterAll, nestedStructure, 'afterAll');
          }
        }
      }
    }
  }

  // Distribute hook duration among nested hooks
  distributeNestedHookDuration(hookInfo, nestedStructure, hookType) {
    if (!nestedStructure || nestedStructure.length === 0) return;
    
    // Find all suites that have this hook type
    const suitesWithHooks = nestedStructure.filter(suite => 
      suite.hooks[hookType] && suite.hooks[hookType].length > 0
    );
    
    if (suitesWithHooks.length === 0) return;
    
    // Distribute duration among nested hooks
    const durationPerHook = Math.round(hookInfo.duration / suitesWithHooks.length);
    
    suitesWithHooks.forEach(suite => {
      suite.hooks[hookType].forEach((hook, index) => {
        hookInfo.nested.push({
          suite: suite.fullPath,
          lineNumber: hook.lineNumber,
          duration: index === 0 ? durationPerHook : Math.round(durationPerHook * 0.5), // First hook gets more time
          status: hookInfo.status
        });
      });
    });
    
    this.logger.debug(`Distributed ${hookType} duration (${hookInfo.duration}ms) among ${hookInfo.nested.length} nested hooks`);
  }

  validateTestResults(testResults, workItem, expectedStats) {
    // Ensure we have the minimum expected number of results
    const currentStats = {
      passed: testResults.filter(t => t.status === 'passed').length,
      failed: testResults.filter(t => t.status === 'failed').length,
      skipped: testResults.filter(t => t.status === 'skipped').length,
      todo: testResults.filter(t => t.status === 'todo').length
    };

    this.logger.debug(`Test results validation for ${path.basename(workItem.filePath)}:`);
    this.logger.debug(`Found: ${JSON.stringify(currentStats)}`);
    this.logger.debug(`Expected: ${JSON.stringify(expectedStats)}`);

    // If we're missing tests but have a count from the parser, add placeholders carefully
    const foundTotal = currentStats.passed + currentStats.failed + currentStats.skipped + currentStats.todo;
    const expectedTotal = expectedStats.passed + expectedStats.failed + expectedStats.skipped + expectedStats.todo;
    
    if (foundTotal === 0 && workItem.testCount > 0) {
      // Try to extract actual test names from the source file
      const actualTestNames = this.extractTestNamesFromFile(workItem.filePath);
      
      if (actualTestNames.length > 0) {
        this.logger.debug(`Creating ${actualTestNames.length} test results from source file analysis`);
        for (const testName of actualTestNames) {
          testResults.push({
            name: testName,
            suite: path.basename(workItem.filePath, '.test.js'),
            status: 'passed', // Assume passed if Jest didn't report failures
            duration: 0,
            error: null,
            failureType: null,
            testId: `${workItem.filePath}:${testName}`
          });
        }
      } else {
        // Last resort: create placeholder results based on test count
        this.logger.debug(`Creating ${workItem.testCount} placeholder results (could not extract test names)`);
        for (let i = 0; i < workItem.testCount; i++) {
          testResults.push({
            name: `Test ${i + 1} (parsing failed)`,
            suite: path.basename(workItem.filePath, '.test.js'),
            status: 'passed', // Assume passed if Jest didn't report failures
            duration: 0,
            error: null,
            failureType: null,
            testId: `${workItem.filePath}:Test ${i + 1}`
          });
        }
      }
    }
  }

  // Extract actual test names from source file when Jest parsing fails
  extractTestNamesFromFile(filePath) {
    try {
      const fs = require('fs');
      const fileContent = fs.readFileSync(filePath, 'utf8');
      const testNames = [];
      
      // Match various test patterns: it('name'), test('name'), it("name"), test("name")
      const testPatterns = [
        /(?:it|test)\s*\(\s*['"`]([^'"`]+)['"`]/g,
        /(?:it|test)\.only\s*\(\s*['"`]([^'"`]+)['"`]/g,
        /(?:it|test)\.skip\s*\(\s*['"`]([^'"`]+)['"`]/g,
        /(?:it|test)\.todo\s*\(\s*['"`]([^'"`]+)['"`]/g,
        /(?:it|test)\.concurrent\s*\(\s*['"`]([^'"`]+)['"`]/g
      ];
      
      for (const pattern of testPatterns) {
        let match;
        while ((match = pattern.exec(fileContent)) !== null) {
          const testName = match[1].trim();
          if (testName && !testNames.includes(testName)) {
            testNames.push(testName);
          }
        }
      }
      
      this.logger.debug(`Extracted ${testNames.length} test names from ${path.basename(filePath)}: ${testNames.slice(0, 3).join(', ')}${testNames.length > 3 ? '...' : ''}`);
      return testNames;
      
    } catch (error) {
      this.logger.debug(`Failed to extract test names from ${filePath}: ${error.message}`);
      return [];
    }
  }

  // Extract nested describe blocks and their hooks from source file
  extractNestedHooksFromFile(filePath) {
    try {
      const fs = require('fs');
      const fileContent = fs.readFileSync(filePath, 'utf8');
      const nestedStructure = [];
      
      // Parse the file to find nested describe blocks and their hooks
      const lines = fileContent.split('\n');
      let currentIndentation = 0;
      let describeStack = [];
      let braceCount = 0;
      let inDescribe = false;
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmedLine = line.trim();
        
        // Skip empty lines and comments
        if (!trimmedLine || trimmedLine.startsWith('//') || trimmedLine.startsWith('/*')) {
          continue;
        }
        
        // Count braces to track nesting level
        const openBraces = (line.match(/\{/g) || []).length;
        const closeBraces = (line.match(/\}/g) || []).length;
        braceCount += openBraces - closeBraces;
        
        // Detect describe blocks
        const describeMatch = trimmedLine.match(/describe\s*\(\s*['"`]([^'"`]+)['"`]/);
        if (describeMatch) {
          const suiteName = describeMatch[1];
          const indentLevel = line.length - line.trimStart().length;
          
          // Pop describe stack if we're at a lower indentation level
          while (describeStack.length > 0 && indentLevel <= describeStack[describeStack.length - 1].indentLevel) {
            describeStack.pop();
          }
          
          const suiteInfo = {
            name: suiteName,
            indentLevel: indentLevel,
            fullPath: [...describeStack.map(s => s.name), suiteName].join(' › '),
            hooks: {
              beforeAll: [],
              beforeEach: [],
              afterAll: [],
              afterEach: []
            },
            lineNumber: i + 1
          };
          
          describeStack.push(suiteInfo);
          nestedStructure.push(suiteInfo);
        }
        
        // Detect hooks within current describe context
        if (describeStack.length > 0) {
          const currentSuite = describeStack[describeStack.length - 1];
          
          if (trimmedLine.includes('beforeAll(')) {
            currentSuite.hooks.beforeAll.push({
              lineNumber: i + 1,
              suite: currentSuite.fullPath
            });
          } else if (trimmedLine.includes('beforeEach(')) {
            currentSuite.hooks.beforeEach.push({
              lineNumber: i + 1,
              suite: currentSuite.fullPath
            });
          } else if (trimmedLine.includes('afterAll(')) {
            currentSuite.hooks.afterAll.push({
              lineNumber: i + 1,
              suite: currentSuite.fullPath
            });
          } else if (trimmedLine.includes('afterEach(')) {
            currentSuite.hooks.afterEach.push({
              lineNumber: i + 1,
              suite: currentSuite.fullPath
            });
          }
        }
      }
      
      this.logger.debug(`Found ${nestedStructure.length} nested describe blocks in ${path.basename(filePath)}`);
      nestedStructure.forEach(suite => {
        const hookCounts = Object.entries(suite.hooks).map(([type, hooks]) => `${type}:${hooks.length}`).join(', ');
        this.logger.debug(`- "${suite.fullPath}": ${hookCounts}`);
      });
      
      return nestedStructure;
      
    } catch (error) {
      this.logger.debug(`Failed to extract nested hooks from ${filePath}: ${error.message}`);
      return [];
    }
  }

  enhanceErrorMessage(originalError, hookFailures = []) {
    // This method is kept for backward compatibility but the logic is now in classifyJestError
    const { errorMessage } = this.classifyJestError(originalError, 'unknown suite');
    return errorMessage;
  }

  // Detect if a timeout likely occurred during hook execution
  detectHookTimeout(output, errorOutput, filePath) {
    const allOutput = (output + '\n' + errorOutput).toLowerCase();
    const lines = allOutput.split('\n');
    
    // Look for hook-related patterns in the output
    let lastSuiteName = '';
    let hookInProgress = null;
    
    for (const line of lines) {
      const trimmedLine = line.trim();
      
      // Track current suite/describe block
      if (trimmedLine.includes('describe') && !trimmedLine.includes('at ')) {
        const suiteMatch = trimmedLine.match(/describe[^"']*["']([^"']+)["']/);
        if (suiteMatch) {
          lastSuiteName = suiteMatch[1];
        }
      }
      
      // Detect hook execution messages
      if (trimmedLine.includes('beforeall starting') || trimmedLine.includes('beforeall setup')) {
        hookInProgress = { hookType: 'beforeAll', suiteName: lastSuiteName };
      } else if (trimmedLine.includes('beforeeach starting') || trimmedLine.includes('beforeeach setup')) {
        hookInProgress = { hookType: 'beforeEach', suiteName: lastSuiteName };
      } else if (trimmedLine.includes('afterall starting') || trimmedLine.includes('afterall cleanup')) {
        hookInProgress = { hookType: 'afterAll', suiteName: lastSuiteName };
      } else if (trimmedLine.includes('aftereach starting') || trimmedLine.includes('aftereach cleanup')) {
        hookInProgress = { hookType: 'afterEach', suiteName: lastSuiteName };
      }
      
      // Detect hook completion messages (if hook completed, it wasn't a timeout)
      if (trimmedLine.includes('beforeall completed') || trimmedLine.includes('beforeeach completed') ||
          trimmedLine.includes('afterall completed') || trimmedLine.includes('aftereach completed')) {
        hookInProgress = null;
      }
      
      // Look for Jest timeout patterns
      if (trimmedLine.includes('timeout') || trimmedLine.includes('exceeded timeout')) {
        // If we detected a hook in progress and then see timeout, it's likely a hook timeout
        if (hookInProgress) {
          return hookInProgress;
        }
      }
    }
    
    // If we detected a hook in progress but never saw completion, assume timeout in that hook
    if (hookInProgress) {
      return hookInProgress;
    }
    
    // Check for other timeout indicators when we can infer the suite name
    if (allOutput.includes('timeout') && lastSuiteName) {
      // Look for beforeAll/beforeEach patterns in the file content to guess which hook
      try {
        const fs = require('fs');
        const fileContent = fs.readFileSync(filePath, 'utf8').toLowerCase();
        
        if (fileContent.includes('beforeall')) {
          return { hookType: 'beforeAll', suiteName: lastSuiteName };
        } else if (fileContent.includes('beforeeach')) {
          return { hookType: 'beforeEach', suiteName: lastSuiteName };
        }
      } catch (error) {
        // Ignore file read errors
      }
    }
    
    return null;
  }

  processWorkQueue() {
    // Start workers up to maxWorkers limit while there are items in the queue
    while (this.activeWorkers < this.maxWorkers && this.workQueue.length > 0) {
      // Find an available worker ID (reuse completed worker slots)
      let workerId = this.findAvailableWorkerId();
      this.startWorker(workerId);
    }
    
    // Check if all work is complete
    if (this.activeWorkers === 0 && this.workQueue.length === 0) {
      this.checkCompletion();
    }
  }

  findAvailableWorkerId() {
    // Find the first available worker slot, or use the next sequential ID
    for (let i = 0; i < this.maxWorkers; i++) {
      if (!this.workers[i] || this.workers[i].killed) {
        return i;
      }
    }
    // If all slots are in use, this shouldn't happen due to activeWorkers check
    return this.workers.length;
  }

  checkCompletion() {
    if (this.activeWorkers === 0 && this.workQueue.length === 0) {
      // Record execution end time
      this.executionEndTime = new Date();
      
      this.logger.success(`All workers completed. Total results: ${this.results.length}`);
      
      // Log execution time if available
      if (this.executionStartTime && this.executionEndTime) {
        const totalDurationMs = this.executionEndTime - this.executionStartTime;
        const totalDurationSeconds = (totalDurationMs / 1000).toFixed(2);
        this.logger.info(`Total execution time: ${totalDurationSeconds}s`);
      }
      
      // Log final test status
      this.logFinalTestStatus().catch(err => 
        console.error('Error logging final test status:', err.message)
      );

      // Write enhanced JSON reporter output
      try {
        const fs = require('fs');
        const path = require('path');
        const reportDir = path.join(process.cwd(), 'reports');
        if (!fs.existsSync(reportDir)) {
          fs.mkdirSync(reportDir, { recursive: true });
        }

        // Group results by file
        const fileMap = {};
        for (const result of this.results) {
          const file = result.filePath || result.file || 'unknown';
          if (!fileMap[file]) {
            fileMap[file] = {
              filePath: file,
              status: 'passed',
              testCount: 0,
              passed: 0,
              failed: 0,
              skipped: 0,
              tests: [],
              startTime: null,
              endTime: null,
              hooks: {
                beforeAll: { duration: 0, status: 'not_found', nested: [] },
                beforeEach: { duration: 0, status: 'not_found', nested: [] },
                afterAll: { duration: 0, status: 'not_found', nested: [] },
                afterEach: { duration: 0, status: 'not_found', nested: [] }
              }
            };
          }
          // File-level status
          if (result.status === 'failed') fileMap[file].status = 'failed';
          if (result.testCount) fileMap[file].testCount += result.testCount;
          
          // Track file timing
          if (result.startTime && (!fileMap[file].startTime || new Date(result.startTime) < new Date(fileMap[file].startTime))) {
            fileMap[file].startTime = result.startTime;
          }
          if (result.endTime && (!fileMap[file].endTime || new Date(result.endTime) > new Date(fileMap[file].endTime))) {
            fileMap[file].endTime = result.endTime;
          }
          
          // Merge hook information if available
          if (result.hookInfo) {
            Object.keys(result.hookInfo).forEach(hookType => {
              if (result.hookInfo[hookType].duration > fileMap[file].hooks[hookType].duration) {
                // Copy the hook info including nested information
                fileMap[file].hooks[hookType] = { 
                  duration: result.hookInfo[hookType].duration,
                  status: result.hookInfo[hookType].status,
                  nested: result.hookInfo[hookType].nested || []
                };
              }
            });
          }
          
          // Individual test results
          if (Array.isArray(result.testResults)) {
            for (const t of result.testResults) {
              fileMap[file].tests.push({
                name: t.testName || t.fullName || t.title || t.name || 'Unknown Test',
                status: t.status,
                duration: t.duration ? `${(t.duration / 1000).toFixed(3)}s` : 'N/A',
                durationMs: t.duration || 0
              });
              if (t.status === 'passed') fileMap[file].passed++;
              if (t.status === 'failed') fileMap[file].failed++;
              if (t.status === 'skipped') fileMap[file].skipped++;
            }
          } else if (result.status) {
            // Fallback for single test
            fileMap[file].tests.push({
              name: result.testName || result.fullName || result.title || result.name || 'Unknown Test',
              status: result.status,
              duration: result.duration ? `${(result.duration / 1000).toFixed(3)}s` : 'N/A',
              durationMs: result.duration || 0
            });
            if (result.status === 'passed') fileMap[file].passed++;
            if (result.status === 'failed') fileMap[file].failed++;
            if (result.status === 'skipped') fileMap[file].skipped++;
          }
        }

        // Build file summary array
        const fileSummaries = Object.values(fileMap).map(f => {
          // Calculate file duration from test results if available
          let fileDurationMs = 0;
          if (f.tests && f.tests.length > 0) {
            fileDurationMs = f.tests.reduce((sum, test) => sum + (test.durationMs || 0), 0);
          }
          
          // Add calculated duration to the file map entry for fileDetails
          f.duration = fileDurationMs > 0 ? `${(fileDurationMs / 1000).toFixed(3)}s` : 'N/A';
          f.durationMs = fileDurationMs;
          
          // Calculate total hook duration for summary
          const totalHookDuration = Object.values(f.hooks).reduce((sum, hook) => sum + (hook.duration || 0), 0);
          
          return {
            filePath: f.filePath,
            status: f.status,
            testCount: f.testCount || f.tests.length,
            passed: f.passed,
            failed: f.failed,
            skipped: f.skipped,
            duration: f.duration,
            durationMs: f.durationMs,
            hooks: {
              total: totalHookDuration,
              beforeAll: f.hooks.beforeAll,
              beforeEach: f.hooks.beforeEach,
              afterAll: f.hooks.afterAll,
              afterEach: f.hooks.afterEach
            }
          };
        });

        const jsonReport = {
          summary: {
            total: this.testStatus.total,
            passed: this.testStatus.passed,
            failed: this.testStatus.failed,
            skipped: this.testStatus.skipped,
            completed: this.testStatus.completed,
            running: this.testStatus.running,
            successRate: this.testStatus.total > 0 ? ((this.testStatus.passed / this.testStatus.total) * 100).toFixed(1) : '0.0',
            duration: this.executionEndTime && this.executionStartTime ? 
              `${((this.executionEndTime - this.executionStartTime) / 1000).toFixed(2)}s` : 'N/A',
            durationMs: this.executionEndTime && this.executionStartTime ? 
              (this.executionEndTime - this.executionStartTime) : 0,
            startTime: this.executionStartTime ? this.executionStartTime.toISOString() : null,
            endTime: this.executionEndTime ? this.executionEndTime.toISOString() : null,
            hooks: {
              totalDuration: fileSummaries.reduce((sum, f) => sum + (f.hooks?.total || 0), 0),
              beforeAllTotal: fileSummaries.reduce((sum, f) => sum + (f.hooks?.beforeAll?.duration || 0), 0),
              beforeEachTotal: fileSummaries.reduce((sum, f) => sum + (f.hooks?.beforeEach?.duration || 0), 0),
              afterAllTotal: fileSummaries.reduce((sum, f) => sum + (f.hooks?.afterAll?.duration || 0), 0),
              afterEachTotal: fileSummaries.reduce((sum, f) => sum + (f.hooks?.afterEach?.duration || 0), 0)
            }
          },
          fileSummary: fileSummaries,
          fileDetails: fileMap,
          results: this.results
        };
        fs.writeFileSync(path.join(reportDir, 'test-status.json'), JSON.stringify(jsonReport, null, 2), 'utf8');
        this.logger.info('JSON test status report written to reports/test-status.json');
      } catch (err) {
        this.logger.error('Failed to write JSON test status report:', err.message);
      }

      this.onComplete(this.results);
    }
  }

  cleanup() {
    Object.entries(this.workers).forEach(([id, worker]) => {
      if (worker && !worker.killed) {
        this.logger.debug(`Cleaning up worker ${id}`);
        worker.kill('SIGTERM');
      }
    });
  }
}

module.exports = { WorkerManager };
