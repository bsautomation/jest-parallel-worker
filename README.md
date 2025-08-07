# Jest Parallel Worker SDK

A powerful Node.js SDK that extends Jest to run tests in parallel at the test level, providing significant performance improvements and detailed reporting capabilities.

[![NPM Version](https://img.shields.io/npm/v/jest-parallel-worker.svg)](https://www.npmjs.com/package/jest-parallel-worker)
[![Node.js Version](https://img.shields.io/node/v/jest-parallel-worker.svg)](https://nodejs.org)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

## 🚀 Features

- **🏃‍♂️ Multiple Execution Modes**: Run tests with Jest's native parallel capabilities or custom parallel strategies
- **📊 Comprehensive Reporting**: HTML reports with detailed metrics, visualizations, and performance statistics
- **🔧 SDK Integration**: Use as a CLI tool or integrate programmatically into your Node.js applications
- **⚡ Performance Optimized**: Significant speed improvements over sequential test execution
- **🎯 Hook Compatible**: Proper beforeAll/afterAll hook behavior with file-level isolation
- **🔄 Jest Compatible**: Works with existing Jest test suites without modification
- **🌐 BrowserStack Integration**: Native support for cross-browser testing with BrowserStack

## 🤔 Why Choose Jest Parallel Worker Over Standard Jest?

Jest is an excellent testing framework, but it has inherent limitations for parallel execution:

### 🚀 **Jest vs Jest Parallel Worker: Fact-Checked Comparison**

| Feature/Behavior                | Standard Jest                | Jest Parallel Worker         |
|---------------------------------|------------------------------|-----------------------------|
| **File-level parallelism**      | ✅ Yes (with --maxWorkers)   | ✅ Yes                      |
| **Test-level parallelism**      | ⚠️ Only with test.concurrent | ⚠️ Only with test.concurrent|
| **Automatic test-level parallel**| ❌ No                        | ❌ No (except parallel-test) |
| **Hooks support**               | ✅ Yes                       | ✅ Yes                      |
| **Process isolation**           | ⚠️ Limited                   | ✅ (jest-parallel mode)      |
| **Reporting**                   | Basic console                | Rich HTML & JSON            |
| **SDK/Programmatic API**        | ❌ No                        | ✅ Yes                      |
| **Modes/strategies**            | 1 (file-level only)          | 4 (file/test/process/custom)|
| **Migration required**          | N/A                          | None (drop-in for Jest)     |

- **Standard Jest**: Runs files in parallel, tests in a file run sequentially unless you use `test.concurrent`. No automatic test-level parallelism.
- **Jest Parallel Worker**: Same as Jest for native-parallel/parallel-file/jest-parallel modes. Only `parallel-test` mode rewrites tests for automatic test-level parallelism (but breaks hooks).
- **Hooks**: Both support hooks, but only file-level parallelism preserves them perfectly. Test-level parallelism (via rewriting) breaks hooks.
- **Reporting**: Jest Parallel Worker adds rich HTML/JSON reports and SDK integration.

## 📦 Installation

### As a dependency in your project
```bash
npm install jest-parallel-worker --save-dev
```

### Or globally for CLI usage
```bash
npm install -g jest-parallel-worker
```

## 🎯 Quick Start

### CLI Usage
```bash
# Run tests with native parallel execution (recommended)
npx jest-parallel run --mode native-parallel --testMatch 'tests/**/*.test.js'

# Run with custom configuration
npx jest-parallel run --mode native-parallel --maxWorkers 4 --timeout 30 --testMatch 'src/**/*.test.js'

# Run specific test file with options
npx jest-parallel run --testMatch 'path/to/test.js' --mode native-parallel --maxWorkers 5 --timeout 10 --reporter both --verbose

# Check environment compatibility
npx jest-parallel check
```

### SDK/Programmatic Usage
```javascript
const { JestParallelSDK } = require('jest-parallel-worker');

// Simple usage
async function runTests() {
  const results = await JestParallelSDK.runTests({
    testMatch: 'tests/**/*.test.js',
    mode: 'native-parallel',
    maxWorkers: 4,
    outputDir: 'test-reports'
  });
  console.log(`Tests completed: ${results.summary.passed}/${results.summary.totalTests} passed`);
  return results;
}

// Advanced usage with hooks
const sdk = new JestParallelSDK({
  testMatch: 'tests/**/*.test.js',
  mode: 'native-parallel',
  verbose: true
});
const results = await sdk.runWithHooks({
  beforeAll: async () => {
    console.log('Setting up test environment...');
    // Initialize test database, start servers, etc.
  },
  onProgress: (progress) => {
    console.log(`Progress: ${progress.completed}/${progress.total} tests`);
  },
  afterAll: async (results) => {
    console.log('Cleaning up test environment...');
    // Cleanup resources, stop servers, etc.
  }
});
```

### Configuration
Jest Parallel Worker uses **standard Jest configuration files only**:
- `jest.config.js` or `jest.config.json`
- The `jest` section in your `package.json`

Example `jest.config.js`:
```javascript
module.exports = {
  testMatch: ['tests/**/*.test.js', 'src/**/__tests__/*.js'],
  maxWorkers: 4,
  timeout: 30000, // 30 seconds in milliseconds (config files use milliseconds)
  verbose: true
};
```
Or in your `package.json`:
```json
{
  "jest": {
    "testMatch": ["tests/**/*.test.js"],
    "maxWorkers": 4
  }
}
```

## 🏃‍♂️ Execution Modes Explained

Jest Parallel Worker provides four distinct execution modes, each optimized for different testing scenarios. Choose the right mode based on your test suite characteristics and performance requirements.

### 🌟 1. Native Parallel (`native-parallel`) - **Recommended for Most Projects**

**How it works**: Runs test files in parallel using Jest's native parallel capabilities without any file rewriting. Each file executes with Jest's internal parallelism while maintaining complete test isolation and proper hook behavior.

**Architecture**:
- Multiple worker processes run test files simultaneously
- Each worker uses Jest's internal test parallelism within files
- No modification of test files required
- Maintains file-level isolation boundaries

**Key Advantages**:
- ✅ **Zero Configuration**: Works with existing Jest test suites without any modifications
- ✅ **Perfect Hook Handling**: `beforeAll`, `afterAll`, `beforeEach`, `afterEach` work exactly as expected
- ✅ **Best Performance**: Combines file-level AND test-level parallelism (up to 65% faster)
- ✅ **Full Jest Compatibility**: Supports all Jest features, configurations, and plugins
- ✅ **State Isolation**: Complete isolation between test files prevents cross-contamination
- ✅ **Production Ready**: Most stable and reliable mode for CI/CD pipelines

**Best for**:
- Production applications with complex test suites
- Tests that use setup/teardown hooks extensively
- Projects with file-level shared state or resources
- CI/CD environments requiring reliability
- Teams migrating from standard Jest without code changes

**Performance Example**: 58 tests across 13 files complete in ~10.2s vs 29.6s sequential (**65% faster**)

---

### ⚡ 2. Parallel Test (`parallel-test`) - **Maximum Parallelism**

**How it works**: Transforms individual `it()` and `test()` calls into `test.concurrent()` by rewriting test files, then runs them across multiple worker processes for maximum parallel execution.

**Architecture**:
- Test files are temporarily rewritten to use `test.concurrent()`
- Individual tests execute simultaneously across worker processes
- Each test runs independently without file-level boundaries

**Key Advantages**:
- ✅ **Maximum Throughput**: Highest possible parallelism at the individual test level
- ✅ **Scalability**: Excellent for very large test suites (1000+ tests)
- ✅ **Resource Efficiency**: Optimal CPU utilization across all available cores
- ✅ **Independent Tests**: Perfect for unit tests without shared dependencies

**Important Limitations**:
- ❌ **Breaks Hook Behavior**: `beforeAll`/`afterAll` hooks won't work as expected
- ❌ **File Rewriting Overhead**: Temporary file modifications add processing time
- ❌ **Shared State Issues**: Tests sharing file-level variables may conflict
- ❌ **Complex Setup**: Not suitable for integration tests requiring sequential setup

**Best for**:
- Pure unit test suites with no shared state
- Tests that don't rely on beforeAll/afterAll hooks
- Mathematical, utility, or stateless function testing
- Performance-critical scenarios where maximum speed is required

**Use When**: Your tests are completely independent and don't use file-level hooks

---

### 🏗️ 3. Parallel File (`parallel-file`) - **Standard Jest Approach**

**How it works**: Uses Jest's built-in `--maxWorkers` functionality to run test files in parallel while maintaining standard Jest behavior within each file.

**Architecture**:
- Files run in parallel across multiple worker processes
- Within each file, tests run sequentially (standard Jest behavior)
- No modifications to test files or Jest configuration

**Key Advantages**:
- ✅ **Jest Standard**: Identical to running `jest --maxWorkers=4`
- ✅ **Reliable & Stable**: Time-tested approach used by millions of projects
- ✅ **Hook Compatible**: Perfect `beforeAll`/`afterAll` behavior within files
- ✅ **Predictable**: Sequential test execution within files ensures deterministic behavior
- ✅ **Simple**: No learning curve if you're familiar with Jest

**Limitations**:
- ⚠️ **Limited Parallelism**: Only file-level parallelism, not test-level
- ⚠️ **Slower**: Sequential execution within files limits performance gains

**Best for**:
- Teams new to parallel testing who want to start conservatively
- Legacy codebases with strict sequential test requirements
- Integration tests that require controlled execution order
- Projects where stability is more important than maximum performance

**Performance**: Baseline Jest performance with file-level parallelism only

---

### 🔒 4. Jest Parallel (`jest-parallel`) - **Process Isolation**

**How it works**: Each test file runs in its own isolated Jest process with internal test parallelism, providing maximum isolation between test files.

**Architecture**:
- Separate Jest process spawned for each test file
- Each process uses Jest's internal parallelism for tests within the file
- Complete process-level isolation between test files

**Key Advantages**:
- ✅ **Maximum Isolation**: Complete process separation prevents any cross-file interference
- ✅ **Resource Safety**: Each file gets fresh memory space and clean environment
- ✅ **Fault Tolerance**: Failure in one file doesn't affect others
- ✅ **Heavy Resource Handling**: Excellent for tests that consume significant memory/CPU
- ✅ **Integration Testing**: Perfect for tests that modify global state or environment

**Considerations**:
- ⚠️ **Higher Overhead**: Process creation adds startup time
- ⚠️ **Memory Usage**: Multiple Jest processes consume more RAM
- ⚠️ **Resource Intensive**: Best suited for powerful development/CI machines

**Best for**:
- Integration tests that modify global state, environment variables, or system resources
- Tests that work with external services, databases, or file systems
- Memory-intensive test suites that benefit from fresh process environments
- Projects where test files have historically interfered with each other
- CI environments with abundant resources where maximum isolation is critical

**Performance Example**: 58 tests complete in ~15.8s with perfect isolation (**47% faster** than sequential)

---

## 📊 Comprehensive Performance Comparison

| Mode | Execution Time | Speed Improvement | Hook Behavior | Isolation Level | Resource Usage | Best Use Case |
|------|----------------|-------------------|---------------|-----------------|----------------|---------------|
| **native-parallel** | **10.2s** | **🚀 65% faster** | ✅ Perfect | File-level | Medium | **Most projects** |
| parallel-test | 11.1s | 🔥 62% faster | ❌ Broken | Test-level | Low | Independent tests only |
| jest-parallel | 15.8s | ⚡ 47% faster | ✅ Perfect | Process-level | High | Integration tests |
| parallel-file | 29.6s | 📈 Baseline | ✅ Perfect | File-level | Low | Standard Jest |

*Benchmark: 58 tests across 13 files on 8-core machine*

### 🎯 Mode Selection Guide

**Choose `native-parallel` if**:
- ✅ You want the best balance of performance and compatibility
- ✅ Your tests use beforeAll/afterAll hooks
- ✅ You need production-ready reliability
- ✅ You want to migrate from Jest without code changes

**Choose `parallel-test` if**:
- ✅ Your tests are completely independent (no shared state)
- ✅ You don't use beforeAll/afterAll hooks
- ✅ Maximum speed is your primary goal
- ✅ You have simple unit tests only

**Choose `jest-parallel` if**:
- ✅ Your tests modify global state or environment
- ✅ You need maximum isolation between test files
- ✅ You're running integration or end-to-end tests
- ✅ Test files have historically interfered with each other

**Choose `parallel-file` if**:
- ✅ You're new to parallel testing
- ✅ You want standard Jest behavior with minimal risk
- ✅ Your test execution order is critical
- ✅ You prefer conservative, proven approaches

## 🔧 API Reference

### JestParallelSDK Class
```javascript
const { JestParallelSDK } = require('jest-parallel-worker');

// Constructor
const sdk = new JestParallelSDK(options);

// Configuration methods (fluent API)
sdk.setTestMatch('tests/**/*.test.js')
   .setMode('native-parallel')
   .setMaxWorkers(4)
   .setTimeout(30000)
   .setOutputDir('reports')
   .enableVerbose();

// Execution methods
await sdk.run(overrideOptions);
await sdk.runWithHooks(lifecycleHooks);

// Static methods
const results = await JestParallelSDK.runTests(options);
const modes = JestParallelSDK.getModes();
```

### Configuration Options
```javascript
{
  testMatch: string | string[],     // Test file patterns
  mode: string,                     // Execution mode
  maxWorkers: number,               // Maximum worker processes (default: CPU cores)
  timeout: number,                  // Timeout in milliseconds (minimum: 60000ms = 1 minute)
  forceConcurrent: boolean,         // Force concurrent execution
  verbose: boolean,                 // Verbose output
  outputDir: string,                // Report output directory
  reporter: 'console'|'html'|'both' // Reporter type
}
```

**Note**: When using the CLI, timeout is specified in **minutes** (e.g., `--timeout 10` = 10 minutes), but in configuration files and SDK, it's in milliseconds.
```

### Lifecycle Hooks
```javascript
await sdk.runWithHooks({
  beforeAll: async () => { /* Setup */ },
  beforeEach: async (test) => { /* Before each test */ },
  afterEach: async (result) => { /* After each test */ },
  afterAll: async (results) => { /* Cleanup */ },
  onProgress: (progress) => { /* Progress updates */ },
  onComplete: async (results) => { /* Final callback */ }
});
```

### BrowserStack Integration
```javascript
// Run tests with BrowserStack
const results = await sdk.runWithBrowserStack({
  buildName: 'Feature Tests',
  projectName: 'My App',
  local: true
});

// Or use static method
const results = await JestParallelSDK.runTestsWithBrowserStack(
  { buildName: 'CI Tests', projectName: 'My App' },
  { testMatch: 'tests/**/*.test.js', mode: 'native-parallel' }
);
```

## 📈 Reporting

### HTML Reports
Generate detailed HTML reports with:
- Test execution summaries with pass/fail/skip counts
- Performance metrics and time savings calculations
- Individual test results with error details
- Hook execution timing and status
- Memory usage and worker allocation
- Interactive filtering by test status

### Console Reports
Detailed console output including:
- Real-time progress tracking
- Test execution summaries
- Performance statistics
- Memory usage monitoring
- Error details and stack traces

## 🛠️ Development

### Running Tests
```bash
# Run SDK tests
npm test

# Test SDK loading
npm run test:sdk

# Run examples
npx jest-parallel run --testMatch 'examples/**/*.test.js' --mode native-parallel

# Run with BrowserStack
npx jest-parallel-browserstack run --testMatch 'examples/**/*.test.js' --mode native-parallel
```

### Project Structure
```plaintext
jest-parallel-worker/
├── src/
│   ├── index.js              # Main SDK entry point
│   ├── config/               # Configuration management
│   ├── core/                 # Core execution engine
│   │   ├── runner.js         # Main test runner
│   │   ├── worker-manager.js # Worker process management
│   │   ├── parser.js         # Test file parsing
│   │   ├── reporter.js       # Report generation
│   │   └── execution-logger.js # Execution logging
│   ├── workers/              # Worker implementations
│   └── utils/                # Utility functions
├── bin/
│   └── jest-parallel.js      # CLI interface
├── examples/                 # Example test files
└── tests/                    # SDK unit tests
```
## 🤝 Contributing
1. Fork the repository
2. Create a feature branch: `git checkout -b feature/new-feature`
3. Make your changes and add tests
4. Run tests: `npm test`
5. Commit your changes: `git commit -am 'Add new feature'`
6. Push to the branch: `git push origin feature/new-feature`
7. Submit a pull request

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

## 🙋‍♂️ Support

- 📖 [Documentation](https://github.com/bsautomation/jest-parallel-worker#readme)
- 🐛 [Issue Tracker](https://github.com/bsautomation/jest-parallel-worker/issues)
- 💬 [Discussions](https://github.com/bsautomation/jest-parallel-worker/discussions)

---

**Made with ❤️ for the Jest testing community**