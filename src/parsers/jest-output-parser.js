const path = require('path');

/**
 * Centralized Jest Output Parser
 * 
 * This module provides robust parsing of Jest output with comprehensive error handling,
 * test result extraction, and hook timing analysis.
 */
class JestOutputParser {
  constructor(logger = null) {
    this.logger = logger || console;
    
    // Regex patterns for various Jest output formats
    this.patterns = {
      // Test result patterns
      testPassed: /^\s*✓\s+(.+?)(?:\s*\((\d+(?:\.\d+)?)\s*m?s\))?\s*$/,
      testFailed: /^\s*[✗✕×]\s+(.+?)(?:\s*\((\d+(?:\.\d+)?)\s*m?s\))?\s*$/,
      testSkipped: /^\s*○\s+(.+?)\s*$/,
      testTodo: /^\s*✎\s+todo\s+(.+?)\s*$/,
      
      // Error and failure patterns
      errorHeader: /^\s*●\s+(.+?)\s*›\s*(.+?)\s*$/,
      suiteFailure: /^\s*●\s+Test suite failed to run\s*$/,
      hookFailure: /^\s*●\s+(.+?)\s*›\s*(beforeAll|beforeEach|afterAll|afterEach)\s*$/i,
      hookFailureInTest: /^\s*●\s+(.+?)\s*›\s*(.+?)$/,  // For beforeAll failures that appear as test failures
      
      // Timing patterns
      overallTime: /Time:\s+(\d+(?:\.\d+)?)\s*s/,
      testSummary: /Tests:\s+(.+?)$/,
      suiteSummary: /Test Suites:\s+(.+?)$/,
      
      // Stack trace patterns
      stackTrace: /^\s+at\s+(.+?)$/,
      errorMessage: /^\s*(Error|TypeError|ReferenceError|SyntaxError|AssertionError):\s*(.+)$/,
      expectationFailed: /expect\(.*?\)\.(toBe|toEqual|toMatch|toContain|toBeDefined|toBeUndefined|toBeTruthy|toBeFalsy)/,
      
      // Hook timing patterns
      hookTiming: /(beforeAll|beforeEach|afterAll|afterEach).*?(\d+(?:\.\d+)?)\s*m?s/i,
      
      // Race condition and timeout patterns
      timeout: /timeout|timed?\s*out/i,
      raceCondition: /race\s*condition|concurrent|async.*await|promise.*reject/i,
      
      // Jest summary patterns
      failedTests: /(\d+)\s+failed/,
      passedTests: /(\d+)\s+passed/,
      skippedTests: /(\d+)\s+skipped/,
      todoTests: /(\d+)\s+todo/
    };
  }

  /**
   * Main parsing method that extracts all information from Jest output
   * @param {string} output - Raw Jest output (stdout + stderr combined)
   * @param {Object} workItem - Work item context for additional metadata
   * @returns {Object} Parsed results with testResults, hookInfo, errors, and metadata
   */
  parseJestOutput(output, workItem = {}) {
    const result = {
      testResults: [],
      hookInfo: {
        beforeAll: { duration: 0, status: 'not_found', errors: [] },
        beforeEach: { duration: 0, status: 'not_found', errors: [] },
        afterAll: { duration: 0, status: 'not_found', errors: [] },
        afterEach: { duration: 0, status: 'not_found', errors: [] }
      },
      errors: [],
      summary: {
        passed: 0,
        failed: 0,
        skipped: 0,
        todo: 0,
        totalTime: 0,
        suiteStatus: 'unknown'
      },
      metadata: {
        filePath: workItem.filePath || 'unknown',
        workerId: workItem.workerId || 0,
        parseTimestamp: new Date().toISOString()
      }
    };

    if (!output || typeof output !== 'string') {
      this.logger.warn('JestOutputParser: Empty or invalid output provided');
      return result;
    }

    try {
      const lines = output.split('\n');
      let currentContext = {
        suite: '',
        collectingError: false,
        errorLines: [],
        errorTarget: null,
        inStackTrace: false
      };

      // First pass: Extract timing and summary information
      this.extractTimingAndSummary(output, result);

      // Second pass: Parse line by line for detailed information
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmedLine = line.trim();

        if (!trimmedLine) {
          // Empty lines usually don't end error collection, just continue
          // Only end error collection if we've collected substantial error content
          if (currentContext.collectingError && currentContext.errorLines && currentContext.errorLines.length > 5) {
            this.finalizeErrorCollection(currentContext, result);
          }
          continue;
        }

        // Process different types of lines
        this.processLine(line, trimmedLine, currentContext, result, i, lines);
      }

      // Finalize any remaining error collection
      if (currentContext.collectingError) {
        this.finalizeErrorCollection(currentContext, result);
      }

      // Calculate hook durations based on timing analysis
      this.calculateHookDurations(result);
      
      // Detect hooks from output patterns and test structure
      this.detectHooksFromOutput(output, result);

      // Validate and clean up results
      this.validateAndCleanResults(result, workItem);

      this.logger.debug(`Jest output parsing completed for ${path.basename(result.metadata.filePath)}: ${result.testResults.length} tests, ${result.errors.length} errors`);

    } catch (error) {
      this.logger.error('JestOutputParser: Error during parsing:', error.message);
      result.errors.push({
        type: 'parser_error',
        message: `Failed to parse Jest output: ${error.message}`,
        context: 'JestOutputParser',
        timestamp: new Date().toISOString()
      });
    }

