# Jest Parallel Worker

A powerful Node.js package that extends Jest to run tests in parallel at the test level, providing significant performance improvements and detailed reporting.

## Features

🚀 **Multiple Execution Modes**
- **Native Parallel**: Run tests with Jest's native parallel capabilities (recommended)
- **Parallel Test Level**: Run individual tests (`it()`) in parallel across worker processes
- **Parallel File Level**: Run test files in parallel using standard Jest
- **Jest Parallel Mode**: Each file runs in its own process with Jest's internal test parallelism

📊 **Comprehensive Reporting**
- HTML reports with detailed metrics and visualizations
- Console output with progress tracking and performance statistics
- Time savings calculation compared to sequential execution

🔧 **Advanced Features**
- Configurable test timeouts via CLI
- Custom test file patterns with `--testMatch`
- Worker progress tracking with PID and memory usage
- Proper beforeAll/afterAll hook behavior
- Jest-compatible CLI options

## Installation

```bash
npm install jest-parallel-worker
```

## Quick Start

### Environment Check

Before using jest-parallel in your project, run the environment check:

```bash
npx jest-parallel check
```

This will verify that:
- Jest is properly installed and configured
- Your environment is compatible
- jest-parallel can execute tests successfully

### CLI Usage

```bash
# Run tests with native parallel execution (recommended)
npx jest-parallel --mode native-parallel --testMatch 'tests/**/*.test.js'

# Run tests in parallel at test level
npx jest-parallel --testMatch 'tests/**/*.test.js'

# Run tests in parallel at file level
npx jest-parallel --mode parallel-file --testMatch 'src/**/*.test.js'

# Run with Jest's internal parallelism
npx jest-parallel --mode jest-parallel --testMatch 'tests/**/*.test.js'

# Configure timeout and workers
npx jest-parallel --timeout 60000 --maxWorkers 8 --testMatch 'tests/**/*.test.js'

# Generate only HTML reports
npx jest-parallel --reporter html --outputDir ./custom-reports
```

### Programmatic Usage

```javascript
const { JestParallelRunner } = require('jest-parallel-worker');

async function runTests() {
  const results = await JestParallelRunner.run({
    mode: 'native-parallel', // recommended mode
    testMatch: 'tests/**/*.test.js',
    timeout: 30000,
    maxWorkers: 4,
    reporter: 'both',
    outputDir: './reports'
  });
  
  console.log(`Tests completed: ${results.passed}/${results.total} passed`);
  console.log(`Time saved: ${results.timeSaved}ms`);
}

runTests().catch(console.error);
```

## Execution Modes

### 1. Native Parallel (`native-parallel`) - **Recommended**
Runs test files in parallel using Jest's native parallel capabilities without file rewriting. Each file runs with Jest's internal parallelism while maintaining proper test isolation and hook behavior.

**Best for**: Most test suites, especially those with complex hooks, file-level state, or existing Jest configurations.

