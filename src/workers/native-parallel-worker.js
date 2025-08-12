// Worker that runs tests in parallel without rewriting files
// Uses Jest's native capabilities for parallel execution
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');

// Function to log Jest output to file instead of console
function logJestOutput(message) {
  const logFile = path.join(process.cwd(), 'logs', 'jest-parallel-worker.log');
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}\n`;
  
  try {
    // Ensure logs directory exists
    const logDir = path.dirname(logFile);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    
    // Append to log file
    fs.appendFileSync(logFile, logMessage);
  } catch (error) {
    // Fallback to console if file logging fails
    console.error(`Failed to write to log file: ${error.message}`);
  }
}

// Function to detect existing Jest configuration files
function findJestConfig() {
  const configFiles = [
    'jest.config.js',
    'jest.config.ts',
    'jest.config.mjs',
    'jest.config.cjs',
    'jest.config.json',
    'jest.json'
  ];
  
  // Check for Jest config files in project root
  for (const configFile of configFiles) {
    const configPath = path.join(process.cwd(), configFile);
    if (fs.existsSync(configPath)) {
      console.log(`📋 Found Jest config: ${configFile}`);
      return configPath;
    }
  }
  
  // Check for Jest config in package.json
  try {
    const packageJsonPath = path.join(process.cwd(), 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      if (packageJson.jest) {
        console.log(`📋 Found Jest config in package.json`);
        return null; // Jest will automatically use package.json config
      }
    }
  } catch (error) {
    console.warn(`⚠️ Error reading package.json: ${error.message}`);
  }
  
  console.log(`📋 No Jest config found, using Jest defaults with minimal overrides`);
  return null;
}

// Function to create a minimal fallback Jest config when needed
function createFallbackJestConfig() {
  const fallbackConfigPath = path.join(process.cwd(), 'jest.config.fallback.json');
  
  // Only create if it doesn't exist
  if (!fs.existsSync(fallbackConfigPath)) {
    const fallbackConfig = {
      testEnvironment: 'node',
      moduleFileExtensions: ['js', 'json', 'node'],
      testRunner: 'jest-circus/runner',
      verbose: true,
      forceExit: true,
      detectOpenHandles: true,
      // More aggressive cleanup settings
      maxWorkers: 1, // Run with single worker to avoid handle conflicts
      resetMocks: true,
      resetModules: true,
      restoreMocks: true,
      clearMocks: true,
      // Prevent loading any setup files that might import BrowserStack helpers
      setupFiles: [],
      setupFilesAfterEnv: [],
      testMatch: [
        '**/__tests__/**/*.(js|jsx)',
        '**/*.(test|spec).(js|jsx)'
      ],
      // Avoid any transformations that might cause issues
      transform: {},
      // Set timeout for aggressive cleanup
      testTimeout: 10000
    };
    
    try {
      fs.writeFileSync(fallbackConfigPath, JSON.stringify(fallbackConfig, null, 2));
      console.log(`📋 Created fallback Jest config: jest.config.fallback.json`);
      
      // Also create a minimal mock for problematic modules
      createMockSetupFile();
    } catch (error) {
      console.warn(`⚠️ Could not create fallback config: ${error.message}`);
      return null;
    }
  }
  
  return fallbackConfigPath;
}

// Function to create a mock setup file that prevents problematic module loading
function createMockSetupFile() {
  const mockSetupPath = path.join(process.cwd(), 'jest.mock-setup.js');
  
  if (!fs.existsSync(mockSetupPath)) {
    const mockSetupContent = `
// Jest mock setup to prevent problematic modules from loading
// This file prevents modules that create open handles from being loaded

// Mock bstackautomation-helpers to prevent UDPWRAP handles
jest.mock('bstackautomation-helpers', () => ({
  constants: {},
  helpers: {}
}));

// Mock hoothoot to prevent network handles
jest.mock('hoothoot', () => ({}));

// Mock any other modules that might create handles
jest.mock('browserstack-node-sdk/src/bin/utils/logReportingAPI', () => ({}));

