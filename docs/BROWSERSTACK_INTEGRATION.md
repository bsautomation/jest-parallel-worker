# 🌐 **BrowserStack Integration for Jest Parallel Worker**

Complete guide for running Jest Parallel Worker tests with BrowserStack cross-browser testing.

## 🚀 **Quick Start (Recommended)**

### **Primary Command: jest-parallel-browserstack**

```bash
# Install dependencies
npm install jest-parallel-worker browserstack-node-sdk --save-dev

# Set credentials
export BROWSERSTACK_USERNAME="your_username"
export BROWSERSTACK_ACCESS_KEY="your_access_key"

# Run tests (works exactly like browserstack-node-sdk)
npx jest-parallel-browserstack run --testMatch "tests/**/*.test.js" --timeout 10
```

**This is the recommended approach for external packages and production use.**

## 🔧 **Integration Methods**

### **🥇 Method 1: jest-parallel-browserstack (Primary - Recommended)**

Drop-in replacement for browserstack-node-sdk with Jest Parallel Worker:

```bash
# Basic usage (works exactly like browserstack-node-sdk)
npx jest-parallel-browserstack run --testMatch "tests/**/*.test.js"

# With advanced options
npx jest-parallel-browserstack run \
  --testMatch "tests/**/*.test.js" \
  --mode native-parallel \
  --timeout 15 \
  --maxWorkers 4 \
  --verbose

# Command equivalence:
# jest-parallel-browserstack [args] === browserstack-node-sdk node jest-parallel [args]
```

**Benefits:**
- ✅ **External Package Ready**: Perfect for npm/yarn installations
- ✅ **Familiar Workflow**: Same as browserstack-node-sdk usage
- ✅ **Automatic Detection**: Finds all required binaries automatically
- ✅ **Error Handling**: Helpful troubleshooting and setup guidance

### 2. Setup BrowserStack Configuration

Create a `browserstack.yml` file:

```yaml
userName: your_username
accessKey: your_access_key
buildName: Jest Parallel Worker Tests
projectName: My Web App
local: false

capabilities:
  - browserName: chrome
    browserVersion: latest
    os: Windows
    osVersion: 10
  - browserName: firefox
    browserVersion: latest
    os: Windows
    osVersion: 10
  - browserName: safari
    browserVersion: latest
    os: OS X
    osVersion: Big Sur
```

### 3. Usage Options

## 🔧 **Approach 1: CLI Wrapper (Recommended)**

Use the dedicated BrowserStack CLI wrapper:

```bash
# Basic usage
npx jest-parallel-browserstack run --testMatch 'tests/**/*.test.js' --mode native-parallel

# With custom BrowserStack options
npx jest-parallel-browserstack run \
  --testMatch 'tests/**/*.test.js' \
  --mode native-parallel \
  --maxWorkers 4 \
  --timeout 10 \
  --buildName "Feature Branch Tests" \
  --projectName "My App" \
  --local
```

## 🔧 **Approach 2: SDK Integration**

Use the SDK with BrowserStack methods:

```javascript
const { JestParallelSDK } = require('jest-parallel-worker');

// Method 1: Instance method
const sdk = new JestParallelSDK({
  testMatch: 'tests/**/*.test.js',
  mode: 'native-parallel',
  maxWorkers: 4
});

const results = await sdk.runWithBrowserStack({
  buildName: 'Feature Branch Tests',
  projectName: 'My App',
  local: true
});

// Method 2: Static method
const results = await JestParallelSDK.runTestsWithBrowserStack(
  // BrowserStack options
  {
    buildName: 'Main Branch Tests',
    projectName: 'My App',
    local: false
  },
  // Jest Parallel Worker options
  {
    testMatch: 'tests/**/*.test.js',
    mode: 'native-parallel',
    maxWorkers: 4,
    timeout: 600000 // 10 minutes
  }
);

console.log(`Tests completed: ${results.summary.passed}/${results.summary.totalTests} passed`);
```

## 🔧 **Approach 3: Manual BrowserStack SDK Wrapper**

Use browserstack-node-sdk directly:

