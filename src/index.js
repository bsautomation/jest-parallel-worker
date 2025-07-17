const glob = require('glob');
const path = require('path');
const fs = require('fs');
const { Worker } = require('jest-worker');
const chalk = require('chalk');
const { extractTestsFromFile, getDefaultTestPattern } = require('./test-extractor');
const logger = require('./logger');
const ReportGenerator = require('./report-generator');

async function runParallel(options) {
  const {
    pattern,
    jestConfigPath,
    workers = Math.max(1, require('os').cpus().length - 1),
    timeout = 4 * 60 * 1000, // Default to 4 minutes
    jestOptions = {},
    logFile,
    generateReport = true, // Enable report generation by default
    reportOptions = {}, // Custom report options
    cwd = process.cwd()
  } = options;
  
  // Initialize the report generator if reporting is enabled
  const reportGenerator = generateReport ? new ReportGenerator(reportOptions) : null;
  
  // Configure logger with custom log file if provided
  if (logFile) {
    // Initialize the logger with the custom log file path
    logger.options.logFile = logFile;
    
    // Check if logFile already contains 'logs/' prefix
    if (logFile.startsWith('logs/')) {
      // Use the path directly instead of prepending logs directory again
      logger.logFilePath = path.join(logger.options.rootDir, logFile);
    } else {
      // Otherwise, join with the logs directory
      logger.logFilePath = path.join(logger.options.logDir, logFile);
    }
    
    // Ensure directory exists
    const logDir = path.dirname(logger.logFilePath);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    
    fs.writeFileSync(logger.logFilePath, '', 'utf8');
    logger._internalLog(`Using custom log file: ${logger.logFilePath}`);
  }

  // Use the default pattern if none is specified
  const testPattern = pattern || '**/__tests__/**/*.test.{js,jsx,ts,tsx}';

  logger.info(`🔍 Discovering Jest tests matching pattern: ${testPattern}`);
  
  // Find all test files matching pattern
  let testFiles = await glob.glob(testPattern, { cwd });
  logger.info(`Found ${testFiles.length} files initially with pattern: ${testPattern}`);
  
  // Apply testPathPattern filter if provided, but with more lenient approach
  if (jestOptions.testPathPattern) {
    try {
      // Create a more lenient regex pattern that handles special chars
      let regexPattern = jestOptions.testPathPattern;
      // Convert the pattern to something more flexible for matching
      regexPattern = regexPattern.replace(/[-\/\\^$*+?.()|[\]{}]/g, '.');
      
      logger.info(`Using testPathPattern: ${jestOptions.testPathPattern} (converted to: ${regexPattern})`);
      const testPathPattern = new RegExp(regexPattern, 'i');  // Case-insensitive for more hits
      
      // First try direct matching
      const directMatches = testFiles.filter(file => file.includes(jestOptions.testPathPattern));
      
      // If we found direct matches, use those
      if (directMatches.length > 0) {
        testFiles = directMatches;
        logger.info(`Found ${testFiles.length} files with direct match for: ${jestOptions.testPathPattern}`);
      } else {
        // Otherwise fall back to regex matching
        testFiles = testFiles.filter(file => testPathPattern.test(file));
        logger.info(`Found ${testFiles.length} files with regex match for: ${regexPattern}`);
      }
    } catch (error) {
      logger.warn(`Error applying testPathPattern filter: ${error.message}`);
      logger.info(`Proceeding with all ${testFiles.length} test files`);
    }
  }
  
  if (testFiles.length === 0) {
    logger.warn('No test files found matching pattern');
    return { success: true, testsRun: 0 };
  }
  
  logger.info(`📁 Found ${testFiles.length} test files`);

  // Extract individual test cases from all files
  const testCases = [];
  
  for (const relativeFilePath of testFiles) {
    const filePath = path.resolve(cwd, relativeFilePath);
    try {
      // Pass testNamePattern to filter tests during extraction
      const extractOptions = {};
      if (jestOptions.testNamePattern) {
        extractOptions.testNamePattern = jestOptions.testNamePattern;
      }
      
      const testsInFile = await extractTestsFromFile(filePath, extractOptions);
      testCases.push(...testsInFile.map(testName => ({ 
        filePath, 
        testName,
        relativeFilePath 
      })));
    } catch (err) {
      logger.error(`Error extracting tests from ${relativeFilePath}: ${err.message}`);
    }
  }
  
  logger.info(`🧪 Found ${testCases.length} individual test cases`);
  
  if (testCases.length === 0) {
    logger.warn('No test cases found in files');
    return { success: true, testsRun: 0 };
  }

  // Create worker pool with forced worker count
  const actualWorkers = parseInt(workers, 10);
  logger.info(`👷 Creating worker pool with ${actualWorkers} workers (requested: ${workers})`);
  const workerStartTime = Date.now();
  const worker = new Worker(path.join(__dirname, 'worker.js'), {
    numWorkers: actualWorkers,
    // Use child processes instead of worker threads for proper isolation
    enableWorkerThreads: false,
    WorkerPool: require('jest-worker').WorkerPool,
    // Additional options to ensure all workers are utilized
    forkOptions: { 
      stdio: 'pipe' 
    },
    maxRetries: 0 // Prevent worker restarts that might reduce parallel count
  });
  
  // Set up tracking of active worker PIDs
  const activePids = new Set();
  let maxConcurrent = 0;
  
  // Set up an event listener for worker events
  worker.getStderr().on('data', data => {
    try {
      const event = JSON.parse(data.toString());
      if (event.eventType === 'testStart') {
        const { testName, testFile, pid, stats } = event;
        const relPath = path.relative(cwd, testFile);
        
        // Track active workers
        activePids.add(pid);
        if (activePids.size > maxConcurrent) {
          maxConcurrent = activePids.size;
        }
        
        // Format resource usage info
        let resourceInfo = '';
        if (stats && stats.memoryUsageMB) {
          const { memoryUsageMB } = stats;
          resourceInfo = ` [Memory: ${memoryUsageMB.rss}MB RSS, ${memoryUsageMB.heapUsed}MB Heap]`;
        }
        
        logger.info(`🚀 Starting: ${relPath} - ${testName} [PID: ${pid}]${resourceInfo} (Active workers: ${activePids.size}/${actualWorkers})`);
      }
    } catch (e) {
      // Not a JSON event, regular stderr output
    }
  });
  
  logger.info(`✅ Worker pool initialized in ${((Date.now() - workerStartTime) / 1000).toFixed(2)}s`);

  // Run tests in parallel
  logger.info('▶️  Running tests in parallel...');
  
  const startTime = Date.now();
  const results = [];
  let completed = 0;
  let passed = 0;
  let failed = 0;
  
  await Promise.all(
    testCases.map(async ({ filePath, testName, relativeFilePath }, index) => {
      try {
        // We don't log the start here anymore, it comes from the worker
        const startTimeTest = Date.now();
        
        const result = await worker.runTest({
          testFile: filePath,
          testName,
          jestConfigPath,
          timeout,
          jestOptions
        });
        
        const testDuration = ((Date.now() - startTimeTest) / 1000).toFixed(2);
        completed++;
        
        // Format resource usage info if available
        let resourceInfo = '';
        if (result.stats && result.stats.memoryUsageMB) {
          const { memoryUsageMB } = result.stats;
          resourceInfo = ` [Memory: ${memoryUsageMB.rss}MB RSS, ${memoryUsageMB.heapUsed}MB Heap]`;
        }
        
        if (result.success) {
          passed++;
          logger.success(`✓ [${completed}/${testCases.length}] Completed (${testDuration}s): ${relativeFilePath} - ${testName} [PID: ${result.pid || 'unknown'}]${resourceInfo}`);
        } else {
          failed++;
          logger.error(`✗ [${completed}/${testCases.length}] Failed (${testDuration}s): ${relativeFilePath} - ${testName} [PID: ${result.pid || 'unknown'}]${resourceInfo}`);
          
          // Enhanced error reporting
          if (result.errorType === 'testFailed') {
            // For assertion errors, show the full formatted message which includes expected/received values
            console.log(chalk.red(`  ${result.errorMessage}`));
            
            // Only print error details if they exist and are meaningful
            if (result.errorDetails && result.errorDetails !== 'undefined' && result.errorDetails !== '') {
              console.log(chalk.yellow(`  ${result.errorDetails}`));
            }
          } else if (result.errorType === 'discovery') {
            console.log(chalk.red(`  Test Discovery Error: ${result.errorMessage}`));
          } else {
            console.log(chalk.red(`  Error: ${result.errorMessage}`));
          }
          
          // Print stack trace if available
          if (result.stackTrace) {
            console.log(chalk.red(`  Stack Trace: ${result.stackTrace}`));
          }
        }
        
        const testResult = {
          ...result,
          testFile: relativeFilePath,
          testName
        };
        
        results.push(testResult);
        
        // Add to report generator if enabled
        if (reportGenerator) {
          reportGenerator.addResult(testResult);
        }
      } catch (error) {
        completed++;
        failed++;
        logger.error(`✗ [${completed}/${testCases.length}] ${relativeFilePath} - ${testName}`);
        logger.error(`  Error: ${error.message || 'Unknown error'}`);
        
        const errorResult = {
          success: false,
          testFile: relativeFilePath,
          testName,
          errorMessage: error.message || 'Unknown error',
          pid: 'error'
        };
        
        results.push(errorResult);
        
        // Add failed test to report
        if (reportGenerator) {
          reportGenerator.addResult(errorResult);
        }
      }
    })
  );
  
  const duration = (Date.now() - startTime) / 1000;
  
  // Shutdown worker pool
  logger.info('🔄 Shutting down worker pool...');
  const shutdownStartTime = Date.now();
  await worker.end();
  logger.info(`✅ Worker pool shutdown completed in ${((Date.now() - shutdownStartTime) / 1000).toFixed(2)}s`);
  
  // Report summary
  logger.info('\n📊 Test Summary:');
  logger.info(`  Total Tests: ${testCases.length}`);
  logger.success(`  Passed: ${passed}`);
  if (failed > 0) {
    logger.error(`  Failed: ${failed}`);
  } else {
    logger.success(`  Failed: ${failed}`);
  }
  logger.info(`  Time: ${duration.toFixed(2)}s`);
  
  // Generate report if enabled
  if (reportGenerator) {
    const summary = {
      testsRun: testCases.length,
      passed,
      failed,
      skipped: 0 // We don't track skipped tests separately yet
    };
    reportGenerator.generateReport(summary);
  }
  
  // Return the result with additional validation
  // A run is successful if there were tests AND no failures
  const success = testCases.length > 0 && failed === 0;
  
  // Log the final summary for better visibility
  if (success) {
    logger.success(`✅ All ${passed} tests passed successfully in ${duration.toFixed(2)}s`);
  }
  
  return {
    success,
    testsRun: testCases.length,
    passed,
    failed,
    duration,
    results
  };
}

module.exports = {
  runParallel
};