console.log('✅ Problematic modules mocked to prevent open handles');
`;
    
    try {
      fs.writeFileSync(mockSetupPath, mockSetupContent);
      console.log(`📋 Created mock setup file: jest.mock-setup.js`);
    } catch (error) {
      console.warn(`⚠️ Could not create mock setup file: ${error.message}`);
    }
  }
}

async function runTestsNatively(config) {
  const startTime = Date.now();
  
  try {
    // Determine the execution strategy based on config
    if (config.strategy === 'enhanced-file-parallelism') {
      // Run file with Jest's internal parallelism for intra-file parallelism
      return await runFileWithMaxParallelism(config, startTime);
    } else if (config.strategy === 'individual-tests' && config.testNames && config.testNames.length > 0) {
      // Run individual tests using Jest's testNamePattern (legacy approach)
      return await runIndividualTests(config, startTime);
    } else {
      // Run entire file with Jest's parallel capabilities
      return await runFileWithParallelism(config, startTime);
    }
  } catch (error) {
    return {
      status: 'failed',
      testResults: [{
        testId: `${config.filePath}:error`,
        testName: 'Execution Error',
        status: 'failed',
        duration: Date.now() - startTime,
        error: error.message,
        workerId: config.workerId,
        filePath: config.filePath
      }],
      error: error.message,
      workerId: config.workerId,
      filePath: config.filePath
    };
  }
}

async function runIndividualTests(config, startTime) {
  // Run specific tests using Jest's testNamePattern
  const results = [];
  
  for (const testName of config.testNames) {
    const testResult = await runSingleTest(config, testName, startTime);
    results.push(...testResult.testResults);
  }
  
  return {
    status: results.every(r => r.status === 'passed') ? 'passed' : 'failed',
    testResults: results,
    duration: Date.now() - startTime,
    workerId: config.workerId,
    filePath: config.filePath
  };
}

async function runIndividualTests(config, startTime) {
  // For intra-file parallelism with proper beforeAll/afterAll handling,
  // we need to run the file in a way that respects Jest's lifecycle hooks
  // but still achieves parallelism across different test files
  
  // The better approach is to run each test file in its own Jest process
  // but use Jest's internal parallelism for tests within the file
  // This is actually what the runFileWithParallelism function does
  
  // Redirect to file-level execution with Jest's internal parallelism
  return await runFileWithMaxParallelism(config, startTime);
}

async function runFileWithMaxParallelism(config, startTime) {
  // IMPORTANT NOTE: Jest's test.concurrent() has a limitation where concurrent tests
  // may start before beforeAll() completes, breaking the expected hook semantics.
  // For now, we fall back to standard file execution which preserves hook behavior
  // but limits intra-file parallelism to what the test file explicitly defines.
  
  // TODO: Implement proper intra-file parallelism that respects beforeAll/afterAll
  // This would require either:
  // 1. Custom Jest test runner that handles concurrent execution with proper hook sequencing
  // 2. Transform tests to use a custom parallel execution framework
  // 3. Use Jest's worker_threads API directly
  
  return await runFileWithParallelism(config, startTime);
}

async function runFileWithConcurrentTransformation(config, startTime) {
  const fs = require('fs').promises;
  const path = require('path');
  const os = require('os');
  
  return new Promise(async (resolve, reject) => {
    let tempFilePath = null;
    
    try {
      // Read the original test file
      const originalContent = await fs.readFile(config.filePath, 'utf8');
      
      // Transform regular test() calls to test.concurrent() calls
      const transformedContent = transformTestsToConcurrent(originalContent);
      
      // Create a temporary file with the transformed content
      const tempDir = path.join(process.cwd(), 'tests'); // Use tests directory
      const fileName = path.basename(config.filePath);
      const tempFileName = `jest-parallel-${Date.now()}-${Math.random().toString(36).substr(2, 9)}-${fileName}`;
      tempFilePath = path.join(tempDir, tempFileName);
      
      await fs.writeFile(tempFilePath, transformedContent, 'utf8');
      
      // Calculate optimal concurrency for this file
      const testCount = config.testCount || 4;
      const maxConcurrency = Math.min(
        testCount, // One concurrent test per test if possible
        config.maxWorkers || 4, // Don't exceed configured max
        require('os').cpus().length // Don't exceed CPU cores
      );
      
      // Enhanced logging for Jest directory and file discovery
      console.log(`🔍 Jest Concurrent Configuration Debug:`);
      console.log(`   - Target file: ${config.filePath}`);
      console.log(`   - Temp file: ${tempFilePath}`);
      console.log(`   - Resolved temp path: ${path.resolve(tempFilePath)}`);
      console.log(`   - Current working directory: ${process.cwd()}`);
      console.log(`   - Temp file exists: ${require('fs').existsSync(tempFilePath)}`);
      console.log(`   - Resolved temp file exists: ${require('fs').existsSync(path.resolve(tempFilePath))}`);
      
      // Detect and use existing Jest configuration
      let jestConfigPath = findJestConfig();
      
      // If no user config found, create a minimal fallback
      if (!jestConfigPath) {
        jestConfigPath = createFallbackJestConfig();
      }
      
      const jestArgs = [
        // Use absolute path to the temporary file
        path.resolve(tempFilePath),
        // Use detected or fallback Jest configuration
        ...(jestConfigPath ? ['--config', jestConfigPath] : []),
        '--verbose',
        '--no-coverage',
        '--passWithNoTests', // Allow exiting with code 0 when no tests found
        '--forceExit',
        '--detectOpenHandles',
        '--maxConcurrency', maxConcurrency.toString(),
        // Ensure Jest looks in the correct directory
        '--rootDir', process.cwd(),
        // Add more specific patterns for the target file
        '--testPathPattern', path.basename(tempFilePath),
        // Disable cache to avoid stale issues
        '--no-cache'
      ];
      
      console.log(`🚀 Jest concurrent command args: ${jestArgs.join(' ')}`);
      console.log(`📂 Working directory: ${process.cwd()}`);
      console.log(`🎯 Target temp file basename: ${path.basename(tempFilePath)}`);
      console.log(`📁 Target temp file directory: ${path.dirname(tempFilePath)}`);
      
      // Check if BrowserStack integration is enabled for concurrent execution
      const browserstackEnabled = process.env.BROWSERSTACK_SDK_ENABLED === 'true' || config.browserstackSdk;
      let command = 'npx';
      let commandArgs = ['jest', ...jestArgs];
      
      // If BrowserStack is enabled, try to use browserstack-node-sdk
      if (browserstackEnabled) {
        try {
          // Check if browserstack-node-sdk is available
          require.resolve('browserstack-node-sdk');
          
          // Use browserstack-node-sdk to run Jest
          command = 'npx';
          commandArgs = ['browserstack-node-sdk', 'jest', ...jestArgs];
          
          console.log(`🌐 Running concurrent tests with BrowserStack Node SDK for file: ${path.basename(config.filePath)}`);
        } catch (error) {
          console.warn(`⚠️ BrowserStack enabled but browserstack-node-sdk not found, falling back to regular Jest execution`);
          // Keep original jest execution
        }
      }
      
      const worker = spawn(command, commandArgs, {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { 
          ...process.env,
          NODE_OPTIONS: '--max-old-space-size=4096',
          // Pass BrowserStack configuration to the test environment
          ...(browserstackEnabled && {
            BROWSERSTACK_BUILD_NAME: process.env.BUILD_NAME || config.buildName || 'Jest Parallel Build',
            BROWSERSTACK_PROJECT_NAME: process.env.PROJECT_NAME || config.projectName || 'Jest Parallel Tests',
            BROWSERSTACK_BUILD_ID: process.env.BROWSERSTACK_BUILD_ID,
          })
        },
        cwd: process.cwd()
      });
      
      let output = '';
      let errorOutput = '';
      let hasResolved = false;
      
      worker.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      worker.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });
      
      const handleExit = async (code) => {
        if (hasResolved) return;
        hasResolved = true;
        
        console.log(`📊 Jest concurrent execution completed with exit code: ${code}`);
        console.log(`📏 Output length: ${output.length} characters`);
        console.log(`📏 Error output length: ${errorOutput.length} characters`);
        
        // Clean up the temporary file
        try {
          if (tempFilePath) {
            await fs.unlink(tempFilePath);
            console.log(`🗑️ Cleaned up temporary file: ${tempFilePath}`);
          }
        } catch (cleanupError) {
          console.warn(`⚠️ Failed to cleanup temp file: ${cleanupError.message}`);
        }
        
        // Log first and last 200 chars of output for debugging (to log file only)
        if (output.length > 0) {
          logJestOutput(`📤 Concurrent output start: ${output.substring(0, 200)}...`);
          logJestOutput(`📤 Concurrent output end: ...${output.substring(Math.max(0, output.length - 200))}`);
        }
        
        if (errorOutput.length > 0) {
          logJestOutput(`📤 Concurrent error output start: ${errorOutput.substring(0, 200)}...`);
          logJestOutput(`📤 Concurrent error output end: ...${errorOutput.substring(Math.max(0, errorOutput.length - 200))}`);
        }
        
        // Special handling for BrowserStack SDK output in concurrent mode
        if (browserstackEnabled) {
          console.log(`🌐 BrowserStack SDK concurrent mode detected, parsing output...`);
          
          // Check if BrowserStack had configuration issues
          if (output.includes('Cannot read properties of null') || 
              output.includes('Cannot convert undefined or null to object') ||
              errorOutput.includes('Cannot read properties of null') ||
              errorOutput.includes('Cannot convert undefined or null to object') ||
              output.includes('TypeError:') || 
              errorOutput.includes('TypeError:') ||
              output.includes('No tests found, exiting with code 1') ||
              output.includes('No files found in /') ||
              output.includes("Make sure Jest's configuration does not exclude this directory") ||
              output.includes('SDK run started with id:') && code !== 0) {
            
            let errorMessage = 'BrowserStack SDK configuration error in concurrent mode. Common issues:\n' +
                             '1. BROWSERSTACK_USERNAME and BROWSERSTACK_ACCESS_KEY environment variables missing or invalid\n' +
                             '2. browserstack.yml configuration file missing or misconfigured\n' +
                             '3. BrowserStack Node SDK version compatibility issues\n' +
                             '4. Jest working directory or file path resolution problems\n' +
                             '5. Object property access errors in SDK setup (TypeError: Cannot convert undefined or null to object)';
            
            if (output.includes('Cannot convert undefined or null to object') || errorOutput.includes('Cannot convert undefined or null to object')) {
              errorMessage = 'BrowserStack SDK internal error: Cannot convert undefined or null to object.\n' +
                            'This is a known issue with BrowserStack Node SDK when configuration is incomplete.\n' +
                            'Solutions:\n' +
                            '1. Verify BROWSERSTACK_USERNAME and BROWSERSTACK_ACCESS_KEY are set correctly\n' +
                            '2. Ensure browserstack.yml exists and is properly formatted\n' +
                            '3. Consider downgrading BrowserStack Node SDK to v1.39.0 (known stable version)\n' +
                            '4. Run tests without --browserstack-sdk flag for local execution';
            }
            
            if (output.includes('No tests found') || output.includes('No files found')) {
              errorMessage = 'BrowserStack SDK Jest configuration error in concurrent mode. Jest cannot find test files.\n' +
                            'This may be due to:\n' +
                            '1. Incorrect working directory in BrowserStack execution context\n' +
                            '2. Jest configuration excluding test files when run through BrowserStack SDK\n' +
                            '3. Missing package.json in the target directory\n' +
                            '4. TestMatch patterns not matching any files in rootDir\n' +
                            '5. BrowserStack SDK changing the execution context or file paths';
            }
            
            console.log(`🚨 BrowserStack concurrent configuration error detected`);
            
            resolve({
              status: 'failed',
              testResults: [],
              output: `${errorMessage}\n\nOriginal output:\n${output}`,
              errorOutput,
              duration: Date.now() - startTime,
              workerId: config.workerId,
              filePath: config.filePath,
              exitCode: code,
              strategy: 'enhanced-file-parallelism-concurrent-browserstack-error',
              error: 'BrowserStack SDK configuration error',
              tempFile: tempFilePath
            });
            return;
          }
        }
        
        // Debug output to understand what happened
        if (code !== 0) {
          console.error('Jest concurrent execution failed with code:', code);
          console.error('Error output sample:', errorOutput.substring(0, 500));
          console.error('Standard output sample:', output.substring(0, 500));
        }
        
        console.log(`🔍 Parsing Jest concurrent output...`);
        
        try {
          const parseResult = parseJestOutput(errorOutput, config);
          const testResults = parseResult.testResults || parseResult; // Handle both old and new return formats
          const hookInfo = parseResult.hookInfo || {};
          
          console.log(`✅ Parsed ${testResults.length} concurrent test results`);
          
          resolve({
            status: code === 0 ? 'passed' : 'failed',
            testResults,
            output,
            errorOutput,
            duration: Date.now() - startTime,
            workerId: config.workerId,
            filePath: config.filePath,
            exitCode: code,
            strategy: 'enhanced-file-parallelism-concurrent',
            concurrency: maxConcurrency,
            tempFile: tempFilePath,
            hookInfo: hookInfo
          });
        } catch (parseError) {
          console.error(`❌ Error parsing Jest concurrent output: ${parseError.message}`);
          console.error(`📊 Concurrent parse error stack: ${parseError.stack}`);
          
          // Return a safe result even if parsing fails
          resolve({
            status: code === 0 ? 'passed' : 'failed',
            testResults: [],
            output,
            errorOutput,
            duration: Date.now() - startTime,
            workerId: config.workerId,
            filePath: config.filePath,
            exitCode: code,
            strategy: 'enhanced-file-parallelism-concurrent-parse-error',
            concurrency: maxConcurrency,
            tempFile: tempFilePath,
            error: `Concurrent output parsing failed: ${parseError.message}`
          });
        }
      };
      
      worker.on('close', handleExit);
      worker.on('exit', handleExit);
      
      worker.on('error', async (error) => {
        if (hasResolved) return;
        hasResolved = true;
        
        // Clean up the temporary file
        try {
          if (tempFilePath) {
            await fs.unlink(tempFilePath);
          }
        } catch (cleanupError) {
          // Ignore cleanup errors
        }
        
        reject(error);
      });
      
      // Set timeout
      const timeout = config.timeout || 25000;
      setTimeout(async () => {
        if (!worker.killed && !hasResolved) {
          worker.kill('SIGTERM');
          setTimeout(async () => {
            if (!worker.killed && !hasResolved) {
              hasResolved = true;
              worker.kill('SIGKILL');
              
              // Clean up the temporary file
              try {
                if (tempFilePath) {
                  await fs.unlink(tempFilePath);
                }
              } catch (cleanupError) {
                // Ignore cleanup errors
              }
              
              reject(new Error('Test execution timeout'));
            }
          }, 2000);
        }
      }, timeout);
      
    } catch (error) {
      // Clean up the temporary file in case of error
      try {
        if (tempFilePath) {
          await fs.unlink(tempFilePath);
        }
      } catch (cleanupError) {
        // Ignore cleanup errors
      }
      
      reject(error);
    }
  });
}

function transformTestsToConcurrent(content) {
  // Transform regular test() and it() calls to test.concurrent() and it.concurrent()
  // This regex handles various whitespace and formatting scenarios
  
  let transformed = content;
  
  // Transform test() calls
  transformed = transformed.replace(
    /(\s*)(test|it)\s*\(\s*(['"`][^'"`]*['"`]\s*,\s*)/g,
    '$1$2.concurrent($3'
  );
  
  // Handle cases where test() is already concurrent (avoid double transformation)
  transformed = transformed.replace(
    /(test|it)\.concurrent\.concurrent\(/g,
    '$1.concurrent('
  );
  
  // Add a comment to indicate transformation
  const header = `// This file has been automatically transformed by jest-parallel-worker for intra-file parallelism\n// Original file: ${arguments[1] || 'unknown'}\n// All test() and it() calls have been converted to test.concurrent() and it.concurrent()\n\n`;
  
  return header + transformed;
}

