# BrowserStack Integration Guide

This guide explains how to integrate jest-parallel-worker with BrowserStack Test Reporting to automatically push test results to your BrowserStack dashboard.

## Prerequisites

1. **BrowserStack Account**: You need an active BrowserStack account
2. **Credentials**: Your BrowserStack username and access key
3. **SDK Installation**: Install the BrowserStack Node SDK

```bash
npm install browserstack-node-sdk
```

## Configuration

### 1. Environment Variables

Set your BrowserStack credentials as environment variables:

```bash
export BROWSERSTACK_USERNAME="your_username"
export BROWSERSTACK_ACCESS_KEY="your_access_key"
```

### 2. BrowserStack Configuration File

Create a `browserstack.yml` file in your project root:

```yaml
userName: ${BROWSERSTACK_USERNAME}
accessKey: ${BROWSERSTACK_ACCESS_KEY}
buildName: ${BUILD_NAME:-Jest Parallel Build}
projectName: ${PROJECT_NAME:-Jest Parallel Project}

testReporting:
  enabled: true
  testRunName: ${TEST_RUN_NAME:-Jest Parallel Test Run}
  testRunTags: 
    - ${ENVIRONMENT:-development}
    - ${BRANCH:-main}
  networkLogs: true
  screenshots: true
```

## Usage

### Basic Usage

Enable BrowserStack reporting by adding the `--browserstack` flag:

```bash
jest-parallel run --browserstack
```

### Custom Build and Project Names

Specify custom build and project names:

```bash
jest-parallel run --browserstack --bs-build "Feature X Tests" --bs-project "My App"
```

### Complete Example

```bash
jest-parallel run \
  --testMatch "tests/**/*.test.js" \
  --mode native-parallel \
  --maxWorkers 4 \
  --browserstack \
  --bs-build "Release v1.2.3" \
  --bs-project "E-commerce App" \
  --verbose
```

## Integration Features

### Automatic Test Result Reporting

- ✅ **Test Status**: Passed, failed, skipped tests are automatically reported
- ✅ **Test Duration**: Individual test execution times
- ✅ **Error Details**: Full error messages and stack traces for failed tests
- ✅ **Test Metadata**: Test names, descriptions, and file paths

### Build Management

- ✅ **Build Creation**: Automatically creates a new build in BrowserStack
- ✅ **Build Finalization**: Marks builds as complete when tests finish
- ✅ **Build URLs**: Provides direct links to BrowserStack dashboard

### Batch Processing

- ✅ **Efficient Reporting**: Groups test results for optimized API calls
- ✅ **Real-time Updates**: Results are sent as tests complete
- ✅ **Error Handling**: Graceful fallback if BrowserStack is unavailable

## Configuration Options

### CLI Options

| Option | Description | Example |
|--------|-------------|---------|
| `--browserstack` | Enable BrowserStack integration | `--browserstack` |
| `--bs-build <name>` | Set build name | `--bs-build "Release 1.0"` |
| `--bs-project <name>` | Set project name | `--bs-project "My App"` |

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `BROWSERSTACK_USERNAME` | Your BrowserStack username | Yes |
| `BROWSERSTACK_ACCESS_KEY` | Your BrowserStack access key | Yes |
| `BUILD_NAME` | Default build name | No |
| `PROJECT_NAME` | Default project name | No |
| `BROWSERSTACK_ENABLED` | Enable/disable integration | No |

## Example Output

When BrowserStack integration is enabled, you'll see output like:

```
🌐 BrowserStack Test Reporting enabled
📦 Build: Feature X Tests
📁 Project: My App

🚀 Starting Jest Parallel Execution...

✅ Tests completed: 25/25 passed
⚡ Time saved: 1250ms (45.2%)
🌐 BrowserStack Dashboard: https://automate.browserstack.com/dashboard/v2/builds/abc123
```

## Troubleshooting

### Common Issues

1. **SDK Not Found**
   ```bash
   npm install browserstack-node-sdk
   ```

2. **Authentication Failed**
   - Verify your username and access key
   - Check environment variables are set correctly

3. **Build Creation Failed**
   - Ensure you have sufficient BrowserStack credits
   - Check your account permissions

### Debug Mode

Enable verbose logging to see detailed BrowserStack operations:

```bash
jest-parallel run --browserstack --verbose
```

## Advanced Usage

### Programmatic Integration

You can also use BrowserStack integration programmatically:

```javascript
const { JestParallelSDK } = require('jest-parallel-worker');

const config = {
  testMatch: ['tests/**/*.test.js'],
  browserstackEnabled: true,
  buildName: 'Automated Build',
  projectName: 'My Project'
};

const sdk = new JestParallelSDK(config);
const results = await sdk.run();

console.log('BrowserStack Dashboard:', results.browserstackBuildUrl);
```

### Custom Reporter

Include the BrowserStack reporter in your Jest configuration:

```javascript
// jest.config.js
module.exports = {
  reporters: [
    'default',
    ['./src/integrations/browserstack-reporter.js', {
      buildName: 'Custom Build',
      projectName: 'Custom Project'
    }]
  ]
};
```

## Best Practices

1. **Use Meaningful Names**: Choose descriptive build and project names
2. **Environment Variables**: Store credentials securely using environment variables
3. **CI/CD Integration**: Set different build names for different environments
4. **Error Handling**: Always check if BrowserStack integration is working correctly
5. **Resource Management**: Clean up builds and sessions properly

## Support

For issues related to BrowserStack integration:

1. Check the BrowserStack Node SDK documentation
2. Verify your account status and credits
3. Review the jest-parallel-worker logs with `--verbose` flag
4. Contact BrowserStack support for account-specific issues
