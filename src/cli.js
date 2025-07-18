#!/usr/bin/env node

const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');
const { JestParallelRunner } = require('./index');
const HTMLReportGenerator = require('./html-reporter');
const chalk = require('chalk');
const os = require('os');
const fs = require('fs');
const path = require('path');

function parseArguments() {
  return yargs(hideBin(process.argv))
    .usage('Usage: $0 [options]')
    .option('workers', {
      alias: 'w',
      type: 'number',
      description: 'Number of worker processes',
      default: os.cpus().length
    })
    .option('verbose', {
      alias: 'v',
      type: 'boolean',
      description: 'Enable verbose output with memory and PID tracking',
      default: false
    })
    .option('bail', {
      alias: 'b',
      type: 'boolean',
      description: 'Stop running tests after the first test failure',
      default: false
    })
    .option('testMatch', {
      type: 'array',
      description: 'Glob patterns for test files',
      default: ['**/__tests__/**/*.(js|jsx|ts|tsx)', '**/*.(test|spec).(js|jsx|ts|tsx)']
    })
    .option('testPathPattern', {
      type: 'string',
      description: 'Regex pattern to filter test file paths'
    })
    .option('testNamePattern', {
      type: 'string', 
      description: 'Regex pattern to filter test names'
    })
    .option('coverage', {
      type: 'boolean',
      description: 'Enable coverage collection',
      default: false
    })
    .option('config', {
      type: 'string',
      description: 'Path to Jest config file'
    })
    .option('silent', {
      type: 'boolean',
      description: 'Prevent tests from printing messages',
      default: false
    })
    .option('detectOpenHandles', {
      type: 'boolean',
      description: 'Detect handles that may prevent Jest from exiting',
      default: false
    })
    .option('forceExit', {
      type: 'boolean', 
      description: 'Force Jest to exit after all tests complete',
      default: false
    })
    .option('testTimeout', {
      type: 'number',
      description: 'Default timeout interval for tests in milliseconds'
    })
    .option('maxWorkers', {
      type: 'number',
      description: 'Maximum number of Jest workers'
    })
    .option('htmlReport', {
      type: 'boolean',
      description: 'Generate HTML report',
      default: true
    })
    .option('htmlReportPath', {
      type: 'string',
      description: 'Path for HTML report output',
      default: 'reports/jest-parallel-report.html'
    })
    .option('htmlReportTitle', {
      type: 'string',
      description: 'Title for HTML report',
      default: 'Jest Parallel Test Report'
    })
    .help()
    .alias('help', 'h')
    .argv;
}

