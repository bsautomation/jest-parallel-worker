const { JestOutputParser } = require('./jest-output-parser');

/**
 * Error Result Formatter
 * 
 * This module formats parsed Jest errors into various output formats
 * for console display and HTML reporting.
 */
class ErrorResultFormatter {
  constructor(logger = null) {
    this.logger = logger || console;
  }

  /**
   * Format errors for console output
   * @param {Object} parsedResult - Result from JestOutputParser
   * @param {Object} options - Formatting options
   * @returns {string} Formatted console output
   */
  formatForConsole(parsedResult, options = {}) {
    const {
      showStackTraces = false,
      colorize = true,
      maxErrorLines = 20,
      showHookDetails = true
    } = options;

    let output = [];

    // File header
    const fileName = this.getFileDisplayName(parsedResult.metadata.filePath);
    output.push(colorize ? `\n${this.colorize('cyan', fileName)}` : `\n${fileName}`);
    output.push('='.repeat(60));

    // Summary
    const summary = this.formatSummary(parsedResult.summary, colorize);
    output.push(summary);

    // Test results with errors
    const testErrors = this.formatTestErrors(parsedResult.testResults, {
      showStackTraces,
      colorize,
      maxErrorLines
    });
    if (testErrors) {
      output.push(testErrors);
    }

    // Hook errors
    if (showHookDetails) {
      const hookErrors = this.formatHookErrors(parsedResult.hookInfo, {
        colorize,
        maxErrorLines
      });
      if (hookErrors) {
        output.push(hookErrors);
      }
    }

    // Suite-level errors
    const suiteErrors = this.formatSuiteErrors(parsedResult.errors, {
      colorize,
      maxErrorLines
    });
    if (suiteErrors) {
      output.push(suiteErrors);
    }

    return output.join('\n');
  }

  /**
   * Format errors for HTML report
   * @param {Object} parsedResult - Result from JestOutputParser
   * @param {Object} options - HTML formatting options
   * @returns {Object} HTML-formatted data
   */
  formatForHTML(parsedResult, options = {}) {
    const {
      includeStackTraces = true,
      expandErrorsByDefault = false,
      showTimings = true
    } = options;

    const fileName = this.getFileDisplayName(parsedResult.metadata.filePath);
    
    return {
      fileName: fileName,
      filePath: parsedResult.metadata.filePath,
      summary: {
        passed: parsedResult.summary.passed,
        failed: parsedResult.summary.failed,
        skipped: parsedResult.summary.skipped,
        todo: parsedResult.summary.todo,
        totalTime: parsedResult.summary.totalTime,
        suiteStatus: parsedResult.summary.suiteStatus
      },
      testResults: parsedResult.testResults.map(test => ({
        name: this.escapeHtml(test.name),
        suite: this.escapeHtml(test.suite),
        status: test.status,
        duration: test.duration,
        error: test.error ? {
          message: this.escapeHtml(test.error),
          type: test.failureType,
          stackTrace: includeStackTraces && test.stackTrace ? 
            test.stackTrace.map(line => this.escapeHtml(line)) : null
        } : null,
        testId: test.testId
      })),
      hookInfo: Object.keys(parsedResult.hookInfo).reduce((acc, hookType) => {
        const hook = parsedResult.hookInfo[hookType];
        acc[hookType] = {
          status: hook.status,
          duration: showTimings ? hook.duration : null,
          errors: hook.errors.map(error => ({
            suite: this.escapeHtml(error.suite),
            message: this.escapeHtml(error.message),
            type: error.type,
            stackTrace: includeStackTraces && error.stackTrace ? 
              error.stackTrace.map(line => this.escapeHtml(line)) : null,
            timestamp: error.timestamp
          }))
        };
        return acc;
      }, {}),
      generalErrors: parsedResult.errors.map(error => ({
        type: error.type,
        message: this.escapeHtml(error.message),
        context: error.context,
        stackTrace: includeStackTraces && error.stackTrace ? 
          error.stackTrace.map(line => this.escapeHtml(line)) : null,
        timestamp: error.timestamp
      })),
      metadata: {
        ...parsedResult.metadata,
        parseTimestamp: parsedResult.metadata.parseTimestamp,
        expandErrorsByDefault
      }
    };
  }

