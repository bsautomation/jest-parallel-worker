# Jest Parallel Worker

Run Jest tests in parallel at the individual test level (`it()`/`test()`) without having to create separate files for each test.

## Why?

Standard Jest parallelization works at the file level, meaning tests within the same file run sequentially. This package extracts all test cases and runs each one in its own process, maximizing parallelization.

## Installation

```bash
npm install --save-dev jest-parallel-worker
# or
yarn add -D jest-parallel-worker
```

## Usage

### Command Line

```bash
# Basic usage
npx jest-parallel-worker

# With pattern
npx jest-parallel-worker --pattern "**/__tests__/**/*.test.js"

# With Jest arguments
npx jest-parallel-worker --verbose --updateSnapshot --bail
```

### BrowserStack Integration

This package provides special support for running with BrowserStack Node SDK:

```bash
# Using browserstack-jest-parallel
node_modules/.bin/browserstack-node-sdk browserstack-jest-parallel --testPathPattern="src/__tests__/automatedTests/*.js" --testNamePattern="@p0" --detectOpenHandles
```

The `browserstack-jest-parallel` command is optimized for use with BrowserStack and properly handles test patterns and tags.

### Options

#### Core Options

- `-p, --pattern <pattern>`: Test file glob pattern (default: `**/__tests__/**/*.test.{js,jsx,ts,tsx}`)
- `-w, --workers <number>`: Number of parallel workers (default: CPU cores - 1)
- `-t, --timeout <number>`: Timeout for each test in milliseconds (default: 4 * 60 * 1000)

#### Jest Options

All standard Jest CLI options are also supported. Some commonly used ones include:

- `-c, --config <path>`: Path to Jest config file
- `--verbose`: Display individual test results with the test suite hierarchy
- `--silent`: Prevent tests from printing messages through the console
- `--bail`: Stop running tests after the first failure
- `--updateSnapshot`: Update snapshots
- `--testNamePattern <regexp>`: Run only tests with a name that matches the regex

### Programmatic Usage

```javascript
const { runParallel } = require('jest-parallel-worker');

async function runTests() {
  const result = await runParallel({
    pattern: '**/__tests__/**/*.test.js',
    jestConfigPath: './jest.config.js',  // optional
    workers: 4,                          // optional, default: CPU cores - 1
    timeout: 10000,                      // optional, default: 5000ms
    cwd: process.cwd(),                  // optional, default: process.cwd()
    jestOptions: {                       // optional, all Jest options are supported
      verbose: true,
      bail: true,
      updateSnapshot: true,
      testNamePattern: '@p0'             // Filter tests by tag
    }
  });
  
  console.log(`Tests run: ${result.testsRun}, Passed: ${result.passed}, Failed: ${result.failed}`);
  
  // result.success will be true if all tests passed
  process.exit(result.success ? 0 : 1);
}

runTests();
```

## How it Works

1. Discovers all Jest test files matching the specified pattern
2. Uses Babel parser to statically analyze files and extract all `it()` and `test()` calls
3. Creates a worker pool using jest-worker
4. Distributes individual tests across workers for parallel execution
5. Collects results and provides a summary report

## Limitations

- Test cases must have a static string as their first argument
- Tests that depend on shared state between test cases may not work as expected
- Tests that depend on the execution order may not work as expected