# GitHub Copilot Prompts for jest-parallel-worker

This document contains curated prompts for GitHub Copilot to help with common development tasks in the jest-parallel-worker project. These prompts are designed to leverage the project's architecture and patterns effectively.

## 🚀 Quick Start Prompts

### Initial Development Setup
```
Create a new worker process for jest-parallel-worker that handles [specific functionality] with proper timeout management, BrowserStack SDK support, and structured logging following the existing patterns in native-parallel-worker.js
```

### Bug Investigation
```
Debug timeout issues in jest-parallel-worker where user-specified timeouts are not being honored. Check WorkerManager timeout propagation, Jest --testTimeout parameters, and worker process cleanup patterns.
```

## 🔧 Worker Development Prompts

### Creating New Workers
```
// Prompt for new worker creation
Create a new worker file src/workers/[worker-name]-worker.js that:
1. Follows the existing worker patterns from native-parallel-worker.js
2. Implements proper timeout handling with unique timeout IDs
3. Supports both regular Jest and BrowserStack SDK execution
4. Includes structured logging with workerId context
5. Handles process cleanup with SIGTERM/SIGKILL sequence
6. Parses Jest output and returns structured results
```

### Worker Enhancement
```
Enhance the existing [worker-name] worker to:
- Add BrowserStack SDK support with conditional execution
- Implement multi-level timeout handling (worker + Jest process)
- Add detailed logging for debugging timeout issues
- Follow the timeout patterns from worker-manager.js spawnJestParallelWorker method
```

### Timeout Debugging
```
Fix timeout handling in [file-name] where:
- User timeout parameter should be passed to Jest via --testTimeout
- Worker process should be killed after user-specified timeout
- BrowserStack SDK execution should respect the same timeouts
- Add logging to show actual timeout values being used
```

## 🔄 BrowserStack Integration Prompts

### BrowserStack Feature Addition
```
Add BrowserStack Node SDK support to [component-name] that:
1. Detects BrowserStack via options.browserstackSdk or BROWSERSTACK_SDK_ENABLED
2. Uses unified build IDs across all workers via getBrowserStackBuildId()
3. Wraps Jest commands with ['browserstack-node-sdk', 'jest', ...args]
4. Handles BrowserStack-specific output parsing differences
5. Propagates BROWSERSTACK_BUILD_ID environment variable to child processes
```

### BrowserStack Output Parsing
```
Enhance Jest output parsing to handle BrowserStack SDK format differences:
- Parse hook timing with fallback estimation for BrowserStack mode
- Handle different test result formats between regular Jest and BrowserStack
- Add "browserstack_estimated" status for calculated hook durations
- Follow the parsing patterns from parseJestOutput method in worker-manager.js
```

### BrowserStack Debugging
```
Debug BrowserStack integration issues:
- Check build ID propagation across worker processes
- Verify SDK command construction and environment variables
- Add logging to distinguish BrowserStack vs regular Jest execution
- Follow the logging patterns from native-parallel-worker.js
```

## 📊 Reporting & Logging Prompts

### Report Generation
```
Create/enhance reporting functionality that:
1. Generates both HTML and JSON reports following ReportGenerator patterns
2. Includes performance metrics and execution timing
3. Handles both individual test results and file-level summaries
4. Supports BrowserStack execution context in reports
5. Follows the reporting structure from existing test-report.html
```

### Logging Enhancement
```
Add structured logging to [component-name] following the project patterns:
- Use ExecutionLogger for detailed execution tracking
- Include workerId, filePath, and timing context
- Add debug logging for timeout and process management
- Follow the logging patterns from worker-manager.js and native-parallel-worker.js
```

### Performance Monitoring
```
Add performance monitoring that tracks:
- Worker execution times and memory usage
- Test throughput and completion rates
- Hook execution timing and estimation accuracy
- BrowserStack vs regular Jest performance differences
- Follow the performance tracking patterns from WorkerManager
```

## 🧪 Testing & Validation Prompts

### Test Suite Creation
```
Create comprehensive tests for [component-name] that verify:
1. Timeout handling with both short and long timeouts
2. BrowserStack SDK integration and build ID management
3. Worker process cleanup and error handling
4. Jest output parsing for various test result formats
5. Hook timing calculation and estimation accuracy
```

### Integration Testing
```
Create integration tests that validate:
- End-to-end execution with different modes (native-parallel, parallel-files, etc.)
- BrowserStack SDK integration with real test files
- Timeout enforcement across WorkerManager and individual workers
- Report generation with various test scenarios
- Error handling and recovery patterns
```

### Error Scenario Testing
```
Add error handling tests for:
- Worker process timeouts and cleanup
- Jest output parsing failures
- BrowserStack SDK execution errors
- Hook timing estimation edge cases
- Process cleanup and resource management
```

