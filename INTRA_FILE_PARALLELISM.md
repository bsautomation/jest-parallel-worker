# Intra-File Parallelism Feature

## Overview

This feature implements **true intra-file parallelism** where tests within a single file can run in parallel while maintaining correct beforeAll/afterAll hook semantics.

## Status: ✅ IMPLEMENTED

**Custom Test Runner**: Successfully implemented using Node.js VM module for true intra-file parallelism.

## Features

### 1. Custom Test Runner (`--custom-runner`)

**✅ IMPLEMENTED AND WORKING**

- **True Parallel Execution**: Tests within a single file run simultaneously
- **Correct Hook Semantics**: beforeAll runs once before all tests, afterAll runs once after all tests
- **Shared State**: Variables set in beforeAll are accessible to all tests
- **Performance**: Significant speed improvements for test files with multiple slow tests

#### Usage

```bash
# Enable custom test runner for true intra-file parallelism
node bin/jest-parallel.js tests/ --custom-runner

# With concurrency control
node bin/jest-parallel.js tests/ --custom-runner --runner-concurrency 6

# Verbose output to see parallel execution
node bin/jest-parallel.js tests/ --custom-runner --verbose
```

#### Example Output

```
TEST_1: Starting at 2025-07-23T05:06:54.528Z, counter=100
TEST_2: Starting at 2025-07-23T05:06:54.529Z, counter=100  
TEST_3: Starting at 2025-07-23T05:06:54.529Z, counter=100
TEST_4: Starting at 2025-07-23T05:06:54.529Z, counter=100
```

All tests start at nearly identical timestamps, proving true parallelism.

### 2. Enhanced Native Parallel Mode

The existing `native-parallel` mode provides file-level parallelism:

```bash
# File-level parallelism (tests run sequentially within each file)
node bin/jest-parallel.js tests/ --mode native-parallel

# Disable intra-file parallelism for sequential execution within files
node bin/jest-parallel.js tests/ --mode native-parallel --no-intra-file-parallelism
```

## Implementation Details

### Custom Test Runner Architecture

The custom test runner uses Node.js VM (Virtual Machine) module to:

1. **Parse Test Files**: Extract tests, beforeAll, afterAll, beforeEach, afterEach hooks
2. **Create Shared Context**: Establish a VM context where all tests share state
3. **Execute Hooks**: Run beforeAll once before all tests
4. **Parallel Test Execution**: Run all tests simultaneously using Promise.all()
5. **Hook Cleanup**: Run afterAll once after all tests complete

### Key Technical Features

- **VM-based Isolation**: Uses `vm.createContext()` for controlled test execution
- **Jest API Compatibility**: Provides expect(), describe(), test(), it(), beforeAll(), afterAll()
- **Shared State Management**: Variables set in beforeAll are accessible to all tests
- **Error Handling**: Individual test failures don't affect other tests
- **Performance Optimized**: True parallel execution with configurable concurrency

### Performance Comparison

| Mode | Intra-File Parallelism | Hook Semantics | Use Case |
|------|----------------------|-----------------|----------|
| `--custom-runner` | ✅ True parallel | ✅ Correct | Best for files with slow tests |
| `native-parallel` | ❌ Sequential | ✅ Correct | Standard Jest compatibility |
| `parallel-file` | ❌ Sequential | ✅ Correct | Many small test files |

### Limitations

- **VM Overhead**: Small performance overhead from VM context creation
- **Limited Jest Features**: Basic Jest API implementation (no mocking, spies, etc.)
- **Node.js Only**: Requires Node.js VM module
- **Simple Expect**: Basic expect implementation (toBe, toEqual)

## Examples

### Test File Structure

```javascript
// examples/custom-runner-test.test.js
let sharedCounter = 0;
let beforeAllExecuted = false;

beforeAll(async () => {
  console.log('BEFORE_ALL: Setting up shared resources');
  beforeAllExecuted = true;
  sharedCounter = 100;
  await new Promise(resolve => setTimeout(resolve, 100));
});

afterAll(async () => {
  console.log('AFTER_ALL: Cleaning up shared resources');
  sharedCounter = 0;
  await new Promise(resolve => setTimeout(resolve, 50));
});

test('test 1 - should have access to shared state', async () => {
  console.log(`TEST_1: Starting at ${new Date().toISOString()}, counter=${sharedCounter}`);
  expect(beforeAllExecuted).toBe(true);
  expect(sharedCounter).toBe(100);
  
  await new Promise(resolve => setTimeout(resolve, 200));
  
  console.log(`TEST_1: Completed at ${new Date().toISOString()}`);
});

test('test 2 - should run in parallel with test 1', async () => {
  console.log(`TEST_2: Starting at ${new Date().toISOString()}, counter=${sharedCounter}`);
  expect(beforeAllExecuted).toBe(true);
  expect(sharedCounter).toBe(100);
  
  await new Promise(resolve => setTimeout(resolve, 300));
  
  console.log(`TEST_2: Completed at ${new Date().toISOString()}`);
});
```

### Expected Output

```bash
$ node bin/jest-parallel.js examples/custom-runner-test.test.js --custom-runner --verbose

BEFORE_ALL: Setting up shared resources
TEST_1: Starting at 2025-07-23T05:06:54.528Z, counter=100
TEST_2: Starting at 2025-07-23T05:06:54.529Z, counter=100
TEST_3: Starting at 2025-07-23T05:06:54.529Z, counter=100
TEST_4: Starting at 2025-07-23T05:06:54.529Z, counter=100
TEST_4: Completed at 2025-07-23T05:06:54.630Z
TEST_3: Completed at 2025-07-23T05:06:54.681Z
TEST_1: Completed at 2025-07-23T05:06:54.730Z
TEST_2: Completed at 2025-07-23T05:06:54.830Z
AFTER_ALL: Cleaning up shared resources

================================================================================
JEST PARALLEL WORKER - TEST RESULTS
================================================================================

Test Summary:
  Total Tests: 4
  Passed: 4
  Failed: 0
  Files: 1

Test Details:
  ✓ test 1 - should have access to shared state (202ms)
  ✓ test 2 - should run in parallel with test 1 (302ms)
  ✓ test 3 - should also run in parallel (152ms)
  ✓ test 4 - validates parallel execution timing (101ms)
```

## Migration Guide

### From Sequential to Parallel

If you have existing test files and want to enable intra-file parallelism:

1. **Ensure Hook Usage**: Make sure beforeAll/afterAll are used for shared setup
2. **Test Independence**: Ensure tests don't depend on execution order
3. **Enable Custom Runner**: Add `--custom-runner` flag

```bash
# Before (sequential)
node bin/jest-parallel.js tests/ --mode native-parallel

# After (parallel)
node bin/jest-parallel.js tests/ --custom-runner
```

### Performance Considerations

- **Best for**: Test files with multiple slow tests (>100ms each)
- **Not beneficial for**: Test files with many fast tests (<10ms each)
- **Optimal concurrency**: Usually matches CPU cores (default: 4)

## Future Enhancements

Potential improvements for the custom test runner:

1. **Enhanced Jest API**: Support for mocking, spies, and other Jest features
2. **Debugging Support**: Better debugging experience with parallel tests
3. **Configuration Options**: More fine-grained control over parallelism
4. **IDE Integration**: Better integration with VS Code and other IDEs