async function runTestsInParallel(config, startTime) {
  // This function is no longer used with the concurrent transformation approach
  // but kept for backwards compatibility
  return await runFileWithConcurrentTransformation(config, startTime);
}

async function runSingleTestOptimized(config, startTime) {
  // This function is no longer used with the concurrent transformation approach
  // but kept for backwards compatibility
  return await runFileWithParallelism(config, startTime);
}

// Helper function to escape regex special characters
function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function runFileWithParallelism(config, startTime) {
  return new Promise((resolve, reject) => {
    // Calculate optimal worker count for this file
    const testCount = config.testCount || 4; // Default assumption
    const maxWorkersForFile = Math.min(
      Math.max(2, Math.ceil(testCount / 2)), // At least 2, but scale with test count
      config.maxWorkers || 4 // Don't exceed configured max
    );
    
    // Enhanced logging for Jest directory and file discovery
    console.log(`🔍 Jest Configuration Debug:`);
    console.log(`   - Target file: ${config.filePath}`);
    console.log(`   - Resolved path: ${path.resolve(config.filePath)}`);
    console.log(`   - Current working directory: ${process.cwd()}`);
    console.log(`   - File exists: ${require('fs').existsSync(config.filePath)}`);
    console.log(`   - Resolved file exists: ${require('fs').existsSync(path.resolve(config.filePath))}`);
    
    // Detect and use existing Jest configuration
    let jestConfigPath = findJestConfig();
    
    // If no user config found, create a minimal fallback
    if (!jestConfigPath) {
      jestConfigPath = createFallbackJestConfig();
    }
    
    const jestArgs = [
      // Use the full absolute file path for more reliable test discovery
      path.resolve(config.filePath),
      // Use detected or fallback Jest configuration
      ...(jestConfigPath ? ['--config', jestConfigPath] : []),
      '--verbose',
      '--no-coverage',
      '--passWithNoTests', // Allow exiting with code 0 when no tests found
      '--forceExit',
      '--detectOpenHandles',
      '--maxWorkers', '1', // Single worker to avoid handle conflicts
      // Override testMatch to include any test files regardless of location
      '--testMatch', '**/*.test.js',
      '--testMatch', '**/*.spec.js',
      // Ensure Jest looks in the correct directory
      '--rootDir', process.cwd(),
      // Add more specific patterns for the target file
      '--testPathPattern', path.basename(config.filePath),
      // Disable cache to avoid stale issues
      '--no-cache'
    ];
    
    console.log(`🚀 Jest command args: ${jestArgs.join(' ')}`);
    console.log(`📂 Working directory: ${process.cwd()}`);
    console.log(`🎯 Target file basename: ${path.basename(config.filePath)}`);
    console.log(`📁 Target file directory: ${path.dirname(config.filePath)}`);
    
    // Check if BrowserStack integration is enabled
    const browserstackEnabled = process.env.BROWSERSTACK_SDK_ENABLED === 'true' || config.browserstackSdk;
    let command = 'npx';
    let commandArgs = ['jest', ...jestArgs];
    
    // If BrowserStack is enabled, create a safer execution environment
    if (browserstackEnabled) {
      try {
        // Check if browserstack-node-sdk is available
        require.resolve('browserstack-node-sdk');
        
        console.log(`🌐 BrowserStack SDK detected, preparing safe execution environment...`);
        
        // Create a BrowserStack-safe configuration by ensuring proper environment setup
        const browserstackSafeEnv = {
          ...process.env,
          // Ensure required BrowserStack environment variables are properly set
          BROWSERSTACK_USERNAME: process.env.BROWSERSTACK_USERNAME || '',
          BROWSERSTACK_ACCESS_KEY: process.env.BROWSERSTACK_ACCESS_KEY || '',
          // Disable BrowserStack SDK's automatic Jest configuration injection
          BROWSERSTACK_SDK_DEBUG: 'false',
          // Set proper Node options to avoid memory issues
          NODE_OPTIONS: '--max-old-space-size=4096 --no-warnings',
          // Ensure clean Jest environment
          NODE_ENV: 'test'
        };
        
        // Only use BrowserStack SDK if environment variables are properly configured
        if (browserstackSafeEnv.BROWSERSTACK_USERNAME && browserstackSafeEnv.BROWSERSTACK_ACCESS_KEY) {
          // Use browserstack-node-sdk to run Jest with safe environment
          command = 'npx';
          commandArgs = ['browserstack-node-sdk', 'jest', ...jestArgs];
          
          console.log(`🌐 Running tests with BrowserStack Node SDK for file: ${path.basename(config.filePath)}`);
        } else {
          console.warn(`⚠️ BrowserStack environment variables not configured, falling back to regular Jest execution`);
          browserstackEnabled = false; // Disable BrowserStack for this execution
        }
        
      } catch (error) {
        console.warn(`⚠️ BrowserStack enabled but browserstack-node-sdk not found or has errors: ${error.message}`);
        console.warn(`⚠️ Falling back to regular Jest execution`);
        browserstackEnabled = false; // Disable BrowserStack for this execution
      }
    }
    
    const worker = spawn(command, commandArgs, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: browserstackEnabled ? {
        ...process.env,
        NODE_OPTIONS: '--max-old-space-size=4096 --no-warnings',
        BROWSERSTACK_BUILD_NAME: process.env.BUILD_NAME || config.buildName || 'Jest Parallel Build',
        BROWSERSTACK_PROJECT_NAME: process.env.PROJECT_NAME || config.projectName || 'Jest Parallel Tests',
        BROWSERSTACK_BUILD_ID: process.env.BROWSERSTACK_BUILD_ID,
        // Ensure BrowserStack SDK doesn't interfere with Jest's configuration
        BROWSERSTACK_SDK_DEBUG: 'false',
        NODE_ENV: 'test',
        // Force aggressive cleanup for BrowserStack helpers
        FORCE_COLOR: '0', // Disable colors to reduce handle usage
        CI: 'true' // Make external libs think we're in CI for cleaner behavior
      } : { 
        ...process.env,
        NODE_OPTIONS: '--max-old-space-size=4096 --no-warnings',
        NODE_ENV: 'test',
        // Force aggressive cleanup for external dependencies
        FORCE_COLOR: '0', // Disable colors to reduce handle usage
        CI: 'true', // Make external libs think we're in CI for cleaner behavior
        // Disable any potential network-related features
        NO_UPDATE_NOTIFIER: '1'
      },
      cwd: process.cwd()
    });
    
    let output = '';
    let errorOutput = '';
    let hasResolved = false;
    
    worker.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    worker.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });
    
    const handleExit = (code) => {
      if (hasResolved) return;
      hasResolved = true;
      
      console.log(`📊 Jest execution completed with exit code: ${code}`);
      console.log(`📏 Output length: ${output.length} characters`);
      console.log(`📏 Error output length: ${errorOutput.length} characters`);
      
      // Log first and last 200 chars of output for debugging (to log file only)
      if (output.length > 0) {
        logJestOutput(`📤 Output start: ${output}...`);
        logJestOutput(`📤 Output end: ...${output}`);
      }
      
      if (errorOutput.length > 0) {
        logJestOutput(`📤 Error output start: ${errorOutput}...`);
        logJestOutput(`📤 Error output end: ...${errorOutput}`);
      }
      
      // Handle open handle warnings specifically
      if (output.includes('open handle potentially keeping Jest from exiting') || 
          errorOutput.includes('open handle potentially keeping Jest from exiting')) {
        console.warn(`⚠️ Detected open handles - this is likely from external dependencies like BrowserStack helpers`);
        logJestOutput(`🔧 Open handle detected: ${output.includes('UDPWRAP') ? 'UDPWRAP (network connection)' : 'unknown type'}`);
        
        // Extract the specific module causing the issue
        const handleMatch = (output + errorOutput).match(/at Object\.<anonymous> \(([^)]+)\)/);
        if (handleMatch) {
          const problematicModule = handleMatch[1];
          console.warn(`⚠️ Open handle caused by module: ${problematicModule}`);
          logJestOutput(`🔧 Problematic module: ${problematicModule}`);
        }
      }
      
      // Special handling for BrowserStack SDK output
      let processedOutput = output;
      let processedErrorOutput = errorOutput;
      
      if (browserstackEnabled) {
        console.log(`🌐 BrowserStack SDK mode detected, parsing output...`);
        
        // BrowserStack SDK adds colored logs that can interfere with Jest output parsing
        // Try to extract clean Jest output from the mixed output
        try {
          // Look for JSON result in the output
          const jsonMatch = output.match(/(\{"status":"[^"]+","testResults":\[.*?\].*?\})/);
          if (jsonMatch) {
            console.log(`✅ Found BrowserStack JSON result in output`);
            const jsonResult = JSON.parse(jsonMatch[1]);
            // If we found valid JSON output, use it directly
            resolve({
              ...jsonResult,
              duration: Date.now() - startTime,
              workerId: config.workerId,
              filePath: config.filePath,
              exitCode: code,
              strategy: 'file-parallelism-browserstack',
              jestWorkers: maxWorkersForFile,
              browserstackOutput: output
            });
            return;
          } else {
            console.log(`❌ No valid JSON result found in BrowserStack output`);
          }
        } catch (jsonError) {
          console.warn('⚠️ Failed to parse BrowserStack output JSON:', jsonError.message);
        }
        
        // If JSON parsing failed, check if BrowserStack had configuration issues
        if (output.includes('Cannot read properties of null') || 
            output.includes('Cannot convert undefined or null to object') ||
            errorOutput.includes('Cannot read properties of null') ||
            errorOutput.includes('Cannot convert undefined or null to object') ||
            output.includes('TypeError:') || 
            errorOutput.includes('TypeError:') ||
            output.includes('No tests found, exiting with code 1') ||
            output.includes('No files found in /') ||
            output.includes("Make sure Jest's configuration does not exclude this directory") ||
            output.includes('SDK run started with id:') && code !== 0) {
          
          let errorMessage = 'BrowserStack SDK configuration error detected. Common issues:\n' +
                           '1. BROWSERSTACK_USERNAME and BROWSERSTACK_ACCESS_KEY environment variables missing or invalid\n' +
                           '2. browserstack.yml configuration file missing or misconfigured\n' +
                           '3. BrowserStack Node SDK version compatibility issues\n' +
                           '4. Jest working directory or file path resolution problems\n' +
                           '5. Object property access errors in SDK setup (TypeError: Cannot convert undefined or null to object)';
          
          if (output.includes('Cannot convert undefined or null to object') || errorOutput.includes('Cannot convert undefined or null to object')) {
            errorMessage = 'BrowserStack SDK internal error: Cannot convert undefined or null to object.\n' +
                          'This is a known issue with BrowserStack Node SDK when configuration is incomplete.\n' +
                          'Solutions:\n' +
                          '1. Verify BROWSERSTACK_USERNAME and BROWSERSTACK_ACCESS_KEY are set correctly\n' +
                          '2. Ensure browserstack.yml exists and is properly formatted\n' +
                          '3. Consider downgrading BrowserStack Node SDK to v1.39.0 (known stable version)\n' +
                          '4. Run tests without --browserstack-sdk flag for local execution';
          }
          
          if (output.includes('No tests found') || output.includes('No files found')) {
            errorMessage = 'BrowserStack SDK Jest configuration error. Jest cannot find test files.\n' +
                          'This may be due to:\n' +
                          '1. Incorrect working directory in BrowserStack execution context\n' +
                          '2. Jest configuration excluding test files when run through BrowserStack SDK\n' +
                          '3. Missing package.json in the target directory\n' +
                          '4. TestMatch patterns not matching any files in rootDir\n' +
                          '5. BrowserStack SDK changing the execution context or file paths';
          }
          
          console.log(`🚨 BrowserStack configuration error detected`);
          
          resolve({
            status: 'failed',
            testResults: [],
            output: `${errorMessage}\n\nOriginal output:\n${output}`,
            errorOutput,
            duration: Date.now() - startTime,
            workerId: config.workerId,
            filePath: config.filePath,
            exitCode: code,
            strategy: 'file-parallelism-browserstack-error',
            error: 'BrowserStack SDK configuration error'
          });
          return;
        }
      }
      
      console.log(`🔍 Parsing Jest output...`);
      
      try {
        const parseResult = parseJestOutput(processedErrorOutput, config);
        const testResults = parseResult.testResults || parseResult; // Handle both old and new return formats  
        const hookInfo = parseResult.hookInfo || {};
        
        console.log(`✅ Parsed ${testResults.length} test results`);
        
        resolve({
          status: code === 0 ? 'passed' : 'failed',
          testResults,
          output: processedOutput,
          errorOutput: processedErrorOutput,
          duration: Date.now() - startTime,
          workerId: config.workerId,
          filePath: config.filePath,
          exitCode: code,
          strategy: 'file-parallelism',
          jestWorkers: maxWorkersForFile,
          hookInfo: hookInfo
        });
      } catch (parseError) {
        console.error(`❌ Error parsing Jest output: ${parseError.message}`);
        console.error(`📊 Parse error stack: ${parseError.stack}`);
        
        // Return a safe result even if parsing fails
        resolve({
          status: code === 0 ? 'passed' : 'failed',
          testResults: [],
          output: processedOutput,
          errorOutput: processedErrorOutput,
          duration: Date.now() - startTime,
          workerId: config.workerId,
          filePath: config.filePath,
          exitCode: code,
          strategy: 'file-parallelism-parse-error',
          jestWorkers: maxWorkersForFile,
          error: `Output parsing failed: ${parseError.message}`
        });
      }
    };
    
    worker.on('close', handleExit);
    worker.on('exit', handleExit);
    
    worker.on('error', (error) => {
      if (hasResolved) return;
      hasResolved = true;
      reject(error);
    });
    
    // Set timeout
    const timeout = config.timeout || 25000;
    setTimeout(() => {
      if (!worker.killed && !hasResolved) {
        worker.kill('SIGTERM');
        setTimeout(() => {
          if (!worker.killed && !hasResolved) {
            hasResolved = true;
            worker.kill('SIGKILL');
            reject(new Error('Test execution timeout'));
          }
        }, 2000);
      }
    }, timeout);
  });
}

