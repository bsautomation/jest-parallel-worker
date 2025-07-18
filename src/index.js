const fs = require('fs');
const path = require('path');
const os = require('os');
const { TestDiscovery, ProcessPool } = require('./discovery');
const chalk = require('chalk');

const glob = require('glob');

class JestParallelRunner {
  constructor(options) {
    this.options = {
      verbose: false,
      bail: false,
      coverage: false,
      ...options,
      workers: options.workers || os.cpus().length
    };
    
    // Parse Jest arguments from options
    this.jestArgs = this.buildJestArgs(options);
  }

  buildJestArgs(options) {
    const args = [];
    
    // Map common Jest options to command line arguments
    if (options.coverage) args.push('--coverage');
    if (options.verbose) args.push('--verbose');
    if (options.bail) args.push('--bail');
    if (options.updateSnapshot) args.push('--updateSnapshot');
    if (options.watchAll) args.push('--watchAll');
    if (options.watch) args.push('--watch');
    if (options.passWithNoTests) args.push('--passWithNoTests');
    if (options.silent) args.push('--silent');
    if (options.detectOpenHandles) args.push('--detectOpenHandles');
    if (options.forceExit) args.push('--forceExit');
    if (options.maxWorkers) args.push('--maxWorkers', options.maxWorkers);
    if (options.testTimeout) args.push('--testTimeout', options.testTimeout);
    if (options.setupFilesAfterEnv) args.push('--setupFilesAfterEnv', options.setupFilesAfterEnv);
    if (options.testEnvironment) args.push('--testEnvironment', options.testEnvironment);
    if (options.roots) args.push('--roots', options.roots);
    if (options.modulePaths) args.push('--modulePaths', options.modulePaths);
    if (options.testRegex) args.push('--testRegex', options.testRegex);
    if (options.collectCoverageFrom) args.push('--collectCoverageFrom', options.collectCoverageFrom);
    
    return args;
  }

  // Utility function for formatting bytes
  formatBytes(bytes) {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;
    
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    
    return `${size.toFixed(2)} ${units[unitIndex]}`;
  }

  async run() {
    console.log(chalk.blue(`🧪 Jest Parallel Worker v${require('../package.json').version || '1.0.0'}`));
    console.log(chalk.blue(`🔧 Running with ${this.options.workers} child processes (separate PIDs)`));
    console.log('');
    
    const startTime = Date.now();
    
    try {
      // Discover test files
      const testFiles = await this.discoverTestFiles();
      console.log(chalk.gray(`Found ${testFiles.length} test file${testFiles.length !== 1 ? 's' : ''}`));
      
      // Show discovered test files in verbose mode
      if (this.options.verbose && testFiles.length > 0) {
        console.log(chalk.gray('📁 Test files:'));
        testFiles.slice(0, 5).forEach(file => {
          console.log(chalk.gray(`  - ${file.replace(process.cwd(), '.')}`));
        });
        if (testFiles.length > 5) {
          console.log(chalk.gray(`  ... and ${testFiles.length - 5} more`));
        }
      }
      
      // Extract individual test cases
      const testCases = await TestDiscovery.discoverTests(testFiles);
      console.log(chalk.gray(`Discovered ${testCases.length} individual test${testCases.length !== 1 ? 's' : ''}`));
      
      // Filter out skipped tests unless explicitly requested
      const executableTests = testCases.filter(test => !test.skip || this.options.runSkipped);
      
      // If we have .only tests, run only those
      const onlyTests = executableTests.filter(test => test.only);
      const testsToRun = onlyTests.length > 0 ? onlyTests : executableTests;
      
      if (testsToRun.length === 0) {
        console.log(chalk.yellow('No tests found to run'));
        return {
          success: true,
          totalTests: 0,
          passedTests: 0,
          failedTests: 0,
          skippedTests: testCases.length - executableTests.length,
          duration: 0,
          results: []
        };
      }
      
      const skippedCount = testCases.length - testsToRun.length;
      if (skippedCount > 0) {
        console.log(chalk.gray(`Skipping ${skippedCount} test${skippedCount !== 1 ? 's' : ''}`));
      }
      
      if (onlyTests.length > 0) {
        console.log(chalk.yellow(`Running ${onlyTests.length} focused test${onlyTests.length !== 1 ? 's' : ''} (.only)`));
      }
      
      console.log(chalk.gray(`\nRunning ${testsToRun.length} test${testsToRun.length !== 1 ? 's' : ''} in parallel...`));
      console.log('');
      
      // Run tests in parallel using child processes
      const results = await this.runTestsInParallel(testsToRun);
      
      const duration = Date.now() - startTime;
      const passedTests = results.filter(r => r.success).length;
      const failedTests = results.filter(r => !r.success).length;
      const skippedTests = testCases.length - testsToRun.length;
      
      // Print results
      this.printResults(results, duration, skippedTests);
      
      return {
        success: failedTests === 0,
        totalTests: testCases.length,
        passedTests,
        failedTests,
        skippedTests,
        duration,
        results
      };
    } catch (error) {
      console.error(chalk.red('Error running tests:'), error);
      throw error;
    }
  }

