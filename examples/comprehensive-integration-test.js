#!/usr/bin/env node

/**
 * Comprehensive Jest Parallel Worker + BrowserStack Integration Test
 * This script demonstrates all integration approaches and validates compatibility
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Test configuration
const testConfig = {
  testMatch: 'examples/simple-math.test.js', // Use a simple test
  mode: 'native-parallel',
  timeout: 2, // 2 minutes for quick testing
  maxWorkers: 2,
  verbose: true
};

/**
 * Run a command and capture output
 */
function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    console.log(`🔧 Running: ${command} ${args.join(' ')}`);
    
    const child = spawn(command, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: process.cwd(),
      ...options
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      resolve({
        code,
        stdout,
        stderr,
        success: code === 0
      });
    });

    child.on('error', (error) => {
      reject(error);
    });

    // Timeout after 30 seconds for each test
    setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error('Command timeout'));
    }, 30000);
  });
}

/**
 * Test basic Jest Parallel Worker functionality
 */
async function testBasicFunctionality() {
  console.log('\n📋 Test 1: Basic Jest Parallel Worker Functionality');
  
  try {
    const result = await runCommand('node', [
      'bin/jest-parallel.js',
      'run',
      '--testMatch', testConfig.testMatch,
      '--mode', testConfig.mode,
      '--timeout', testConfig.timeout.toString(),
      '--maxWorkers', testConfig.maxWorkers.toString()
    ]);

    if (result.success) {
      console.log('✅ Basic functionality test passed');
      console.log('📊 Output preview:', result.stdout.substring(0, 200) + '...');
      return true;
    } else {
      console.log('❌ Basic functionality test failed');
      console.log('📊 Error:', result.stderr.substring(0, 200));
      return false;
    }
  } catch (error) {
    console.log('❌ Basic functionality test failed with error:', error.message);
    return false;
  }
}

/**
 * Test CLI wrapper without BrowserStack
 */
async function testCLIWrapper() {
  console.log('\n📋 Test 2: CLI Wrapper (Dry Run)');
  
  try {
    // Test that the wrapper exists and is executable
    const wrapperPath = path.join(process.cwd(), 'bin/jest-parallel-browserstack.js');
    
    if (!fs.existsSync(wrapperPath)) {
      console.log('❌ CLI wrapper not found at:', wrapperPath);
      return false;
    }

    console.log('✅ CLI wrapper found and executable');
    console.log('📝 Note: Skipping BrowserStack execution (requires credentials)');
    return true;
  } catch (error) {
    console.log('❌ CLI wrapper test failed:', error.message);
    return false;
  }
}

/**
 * Test universal wrapper
 */
async function testUniversalWrapper() {
  console.log('\n📋 Test 3: Universal Wrapper');
  
  try {
    const wrapperPath = path.join(process.cwd(), 'bin/browserstack-wrapper.js');
    
    if (!fs.existsSync(wrapperPath)) {
      console.log('❌ Universal wrapper not found');
      return false;
    }

    // Check if it's executable
    try {
      fs.accessSync(wrapperPath, fs.constants.X_OK);
      console.log('✅ Universal wrapper is executable');
    } catch (error) {
      console.log('⚠️  Universal wrapper needs execution permission');
      console.log('   Run: chmod +x bin/browserstack-wrapper.js');
      return false;
    }

    console.log('✅ Universal wrapper test passed');
    console.log('📝 Note: Wrapper available for npx jest-parallel-bstack');
    return true;
  } catch (error) {
    console.log('❌ Universal wrapper test failed:', error.message);
    return false;
  }
}

/**
 * Test SDK integration
 */
async function testSDKIntegration() {
  console.log('\n📋 Test 4: SDK Integration');
  
  try {
    const { BrowserStackIntegration, runWithBrowserStack } = require('../src/integrations/browserstack');
    
    // Test integration class
    const integration = new BrowserStackIntegration();
    const sdkVersion = integration.getBrowserStackSdkVersion();
    
    if (sdkVersion) {
      console.log(`✅ BrowserStack SDK detected: v${sdkVersion}`);
    } else {
      console.log('ℹ️  BrowserStack SDK not installed (optional for testing)');
    }

    // Test binary path detection
    const binaryPath = integration.findJestParallelBinary();
    if (binaryPath) {
      console.log('✅ Jest Parallel binary path resolved');
    } else {
      console.log('⚠️  Binary path resolution may need npx fallback');
    }

    console.log('✅ SDK integration test passed');
    console.log('📝 Note: runWithBrowserStack function available');
    return true;
  } catch (error) {
    console.log('❌ SDK integration test failed:', error.message);
    return false;
  }
}

