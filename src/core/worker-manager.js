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
      workerProcess = this.spawnJestParallelWorker(workItem, workerId);
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

    const jestMaxWorkers = Math.min(4, Math.max(2, Math.min(workItem.testCount || 2, this.maxWorkers)));
    const jestArgs = [
      '--testMatch', `${workItem.filePath}`,
      '--verbose',
      '--no-coverage',
      '--passWithNoTests=false',
      '--maxWorkers', jestMaxWorkers.toString()
    ];

  const cmd = 'npx';
  const cmdArgs = useBrowserStack ? ['browserstack-node-sdk', 'jest', ...jestArgs] : ['jest', ...jestArgs];

    if (useBrowserStack) {
      this.logger.info(`🌐 Using BrowserStack Node SDK for ${path.basename(workItem.filePath)} (workers: ${jestMaxWorkers})`);
    } else {
      this.logger.debug(`Starting Jest (workers: ${jestMaxWorkers}) for ${path.basename(workItem.filePath)}`);
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
      const testResults = this.parseJestOutput(combinedOutput, workItem);
      
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
        testResults
      };
      
      // If Jest failed and we couldn't parse any tests, attach a minimal error for reporting
      if (result.status === 'failed' && (!result.testResults || result.testResults.length === 0)) {
        const minimalError = (combinedOutput.match(/^FAIL[\s\S]*?$(?:\n[\s\S]*?)?(?=^PASS|^FAIL|^Test Suites:|^Tests:|\Z)/m) || [combinedOutput.trim()])[0];
        result.error = minimalError.slice(0, 2000);
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
    try {
      const lines = output.split('\n');
      let currentSuite = '';
      let currentFailed = null;
      let collecting = false;
      let errorLines = [];
      for (const line of lines) {
        const t = line.trim();
        if (!t) continue;

        // Capture suite headers heuristically (non-test lines between PASS/FAIL and test markers)
        if (!t.startsWith('✓') && !t.match(/^[✗✕×]/) && !t.startsWith('○') &&
            !t.startsWith('PASS') && !t.startsWith('FAIL') && !t.includes('Test Suites:') && !t.includes('Tests:')) {
          if (!line.startsWith('    ')) currentSuite = t;
        }

        const pass = line.match(/^\s*✓\s+(.+?)(?:\s*\((\d+)\s*ms\))?$/);
        if (pass) {
          const name = pass[1].trim();
          const dur = pass[2] ? parseInt(pass[2]) : 0;
          if (name) testResults.push({ name, suite: currentSuite, status: 'passed', duration: dur, error: null });
          collecting = false; currentFailed = null; errorLines = [];
          continue;
        }

        const fail = line.match(/^\s*[✗✕×]\s+(.+?)(?:\s*\((\d+)\s*ms\))?$/);
        if (fail) {
          const name = fail[1].trim();
          const dur = fail[2] ? parseInt(fail[2]) : 0;
          if (name) {
            currentFailed = { name, suite: currentSuite, status: 'failed', duration: dur, error: null };
            testResults.push(currentFailed);
            collecting = true; errorLines = [];
          }
          continue;
        }

        const skip = line.match(/^\s*○\s+(.+?)$/);
        if (skip) {
          const name = skip[1].trim();
          if (name) testResults.push({ name, suite: currentSuite, status: 'skipped', duration: 0, error: null });
          continue;
        }

        if (collecting && currentFailed) {
          // Stop on next marker/summary
          if (t.startsWith('✓') || t.match(/^[✗✕×]/) || t.startsWith('○') || t.includes('Test Suites:') || t.includes('Tests:') || t.startsWith('PASS') || t.startsWith('FAIL')) {
            if (errorLines.length) currentFailed.error = errorLines.join('\n').trim();
            collecting = false; currentFailed = null; errorLines = [];
          } else {
            errorLines.push(line);
          }
        }
      }
      if (collecting && currentFailed && errorLines.length) {
        currentFailed.error = errorLines.join('\n').trim();
      }
    } catch (e) {
      this.logger.debug(`parseJestOutput error for ${path.basename(workItem.filePath)}: ${e.message}`);
    }
    return testResults;
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
                beforeAll: { duration: 0, status: 'not_found' },
                beforeEach: { duration: 0, status: 'not_found' },
                afterAll: { duration: 0, status: 'not_found' },
                afterEach: { duration: 0, status: 'not_found' }
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
                fileMap[file].hooks[hookType] = { ...result.hookInfo[hookType] };
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