  async discoverTestFiles() {
    const patterns = this.options.testMatch || [
      '**/__tests__/**/*.(js|jsx|ts|tsx)',
      '**/*.(test|spec).(js|jsx|ts|tsx)'
    ];
    
    const files = [];
    for (const pattern of patterns) {
      const matches = glob.sync(pattern, {
        cwd: process.cwd(),
        ignore: ['**/node_modules/**', '**/coverage/**', '**/dist/**']
      });
      files.push(...matches.map((f) => path.resolve(f)));
    }
    
    // Apply testPathPattern filter if specified
    if (this.options.testPathPattern) {
      const regex = new RegExp(this.options.testPathPattern);
      return files.filter(file => regex.test(file));
    }
    
    return [...new Set(files)]; // Remove duplicates
  }

  async runTestsInParallel(testCases) {
    const pool = new ProcessPool(this.options.workers, this.options.jestConfig, this.jestArgs);
    
    const results = [];
    const promises = [];
    let completedTests = 0;
    
    // Show progress indicator
    const progressInterval = setInterval(() => {
      if (completedTests < testCases.length) {
        process.stdout.write(`\r${chalk.blue('●')} Running tests... ${completedTests}/${testCases.length} completed`);
      }
    }, 100);
    
    for (const testCase of testCases) {
      const promise = pool.runTest(testCase);
      promises.push(promise);
      
      // If bail is enabled, stop on first failure
      if (this.options.bail) {
        promise.then(result => {
          if (!result.success) {
            console.log(chalk.red('\n❌ Stopping due to test failure (--bail enabled)'));
            process.exit(1);
          }
        }).catch(() => {
          console.log(chalk.red('\n❌ Stopping due to test error (--bail enabled)'));
          process.exit(1);
        });
      }
      
      // Show progress for verbose mode
      if (this.options.verbose) {
        promise.then(result => {
          const status = result.success ? chalk.green('✓') : chalk.red('✗');
          const pidInfo = result.pid ? `[PID: ${result.pid}]` : 
                         result.childProcessPID ? `[Child PID: ${result.childProcessPID}]` : 
                         '[PID: N/A]';
          
          // Add memory info if available
          let memoryInfo = '';
          if (result.memory && result.memory.delta) {
            const heapDelta = this.formatBytes(Math.abs(result.memory.delta.heapUsed));
            const heapSign = result.memory.delta.heapUsed >= 0 ? '+' : '-';
            memoryInfo = ` [Mem: ${heapSign}${heapDelta}]`;
          }
          
          console.log(`${status} ${result.testCase.fullName} (${result.duration}ms) ${pidInfo}${memoryInfo}`);
          completedTests++;
        });
      } else {
        promise.then(() => {
          completedTests++;
        });
      }
    }
    
    try {
      const allResults = await Promise.all(promises);
      results.push(...allResults);
    } finally {
      clearInterval(progressInterval);
      process.stdout.write('\r' + ' '.repeat(50) + '\r'); // Clear progress line
      await pool.terminate();
    }
    
    return results;
  }

  printResults(results, duration, skippedTests = 0) {
    const passed = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);
    
    console.log('\n' + '='.repeat(80));
    console.log(chalk.bold('🧪 Jest Parallel Worker Results'));
    console.log('='.repeat(80));
    
    if (failed.length > 0) {
      console.log(chalk.red.bold('\n❌ Failed Tests:'));
      failed.forEach(result => {
        console.log(chalk.red(`  ✗ ${result.testCase.fullName}`));
        console.log(chalk.gray(`    File: ${result.testCase.file}`));
        if (result.error) {
          console.log(chalk.gray(`    Error: ${result.error.message}`));
        }
        if (result.stderr && result.stderr !== result.error?.message) {
          console.log(chalk.gray(`    Output: ${result.stderr.slice(0, 200)}${result.stderr.length > 200 ? '...' : ''}`));
        }
        console.log('');
      });
    }
    
    // Summary
    console.log(chalk.green(`✅ ${passed.length} passing`));
    if (failed.length > 0) {
      console.log(chalk.red(`❌ ${failed.length} failing`));
    }
    if (skippedTests > 0) {
      console.log(chalk.yellow(`⏭️  ${skippedTests} skipped`));
    }
    
    console.log(chalk.gray(`\n⏱️  Total time: ${duration}ms`));
    console.log(chalk.gray(`🔧 Workers used: ${this.options.workers}`));
    console.log(chalk.gray(`📊 Tests per worker: ${Math.ceil(results.length / this.options.workers)}`));
    
