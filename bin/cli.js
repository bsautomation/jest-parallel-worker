#!/usr/bin/env node

const { program } = require('commander');
const { runParallel } = require('../src/index');
const path = require('path');
const pkg = require('../package.json');

// Support for Jest-style CLI arguments
program
  .version(pkg.version)
  .description('Run Jest tests in parallel at the it() level')
  // Core options
.option('-p, --pattern <pattern>', 'Test file pattern', '**/__tests__/**/*.test.{js,jsx,ts,tsx}')
.option('-w, --workers <number>', 'Number of parallel workers', parseInt, Math.max(1, require('os').cpus().length - 1))
.option('-t, --timeout <number>', 'Timeout for each test in milliseconds', parseInt, 4 * 60 * 1000)
.option('-l, --logFile <path>', 'Path to log file (relative to project root)', 'logs/jest_parallel_runner.log')
.option('-r, --report <boolean>', 'Generate HTML report', true)
.option('--reportFile <path>', 'Custom HTML report filename', 'jest-parallel-report.html')
  
  // Pass-through Jest options
  .option('-c, --config <path>', 'Path to Jest config file')
  .option('--testMatch <glob>', 'Jest testMatch pattern')
  .option('--testPathPattern <regexp>', 'Jest testPathPattern')
  .option('--testPathIgnorePatterns <regexp>', 'Jest testPathIgnorePatterns')
  .option('--testRegex <regexp>', 'Jest testRegex')
  .option('--rootDir <path>', 'Jest rootDir')
  .option('--roots <paths>', 'Jest roots directories')
  .option('--bail', 'Jest bail option')
  .option('--env <environment>', 'Jest test environment')
  .option('--json', 'Output test results as JSON')
  .option('--verbose', 'Display individual test results with the test suite hierarchy')
  .option('--silent', 'Prevent tests from printing messages through the console')
  .option('--testNamePattern <regexp>', 'Run only tests with a name that matches the regex')
  .option('--updateSnapshot', 'Update snapshots')
  .option('--ci', 'Run tests in continuous integration mode')
  .option('--detectOpenHandles', 'Attempt to collect and print open handles')
  .option('--forceExit', 'Force Jest to exit after all tests have completed')
  .option('--maxWorkers <num>', 'Specifies the maximum number of workers Jest will use')
  .option('--notify', 'Activates notifications for test results')
  .option('--watchAll', 'Watch files for changes and rerun all tests')
  .option('--watch', 'Watch files for changes and rerun tests related to changed files')
  .allowUnknownOption() // Support all other Jest options
  .action((options) => {
    const cwd = process.cwd();
    const configPath = options.config ? path.resolve(cwd, options.config) : undefined;
    
    // Extract the parallel-worker specific options
    const { pattern, workers, timeout, logFile, report, reportFile } = options;
    
    // Pass all options to Jest except our custom ones
    const jestOptions = { ...options };
    delete jestOptions.pattern;
    delete jestOptions.workers;
    delete jestOptions.logFile;
    delete jestOptions.report;
    delete jestOptions.reportFile;
    
    // Handle testPathPattern properly - ensure it's a string but don't modify it
    if (jestOptions.testPathPattern) {
      // Make sure it's a string
      if (typeof jestOptions.testPathPattern !== 'string') {
        jestOptions.testPathPattern = String(jestOptions.testPathPattern);
      }
      
      // Don't modify the testPathPattern - we'll handle it more carefully in the index.js file
      // This ensures compatibility with how Jest handles path patterns
      console.log(`Using testPathPattern: ${jestOptions.testPathPattern}`);
    }
    
    runParallel({
      pattern,
      jestConfigPath: configPath,
      workers,
      timeout,
      logFile,
      jestOptions,
      cwd,
      generateReport: report,
      reportOptions: {
        reportFilename: reportFile
      }
    }).then(result => {
      process.exit(result.success ? 0 : 1);
    }).catch(err => {
      console.error('Error running tests:', err);
      process.exit(1);
    });
  });

program.parse(process.argv);