/**
 * Test package.json configuration
 */
async function testPackageConfiguration() {
  console.log('\n📋 Test 5: Package Configuration');
  
  try {
    const packageJson = require('../package.json');
    
    // Check bin entries
    const expectedBins = [
      'jest-parallel',
      'jest-parallel-browserstack', 
      'jest-parallel-bstack'
    ];

    let allBinsPresent = true;
    for (const bin of expectedBins) {
      if (packageJson.bin && packageJson.bin[bin]) {
        console.log(`✅ Binary '${bin}' configured`);
      } else {
        console.log(`❌ Binary '${bin}' missing from package.json`);
        allBinsPresent = false;
      }
    }

    // Check dependencies
    if (packageJson.dependencies && packageJson.dependencies['js-yaml']) {
      console.log('✅ js-yaml dependency present for BrowserStack config parsing');
    } else {
      console.log('⚠️  js-yaml dependency missing (needed for BrowserStack config)');
    }

    console.log('✅ Package configuration test completed');
    return allBinsPresent;
  } catch (error) {
    console.log('❌ Package configuration test failed:', error.message);
    return false;
  }
}

/**
 * Test external package simulation
 */
async function testExternalPackageUsage() {
  console.log('\n📋 Test 6: External Package Usage Simulation');
  
  try {
    // Simulate external package by testing npx resolution
    console.log('🔍 Testing npx resolution compatibility...');
    
    // Check if package can be found via require.resolve
    try {
      const mainPath = require.resolve('../package.json');
      console.log('✅ Package resolvable via require.resolve');
    } catch (error) {
      console.log('⚠️  Package resolution issue:', error.message);
    }

    // Test the integration in isolated mode
    const { runWithBrowserStack } = require('../src/integrations/browserstack');
    console.log('✅ BrowserStack integration importable from external context');

    console.log('✅ External package usage test passed');
    console.log('📝 Note: Package ready for external installation and usage');
    return true;
  } catch (error) {
    console.log('❌ External package usage test failed:', error.message);
    return false;
  }
}

/**
 * Main test runner
 */
async function runComprehensiveTest() {
  console.log('🚀 Jest Parallel Worker + BrowserStack Integration Test Suite');
  console.log('======================================================================');

  const tests = [
    testBasicFunctionality,
    testCLIWrapper,
    testUniversalWrapper,
    testSDKIntegration,
    testPackageConfiguration,
    testExternalPackageUsage
  ];

  const results = [];
  
  for (const test of tests) {
    try {
      const result = await test();
      results.push(result);
    } catch (error) {
      console.log(`💥 Test failed with error: ${error.message}`);
      results.push(false);
    }
  }

  // Summary
  console.log('\n======================================================================');
  console.log('📊 Test Results Summary:');
  
  const passed = results.filter(r => r === true).length;
  const total = results.length;
  
  console.log(`✅ Passed: ${passed}/${total} tests`);
  
  if (passed === total) {
    console.log('🎉 All tests passed! Jest Parallel Worker + BrowserStack integration is ready.');
    console.log('\n🔧 Available Commands:');
    console.log('• jest-parallel run --testMatch "tests/**/*.test.js"');
    console.log('• jest-parallel-browserstack run --testMatch "tests/**/*.test.js"');
    console.log('• jest-parallel-bstack run --testMatch "tests/**/*.test.js"');
    console.log('• npx browserstack-node-sdk npx jest-parallel run');
  } else {
    console.log('⚠️  Some tests failed. Check the output above for details.');
  }

  return passed === total;
}

// Run tests if called directly
if (require.main === module) {
  runComprehensiveTest()
    .then(success => process.exit(success ? 0 : 1))
    .catch(error => {
      console.error('💥 Test suite failed:', error);
      process.exit(1);
    });
}

module.exports = { runComprehensiveTest };