function parseJestOutput(output, config, specificTestName = null) {
  const testResults = [];
  let hookInfo = {
    beforeAll: { duration: 0, status: 'not_found' },
    beforeEach: { duration: 0, status: 'not_found' },
    afterAll: { duration: 0, status: 'not_found' },
    afterEach: { duration: 0, status: 'not_found' }
  };
  
  const lines = output.split('\n');
  let currentSuite = '';
  let currentFailedTest = null;
  let collectingError = false;
  let errorLines = [];
  let beforeAllFailure = null; // Track beforeAll hook failures
  
  // Extract overall test timing to calculate hook duration
  let totalTestDuration = 0;
  let overallSuiteDuration = 0;
  
  // Look for Jest timing information
  const timeMatch = output.match(/Time:\s+(\d+(?:\.\d+)?)\s*s/);
  if (timeMatch) {
    overallSuiteDuration = parseFloat(timeMatch[1]) * 1000; // Convert to ms
  }
  
  // First pass: collect test results (pass/fail status) and detect hook failures
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmedLine = line.trim();
    
    // Detect beforeAll hook failures
    const beforeAllMatch = line.match(/●\s+(.+?)\s+›\s+beforeAll/i);
    if (beforeAllMatch) {
      const suiteName = beforeAllMatch[1].trim();
      beforeAllFailure = {
        suite: suiteName,
        type: 'beforeAll',
        message: 'beforeAll hook failed',
        errorLines: []
      };
      console.log(`🚨 DETECTED beforeAll hook failure in suite: "${suiteName}"`);
      continue;
    }
    
    // Detect beforeEach hook failures
    const beforeEachMatch = line.match(/●\s+(.+?)\s+›\s+beforeEach/i);
    if (beforeEachMatch) {
      const suiteName = beforeEachMatch[1].trim();
      console.log(`🚨 DETECTED beforeEach hook failure in suite: "${suiteName}"`);
      continue;
    }
    
    // Detect afterAll hook failures
    const afterAllMatch = line.match(/●\s+(.+?)\s+›\s+afterAll/i);
    if (afterAllMatch) {
      const suiteName = afterAllMatch[1].trim();
      console.log(`🚨 DETECTED afterAll hook failure in suite: "${suiteName}"`);
      continue;
    }
    
    // Detect afterEach hook failures
    const afterEachMatch = line.match(/●\s+(.+?)\s+›\s+afterEach/i);
    if (afterEachMatch) {
      const suiteName = afterEachMatch[1].trim();
      console.log(`🚨 DETECTED afterEach hook failure in suite: "${suiteName}"`);
      continue;
    }
    
    // Look for test suite names
    if (trimmedLine && !trimmedLine.startsWith('✓') && !trimmedLine.startsWith('✗') && 
        !trimmedLine.includes('PASS') && !trimmedLine.includes('FAIL') && 
        !trimmedLine.includes('Test Suites:') && !trimmedLine.includes('Tests:') &&
        !trimmedLine.includes('Snapshots:') && !trimmedLine.includes('Time:') &&
        !trimmedLine.includes('Ran all test suites') && !trimmedLine.startsWith('RUNS') &&
        !trimmedLine.includes('Determining test suites') && !trimmedLine.includes('.test.js') &&
        !trimmedLine.startsWith('at ') && !trimmedLine.includes('Error:') && 
        !trimmedLine.includes('console.') && !trimmedLine.startsWith('●')) {
      
      if (!line.startsWith('    ') && !line.startsWith('  ●') && trimmedLine.length > 0) {
        currentSuite = trimmedLine;
      }
    }
    
    // Parse test results
    // Pattern 1: ✓ test name (time)
    const testMatch = line.match(/^\s*✓\s+(.+?)\s*\((\d+(?:\.\d+)?)\s*m?s\)/);
    if (testMatch) {
      const [, testName, duration] = testMatch;
      const cleanTestName = testName.trim();
      const testDuration = parseFloat(duration);
      totalTestDuration += testDuration;
      
      // Skip empty or invalid test names
      if (cleanTestName && cleanTestName !== '\n' && cleanTestName.length > 0) {
        // If we're looking for a specific test, only include it
        if (!specificTestName || cleanTestName === specificTestName) {
          testResults.push({
            testId: `${config.filePath}:${cleanTestName}`,
            testName: cleanTestName,
            suite: currentSuite,
            status: 'passed',
            duration: testDuration,
            error: null,
            source: null,
            workerId: config.workerId,
            filePath: config.filePath
          });
        }
      }
    } else {
      // Pattern 2: ✓ test name (no timing)
      const quickTestMatch = line.match(/^\s*✓\s+(.+?)$/);
      if (quickTestMatch) {
        const [, testName] = quickTestMatch;
        const cleanTestName = testName.trim();
        
        if (!testName.includes('(') && !testName.includes('ms') && cleanTestName.length > 0 && cleanTestName !== '\n') {
          if (!specificTestName || cleanTestName === specificTestName) {
            testResults.push({
              testId: `${config.filePath}:${cleanTestName}`,
              testName: cleanTestName,
              suite: currentSuite,
              status: 'passed',
              duration: 0, // Very fast test, under 1ms
              error: null,
              source: null,
              workerId: config.workerId,
              filePath: config.filePath
            });
          }
        }
      }
    }
    
    // Parse failed tests
    // Pattern 1: ✗ test name (time) or ✗ test name
    const failedMatchWithTime = line.match(/^\s*[✗✕×]\s+(.+?)\s+\((\d+(?:\.\d+)?)\s*m?s\)$/);
    const failedMatchNoTime = line.match(/^\s*[✗✕×]\s+(.+?)$/);
    
    let failedMatch = null;
    if (failedMatchWithTime) {
      failedMatch = failedMatchWithTime;
    } else if (failedMatchNoTime && !failedMatchNoTime[1].includes('(') && !failedMatchNoTime[1].includes('ms')) {
      failedMatch = [failedMatchNoTime[0], failedMatchNoTime[1], null];
    }
    
    if (failedMatch) {
      const [, testName, duration] = failedMatch;
      const cleanTestName = testName.trim();
      const testDuration = duration ? parseFloat(duration) : 0;
      totalTestDuration += testDuration;
      
      if (cleanTestName && cleanTestName !== '\n' && cleanTestName.length > 0) {
        if (!specificTestName || cleanTestName === specificTestName) {
          testResults.push({
            testId: `${config.filePath}:${cleanTestName}`,
            testName: cleanTestName,
            suite: currentSuite,
            status: 'failed',
            duration: testDuration,
            error: null,
            source: null,
            workerId: config.workerId,
            filePath: config.filePath
          });
        }
      }
    }
    
    // Parse skipped tests
    const skippedMatch = line.match(/^\s*○\s+(.+?)$/);
    if (skippedMatch) {
      const [, testName] = skippedMatch;
      const cleanTestName = testName.trim();
      
      if (cleanTestName && cleanTestName !== '\n' && cleanTestName.length > 0) {
        if (!specificTestName || cleanTestName === specificTestName) {
          testResults.push({
            testId: `${config.filePath}:${cleanTestName}`,
            testName: cleanTestName,
            suite: currentSuite,
            status: 'skipped',
            duration: 0,
            error: null,
            source: null,
            workerId: config.workerId,
            filePath: config.filePath
          });
        }
      }
    }
  }
  
  // Second pass: assign error messages to failed tests
  const failedTests = testResults.filter(t => t.status === 'failed');
  parseIndividualErrors(output, failedTests);
  
  // Calculate hook duration based on timing analysis
  if (overallSuiteDuration > 0 && totalTestDuration >= 0) {
    // Estimate hook duration as the difference between total suite time and test execution time
    const estimatedHookDuration = Math.max(0, overallSuiteDuration - totalTestDuration);
    
    // For now, attribute most hook overhead to beforeAll
    // This is a reasonable assumption since beforeAll typically contains setup logic
    if (estimatedHookDuration > 10) { // Only track if significant (>10ms)
      hookInfo.beforeAll.duration = Math.round(estimatedHookDuration * 0.8); // 80% to beforeAll
      hookInfo.beforeAll.status = 'estimated';
      
      // Distribute remaining time to other hooks if tests show they might exist
      const remainingDuration = estimatedHookDuration - hookInfo.beforeAll.duration;
      if (remainingDuration > 5 && testResults.length > 1) {
        hookInfo.beforeEach.duration = Math.round(remainingDuration * 0.7);
        hookInfo.beforeEach.status = 'estimated';
        hookInfo.afterEach.duration = Math.round(remainingDuration * 0.2);
        hookInfo.afterEach.status = 'estimated';
        hookInfo.afterAll.duration = Math.round(remainingDuration * 0.1);
        hookInfo.afterAll.status = 'estimated';
      }
    }
  }
  
  return { testResults, hookInfo };
}

