# Jest Parallel Worker - Examples

This directory contains comprehensive examples demonstrating the capabilities of Jest Parallel Worker.

## 📁 Test Files

### `sample.test.js` & `async.test.js`
- Basic test examples with synchronous and asynchronous operations
- Good starting point to understand the package

### `comprehensive.test.js`
- Multiple describe blocks with various test types
- Mathematical operations, array operations, and edge cases
- Demonstrates test discovery across complex file structures

### `special-cases.test.js`
- Skipped tests (`it.skip`, `xit`, `test.skip`)
- Focused tests (`.only`) - commented out to avoid affecting normal runs
- Error handling and edge case testing
- Complex object and regex matching examples

### `performance.test.js`
- CPU-intensive tests to demonstrate parallel execution benefits
- Memory usage tests with large objects and arrays
- I/O simulation tests
- Performance measurement examples

### `integration.test.js`
- Mock database operations with async delays
- API integration examples with HTTP simulation
- File system operations (mocked)
- Complex integration scenarios

## 🚀 Usage Examples

### Quick Demo
```bash
npm run demo
```
Runs a quick verification that the package is working correctly.

### Comprehensive Examples
```bash
npm run test:examples
```
Runs all test files programmatically with different configurations and shows performance metrics.

### Interactive CLI Testing
```bash
npm run test:cli
```
Interactive script that demonstrates various CLI usage patterns.

### Manual CLI Usage
```bash
# Basic usage with all examples
npx jest-parallel --workers 4 --testMatch "**/examples/*.test.js" --verbose

# Run only async tests
npx jest-parallel --testPathPattern="async" --workers 2

# Performance comparison
npx jest-parallel --workers 1 --testMatch "**/examples/performance.test.js"
npx jest-parallel --workers 4 --testMatch "**/examples/performance.test.js"

# Run with coverage
npx jest-parallel --coverage --testMatch "**/examples/comprehensive.test.js"

# Use Jest options
npx jest-parallel --bail --detectOpenHandles --forceExit --verbose
```

## 📊 Expected Results

When running these examples, you should see:

### Performance Benefits
- **Sequential execution (1 worker)**: Higher total time
- **Parallel execution (4+ workers)**: Significantly reduced total time
- **Speedup factor**: Typically 3-6x depending on your system

### Test Isolation
- Each test runs in its own child process with separate PID
- Memory isolation between tests
- No shared state interference

### Progress Reporting
```
🧪 Jest Parallel Worker v1.0.0
🔧 Running with 4 child processes (separate PIDs)

Found 42 test files
Discovered 156 individual tests

Running 156 tests in parallel...

🧪 Jest Parallel Worker Results
================================================================================
✅ 150 passing
❌ 3 failing
⏭️ 3 skipped

⏱️ Total time: 2,847ms
🔧 Workers used: 4
📊 Tests per worker: 39
📈 Average time per test: 18.2ms
🚀 Parallel speedup: 4.2x
⚡ Worker efficiency: 91.3%
```

## 🔧 Customization

### Adding Your Own Tests
1. Create a new `.test.js` file in this directory
2. Use standard Jest syntax (`describe`, `it`, `test`, etc.)
3. Add async operations to see parallel benefits
4. Run with: `npx jest-parallel --testMatch "**/examples/your-test.test.js"`

### Test Categories
- **Unit Tests**: Fast, isolated function tests
- **Integration Tests**: Tests with external dependencies (mocked)
- **Performance Tests**: CPU or I/O intensive operations
- **Async Tests**: Promise-based or callback-based operations

### Performance Tips
- Tests with higher execution time benefit more from parallelization
- I/O operations (file system, network, database) see significant speedup
- CPU-intensive operations can utilize multiple cores effectively
- Very fast tests (< 10ms) may not benefit due to process overhead

## 🐛 Troubleshooting

### Common Issues
1. **No tests found**: Check your `testMatch` patterns
2. **Process timeouts**: Increase timeout or check for hanging operations
3. **Memory issues**: Reduce worker count for large test suites
4. **Shared state problems**: Ensure tests don't rely on global state

### Debug Mode
```bash
# Run with single worker for debugging
npx jest-parallel --workers 1 --verbose

# Use Jest's debugging options
npx jest-parallel --detectOpenHandles --forceExit
```

## 📚 Learning Resources

- Study the test files to understand Jest syntax and patterns
- Experiment with different worker counts to see performance impact
- Try different Jest options to understand their effects
- Compare execution times between sequential and parallel runs

## 🤝 Contributing Examples

To add new examples:
1. Create a descriptive test file name
2. Include comments explaining the test purpose
3. Add both sync and async test variants
4. Update this README with your example description
5. Test with various worker counts to verify parallel benefits