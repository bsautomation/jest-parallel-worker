#!/usr/bin/env node

// Example usage script showing how to use the package programmatically
const { JestParallelRunner } = require('../src/index');

// Utility function for formatting bytes
function formatBytes(bytes) {
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unitIndex = 0;
  
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  
  return `${size.toFixed(2)} ${units[unitIndex]}`;
}

async function runExample() {
  console.log('🧪 Jest Parallel Worker - Comprehensive Example\n');

  console.log('📊 Running all example tests with parallel execution...\n');

  const runner = new JestParallelRunner({
    workers: 4,
    testMatch: [
      '**/examples/*.test.js'
    ],
    verbose: true,
    bail: false,
    // Test various Jest options
    testTimeout: 10000,
    detectOpenHandles: false,
    forceExit: true
  });

  try {
    const result = await runner.run();
    
    console.log('\n' + '='.repeat(80));
    console.log('🎯 FINAL RESULTS');
    console.log('='.repeat(80));
    console.log(`Overall Success: ${result.success ? '✅ PASSED' : '❌ FAILED'}`);
    console.log(`Total Tests: ${result.totalTests}`);
    console.log(`Passed: ${result.passedTests}`);
    console.log(`Failed: ${result.failedTests}`);
    console.log(`Skipped: ${result.skippedTests}`);
    console.log(`Duration: ${result.duration}ms`);
    
    if (result.results.length > 0) {
      const avgDuration = result.results.reduce((sum, r) => sum + r.duration, 0) / result.results.length;
      const totalSequentialTime = result.results.reduce((sum, r) => sum + r.duration, 0);
      const speedup = (totalSequentialTime / result.duration).toFixed(2);
      
      console.log(`Average test duration: ${avgDuration.toFixed(2)}ms`);
      console.log(`Sequential time would be: ${totalSequentialTime}ms`);
      console.log(`Parallel speedup achieved: ${speedup}x`);
      
      // Show test distribution across workers
      console.log(`\n📈 Performance Metrics:`);
      console.log(`- Tests per worker: ~${Math.ceil(result.totalTests / 4)}`);
      console.log(`- Worker efficiency: ${((totalSequentialTime / (4 * result.duration)) * 100).toFixed(1)}%`);
    }

    // Show some failed tests details if any
    if (result.failedTests > 0) {
      console.log('\n❌ Failed Tests:');
      result.results
        .filter(r => !r.success)
        .slice(0, 3) // Show first 3 failures
        .forEach(failure => {
          console.log(`  • ${failure.testCase.fullName}`);
          console.log(`    File: ${failure.testCase.file}`);
          if (failure.error) {
            console.log(`    Error: ${failure.error.message}`);
          }
        });
    }

    console.log('='.repeat(80));
    
  } catch (error) {
    console.error('❌ Error running example:', error);
    process.exit(1);
  }
}

async function runSpecificExample() {
  console.log('\n🔍 Running specific test pattern example...\n');

  const runner = new JestParallelRunner({
    workers: 2,
    testMatch: ['**/examples/async.test.js'],
    verbose: true
  });

  try {
    const result = await runner.run();
    console.log(`\n🎯 Async tests result: ${result.success ? 'PASSED' : 'FAILED'}`);
    console.log(`Async tests completed in: ${result.duration}ms`);
  } catch (error) {
    console.error('❌ Error running async example:', error);
  }
}

async function runPerformanceComparison() {
  console.log('\n⚡ Performance Comparison Example...\n');

  // Run with different worker counts to show scaling
  const workerCounts = [1, 2, 4];
  const results = [];

  for (const workers of workerCounts) {
    console.log(`Running with ${workers} worker(s)...`);
    
    const runner = new JestParallelRunner({
      workers,
      testMatch: ['**/examples/performance.test.js'],
      verbose: false
    });

    try {
      const result = await runner.run();
      results.push({
        workers,
        duration: result.duration,
        tests: result.totalTests
      });
      console.log(`  ✓ Completed in ${result.duration}ms`);
    } catch (error) {
      console.error(`  ❌ Error with ${workers} workers:`, error.message);
    }
  }

  console.log('\n📊 Performance Comparison Results:');
  console.log('Workers | Duration | Speedup vs 1 worker');
  console.log('--------|----------|------------------');
  
  const baseline = results.find(r => r.workers === 1)?.duration || results[0]?.duration;
  
  results.forEach(result => {
    const speedup = baseline ? (baseline / result.duration).toFixed(2) : 'N/A';
    console.log(`   ${result.workers}    |   ${result.duration}ms   |       ${speedup}x`);
  });
}

// Main execution
async function main() {
  try {
    await runExample();
    await runSpecificExample();
    await runPerformanceComparison();
    
    console.log('\n🎉 All examples completed successfully!');
    console.log('\nTo run manually:');
    console.log('  npx jest-parallel --workers 4 --testMatch "**/examples/*.test.js" --verbose');
    console.log('  npx jest-parallel --workers 2 --testPathPattern="async"');
    console.log('  npx jest-parallel --help');
    
  } catch (error) {
    console.error('💥 Example failed:', error);
    process.exit(1);
  }
}

main();