function parseIndividualErrors(output, failedTests) {
  const lines = output.split('\n');
  let currentErrorTest = null;
  let errorLines = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmedLine = line.trim();
    
    // Look for test-specific error headers: "● Suite › test name"
    const errorHeaderMatch = line.match(/^\s*●\s+(.+?)\s*›\s*(.+?)$/);
    if (errorHeaderMatch) {
      // Save previous error if we were collecting one
      if (currentErrorTest && errorLines.length > 0) {
        const errorMessage = errorLines.join('\n').trim();
        currentErrorTest.error = errorMessage;
        currentErrorTest.source = extractSourceInfo(errorMessage);
      }
      
      // Find the matching failed test
      const [, suite, testName] = errorHeaderMatch;
      const cleanTestName = testName.trim();
      currentErrorTest = failedTests.find(t => t.testName === cleanTestName);
      errorLines = [];
    } else if (currentErrorTest && (
      trimmedLine.includes('expect(') || 
      trimmedLine.includes('Expected:') || 
      trimmedLine.includes('Received:') || 
      trimmedLine.includes('at Object.') ||
      trimmedLine.includes('at ') ||
      trimmedLine.startsWith('>') ||
      /^\d+\s*\|/.test(trimmedLine) ||
      trimmedLine.includes('|') ||
      trimmedLine.includes('^')
    )) {
      // Collect error details
      errorLines.push(line);
    } else if (trimmedLine.startsWith('●') || trimmedLine.includes('Test Suites:')) {
      // End of current error section
      if (currentErrorTest && errorLines.length > 0) {
        const errorMessage = errorLines.join('\n').trim();
        currentErrorTest.error = errorMessage;
        currentErrorTest.source = extractSourceInfo(errorMessage);
      }
      currentErrorTest = null;
      errorLines = [];
    } else if (currentErrorTest && errorLines.length > 0) {
      // Continue collecting error lines
      errorLines.push(line);
    }
  }
  
  // Handle any remaining error
  if (currentErrorTest && errorLines.length > 0) {
    const errorMessage = errorLines.join('\n').trim();
    currentErrorTest.error = errorMessage;
    currentErrorTest.source = extractSourceInfo(errorMessage);
  }
}