**Benefits**:
- ✅ No file rewriting required
- ✅ **Perfect `beforeAll`/`afterAll` hook handling**  
- ✅ **Excellent performance** (3x faster than sequential)
- ✅ **Test-level parallelism within files** (Jest's native parallelism)
- ✅ Full Jest compatibility
- ✅ Maintains test file integrity

**How it works**: Each test file runs in its own Jest process, and Jest automatically parallelizes tests within each file.

```bash
npx jest-parallel --mode native-parallel
```

### 2. Jest Parallel (`jest-parallel`)
Each file runs in its own process, but tests within each file run sequentially. Maintains proper hook behavior but without intra-file parallelism.

**Best for**: Projects that need file isolation but prefer predictable sequential execution within files.

**Benefits**:
- ✅ Perfect hook behavior
- ✅ File-level isolation  
- ✅ Predictable execution order within files
- ✅ Good performance (file-level parallelism)

**How it works**: Each test file runs in its own Jest process, tests execute one after another within each file.

```bash
npx jest-parallel --mode jest-parallel
```

### 3. Parallel Test Level (`parallel-test`)
Runs individual `it()` test cases in parallel across worker processes. Each test runs in complete isolation.

**Best for**: Test suites with many independent test cases that can benefit from maximum parallelization.

```bash
npx jest-parallel --mode parallel-test
```

### 4. Parallel File Level (`parallel-file`)
Runs test files in parallel using Jest's standard execution model. Tests within each file run sequentially.

**Best for**: Traditional Jest workflows with file-level parallelization.

```bash
npx jest-parallel --mode parallel-file
```

## ⚠️ Important Note About `--forceConcurrent`

### What is `--forceConcurrent`?
The `--forceConcurrent` flag automatically transforms regular `test()` and `it()` calls to `test.concurrent()` for test-level parallelism. While this can provide performance benefits, **it has significant drawbacks**.

### Why We Don't Recommend `--forceConcurrent`

**Hook Behavior Problems:**
```javascript
// Original test file
describe('User Tests', () => {
  beforeAll(async () => {
    await setupDatabase();  // Critical setup
  });
  
  test('should create user', async () => {
    // Depends on database being set up
  });
});

// After --forceConcurrent transformation  
describe('User Tests', () => {
  beforeAll(async () => {
    await setupDatabase();  // May not run when expected ❌
  });
  
  test.concurrent('should create user', async () => {
    // May run before database setup completes ❌
  });
});
```

**Issues with `--forceConcurrent`:**
- ❌ **Breaks `beforeAll`/`afterAll` hook execution order**
- ❌ **Unpredictable test execution timing**
- ❌ **State sharing problems between concurrent tests**
- ❌ **File rewriting complexity and potential errors**

### Better Alternative: Use `native-parallel` Mode

Instead of using `--forceConcurrent`, use **native-parallel mode** which:
- ✅ **Provides test-level parallelism automatically** (via Jest's internal parallelism)
- ✅ **Maintains perfect hook behavior**
- ✅ **Requires no code changes**
- ✅ **Delivers better performance**

```bash
# Instead of this (problematic):
npx jest-parallel --mode parallel-file --forceConcurrent

# Use this (recommended):
npx jest-parallel --mode native-parallel
```

### When `--forceConcurrent` Might Be Acceptable

Only consider `--forceConcurrent` if your tests:
- Have no `beforeAll` or `afterAll` hooks
- Are completely independent with no shared state
- Have been thoroughly tested for concurrent execution
- Cannot be migrated to `native-parallel` mode

### Legacy `--forceConcurrent` Usage (Not Recommended)

If you must use `--forceConcurrent` (not recommended), it works with `parallel-file` and `jest-parallel` modes:

```bash
# Force all regular tests to run concurrently in parallel-file mode
npx jest-parallel --mode parallel-file --forceConcurrent

# Force all regular tests to run concurrently in jest-parallel mode  
npx jest-parallel --mode jest-parallel --forceConcurrent
```

**Note**: This feature automatically rewrites your test files temporarily to use `test.concurrent()`, which can break hook behavior.

### 3. Jest Parallel Mode (`jest-parallel`)
Each file runs in its own process, but tests within the file run in parallel using Jest's internal parallelism. Maintains proper `beforeAll`/`afterAll` hook behavior.

**Best for**: Complex test suites that need file-level setup/teardown hooks but want some internal parallelism.

```bash
npx jest-parallel --mode jest-parallel
```

### 4. Force Concurrent Mode (`--forceConcurrent`)
Transforms regular `test()` and `it()` calls to `test.concurrent()` for true test-level parallelism. Works with `parallel-file` and `jest-parallel` modes.

**Best for**: Existing test suites using regular `test()`/`it()` calls that you want to run concurrently without modifying the test code.

```bash
# Force all regular tests to run concurrently in parallel-file mode
npx jest-parallel --mode parallel-file --forceConcurrent

# Force all regular tests to run concurrently in jest-parallel mode  
npx jest-parallel --mode jest-parallel --forceConcurrent
```

**Note**: This feature automatically rewrites your test files temporarily to use `test.concurrent()`, enabling true test-level parallelism for regular test calls.

## CLI Options

| Option | Description | Default |
|--------|-------------|---------|
| `-m, --mode <mode>` | Execution mode: `parallel-test`, `parallel-file`, `jest-parallel` | `parallel-test` |
| `-t, --testMatch <pattern>` | Test file pattern to match | `tests/**/*.test.js` |
| `--timeout <ms>` | Test timeout in milliseconds | `30000` |
| `--maxWorkers <number>` | Maximum number of worker processes | `4` |
| `--reporter <type>` | Reporter type: `console`, `html`, `both` | `both` |
| `--outputDir <dir>` | Output directory for reports | `./reports` |
| `--forceConcurrent` | Transform regular `test()`/`it()` calls to `test.concurrent()` | `false` |
| `--verbose` | Enable verbose logging | `false` |
| `--silent` | Suppress all output except errors | `false` |

## Logging and Monitoring

The package provides comprehensive logging with:

- **Process Information**: PID and memory usage for each worker
- **Progress Tracking**: Real-time progress bars and completion status
- **Performance Metrics**: Execution times, memory usage, and time savings
- **Worker Status**: Individual worker progress and completion

Example log output:
```
[2025-07-22T10:30:15.123Z] [1500ms] [PID:12345|MEM:45MB] [INFO] Starting Jest Parallel Worker in parallel-test mode
[2025-07-22T10:30:15.200Z] [1577ms] [PID:12345|MEM:47MB] [WORKER-1] [PID:12346|MEM:25MB] Starting work item: test - math.test.js
Progress: [████████████████████████████████████████████████] 100% (15/15) All tests completed
```

## Reporting

### Console Report
Provides a comprehensive summary including:
- Execution mode and timing information
- Test results breakdown (passed/failed)
- Memory usage statistics
- Individual test details with worker assignments

### HTML Report
Generates a beautiful, interactive HTML report with:
- Performance metrics and time savings visualization
- Test results with filtering and sorting
- File-level and test-level breakdowns
- Memory usage and process information
- Responsive design for mobile and desktop viewing

## Hook Behavior

The package maintains Jest's hook behavior patterns:

### Parallel Test Mode
- `beforeAll`/`afterAll`: Run once per file (simulated)
- `beforeEach`/`afterEach`: Run for each test

### File Level Modes
- `beforeAll`/`afterAll`: Run once per file (native Jest behavior)
- `beforeEach`/`afterEach`: Run for each test (native Jest behavior)

## Performance Benefits

Typical performance improvements:

- **CPU-bound tests**: 2-4x speedup with parallel-test mode
- **I/O-bound tests**: 3-8x speedup depending on wait times
- **Mixed workloads**: 2-5x speedup on average

The actual speedup depends on:
- Number of available CPU cores
- Test complexity and dependencies
- I/O wait times
- Memory constraints

## Examples

The package includes example test files in the `examples/` directory:

```bash
# Run example tests in different modes
npm run test:examples           # parallel-test mode
npm run test:file-level        # parallel-file mode  
npm run test:jest-parallel     # jest-parallel mode
```

## API Reference

### JestParallelRunner

Main class for programmatic usage.

```javascript
const runner = new JestParallelRunner(options);
const results = await runner.run();
```

### Options

```typescript
interface Options {
  mode?: 'parallel-test' | 'parallel-file' | 'jest-parallel';
  testMatch?: string;
  timeout?: number;
  maxWorkers?: number;
  reporter?: 'console' | 'html' | 'both';
  outputDir?: string;
  verbose?: boolean;
  silent?: boolean;
}
```

### Results

```typescript
interface Results {
  passed: number;
  failed: number;
  total: number;
  duration: number;
  timeSaved: number;
  mode: string;
}
```

## Testing

Run the package's own tests:

```bash
npm test
```

The test suite includes:
- Unit tests for all core components
- Integration tests for different execution modes
- Mock-based testing for isolated component validation

## Requirements

- Node.js >= 14.0.0
- Jest >= 29.0.0 (peer dependency)

## License

MIT

## Contributing

1. Fork the repository
2. Create a feature branch
3. Add tests for new functionality
4. Ensure all tests pass
5. Submit a pull request

## Troubleshooting

### Common Issues

**Tests timeout**: Increase timeout with `--timeout` option or check for hanging async operations.

**Memory usage**: Reduce `--maxWorkers` if running into memory constraints.

**Worker failures**: Enable `--verbose` logging to see detailed worker output.

### When Tests Don't Execute in Other Repositories

If you're using jest-parallel in another repository and tests aren't executing (showing 0 tests), follow these steps:

#### 1. Quick Environment Check

```bash
# Check if your environment is ready
npx jest-parallel check

# Check with a specific test file
npx jest-parallel check --test-file your-test-file.test.js
```

#### 2. Run the Diagnostic Tool

```bash
node troubleshoot.js [path-to-your-test-file]
```

This will check:
- Jest availability and version
- Project configuration
- Test file patterns
- Dependencies

#### 2. Common Issues and Solutions

**Issue: "No tests found" or "0 tests executed"**
- **Cause**: Jest configuration mismatch or wrong test patterns
- **Solution**: 
  - Ensure your test files follow Jest naming conventions (`*.test.js`, `*.spec.js`)
  - Check your Jest configuration in `package.json` or `jest.config.js`
  - Verify the working directory is the project root

**Issue: "Module not found" errors**
- **Cause**: Missing dependencies or incorrect module resolution
- **Solution**:
  - Run `npm install` to ensure all dependencies are installed
  - Check that Jest is installed: `npm install --save-dev jest`
  - Verify your Jest configuration includes correct module paths

**Issue: "Cannot resolve configuration"**
- **Cause**: Jest configuration issues
- **Solution**:
  - Check for syntax errors in `jest.config.js`
  - Ensure Jest preset is compatible (e.g., `@babel/preset-env` for ES6)
  - Test with a minimal Jest configuration first

**Issue: Config path errors like `../../../configs/undefined`**
- **Cause**: Missing environment variables that your Jest config depends on
- **Solution**:
  - Identify required environment variables (e.g., `PROFILE`, `NODE_ENV`)
  - Set them before running jest-parallel: `PROFILE=prod npx jest-parallel ...`
  - Check your Jest config for environment variable dependencies
  - Note: jest-parallel automatically passes all environment variables to workers

**Issue: Worker exits with code 1 but no test results**
- **Cause**: Jest execution failure before tests run
- **Solution**:
  - Run Jest directly first: `npx jest your-test-file --verbose`
  - Check for syntax errors in your test files
  - Ensure all imports/requires can be resolved

#### 3. Debug Mode

Run with verbose logging to see detailed error information:

```bash
node bin/jest-parallel.js --mode jest-parallel your-tests.test.js --verbose --forceConcurrent
```

#### 4. Manual Jest Test

Before using jest-parallel, ensure Jest works directly:

```bash
# Test Jest directly
npx jest your-test-file.test.js --verbose

# Test with the same arguments jest-parallel uses
npx jest --testMatch "**/${path.basename(testFile)}" --verbose --no-coverage --passWithNoTests=false
```

#### 5. Environment Requirements

Ensure your environment meets these requirements:
- Node.js version 14 or higher
- Jest installed as a dependency
- Test files in standard locations (`__tests__/`, `*.test.js`, `*.spec.js`)
- Proper Jest configuration

#### 6. Configuration Example

Minimal working Jest configuration for most projects:

```json
// package.json
{
  "scripts": {
    "test": "jest"
  },
  "jest": {
    "testEnvironment": "node",
    "testMatch": ["**/__tests__/**/*.js", "**/*.test.js", "**/*.spec.js"]
  },
  "devDependencies": {
    "jest": "^29.0.0"
  }
}
```

#### 7. Getting Help

If issues persist:
1. Run the diagnostic tool and share the output
2. Include your Jest configuration
3. Share the exact error messages from verbose mode
4. Test with a simple test file first