## 🔧 Maintenance & Debugging Prompts

### Performance Optimization
```
Optimize [component-name] performance by:
1. Reducing memory usage in worker processes
2. Improving Jest output parsing efficiency
3. Optimizing timeout handling and process cleanup
4. Following the memory management patterns from existing workers
5. Adding performance monitoring and logging
```

### Bug Fix Patterns
```
Fix [specific-issue] in jest-parallel-worker:
- Analyze the main branch vs current branch differences for the affected component
- Follow the established patterns from worker-manager.js and native-parallel-worker.js  
- Ensure timeout handling maintains backward compatibility
- Add comprehensive logging for debugging similar issues in the future
- Test with both regular Jest and BrowserStack SDK execution
```

### Refactoring Guidance
```
Refactor [component-name] to improve:
1. Code reusability and maintainability
2. Timeout handling consistency across all workers
3. BrowserStack integration patterns
4. Error handling and logging consistency
5. Following the architectural patterns established in the codebase
```

## 🎯 Specific Component Prompts

### WorkerManager Enhancements
```
Enhance WorkerManager to:
- Add new execution mode support with proper worker spawning
- Improve timeout enforcement across all spawn methods
- Add better error handling and recovery for failed workers
- Enhance BrowserStack build ID coordination
- Follow the existing patterns in spawnJestParallelWorker and spawnNativeParallelWorker
```

### Parser Improvements
```
Improve TestParser to:
- Handle more complex Jest test file structures
- Add support for additional Jest features (describe.each, test.each, etc.)
- Improve AST parsing for nested describe blocks
- Add better error handling for malformed test files
- Follow the existing parsing patterns and maintain compatibility
```

### Reporter Enhancements
```
Enhance ReportGenerator to:
- Add new visualization types for test metrics
- Improve HTML report styling and interactivity
- Add support for custom report templates
- Include BrowserStack-specific metrics and context
- Follow the existing report structure and styling patterns
```

## 🔄 Migration & Compatibility Prompts

### Jest Version Updates
```
Update jest-parallel-worker for Jest version [X.X.X]:
1. Check compatibility with new Jest CLI options
2. Update timeout parameter handling if Jest changed --testTimeout behavior
3. Verify BrowserStack SDK compatibility with new Jest version
4. Test all execution modes with the new Jest version
5. Update documentation and version requirements
```

### Node.js Compatibility
```
Ensure Node.js [version] compatibility for jest-parallel-worker:
- Update async/await patterns if needed
- Check child_process spawn behavior changes
- Verify timeout handling with new Node.js version
- Test worker process management and cleanup
- Update package.json engine requirements
```

## 📚 Documentation Prompts

### API Documentation
```
Generate comprehensive API documentation for:
- JestParallelSDK class and its methods
- WorkerManager configuration options and methods
- Available execution modes and their use cases
- BrowserStack integration setup and configuration
- Include code examples and best practices
```

### Troubleshooting Guide
```
Create a troubleshooting guide for common issues:
- Timeout problems and their solutions
- BrowserStack SDK setup and configuration issues
- Worker process failures and debugging steps
- Performance optimization recommendations
- Include specific log patterns to look for and their meanings
```

## 💡 Best Practices for Using These Prompts

1. **Context First**: Always provide relevant file names and current code context
2. **Specify Patterns**: Reference existing patterns and files to maintain consistency
3. **Include Testing**: Always ask for corresponding tests when adding new features
4. **Error Handling**: Ensure proper error handling and logging is included
5. **Documentation**: Update relevant documentation when making changes
6. **BrowserStack Awareness**: Consider BrowserStack compatibility in all worker-related changes
7. **Timeout Consistency**: Maintain timeout handling patterns across all components

## 🔍 Debugging Workflow Prompts

### Issue Investigation
```
Investigate [specific-issue] in jest-parallel-worker:
1. Check logs for timeout, worker, and BrowserStack related messages
2. Compare current behavior with main branch implementation
3. Verify timeout propagation from CLI -> WorkerManager -> Workers -> Jest
4. Test with minimal reproduction case
5. Add detailed logging to identify the root cause
```

### Performance Analysis
```
Analyze performance bottlenecks in [component-name]:
- Profile worker creation and cleanup times
- Monitor Jest execution duration vs user timeout
- Check memory usage patterns in long-running tests
- Compare BrowserStack vs regular Jest execution performance
- Identify optimization opportunities following existing patterns
```

These prompts are designed to work with the existing codebase architecture and patterns. Always review generated code for consistency with the established project patterns, especially around timeout handling, BrowserStack integration, and structured logging.