function extractSourceInfo(errorMessage) {
  if (!errorMessage) return null;
  
  // Look for Jest stack trace patterns:
  // "at Object.toBe (tests/error-demo.test.js:9:15)"
  // "at Object.toContain (tests/error-demo.test.js:13:21)"
  const stackTracePattern = /at\s+[\w.]+\s+\(([^:]+):(\d+):(\d+)\)/;
  const match = errorMessage.match(stackTracePattern);
  
  if (match) {
    const [, filePath, lineNumber, columnNumber] = match;
    return {
      file: filePath,
      line: parseInt(lineNumber, 10),
      column: parseInt(columnNumber, 10),
      location: `${filePath}:${lineNumber}:${columnNumber}`
    };
  }
  
  // Alternative pattern for simpler stack traces
  // "at tests/error-demo.test.js:9:15"
  const simpleStackPattern = /at\s+([^:]+):(\d+):(\d+)/;
  const simpleMatch = errorMessage.match(simpleStackPattern);
  
  if (simpleMatch) {
    const [, filePath, lineNumber, columnNumber] = simpleMatch;
    return {
      file: filePath,
      line: parseInt(lineNumber, 10),
      column: parseInt(columnNumber, 10),
      location: `${filePath}:${lineNumber}:${columnNumber}`
    };
  }
  
  // Look for code context indicators (lines starting with ">")
  const codeContextPattern = />\s*(\d+)\s*\|/;
  const codeMatch = errorMessage.match(codeContextPattern);
  
  if (codeMatch) {
    const lineNumber = parseInt(codeMatch[1], 10);
    return {
      file: null, // File path not available in this pattern
      line: lineNumber,
      column: null,
      location: `line ${lineNumber}`
    };
  }
  
  return null;
}

