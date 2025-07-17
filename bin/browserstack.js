#!/usr/bin/env node

// This is a special entry point for BrowserStack integration
const path = require('path');
const { runParallel } = require('../src/index');

// When invoked by BrowserStack, we need to parse the args differently
const args = process.argv.slice(2);

// Extract our options from the arguments
let pattern = '**/__tests__/**/*.test.{js,jsx,ts,tsx}';
let testNamePattern;
let detectOpenHandles = false;
const jestOptions = {};

// Parse arguments
for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  
  if (arg === '--detectOpenHandles') {
    detectOpenHandles = true;
    jestOptions.detectOpenHandles = true;
  } else if (arg.startsWith('--testNamePattern=')) {
    testNamePattern = arg.split('=')[1];
    jestOptions.testNamePattern = testNamePattern;
    console.log(`Using testNamePattern: ${testNamePattern}`);
  } else if (arg.startsWith('-p=') || arg.startsWith('--pattern=')) {
    pattern = arg.split('=')[1];
  } else if (arg.startsWith('--testPathPattern=')) {
    const testPathPattern = arg.split('=')[1];
    pattern = testPathPattern; // Use testPathPattern as our pattern
    jestOptions.testPathPattern = testPathPattern;
    console.log(`Using testPathPattern: ${testPathPattern}`);
  }
}

console.log(`Running tests with pattern: ${pattern}`);
console.log(`Test name pattern: ${testNamePattern || 'none'}`);

// Run tests in parallel
runParallel({
  pattern,
  jestOptions,
  workers: Math.max(1, require('os').cpus().length - 1),
  timeout: 30000,  // Increase timeout for BrowserStack
  logFile: 'logs/browserstack_parallel_runner.log',  // Use a dedicated log file for BrowserStack runs
  generateReport: true,
  reportOptions: {
    reportFilename: 'browserstack-report.html'
  },
  cwd: process.cwd(),
}).then(result => {
  process.exit(result.success ? 0 : 1);
}).catch(error => {
  console.error('Error running tests:', error);
  process.exit(1);
});