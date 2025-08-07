#!/usr/bin/env node

// Test the SDK programmatic usage
const { JestParallelSDK } = require('./src/index.js');

async function testSDKUsage() {
  console.log('🧪 Testing Jest Parallel SDK programmatic usage...\n');

  try {
    // Test 1: Basic usage
    console.log('📋 Test 1: Basic SDK usage');
    const sdk = new JestParallelSDK({
      testMatch: 'examples/simple-math.test.js',
      mode: 'native-parallel',
      verbose: false
    });

    const results = await sdk.run();
    console.log(`✅ Basic usage: ${results.summary.passed}/${results.summary.totalTests} tests passed`);
    console.log(`⚡ Time saved: ${results.summary.timeSaved}ms\n`);

    // Test 2: Fluent API
    console.log('📋 Test 2: Fluent API usage');
    const fluentResults = await JestParallelSDK
      .create()
      .setTestMatch('examples/hook-timing-test.test.js')
      .setMode('native-parallel')
      .setTimeout(10000)
      .setMaxWorkers(2)
      .run();

    console.log(`✅ Fluent API: ${fluentResults.summary.passed}/${fluentResults.summary.totalTests} tests passed`);
    console.log(`⚡ Time saved: ${fluentResults.summary.timeSaved}ms\n`);

    // Test 3: With lifecycle hooks
    console.log('📋 Test 3: SDK with lifecycle hooks');
    let hooksCalled = [];

    const hooksResults = await sdk.runWithHooks({
      beforeAll: async () => {
        hooksCalled.push('beforeAll');
        console.log('🔗 beforeAll hook called');
      },
      beforeEach: async (testInfo) => {
        hooksCalled.push('beforeEach');
        console.log(`🔗 beforeEach hook called for: ${testInfo?.testName || 'unknown'}`);
      },
      afterEach: async (testResult) => {
        hooksCalled.push('afterEach');
        console.log(`🔗 afterEach hook called for: ${testResult?.testName || 'unknown'}`);
      },
      afterAll: async () => {
        hooksCalled.push('afterAll');
        console.log('🔗 afterAll hook called');
      },
      onProgress: (progress) => {
        console.log(`📊 Progress: ${progress.completed}/${progress.total} tests`);
      },
      onComplete: async (results) => {
        hooksCalled.push('onComplete');
        console.log('🔗 onComplete hook called');
      }
    });

    console.log(`✅ Hooks usage: ${hooksResults.summary.passed}/${hooksResults.summary.totalTests} tests passed`);
    console.log(`🎯 Hooks called: ${hooksCalled.join(', ')}\n`);

    // Test 4: Static factory methods
    console.log('📋 Test 4: Static factory methods');
    console.log(`📊 Available modes: ${JestParallelSDK.getModes().join(', ')}`);
    console.log(`📊 Available reporters: ${JestParallelSDK.getReporters().join(', ')}`);
    
    const defaultOptions = JestParallelSDK.getDefaultOptions();
    console.log(`📊 Default mode: ${defaultOptions.mode}`);
    console.log(`📊 Default max workers: ${defaultOptions.maxWorkers}\n`);

    console.log('🎉 All SDK tests completed successfully!');

  } catch (error) {
    console.error('❌ SDK test failed:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

testSDKUsage();
