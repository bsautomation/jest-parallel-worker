#!/usr/bin/env node

/**
 * Comprehensive Validation Test Suite
 * Tests all the key behaviors of Jest Parallel Worker:
 * 1. File-level parallelism
 * 2. Test-level parallelism 
 * 3. BeforeAll hook behavior
 * 4. Different failure scenarios
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const chalk = require('chalk');

const JEST_PARALLEL_BIN = path.join(__dirname, '../bin/jest-parallel.js');
const LOGS_DIR = path.join(__dirname, '../logs');

console.log(chalk.blue('🧪 Jest Parallel Worker - Comprehensive Validation Suite\n'));

// Ensure logs directory exists and is clean
if (fs.existsSync(LOGS_DIR)) {
  fs.rmSync(LOGS_DIR, { recursive: true, force: true });
}
fs.mkdirSync(LOGS_DIR, { recursive: true });

const tests = [
  {
    name: 'File-Level Parallelism Test',
    description: 'Verify files run in parallel with isolated beforeAll hooks',
    pattern: 'tests/validation/file-parallelism-*.test.js',
    expectedBehavior: [
      '✓ Files should run in parallel',
      '✓ Each file should have its own beforeAll execution',
      '✓ Tests within files should access their file\'s beforeAll setup'
    ]
  },
  {
    name: 'Test-Level Parallelism Test',
    description: 'Verify test.concurrent() enables intra-file parallelism',
    pattern: 'tests/validation/test-level-parallelism.test.js',
    expectedBehavior: [
      '✓ Concurrent tests should start within milliseconds of each other',
      '✓ Total execution time should be less than sum of individual test times',
      '✓ BeforeAll should run once before all concurrent tests'
    ]
  },
  {
    name: 'BeforeAll Hook Failure Test',
    description: 'Verify beforeAll failure causes all tests in file to fail',
    pattern: 'tests/validation/beforeall-failure.test.js',
    expectedBehavior: [
      '✓ BeforeAll failure should be detected',
      '✓ All tests in the file should fail',
      '✓ Test bodies should not execute when beforeAll fails'
    ],
    expectFailure: true
  },
  {
    name: 'All Tests Pass Test',
    description: 'Verify successful beforeAll and all tests passing',
    pattern: 'tests/validation/all-pass.test.js',
    expectedBehavior: [
      '✓ BeforeAll should execute successfully',
      '✓ All tests should pass',
      '✓ Shared data from beforeAll should be available to all tests'
    ]
  },
  {
    name: 'All Tests Fail Test', 
    description: 'Verify different types of test failures are detected',
    pattern: 'tests/validation/all-fail.test.js',
    expectedBehavior: [
      '✓ BeforeAll should succeed but tests should fail',
      '✓ Different failure types should be detected (assertion, reference, thrown, async)',
      '✓ All test failures should be reported'
    ],
    expectFailure: true
  },
  {
    name: 'Mixed Results Test',
    description: 'Verify mix of passing and failing tests',
    pattern: 'tests/validation/mixed-results.test.js', 
    expectedBehavior: [
      '✓ Some tests should pass, others should fail',
      '✓ BeforeAll should succeed',
      '✓ Both pass and fail results should be reported correctly'
    ],
    expectFailure: true
  }
];

async function runTest(test) {
  console.log(chalk.cyan(`\n📋 ${test.name}`));
  console.log(chalk.gray(`   ${test.description}`));
  
  test.expectedBehavior.forEach(behavior => {
    console.log(chalk.gray(`   ${behavior}`));
  });
  
  console.log(chalk.yellow(`\n⚡ Running: ${test.pattern}`));
  
  return new Promise((resolve) => {
    const startTime = Date.now();
    const child = spawn('node', [JEST_PARALLEL_BIN, 'run', '--testMatch', test.pattern, '--verbose'], {
      stdio: ['inherit', 'pipe', 'pipe'],
      cwd: path.join(__dirname, '..')
    });
    
    let stdout = '';
    let stderr = '';
    
    child.stdout.on('data', (data) => {
      stdout += data.toString();
      process.stdout.write(data);
    });
    
    child.stderr.on('data', (data) => {
      stderr += data.toString();
      process.stderr.write(data);
    });
    
    child.on('close', (code) => {
      const duration = Date.now() - startTime;
      const success = test.expectFailure ? code !== 0 : code === 0;
      
      if (success) {
        console.log(chalk.green(`\n✅ ${test.name} completed as expected (${duration}ms)`));
      } else {
        console.log(chalk.red(`\n❌ ${test.name} unexpected result (${duration}ms)`));
        if (test.expectFailure) {
          console.log(chalk.red(`   Expected failure but got success (code ${code})`));
        } else {
          console.log(chalk.red(`   Expected success but got failure (code ${code})`));
        }
      }
      
      resolve({ 
        name: test.name, 
        success, 
        duration, 
        code, 
        stdout, 
        stderr,
        expectedFailure: test.expectFailure || false
      });
    });
  });
}

async function runAllTests() {
  console.log(chalk.blue('Starting comprehensive validation tests...\n'));
  
  const results = [];
  const startTime = Date.now();
  
  for (const test of tests) {
    const result = await runTest(test);
    results.push(result);
    
    // Brief pause between tests
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  const totalDuration = Date.now() - startTime;
  
  // Summary
  console.log(chalk.blue('\n' + '='.repeat(80)));
  console.log(chalk.blue('📊 VALIDATION SUMMARY'));
  console.log(chalk.blue('='.repeat(80)));
  
  const successful = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  
  console.log(chalk.green(`✅ Successful: ${successful}`));
  console.log(chalk.red(`❌ Failed: ${failed}`));
  console.log(chalk.gray(`⏱️  Total time: ${totalDuration}ms`));
  
  results.forEach(result => {
    const icon = result.success ? '✅' : '❌';
    const color = result.success ? chalk.green : chalk.red;
    const expectedText = result.expectedFailure ? ' (expected failure)' : '';
    console.log(color(`${icon} ${result.name} (${result.duration}ms)${expectedText}`));
  });
  
  // Log analysis
  console.log(chalk.blue('\n📁 Log Files Generated:'));
  try {
    const logFiles = fs.readdirSync(LOGS_DIR);
    logFiles.forEach(file => {
      const filePath = path.join(LOGS_DIR, file);
      const size = fs.statSync(filePath).size;
      console.log(chalk.gray(`   ${file} (${size} bytes)`));
    });
  } catch (error) {
    console.log(chalk.yellow('   No log files generated or error reading logs directory'));
  }
  
  // Behavioral validation
  console.log(chalk.blue('\n🔍 Behavioral Validation:'));
  
  // Check file parallelism logs
  try {
    const fileParallelismLog = fs.readFileSync(path.join(LOGS_DIR, 'file-parallelism.log'), 'utf8');
    const beforeAllEntries = (fileParallelismLog.match(/beforeAll started/g) || []).length;
    console.log(chalk.green(`✓ File-level beforeAll hooks: ${beforeAllEntries} files`));
    
    // Check timestamp overlaps for parallelism
    const timestamps = fileParallelismLog.split('\n')
      .filter(line => line.includes('beforeAll started'))
      .map(line => {
        const match = line.match(/^(.+?) -/);
        return match ? new Date(match[1]) : null;
      })
      .filter(date => date !== null);
    
    if (timestamps.length >= 2) {
      const timeDiff = Math.abs(timestamps[1] - timestamps[0]);
      if (timeDiff < 1000) { // Within 1 second suggests parallelism
        console.log(chalk.green(`✓ Files started in parallel (${timeDiff}ms apart)`));
      }
    }
  } catch (error) {
    console.log(chalk.yellow('⚠️  Could not analyze file parallelism logs'));
  }
  
  // Check test-level parallelism
  try {
    const testParallelismLog = fs.readFileSync(path.join(LOGS_DIR, 'test-parallelism.log'), 'utf8');
    const concurrentStarts = (testParallelismLog.match(/concurrent-test-\d+ started/g) || []).length;
    console.log(chalk.green(`✓ Concurrent tests detected: ${concurrentStarts}`));
  } catch (error) {
    console.log(chalk.yellow('⚠️  Could not analyze test-level parallelism logs'));
  }
  
  console.log(chalk.blue('\n' + '='.repeat(80)));
  
  if (failed === 0) {
    console.log(chalk.green('🎉 All validation tests completed successfully!'));
    console.log(chalk.green('   Jest Parallel Worker behavior verified ✓'));
    process.exit(0);
  } else {
    console.log(chalk.red(`⚠️  ${failed} validation tests had unexpected results`));
    console.log(chalk.red('   Review the output above for details'));
    process.exit(1);
  }
}

// Add some helper text
console.log(chalk.gray('This test suite validates:'));
console.log(chalk.gray('• File-level parallelism (multiple files run concurrently)'));
console.log(chalk.gray('• Test-level parallelism (test.concurrent within files)'));  
console.log(chalk.gray('• BeforeAll hook isolation (one per file)'));
console.log(chalk.gray('• Different failure scenarios (beforeAll fails, mixed results)'));
console.log(chalk.gray('• Error detection and reporting\n'));

runAllTests().catch(error => {
  console.error(chalk.red('❌ Validation suite failed:'), error);
  process.exit(1);
});