async function main() {
  const argv = parseArguments();
  
  const options = {
    ...argv,
    workers: argv.workers || os.cpus().length,
    // HTML report configuration
    htmlReport: argv.htmlReport || false,
    htmlReportPath: argv.htmlReportPath || 'reports/jest-parallel-report.html',
    htmlReportTitle: argv.htmlReportTitle || 'Jest Parallel Test Report'
  };

  console.log(chalk.blue('🚀 Jest Parallel Worker - Enhanced Execution'));
  console.log(chalk.gray(`Starting with ${options.workers} worker processes for true PID isolation`));
  
  if (options.htmlReport) {
    console.log(chalk.gray(`HTML report will be generated at: ${options.htmlReportPath}`));
  }
  
  if (options.verbose) {
    console.log(chalk.gray('Configuration:'), JSON.stringify(options, null, 2));
  }
  console.log('');

  const runner = new JestParallelRunner(options);

  try {
    const result = await runner.run();
    
     // Generate HTML report if requested
    if (options.htmlReport && result.results) {
      try {
        console.log(chalk.blue('\n📊 Generating HTML report...'));
        
        if (options.verbose) {
          console.log(chalk.gray(`Found ${result.results.length} test results`));
          console.log(chalk.gray('Sample result structure:'), JSON.stringify(result.results[0] || {}, null, 2));
        }
        
        // Convert results to the expected format for HTML reporter
        const htmlResults = result.results.map(testResult => {
          // Extract detailed error information with proper string conversion
          let errorDetails = null;
          if (!testResult.success && testResult.error) {
            let errorMessage = '';
            let errorStack = '';
            
            // Handle different error formats
            if (typeof testResult.error === 'string') {
              errorMessage = testResult.error;
            } else if (testResult.error && typeof testResult.error === 'object') {
              // Extract message from error object
              errorMessage = testResult.error.message || 
                           testResult.error.toString() || 
                           JSON.stringify(testResult.error);
              errorStack = testResult.error.stack || '';
            } else {
              errorMessage = String(testResult.error || 'Unknown error');
            }
            
            // Also check stderr for additional error info
            if (testResult.stderr && !errorMessage.includes(testResult.stderr)) {
              errorMessage = testResult.stderr + (errorMessage ? '\n\n' + errorMessage : '');
            }
            
            // Clean up error message
            errorMessage = errorMessage
              .replace(/Process exited with code \d+:\s*/, '')
              .replace(/^\s*at\s+.*worker\.js.*\n/gm, '')
              .replace(/^\s*at\s+.*node_modules.*\n/gm, '')
              .trim();
            
            errorDetails = {
              message: errorMessage,
              stack: errorStack,
              type: (testResult.error && testResult.error.name) || 'Error'
            };
          }
          
          return {
            testCase: {
              name: testResult.testCase?.name || 'Unknown Test',
              fullName: testResult.testCase?.fullName || 'Unknown Test',
              file: testResult.testCase?.file || '',
              relativePath: testResult.testCase?.file ? path.relative(process.cwd(), testResult.testCase.file) : ''
            },
            success: testResult.success || false,
            duration: testResult.duration || 0,
            pid: testResult.pid || testResult.childProcessPID || 'unknown',
            memory: testResult.memory || {
              initial: { heapUsed: 0 },
              final: { heapUsed: process.memoryUsage().heapUsed },
              delta: { heapUsed: 0 },
              peak: process.memoryUsage().heapUsed
            },
            error: errorDetails,
            output: testResult.output || '',
            stderr: testResult.stderr || '',
            exitCode: testResult.exitCode || (testResult.success ? 0 : 1),
            startTime: testResult.startTime || new Date().toISOString(),
            endTime: testResult.endTime || new Date().toISOString()
          };
        });
        
        // Generate HTML report using enhanced HTML reporter
        const reportPath = await HTMLReportGenerator.generateReport(htmlResults, options.htmlReportPath, {
          pageTitle: options.htmlReportTitle
        });
        console.log(chalk.green(`✅ HTML report generated: ${reportPath}`));
      } catch (htmlError) {
        console.error(chalk.red('❌ Failed to generate HTML report:'), htmlError.message);
        if (options.verbose) {
          console.error(chalk.red('HTML Error details:'), htmlError.stack);
        }
      }
    } else if (options.htmlReport && !result.results) {
      console.log(chalk.yellow('⚠️  HTML report requested but no test results found'));
    }
    
    // Additional summary for CLI usage
    if (result.totalTests > 0) {
      console.log(chalk.blue('\n📋 CLI Execution Summary:'));
      const successRate = ((result.passedTests / result.totalTests) * 100).toFixed(1);
      console.log(chalk.gray(`Success rate: ${successRate}%`));
      
      if (result.results && result.results.length > 0) {
        const avgDuration = result.results.reduce((sum, r) => sum + r.duration, 0) / result.results.length;
        console.log(chalk.gray(`Average test duration: ${avgDuration.toFixed(2)}ms`));
        
        // Show worker distribution
        const workerDistribution = {};
        result.results.forEach(r => {
          const pid = r.pid || r.childProcessPID || 'unknown';
          workerDistribution[pid] = (workerDistribution[pid] || 0) + 1;
        });
        
        const workerCount = Object.keys(workerDistribution).filter(pid => pid !== 'unknown').length;
        console.log(chalk.gray(`Worker processes used: ${workerCount}`));
        
        if (options.verbose) {
          console.log(chalk.gray('Worker distribution:'));
          Object.entries(workerDistribution)
            .filter(([pid]) => pid !== 'unknown')
            .forEach(([pid, count]) => {
              console.log(chalk.gray(`  PID ${pid}: ${count} tests`));
            });
        }
      }
    }
    
    process.exit(result.success ? 0 : 1);
  } catch (error) {
    console.error(chalk.red('Failed to run tests:'), error.message);
    if (options.verbose) {
      console.error(chalk.red('Stack trace:'), error.stack);
    }
    process.exit(1);
  }
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (error) => {
  console.error(chalk.red('Unhandled promise rejection:'), error);
  process.exit(1);
});

main().catch((error) => {
  console.error(chalk.red('Unexpected error:'), error);
  process.exit(1);
});