  /**
   * Generate error classification report
   * @param {Object} parsedResult - Result from JestOutputParser
   * @returns {Object} Error classification statistics
   */
  generateErrorClassificationReport(parsedResult) {
    const classification = {
      testFailures: {
        assertion_failure: 0,
        timeout: 0,
        reference_error: 0,
        type_error: 0,
        syntax_error: 0,
        race_condition: 0,
        unknown_failure: 0
      },
      hookFailures: {
        hook_failure_beforeall: 0,
        hook_failure_beforeeach: 0,
        hook_failure_afterall: 0,
        hook_failure_aftereach: 0
      },
      suiteFailures: {
        suite_failure: 0,
        parser_error: 0
      },
      totalErrors: 0
    };

    // Classify test failures
    parsedResult.testResults
      .filter(test => test.status === 'failed')
      .forEach(test => {
        const failureType = test.failureType || 'unknown_failure';
        if (classification.testFailures.hasOwnProperty(failureType)) {
          classification.testFailures[failureType]++;
        } else {
          classification.testFailures.unknown_failure++;
        }
        classification.totalErrors++;
      });

    // Classify general errors
    parsedResult.errors.forEach(error => {
      if (classification.hookFailures.hasOwnProperty(error.type)) {
        classification.hookFailures[error.type]++;
      } else if (classification.suiteFailures.hasOwnProperty(error.type)) {
        classification.suiteFailures[error.type]++;
      } else if (classification.testFailures.hasOwnProperty(error.type)) {
        classification.testFailures[error.type]++;
      } else {
        classification.testFailures.unknown_failure++;
      }
      classification.totalErrors++;
    });

    // Add hook-specific errors
    Object.values(parsedResult.hookInfo).forEach(hook => {
      hook.errors.forEach(error => {
        const errorType = error.type || 'unknown_failure';
        if (classification.hookFailures.hasOwnProperty(errorType)) {
          classification.hookFailures[errorType]++;
        } else {
          classification.hookFailures.hook_failure_beforeall++; // Default hook failure
        }
        classification.totalErrors++;
      });
    });

    return classification;
  }

  /**
   * Format summary section
   */
  formatSummary(summary, colorize) {
    const status = summary.suiteStatus;
    const statusColor = status === 'passed' ? 'green' : 
                       status === 'failed' ? 'red' : 'yellow';
    
    let summaryText = [];
    summaryText.push(`Status: ${colorize ? this.colorize(statusColor, status.toUpperCase()) : status.toUpperCase()}`);
    summaryText.push(`Tests: ${summary.passed} passed, ${summary.failed} failed, ${summary.skipped} skipped, ${summary.todo} todo`);
    
    if (summary.totalTime > 0) {
      summaryText.push(`Time: ${(summary.totalTime / 1000).toFixed(2)}s`);
    }
    
    return summaryText.join('\n');
  }

  /**
   * Format test errors
   */
  formatTestErrors(testResults, options) {
    const failedTests = testResults.filter(test => test.status === 'failed');
    if (failedTests.length === 0) return null;

    let output = [];
    output.push('\nFAILED TESTS:');
    output.push('-'.repeat(40));

    failedTests.forEach((test, index) => {
      output.push(`\n${index + 1}. ${test.suite} › ${test.name}`);
      
      if (test.duration > 0) {
        output.push(`   Duration: ${test.duration}ms`);
      }
      
      if (test.failureType) {
        const typeColor = this.getErrorTypeColor(test.failureType);
        const displayType = test.failureType.replace(/_/g, ' ').toUpperCase();
        output.push(`   Type: ${options.colorize ? this.colorize(typeColor, displayType) : displayType}`);
      }

      if (test.error) {
        const errorLines = test.error.split('\n').slice(0, options.maxErrorLines);
        output.push('   Error:');
        errorLines.forEach(line => {
          output.push(`     ${line}`);
        });
      }

      if (options.showStackTraces && test.stackTrace && test.stackTrace.length > 0) {
        output.push('   Stack Trace:');
        test.stackTrace.slice(0, 5).forEach(line => {
          output.push(`     ${line}`);
        });
      }
    });

    return output.join('\n');
  }