// Main execution
if (require.main === module) {
  let config;
  let isShuttingDown = false;
  
  // Handle graceful shutdown
  const handleShutdown = (signal) => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    
    const result = {
      status: 'failed',
      testResults: [],
      error: `Worker interrupted by ${signal}`,
      duration: 0,
      workerId: config ? config.workerId : 'unknown',
      filePath: config ? config.filePath : 'unknown'
    };
    process.stdout.write(JSON.stringify(result) + '\n');
    process.stdout.end(() => {
      process.exit(1);
    });
  };
  
  process.on('SIGTERM', () => handleShutdown('SIGTERM'));
  process.on('SIGINT', () => handleShutdown('SIGINT'));
  
  try {
    config = JSON.parse(process.argv[2]);
  } catch (error) {
    const errorResult = {
      status: 'failed',
      testResults: [],
      error: `Invalid configuration: ${error.message}`,
      duration: 0,
      workerId: 'unknown',
      filePath: 'unknown'
    };
    process.stdout.write(JSON.stringify(errorResult) + '\n');
    process.stdout.end(() => {
      process.exit(1);
    });
  }
  
  // Error handlers
  process.on('uncaughtException', (error) => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    const result = {
      status: 'failed',
      testResults: [],
      error: `Uncaught exception: ${error.message}`,
      duration: 0,
      workerId: config.workerId,
      filePath: config.filePath
    };
    process.stdout.write(JSON.stringify(result) + '\n');
    process.stdout.end(() => {
      process.exit(1);
    });
  });
  
  process.on('unhandledRejection', (reason) => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    const result = {
      status: 'failed',
      testResults: [],
      error: `Unhandled rejection: ${reason}`,
      duration: 0,
      workerId: config.workerId,
      filePath: config.filePath
    };
    process.stdout.write(JSON.stringify(result) + '\n');
    process.stdout.end(() => {
      process.exit(1);
    });
  });
  
  runTestsNatively(config)
    .then(result => {
      if (isShuttingDown) return;
      const jsonOutput = JSON.stringify(result);
      process.stdout.write(jsonOutput + '\n');
      
      process.stdout.end(() => {
        process.exit(result.status === 'passed' ? 0 : 1);
      });
    })
    .catch(error => {
      if (isShuttingDown) return;
      const result = {
        status: 'failed',
        testResults: [],
        error: error.message,
        duration: 0,
        workerId: config.workerId,
        filePath: config.filePath
      };
      const jsonOutput = JSON.stringify(result);
      process.stdout.write(jsonOutput + '\n');
      
      process.stdout.end(() => {
        process.exit(1);
      });
    });
}

module.exports = { runTestsNatively };