    if (results.length > 0) {
      const avgTimePerTest = duration / results.length;
      const totalTestTime = results.reduce((sum, r) => sum + r.duration, 0);
      const parallelSpeedup = (totalTestTime / duration).toFixed(2);
      const efficiency = ((totalTestTime / (this.options.workers * duration)) * 100).toFixed(1);
      
      console.log(chalk.gray(`📈 Average time per test: ${avgTimePerTest.toFixed(2)}ms`));
      console.log(chalk.gray(`🚀 Parallel speedup: ${parallelSpeedup}x`));
      console.log(chalk.gray(`⚡ Worker efficiency: ${efficiency}%`));
      
      // PID Distribution Analysis
      const pids = results
        .map(r => r.pid || r.childProcessPID)
        .filter(pid => pid && pid !== 'N/A' && pid !== 'unknown');
      const uniquePids = [...new Set(pids)];
      
      if (uniquePids.length > 0) {
        console.log(chalk.gray(`\n🔀 Process Isolation:`));
        console.log(chalk.gray(`- Unique PIDs used: ${uniquePids.length} (${uniquePids.slice(0, 5).join(', ')}${uniquePids.length > 5 ? '...' : ''})`));
        console.log(chalk.gray(`- PID isolation: ${uniquePids.length > 1 ? '✅ Working' : '⚠️ Limited'}`));
        console.log(chalk.gray(`- Tests with PID data: ${pids.length}/${results.length}`));
      }
      
      // Memory statistics
      const memoryResults = results.filter(r => r.memory && r.memory.delta);
      if (memoryResults.length > 0) {
        const totalMemoryDelta = memoryResults.reduce((sum, r) => sum + r.memory.delta.heapUsed, 0);
        const avgMemoryDelta = totalMemoryDelta / memoryResults.length;
        const maxMemoryUsage = Math.max(...memoryResults.map(r => r.memory.final.heapUsed));
        const minMemoryUsage = Math.min(...memoryResults.map(r => r.memory.initial.heapUsed));
        const totalRssDelta = memoryResults.reduce((sum, r) => sum + r.memory.delta.rss, 0);
        
        console.log(chalk.gray(`\n💾 Memory Analysis:`));
        console.log(chalk.gray(`- Tests with memory data: ${memoryResults.length}/${results.length}`));
        console.log(chalk.gray(`- Average heap delta: ${this.formatBytes(Math.abs(avgMemoryDelta))} ${avgMemoryDelta >= 0 ? '(growth)' : '(cleanup)'}`));
        console.log(chalk.gray(`- Total heap delta: ${this.formatBytes(Math.abs(totalMemoryDelta))} ${totalMemoryDelta >= 0 ? '(growth)' : '(cleanup)'}`));
        console.log(chalk.gray(`- Peak heap usage: ${this.formatBytes(maxMemoryUsage)}`));
        console.log(chalk.gray(`- Minimum heap usage: ${this.formatBytes(minMemoryUsage)}`));
        console.log(chalk.gray(`- Total RSS delta: ${this.formatBytes(Math.abs(totalRssDelta))} ${totalRssDelta >= 0 ? '(growth)' : '(cleanup)'}`));
        
        // Memory efficiency ranking
        const memoryIntensive = memoryResults
          .map(r => ({
            name: r.testCase.name,
            memoryPerMs: Math.abs(r.memory.delta.heapUsed) / Math.max(r.duration, 1),
            totalMemory: Math.abs(r.memory.delta.heapUsed)
          }))
          .sort((a, b) => b.totalMemory - a.totalMemory)
          .slice(0, 3);
        
        if (memoryIntensive.length > 0) {
          console.log(chalk.gray(`- Most memory intensive:`));
          memoryIntensive.forEach((test, index) => {
            console.log(chalk.gray(`  ${index + 1}. ${test.name.slice(0, 40)}${test.name.length > 40 ? '...' : ''}: ${this.formatBytes(test.totalMemory)}`));
          });
        }
      }
      
      // Performance insights
      const slowestTests = results
        .sort((a, b) => b.duration - a.duration)
        .slice(0, 3);
      
      if (slowestTests.length > 0) {
        console.log(chalk.gray(`\n🐌 Slowest Tests:`));
        slowestTests.forEach((test, index) => {
          const pid = test.pid || test.childProcessPID || 'N/A';
          console.log(chalk.gray(`  ${index + 1}. ${test.testCase.name.slice(0, 50)}${test.testCase.name.length > 50 ? '...' : ''} (${test.duration}ms) [PID: ${pid}]`));
        });
      }
      
      // Sequential vs Parallel time comparison
      const totalSequentialTime = results.reduce((sum, r) => sum + r.duration, 0);
      console.log(chalk.gray(`\n📊 Performance Comparison:`));
      console.log(chalk.gray(`- Sequential time would be: ${totalSequentialTime}ms`));
      console.log(chalk.gray(`- Parallel execution time: ${duration}ms`));
      console.log(chalk.gray(`- Time saved: ${totalSequentialTime - duration}ms (${((totalSequentialTime - duration) / totalSequentialTime * 100).toFixed(1)}%)`));
    }
    
    console.log('='.repeat(80));
  }
}

module.exports = { JestParallelRunner, TestDiscovery, ProcessPool };