```bash
# Install BrowserStack SDK
npm install browserstack-node-sdk --save-dev

# Method 1: Use the universal wrapper (recommended)
npx browserstack-node-sdk npx jest-parallel run --testMatch 'tests/**/*.test.js' --mode native-parallel

# Method 2: Use SDK integration via script (most reliable for external packages)
# Create browserstack-test.js (see troubleshooting section)
npx browserstack-node-sdk node browserstack-test.js
```

## 🔧 **Approach 4: Universal Wrapper (External Package Solution)**

For external package installations where binary path resolution is problematic:

```bash
# Use the universal wrapper that handles path resolution automatically
npx jest-parallel-bstack run --testMatch 'tests/**/*.test.js' --mode native-parallel --timeout 10

# With environment variables
BROWSERSTACK_USERNAME=your_username BROWSERSTACK_ACCESS_KEY=your_key \
npx jest-parallel-bstack run --testMatch 'tests/**/*.test.js' --mode native-parallel
```

## 🛠️ **Configuration Options**

### BrowserStack Options

| Option | Type | Description | Example |
|--------|------|-------------|---------|
| `buildName` | string | Build name for BrowserStack dashboard | `"Feature Branch Tests"` |
| `projectName` | string | Project name for organization | `"My Web App"` |
| `local` | boolean | Enable BrowserStack Local for testing localhost | `true` |
| `configPath` | string | Path to BrowserStack config file | `"./browserstack.yml"` |

### Environment Variables

You can also configure BrowserStack using environment variables:

```bash
export BROWSERSTACK_USERNAME="your_username"
export BROWSERSTACK_ACCESS_KEY="your_access_key"
export BROWSERSTACK_BUILD_NAME="Jest Parallel Worker Tests"
export BROWSERSTACK_PROJECT_NAME="My Web App"
export BROWSERSTACK_LOCAL="true"
```

## 📝 **Example Test File**

```javascript
// tests/cross-browser.test.js
const { Builder, By, until } = require('selenium-webdriver');

describe('Cross-browser testing with BrowserStack', () => {
  let driver;

  beforeAll(async () => {
    // BrowserStack capabilities are automatically configured
    const capabilities = {
      'browserName': process.env.BROWSERSTACK_BROWSER || 'chrome',
      'browserVersion': process.env.BROWSERSTACK_BROWSER_VERSION || 'latest',
      'os': process.env.BROWSERSTACK_OS || 'Windows',
      'osVersion': process.env.BROWSERSTACK_OS_VERSION || '10',
      'browserstack.user': process.env.BROWSERSTACK_USERNAME,
      'browserstack.key': process.env.BROWSERSTACK_ACCESS_KEY,
      'name': 'Jest Parallel Worker Test'
    };

    driver = new Builder()
      .usingServer('https://hub-cloud.browserstack.com/wd/hub')
      .withCapabilities(capabilities)
      .build();
  });

  afterAll(async () => {
    if (driver) {
      await driver.quit();
    }
  });

  test('should load homepage correctly', async () => {
    await driver.get('https://example.com');
    const title = await driver.getTitle();
    expect(title).toContain('Example');
  });

  test('should handle form submission', async () => {
    await driver.get('https://example.com/contact');
    
    const nameField = await driver.findElement(By.name('name'));
    await nameField.sendKeys('Test User');
    
    const submitButton = await driver.findElement(By.css('input[type="submit"]'));
    await submitButton.click();
    
    await driver.wait(until.elementLocated(By.css('.success-message')), 5000);
    const successMessage = await driver.findElement(By.css('.success-message'));
    const messageText = await successMessage.getText();
    expect(messageText).toContain('Thank you');
  });
});
```

## 🔄 **Integration Comparison**

| Approach | Pros | Cons | Best For |
|----------|------|------|----------|
| **CLI Wrapper** | ✅ Simple to use<br>✅ Drop-in replacement<br>✅ Auto-detects BrowserStack SDK | ❌ Additional CLI to learn | Most users |
| **SDK Integration** | ✅ Programmatic control<br>✅ Advanced customization<br>✅ Type safety | ❌ More code required | Advanced users |
| **Manual Wrapper** | ✅ Full BrowserStack SDK features<br>✅ Maximum compatibility | ❌ Verbose commands<br>❌ Manual setup | Special cases |

