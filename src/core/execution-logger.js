const fs = require('fs').promises;
const path = require('path');

class ExecutionLogger {
  constructor(options = {}) {
    this.logDir = options.logDir || './logs';
    this.logLevel = options.logLevel || 'INFO';
    this.enableConsole = options.enableConsole !== false;
    this.enableFile = options.enableFile !== false;
    this.maxLogSize = options.maxLogSize || 10 * 1024 * 1024; // 10MB
    this.staticLogName = options.staticLogName || 'jest-parallel-runner.log';
    
    this.startTime = Date.now();
    this.sessionId = this.generateSessionId();
    this.logBuffer = [];
    this.testExecutions = new Map();
    this.workerActivities = new Map();
    
    if (this.enableFile) {
      this.initializeLogFile();
    }
  }

  generateSessionId() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const random = Math.random().toString(36).substr(2, 6);
    return `jest-parallel-${timestamp}-${random}`;
  }

  async initializeLogFile() {
    try {
      await fs.mkdir(this.logDir, { recursive: true });
      this.logFilePath = path.join(this.logDir, this.staticLogName);
      
      // Write session header with separator for new session
      const header = [
        '',
        '='.repeat(80),
        `NEW EXECUTION SESSION - ${new Date().toISOString()}`,
        '='.repeat(80),
        `JEST PARALLEL WORKER EXECUTION LOG`,
        `Session ID: ${this.sessionId}`,
        `Started: ${new Date().toISOString()}`,
        `Process ID: ${process.pid}`,
        '='.repeat(80),
        ''
      ].join('\n');
      
      // Append to existing log file instead of overwriting
      await fs.appendFile(this.logFilePath, header);
    } catch (error) {
      console.error(`Failed to initialize log file: ${error.message}`);
      this.enableFile = false;
    }
  }

  formatLogEntry(level, category, message, data = null) {
    const timestamp = new Date().toISOString();
    const elapsed = Date.now() - this.startTime;
    const memUsage = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
    
    let entry = `[${timestamp}] [${elapsed}ms] [PID:${process.pid}|MEM:${memUsage}MB] [${level}] [${category}] ${message}`;
    
    if (data) {
      entry += `\n  Data: ${JSON.stringify(data, null, 2)}`;
    }
    
    return entry;
  }

  async writeToFile(entry) {
    if (!this.enableFile || !this.logFilePath) return;
    
    try {
      await fs.appendFile(this.logFilePath, entry + '\n');
    } catch (error) {
      console.error(`Failed to write to log file: ${error.message}`);
    }
  }

  writeToConsole(level, category, message) {
    if (!this.enableConsole) return;
    
    const timestamp = new Date().toISOString();
    const elapsed = Date.now() - this.startTime;
    const memUsage = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
    
    const prefix = `[${timestamp}] [${elapsed}ms] [PID:${process.pid}|MEM:${memUsage}MB]`;
    
    switch (level) {
      case 'ERROR':
        console.error(`${prefix} [ERROR] ${message}`);
        break;
      case 'WARN':
        console.warn(`${prefix} [WARN] ${message}`);
        break;
      case 'SUCCESS':
        console.log(`${prefix} [SUCCESS] ${message}`);
        break;
      case 'INFO':
        console.log(`${prefix} [INFO] ${message}`);
        break;
      case 'DEBUG':
        if (process.env.DEBUG) {
          console.log(`${prefix} [DEBUG] [${category}] ${message}`);
        }
        break;
    }
  }

  async log(level, category, message, data = null) {
    const entry = this.formatLogEntry(level, category, message, data);
    
    // Write to console
    this.writeToConsole(level, category, message);
    
    // Write to file
    if (this.enableFile) {
      await this.writeToFile(entry);
    }
  }

  // Convenience methods
  async info(category, message, data = null) {
    await this.log('INFO', category, message, data);
  }

  async error(category, message, data = null) {
    await this.log('ERROR', category, message, data);
  }

  async warn(category, message, data = null) {
    await this.log('WARN', category, message, data);
  }

  async success(category, message, data = null) {
    await this.log('SUCCESS', category, message, data);
  }

  async debug(category, message, data = null) {
    await this.log('DEBUG', category, message, data);
  }

  // Worker-specific logging
  async logWorkerStart(workerId, workItem) {
    const message = `Starting work item: ${workItem.type} - ${path.basename(workItem.filePath)}`;
    if (workItem.testName) {
      await this.info(`WORKER-${workerId}`, `${message} - ${workItem.testName}`);
    } else {
      await this.info(`WORKER-${workerId}`, message);
    }
    
    this.workerActivities.set(workerId, {
      startTime: Date.now(),
      workItem,
      status: 'running'
    });
  }

  async logWorkerComplete(workerId, result) {
    const activity = this.workerActivities.get(workerId);
    if (activity) {
      activity.endTime = Date.now();
      activity.duration = activity.endTime - activity.startTime;
      activity.status = result.status || 'completed';
      activity.result = result;
    }

    const message = `Completed with code ${result.exitCode || result.status}`;
    await this.info(`WORKER-${workerId}`, message);
  }

  async logWorkerError(workerId, error) {
    const message = `Worker error: ${error.message}`;
    await this.error(`WORKER-${workerId}`, message, { error: error.toString() });
  }

  async logWorkerTimeout(workerId) {
    const message = `Worker timed out`;
    await this.warn(`WORKER-${workerId}`, message);
  }

  // Test execution tracking
  trackTestExecution(testId, workerId, testName, filePath) {
    this.testExecutions.set(testId, {
      testId,
      workerId,
      testName,
      filePath,
      startTime: Date.now(),
      status: 'running'
    });
  }

  completeTestExecution(testId, result) {
    const execution = this.testExecutions.get(testId);
    if (execution) {
      execution.endTime = Date.now();
      execution.duration = execution.endTime - execution.startTime;
      execution.status = result.status;
      execution.error = result.error;
      execution.result = result;
    }
  }

  // Summary generation
  async generateExecutionSummary(finalResults) {
    const summary = this.buildSummaryData(finalResults);
    
    // Write summary to console
    this.printConsoleSummary(summary);
    
    // Write detailed summary to log file
    if (this.enableFile) {
      await this.writeDetailedSummary(summary);
    }
    
    return summary;
  }

  buildSummaryData(finalResults) {
    const totalDuration = Date.now() - this.startTime;
    const workerStats = this.calculateWorkerStats();
    const testStats = this.calculateTestStats(finalResults);
    
    return {
      session: {
        id: this.sessionId,
        startTime: this.startTime,
        endTime: Date.now(),
        totalDuration,
        processId: process.pid
      },
      workers: workerStats,
      tests: testStats,
      results: finalResults
    };
  }

  calculateWorkerStats() {
    const stats = {
      totalWorkers: this.workerActivities.size,
      completedWorkers: 0,
      failedWorkers: 0,
      averageDuration: 0,
      totalWorkTime: 0
    };

    let totalDuration = 0;
    for (const [workerId, activity] of this.workerActivities) {
      if (activity.duration) {
        totalDuration += activity.duration;
        stats.totalWorkTime += activity.duration;
      }
      
      // Check for both 'completed' and 'passed' as success states
      if (activity.status === 'completed' || activity.status === 'passed') {
        stats.completedWorkers++;
      } else {
        stats.failedWorkers++;
      }
    }

    if (stats.totalWorkers > 0) {
      stats.averageDuration = totalDuration / stats.totalWorkers;
    }

    return stats;
  }

  calculateTestStats(finalResults) {
    const stats = {
      total: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
      errors: [],
      failedTests: []
    };

    // Handle the structure passed from runner: {results, summary, metadata}
    let resultsArray = [];
    if (finalResults && finalResults.results) {
      resultsArray = finalResults.results;
    } else if (Array.isArray(finalResults)) {
      resultsArray = finalResults;
    }

    if (resultsArray && Array.isArray(resultsArray)) {
      for (const result of resultsArray) {
        // Handle individual test results (have testId)
        if (result.testId) {
          stats.total++;
          
          switch (result.status) {
            case 'passed':
              stats.passed++;
              break;
            case 'failed':
              stats.failed++;
              stats.failedTests.push({
                name: result.testName,
                file: path.basename(result.filePath),
                error: result.error,
                workerId: result.workerId,
                duration: result.duration
              });
              break;
            case 'skipped':
              stats.skipped++;
              break;
          }
        } 
        // Handle file-level results with nested test results
        else if (result.testResults && Array.isArray(result.testResults)) {
          for (const test of result.testResults) {
            stats.total++;
            
            switch (test.status) {
              case 'passed':
                stats.passed++;
                break;
              case 'failed':
                stats.failed++;
                stats.failedTests.push({
                  name: test.testName || test.name,
                  file: path.basename(result.filePath),
                  error: test.error,
                  workerId: result.workerId,
                  duration: test.duration
                });
                break;
              case 'skipped':
                stats.skipped++;
                break;
            }
          }
        } 
        // Handle file-level failures (execution errors)
        else if (result.status === 'failed') {
          stats.errors.push({
            file: path.basename(result.filePath),
            error: result.error || result.errorOutput,
            workerId: result.workerId
          });
        }
      }
    }

    return stats;
  }

  printConsoleSummary(summary) {
    console.log('\n' + '='.repeat(80));
    console.log('JEST PARALLEL WORKER - EXECUTION SUMMARY');
    console.log('='.repeat(80));
    
    console.log(`\nSession ID: ${summary.session.id}`);
    console.log(`Total Duration: ${this.formatDuration(summary.session.totalDuration)}`);
    console.log(`Workers Used: ${summary.workers.totalWorkers}`);
    console.log(`Average Worker Duration: ${this.formatDuration(summary.workers.averageDuration)}`);
    
    console.log(`\nTest Results:`);
    console.log(`  Total Tests: ${summary.tests.total}`);
    console.log(`  Passed: ${summary.tests.passed}`);
    console.log(`  Failed: ${summary.tests.failed}`);
    console.log(`  Skipped: ${summary.tests.skipped}`);
    
    if (summary.tests.failedTests.length > 0) {
      console.log(`\nFailed Tests:`);
      for (const test of summary.tests.failedTests) {
        console.log(`  ✗ ${test.name} (${test.file}) [Worker: ${test.workerId}]`);
        if (test.error) {
          console.log(`    Error: ${test.error.split('\n')[0]}`);
        }
      }
    }
    
    if (summary.tests.errors.length > 0) {
      console.log(`\nExecution Errors:`);
      for (const error of summary.tests.errors) {
        console.log(`  ✗ ${error.file} [Worker: ${error.workerId}]`);
        console.log(`    Error: ${error.error}`);
      }
    }
    
    console.log('\n' + '='.repeat(80));
  }

  async writeDetailedSummary(summary) {
    const detailedSummary = [
      '',
      '='.repeat(80),
      'EXECUTION SUMMARY',
      '='.repeat(80),
      `Session ID: ${summary.session.id}`,
      `Started: ${new Date(summary.session.startTime).toISOString()}`,
      `Completed: ${new Date(summary.session.endTime).toISOString()}`,
      `Total Duration: ${this.formatDuration(summary.session.totalDuration)}`,
      `Process ID: ${summary.session.processId}`,
      '',
      'WORKER STATISTICS:',
      `  Total Workers: ${summary.workers.totalWorkers}`,
      `  Completed: ${summary.workers.completedWorkers}`,
      `  Failed: ${summary.workers.failedWorkers}`,
      `  Average Duration: ${this.formatDuration(summary.workers.averageDuration)}`,
      `  Total Work Time: ${this.formatDuration(summary.workers.totalWorkTime)}`,
      '',
      'TEST STATISTICS:',
      `  Total Tests: ${summary.tests.total}`,
      `  Passed: ${summary.tests.passed}`,
      `  Failed: ${summary.tests.failed}`,
      `  Skipped: ${summary.tests.skipped}`,
      ''
    ];

    if (summary.tests.failedTests.length > 0) {
      detailedSummary.push('FAILED TESTS:');
      for (const test of summary.tests.failedTests) {
        detailedSummary.push(`  ✗ ${test.name}`);
        detailedSummary.push(`    File: ${test.file}`);
        detailedSummary.push(`    Worker: ${test.workerId}`);
        detailedSummary.push(`    Duration: ${this.formatDuration(test.duration)}`);
        if (test.error) {
          detailedSummary.push(`    Error: ${test.error}`);
        }
        detailedSummary.push('');
      }
    }

    if (summary.tests.errors.length > 0) {
      detailedSummary.push('EXECUTION ERRORS:');
      for (const error of summary.tests.errors) {
        detailedSummary.push(`  ✗ ${error.file}`);
        detailedSummary.push(`    Worker: ${error.workerId}`);
        detailedSummary.push(`    Error: ${error.error}`);
        detailedSummary.push('');
      }
    }

    detailedSummary.push('='.repeat(80));
    detailedSummary.push('END OF EXECUTION LOG');
    detailedSummary.push('='.repeat(80));

    await this.writeToFile(detailedSummary.join('\n'));
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

  async cleanup() {
    if (this.enableFile && this.logFilePath) {
      await this.writeToFile(`\nSession ended: ${new Date().toISOString()}`);
    }
  }
}

module.exports = { ExecutionLogger };
