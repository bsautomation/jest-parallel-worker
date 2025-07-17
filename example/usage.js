const { runParallel } = require('../src/index');

async function main() {
  console.log('Starting Jest parallel runner...');
  
  try {
    const result = await runParallel({
      pattern: 'example/__tests__/**/*.test.js',
      workers: 4,
      timeout: 10000
    });
    
    console.log('Test run complete!');
    console.log(`Total tests: ${result.testsRun}`);
    console.log(`Passed: ${result.passed}`);
    console.log(`Failed: ${result.failed}`);
    console.log(`Duration: ${result.duration.toFixed(2)}s`);
    
    process.exit(result.success ? 0 : 1);
  } catch (error) {
    console.error('Failed to run tests:', error);
    process.exit(1);
  }
}

main();