  /**
   * Format hook errors
   */
  formatHookErrors(hookInfo, options) {
    const hookErrors = Object.entries(hookInfo)
      .filter(([_, hook]) => hook.errors.length > 0)
      .map(([type, hook]) => ({ type, ...hook }));
    
    if (hookErrors.length === 0) return null;

    let output = [];
    output.push('\nHOOK FAILURES:');
    output.push('-'.repeat(40));

    hookErrors.forEach(hook => {
      output.push(`\n${hook.type.toUpperCase()} Hook Failures:`);
      
      hook.errors.forEach((error, index) => {
        output.push(`  ${index + 1}. Suite: ${error.suite}`);
        
        if (error.type) {
          const typeColor = this.getErrorTypeColor(error.type);
          const displayType = error.type.replace(/_/g, ' ').toUpperCase();
          output.push(`     Type: ${options.colorize ? this.colorize(typeColor, displayType) : displayType}`);
        }

        if (error.message) {
          const errorLines = error.message.split('\n').slice(0, options.maxErrorLines);
          output.push('     Error:');
          errorLines.forEach(line => {
            output.push(`       ${line}`);
          });
        }
      });
    });

    return output.join('\n');
  }

  /**
   * Format suite-level errors
   */
  formatSuiteErrors(errors, options) {
    const suiteErrors = errors.filter(error => 
      error.type === 'suite_failure' || error.type === 'parser_error'
    );
    
    if (suiteErrors.length === 0) return null;

    let output = [];
    output.push('\nSUITE ERRORS:');
    output.push('-'.repeat(40));

    suiteErrors.forEach((error, index) => {
      output.push(`\n${index + 1}. ${error.type.replace(/_/g, ' ').toUpperCase()}`);
      
      if (error.message) {
        const errorLines = error.message.split('\n').slice(0, options.maxErrorLines);
        errorLines.forEach(line => {
          output.push(`   ${line}`);
        });
      }
    });

    return output.join('\n');
  }

  /**
   * Get display name for file path
   */
  getFileDisplayName(filePath) {
    if (!filePath || filePath === 'unknown') return 'Unknown File';
    
    const path = require('path');
    return path.basename(filePath);
  }

  /**
   * Get color for error type
   */
  getErrorTypeColor(errorType) {
    const colorMap = {
      assertion_failure: 'red',
      timeout: 'yellow',
      reference_error: 'magenta',
      type_error: 'magenta',
      syntax_error: 'red',
      race_condition: 'cyan',
      hook_failure: 'yellow',
      suite_failure: 'red',
      parser_error: 'gray'
    };

    for (const [pattern, color] of Object.entries(colorMap)) {
      if (errorType.includes(pattern)) {
        return color;
      }
    }

    return 'white';
  }

  /**
   * Colorize text for console output
   */
  colorize(color, text) {
    const colors = {
      red: '\x1b[31m',
      green: '\x1b[32m',
      yellow: '\x1b[33m',
      blue: '\x1b[34m',
      magenta: '\x1b[35m',
      cyan: '\x1b[36m',
      white: '\x1b[37m',
      gray: '\x1b[90m',
      reset: '\x1b[0m'
    };

    return `${colors[color] || colors.white}${text}${colors.reset}`;
  }

  /**
   * Escape HTML special characters
   */
  escapeHtml(text) {
    if (typeof text !== 'string') return text;
    
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}

module.exports = { ErrorResultFormatter };