## 🚧 **Limitations & Considerations**

1. **BrowserStack SDK Required**: For full integration, install `browserstack-node-sdk`
2. **Version Compatibility**: Compatible with BrowserStack SDK v1.30.0+, future versions automatically supported
3. **Environment Setup**: Ensure BrowserStack credentials are properly configured
4. **Network Access**: BrowserStack Local may be required for localhost testing
5. **Timeouts**: Increase timeout values for cross-browser testing (use `--timeout 15` for 15 minutes)
6. **Parallel Limits**: BrowserStack account limits may affect parallel execution

## 🔄 **Future Compatibility**

Jest Parallel Worker's BrowserStack integration is designed to be **future-proof**:

- ✅ **Automatic Version Detection**: Detects BrowserStack SDK version at runtime
- ✅ **Forward Compatibility**: New BrowserStack SDK versions are supported by default
- ✅ **Graceful Degradation**: Falls back to direct execution if SDK is unavailable
- ✅ **Path Resolution**: Robust binary path detection across different installation scenarios
- ✅ **Extensible Architecture**: Easy to add support for new BrowserStack features

### Version Support Matrix

| BrowserStack SDK Version | Jest Parallel Worker Compatibility | Notes |
|---------------------------|-------------------------------------|-------|
| v1.30.0 - v1.40.x | ✅ Fully Supported | Tested and verified |
| v1.41.0+ | ✅ Auto-Compatible | Future versions supported by design |
| v2.x.x | ✅ Forward Compatible | Major version changes handled gracefully |
| < v1.30.0 | ⚠️ Limited Support | May work but not recommended |

## 🔧 **Troubleshooting**

### Common Issues

1. **"browserstack-node-sdk not found"**
   ```bash
   npm install browserstack-node-sdk --save-dev
   ```

2. **"File jest-parallel.js doesn't exist"**
   ```bash
   # Solution 1: Ensure jest-parallel-worker is properly installed
   npm install jest-parallel-worker --save-dev
   
   # Solution 2: Use the universal wrapper (recommended for external packages)
   npx jest-parallel-bstack run --testMatch 'tests/**/*.test.js' --mode native-parallel
   
   # Solution 3: Use SDK integration (most reliable)
   # Create a script file instead of direct CLI usage
   ```
   
   **For external package usage, create a script:**
   ```javascript
   // browserstack-test.js
   const { JestParallelSDK } = require('jest-parallel-worker');
   
   async function runTests() {
     const results = await JestParallelSDK.runTestsWithBrowserStack(
       {
         buildName: 'CI Tests',
         projectName: 'My App',
         local: false
       },
       {
         testMatch: 'tests/**/*.test.js',
         mode: 'native-parallel',
         maxWorkers: 4
       }
     );
     
     console.log(`Tests completed: ${results.summary.passed}/${results.summary.totalTests} passed`);
     process.exit(results.summary.failed > 0 ? 1 : 0);
   }
   
   runTests().catch(console.error);
   ```
   
   Then run: `npx browserstack-node-sdk node browserstack-test.js`

3. **Authentication errors**
   ```bash
   export BROWSERSTACK_USERNAME="your_username"
   export BROWSERSTACK_ACCESS_KEY="your_access_key"
   ```

4. **Version compatibility warnings**
   ```bash
   # Update to latest BrowserStack SDK
   npm update browserstack-node-sdk
   ```

5. **Timeout issues**
   ```bash
   npx jest-parallel-browserstack run --timeout 15 --testMatch 'tests/**/*.test.js'
   ```

6. **Local testing not working**
   ```bash
   npx jest-parallel-browserstack run --local --testMatch 'tests/**/*.test.js'
   ```

### Debug Mode

Enable verbose logging:

```bash
npx jest-parallel-browserstack run --verbose --testMatch 'tests/**/*.test.js'
```

## 📚 **Additional Resources**

- [BrowserStack Node SDK Documentation](https://github.com/browserstack/browserstack-node-sdk)
- [BrowserStack Selenium WebDriver Guide](https://www.browserstack.com/docs/automate/selenium)
- [Jest Parallel Worker Documentation](README.md)