    return result;
  }

  /**
   * Extract overall timing and summary information
   */
  extractTimingAndSummary(output, result) {
    // Extract overall execution time
    const timeMatch = output.match(this.patterns.overallTime);
    if (timeMatch) {
      result.summary.totalTime = parseFloat(timeMatch[1]) * 1000; // Convert to milliseconds
    }

    // Extract test counts from summary
    const testSummaryMatch = output.match(this.patterns.testSummary);
    if (testSummaryMatch) {
      const summary = testSummaryMatch[1];
      
      const failedMatch = summary.match(this.patterns.failedTests);
      if (failedMatch) result.summary.failed = parseInt(failedMatch[1]);
      
      const passedMatch = summary.match(this.patterns.passedTests);
      if (passedMatch) result.summary.passed = parseInt(passedMatch[1]);
      
      const skippedMatch = summary.match(this.patterns.skippedTests);
      if (skippedMatch) result.summary.skipped = parseInt(skippedMatch[1]);
      
      const todoMatch = summary.match(this.patterns.todoTests);
      if (todoMatch) result.summary.todo = parseInt(todoMatch[1]);
    }

    // Determine suite status
    if (output.includes('Test suite failed to run')) {
      result.summary.suiteStatus = 'failed_to_run';
    } else if (result.summary.failed > 0) {
      result.summary.suiteStatus = 'failed';
    } else if (result.summary.passed > 0) {
      result.summary.suiteStatus = 'passed';
    }
  }

  /**
   * Process individual lines of Jest output
   */
  processLine(line, trimmedLine, context, result, lineIndex, allLines) {
    // Check for test results first
    if (this.processTestResult(line, trimmedLine, context, result)) {
      return;
    }

    // Check for error headers
    if (this.processErrorHeader(line, trimmedLine, context, result)) {
      return;
    }

    // Check for hook failures
    if (this.processHookFailure(line, trimmedLine, context, result)) {
      return;
    }

    // Check for suite failures
    if (this.processSuiteFailure(line, trimmedLine, context, result)) {
      return;
    }

    // Collect error details if in error collection mode
    if (context.collectingError) {
      this.collectErrorLine(line, trimmedLine, context, result);
      return;
    }

    // Update suite context
    this.updateSuiteContext(line, trimmedLine, context);
  }

  /**
   * Process test result lines (passed, failed, skipped, todo)
   */
  processTestResult(line, trimmedLine, context, result) {
    // Test passed
    const passMatch = trimmedLine.match(this.patterns.testPassed);
    if (passMatch) {
      const testName = passMatch[1].trim();
      const duration = passMatch[2] ? parseFloat(passMatch[2]) : 0;
      
      result.testResults.push({
        name: testName,
        suite: context.suite,
        status: 'passed',
        duration: duration,
        error: null,
        failureType: null,
        testId: `${result.metadata.filePath}:${testName}`,
        lineNumber: null
      });
      return true;
    }

    // Test failed
    const failMatch = trimmedLine.match(this.patterns.testFailed);
    if (failMatch) {
      const testName = failMatch[1].trim();
      const duration = failMatch[2] ? parseFloat(failMatch[2]) : 0;
      
      const testResult = {
        name: testName,
        suite: context.suite,
        status: 'failed',
        duration: duration,
        error: null, // Will be filled by error collection
        failureType: 'test_failure',
        testId: `${result.metadata.filePath}:${testName}`,
        lineNumber: null
      };
      
      result.testResults.push(testResult);
      return true;
    }

    // Test skipped
    const skipMatch = trimmedLine.match(this.patterns.testSkipped);
    if (skipMatch) {
      const testName = skipMatch[1].trim();
      
      result.testResults.push({
        name: testName,
        suite: context.suite,
        status: 'skipped',
        duration: 0,
        error: null,
        failureType: 'skipped',
        testId: `${result.metadata.filePath}:${testName}`,
        lineNumber: null
      });
      return true;
    }

    // Test todo
    const todoMatch = trimmedLine.match(this.patterns.testTodo);
    if (todoMatch) {
      const testName = todoMatch[1].trim();
      
      result.testResults.push({
        name: testName,
        suite: context.suite,
        status: 'todo',
        duration: 0,
        error: null,
        failureType: 'todo',
        testId: `${result.metadata.filePath}:${testName}`,
        lineNumber: null
      });
      return true;
    }

    return false;
  }

  /**
   * Process error headers and start error collection
   */
  processErrorHeader(line, trimmedLine, context, result) {
    const errorMatch = trimmedLine.match(this.patterns.errorHeader);
    if (errorMatch) {
      // Finalize previous error if collecting
      if (context.collectingError) {
        this.finalizeErrorCollection(context, result);
      }

      const suiteName = errorMatch[1].trim();
      const testName = errorMatch[2].trim();

      // Start collecting error for this test
      context.collectingError = true;
      context.errorLines = [];
      context.errorTarget = {
        suite: suiteName,
        test: testName,
        type: 'test_error'
      };
      context.inStackTrace = false;

      return true;
    }

    return false;
  }

  /**
   * Process hook failure lines
   */
  processHookFailure(line, trimmedLine, context, result) {
    const hookMatch = trimmedLine.match(this.patterns.hookFailure);
    if (hookMatch) {
      const suiteName = hookMatch[1].trim();
      const hookType = hookMatch[2].toLowerCase();

      // Start collecting error for this hook
      if (context.collectingError) {
        this.finalizeErrorCollection(context, result);
      }

      context.collectingError = true;
      context.errorLines = [];
      context.errorTarget = {
        suite: suiteName,
        hook: hookType,
        type: 'hook_failure'
      };
      context.inStackTrace = false;

      // Update hook info
      if (result.hookInfo[hookType]) {
        result.hookInfo[hookType].status = 'failed';
        result.hookInfo[hookType].errors.push({
          suite: suiteName,
          message: `${hookType} hook failed`,
          timestamp: new Date().toISOString()
        });
      }

      return true;
    }

    return false;
  }

  /**
   * Detect if test failures are actually caused by hook failures
   */
  detectHookFailureFromError(errorLines, result) {
    if (!errorLines || errorLines.length === 0) return;

    const errorText = errorLines.join('\n').toLowerCase();
    
    // Check for beforeAll failure indicators
    if (errorText.includes('beforeall') || 
        errorText.includes('before all')) {
      
      // Extract error message from the error lines
      let errorMessage = 'beforeAll hook failed';
      
      // Look for the actual error message
      for (const line of errorLines) {
        if (line.includes('Error:') || line.includes('TypeError:') || line.includes('ReferenceError:')) {
          errorMessage = line.trim();
          break;
        }
        // Also check for lines that contain common error patterns
        if (line.includes('failed') || line.includes('connection') || line.includes('undefined')) {
          errorMessage = line.trim();
        }
      }
      
      // Mark beforeAll as failed
      if (result.hookInfo.beforeAll.status === 'not_found' || result.hookInfo.beforeAll.status === 'executed') {
        result.hookInfo.beforeAll.status = 'failed';
        result.hookInfo.beforeAll.errors = [{
          message: errorMessage,
          timestamp: new Date().toISOString(),
          type: 'hook_failure'
        }];
        
        // Ensure it has a duration for timing purposes
        if (result.hookInfo.beforeAll.duration === 0) {
          result.hookInfo.beforeAll.duration = Math.max(1, Math.round(result.summary.totalTime * 0.1));
        }
      }
    }
    
    // Similar checks for other hooks...
    if (errorText.includes('beforeeach') || errorText.includes('before each')) {
      if (result.hookInfo.beforeEach.status === 'not_found' || result.hookInfo.beforeEach.status === 'executed') {
        result.hookInfo.beforeEach.status = 'failed';
        result.hookInfo.beforeEach.errors = [{
          message: 'beforeEach hook failed',
          timestamp: new Date().toISOString(),
          type: 'hook_failure'
        }];
      }
    }
    
    if (errorText.includes('afterall') || errorText.includes('after all')) {
      if (result.hookInfo.afterAll.status === 'not_found' || result.hookInfo.afterAll.status === 'executed') {
        result.hookInfo.afterAll.status = 'failed';
        result.hookInfo.afterAll.errors = [{
          message: 'afterAll hook failed',
          timestamp: new Date().toISOString(),
          type: 'hook_failure'
        }];
      }
    }
    
    if (errorText.includes('aftereach') || errorText.includes('after each')) {
      if (result.hookInfo.afterEach.status === 'not_found' || result.hookInfo.afterEach.status === 'executed') {
        result.hookInfo.afterEach.status = 'failed';
        result.hookInfo.afterEach.errors = [{
          message: 'afterEach hook failed',
          timestamp: new Date().toISOString(),
          type: 'hook_failure'
        }];
      }
    }
  }

  /**
   * Process suite failure lines
   */
  processSuiteFailure(line, trimmedLine, context, result) {
    if (this.patterns.suiteFailure.test(trimmedLine)) {
      // Start collecting suite failure error
      if (context.collectingError) {
        this.finalizeErrorCollection(context, result);
      }

      context.collectingError = true;
      context.errorLines = [];
      context.errorTarget = {
        suite: 'Test Suite',
        type: 'suite_failure'
      };
      context.inStackTrace = false;

      result.summary.suiteStatus = 'failed_to_run';
      return true;
    }

    return false;
  }

  /**
   * Collect error lines when in error collection mode
   */
  collectErrorLine(line, trimmedLine, context, result) {
    // Check if we're entering a stack trace
    if (this.patterns.stackTrace.test(trimmedLine)) {
      context.inStackTrace = true;
    }

    // Check for specific error types
    const errorTypeMatch = trimmedLine.match(this.patterns.errorMessage);
    if (errorTypeMatch && !context.inStackTrace) {
      context.errorTarget.errorType = errorTypeMatch[1];
      context.errorTarget.mainMessage = errorTypeMatch[2];
    }

    // Check for expectation failures
    if (this.patterns.expectationFailed.test(trimmedLine)) {
      context.errorTarget.failureType = 'assertion_failure';
    }

    // Check for timeouts
    if (this.patterns.timeout.test(trimmedLine)) {
      context.errorTarget.failureType = 'timeout';
    }

    // Check for race conditions
    if (this.patterns.raceCondition.test(trimmedLine)) {
      context.errorTarget.failureType = 'race_condition';
    }

    // Collect the line
    context.errorLines.push(line);

    // Stop collecting after a reasonable number of lines to avoid memory issues
    if (context.errorLines.length > 100) {
      this.finalizeErrorCollection(context, result);
    }
  }

  /**
   * Finalize error collection and attach to appropriate target
   */
  finalizeErrorCollection(context, result) {
    if (!context.collectingError || !context.errorTarget || context.errorLines.length === 0) {
      context.collectingError = false;
      return;
    }

    const errorText = context.errorLines.join('\n').trim();
    const classifiedError = this.classifyAndEnhanceError(errorText, context.errorTarget);

    if (context.errorTarget.type === 'test_error') {
      // Find the test and attach error
      const test = result.testResults.find(t => 
        t.name === context.errorTarget.test && 
        t.suite === context.errorTarget.suite
      );
      
      if (test) {
        test.error = classifiedError.message;
        test.failureType = classifiedError.type;
        test.stackTrace = classifiedError.stackTrace;
      } else {
        // Create a failed test entry if not found
        result.testResults.push({
          name: context.errorTarget.test,
          suite: context.errorTarget.suite,
          status: 'failed',
          duration: 0,
          error: classifiedError.message,
          failureType: classifiedError.type,
          stackTrace: classifiedError.stackTrace,
          testId: `${result.metadata.filePath}:${context.errorTarget.test}`,
          lineNumber: null
        });
      }
    } else if (context.errorTarget.type === 'hook_failure') {
      // Add to hook errors
      const hookType = context.errorTarget.hook;
      if (result.hookInfo[hookType]) {
        result.hookInfo[hookType].errors.push({
          suite: context.errorTarget.suite,
          message: classifiedError.message,
          type: classifiedError.type,
          stackTrace: classifiedError.stackTrace,
          timestamp: new Date().toISOString()
        });
      }
    }

    // Add to general errors list
    result.errors.push({
      type: classifiedError.type,
      message: classifiedError.message,
      context: context.errorTarget,
      stackTrace: classifiedError.stackTrace,
      timestamp: new Date().toISOString()
    });

    // Check if this error is actually a hook failure
    this.detectHookFailureFromError(context.errorLines, result);

    // Reset context
    context.collectingError = false;
    context.errorLines = [];
    context.errorTarget = null;
    context.inStackTrace = false;
  }

  /**
   * Classify and enhance error messages
   */
  classifyAndEnhanceError(errorText, target) {
    const lowerError = errorText.toLowerCase();
    let errorType = 'unknown_error';
    let enhancedMessage = errorText;
    let stackTrace = [];

    // Extract stack trace
    const lines = errorText.split('\n');
    const stackLines = lines.filter(line => this.patterns.stackTrace.test(line.trim()));
    stackTrace = stackLines.map(line => line.trim());

    // Determine error type
    if (target.failureType) {
      errorType = target.failureType;
    } else if (lowerError.includes('beforeall')) {
      errorType = 'hook_failure_beforeall';
    } else if (lowerError.includes('beforeeach')) {
      errorType = 'hook_failure_beforeeach';
    } else if (lowerError.includes('afterall')) {
      errorType = 'hook_failure_afterall';
    } else if (lowerError.includes('aftereach')) {
      errorType = 'hook_failure_aftereach';
    } else if (lowerError.includes('expect(')) {
      errorType = 'assertion_failure';
    } else if (lowerError.includes('timeout') || lowerError.includes('timed out')) {
      errorType = 'timeout';
    } else if (lowerError.includes('referenceerror')) {
      errorType = 'reference_error';
    } else if (lowerError.includes('typeerror')) {
      errorType = 'type_error';
    } else if (lowerError.includes('syntaxerror')) {
      errorType = 'syntax_error';
    } else if (lowerError.includes('race condition') || lowerError.includes('concurrent')) {
      errorType = 'race_condition';
    } else if (target.errorType) {
      errorType = target.errorType.toLowerCase() + '_error';
    }

    // Enhance message based on error type
    if (target.type === 'hook_failure') {
      enhancedMessage = `${target.hook} hook failure in "${target.suite}":\n${errorText}`;
    } else if (target.type === 'suite_failure') {
      enhancedMessage = `Test suite failed to run:\n${errorText}`;
    } else if (target.mainMessage) {
      enhancedMessage = `${target.errorType}: ${target.mainMessage}\n${errorText}`;
    }

    return {
      type: errorType,
      message: enhancedMessage,
      stackTrace: stackTrace
    };
  }

  /**
   * Update suite context based on line content
   */
  updateSuiteContext(line, trimmedLine, context) {
    // Try to detect suite names from describe blocks or test structure
    // Suite names can be indented (usually 2 spaces) after PASS/FAIL file name
    if (line.match(/^\s{1,4}[^\s]/) && // 1-4 spaces followed by non-space (suite names)
        !trimmedLine.includes('●') && 
        !trimmedLine.includes('✓') && 
        !trimmedLine.includes('✗') &&
        !trimmedLine.includes('✕') && 
        !trimmedLine.includes('○') && 
        !trimmedLine.includes('Test Suites:') && 
        !trimmedLine.includes('Tests:') &&
        !trimmedLine.includes('Expected:') && 
        !trimmedLine.includes('Received:') &&
        !trimmedLine.includes('at Object.') && 
        !trimmedLine.includes('at ') &&
        !trimmedLine.includes('FAIL') &&
        !trimmedLine.includes('PASS') &&
        !trimmedLine.includes('expect(') &&
        trimmedLine.length > 0) {
      
      // This could be a suite name
      if (!trimmedLine.includes('.test.js') &&
          !trimmedLine.includes('.spec.js') &&
          !trimmedLine.includes('Time:') &&
          !trimmedLine.includes('ms')) {
        context.suite = trimmedLine;
      }
    }
  }

  /**
   * Detect hooks from Jest output patterns and test structure
   */
  detectHooksFromOutput(output, result) {
    // Look for hook indicators in Jest output
    const hookIndicators = {
      beforeAll: [
        /console\.log.*beforeAll/i,
        /BeforeAll.*executed/i,
        /beforeAll.*hook/i,
        // If tests passed and we have multiple tests in the same suite, likely has beforeAll
        result.testResults.length > 1 && result.summary.passed > 0
      ],
      beforeEach: [
        /console\.log.*beforeEach/i,
        /BeforeEach.*executed/i,
        /beforeEach.*hook/i
      ],
      afterAll: [
        /console\.log.*afterAll/i,
        /AfterAll.*executed/i,
        /afterAll.*hook/i
      ],
      afterEach: [
        /console\.log.*afterEach/i,
        /AfterEach.*executed/i,
        /afterEach.*hook/i
      ]
    };

    // Check each hook type
    Object.keys(hookIndicators).forEach(hookType => {
      const indicators = hookIndicators[hookType];
      let found = false;

      // Check regex patterns
      for (const indicator of indicators) {
        if (indicator instanceof RegExp && indicator.test(output)) {
          found = true;
          break;
        } else if (typeof indicator === 'boolean' && indicator) {
          found = true;
          break;
        }
      }

      // If hook is detected and not already processed (preserve failed status)
      if (found && result.hookInfo[hookType].status === 'not_found') {
        result.hookInfo[hookType].status = 'executed';
        
        // Estimate duration if not already set
        if (result.hookInfo[hookType].duration === 0) {
          // Assign a small portion of total time to hooks
          const estimatedDuration = Math.max(1, Math.round(result.summary.totalTime * 0.05));
          result.hookInfo[hookType].duration = estimatedDuration;
        }
      }
      
      // If hook had indicators but is marked as failed, ensure it has a duration
      if (found && result.hookInfo[hookType].status === 'failed') {
        if (result.hookInfo[hookType].duration === 0) {
          // Failed hooks should still get estimated duration for timing purposes
          const estimatedDuration = Math.max(1, Math.round(result.summary.totalTime * 0.05));
          result.hookInfo[hookType].duration = estimatedDuration;
        }
      }
    });

    // Special case: If we have console.log output that mentions beforeAll
    if (output.includes('BeforeAll hook executed')) {
      result.hookInfo.beforeAll.status = 'executed';
      result.hookInfo.beforeAll.duration = Math.max(1, Math.round(result.summary.totalTime * 0.1));
    }
  }

  /**
   * Calculate hook durations based on overall timing
   */
  calculateHookDurations(result) {
    if (result.summary.totalTime === 0) return;

    const totalTestTime = result.testResults.reduce((sum, test) => sum + (test.duration || 0), 0);
    const remainingTime = Math.max(0, result.summary.totalTime - totalTestTime);

    // Distribute remaining time among hooks (rough estimation)
    const hookTypes = ['beforeAll', 'beforeEach', 'afterAll', 'afterEach'];
    const activeHooks = hookTypes.filter(type => 
      result.hookInfo[type].status !== 'not_found'
    );

    if (activeHooks.length > 0) {
      const timePerHook = remainingTime / activeHooks.length;
      activeHooks.forEach(hookType => {
        result.hookInfo[hookType].duration = Math.round(timePerHook);
        if (result.hookInfo[hookType].status === 'not_found') {
          result.hookInfo[hookType].status = 'estimated';
        }
      });
    }
  }

  /**
   * Validate and clean up results
   */
  validateAndCleanResults(result, workItem) {
    // Remove duplicate test results
    const uniqueTests = new Map();
    result.testResults.forEach(test => {
      const key = `${test.suite}:${test.name}`;
      if (!uniqueTests.has(key) || (test.error && !uniqueTests.get(key).error)) {
        uniqueTests.set(key, test);
      }
    });
    result.testResults = Array.from(uniqueTests.values());

    // Validate summary counts
    const actualCounts = {
      passed: result.testResults.filter(t => t.status === 'passed').length,
      failed: result.testResults.filter(t => t.status === 'failed').length,
      skipped: result.testResults.filter(t => t.status === 'skipped').length,
      todo: result.testResults.filter(t => t.status === 'todo').length
    };

    // Use actual counts if summary is empty or inconsistent
    if (result.summary.passed === 0 && result.summary.failed === 0) {
      Object.assign(result.summary, actualCounts);
    }

    // Ensure all failed tests have error messages
    result.testResults.forEach(test => {
      if (test.status === 'failed' && !test.error) {
        test.error = 'Test failed (no detailed error message available)';
        test.failureType = test.failureType || 'unknown_failure';
      }
    });
  }
}

module.exports = { JestOutputParser };
