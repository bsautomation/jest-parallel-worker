#!/usr/bin/env node

/**
 * BrowserStack-enabled Jest Parallel Worker CLI
 * Drop-in replacement for browserstack-node-sdk with Jest Parallel Worker
 * Usage: jest-parallel-browserstack [jest-parallel-args]
 * 
 * This acts exactly like browserstack-node-sdk but automatically uses Jest Parallel Worker
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

/**
 * Find BrowserStack SDK command
 */
function findBrowserStackCommand() {
  const possiblePaths = [
    path.join(process.cwd(), 'node_modules', '.bin', 'browserstack-node-sdk'),
    path.join(__dirname, '..', 'node_modules', '.bin', 'browserstack-node-sdk'),
    'browserstack-node-sdk' // Global or PATH
  ];

  for (const cmdPath of possiblePaths) {
    if (fs.existsSync(cmdPath)) {
      return cmdPath;
    }
  }

  // Fallback to npx
  return 'npx browserstack-node-sdk';
}

/**
 * Find Jest Parallel Worker binary
 */
function findJestParallelBinary() {
  const possiblePaths = [
    path.join(__dirname, 'jest-parallel.js'),
    path.join(process.cwd(), 'node_modules', '.bin', 'jest-parallel'),
    path.join(__dirname, '..', 'bin', 'jest-parallel.js'),
    'jest-parallel' // For npx resolution
  ];

  for (const binPath of possiblePaths) {
    if (fs.existsSync(binPath)) {
      return binPath;
    }
  }

  // Fallback to npx
  return 'npx jest-parallel';
}

/**
 * Main execution function
 */
async function main() {
  try {
    console.log('🌐 Jest Parallel Worker with BrowserStack Integration');
    
    // Get Jest Parallel Worker args from command line
    const jestParallelArgs = process.argv.slice(2);
    
    if (jestParallelArgs.length === 0) {
      console.log('');
      console.log('Usage: jest-parallel-browserstack [jest-parallel-args]');
      console.log('');
      console.log('Examples:');
      console.log('  jest-parallel-browserstack run --testMatch "tests/**/*.test.js"');
      console.log('  jest-parallel-browserstack run --mode native-parallel --timeout 10');
      console.log('');
      console.log('This command automatically wraps Jest Parallel Worker with BrowserStack SDK.');
      console.log('It works exactly like: browserstack-node-sdk node jest-parallel [args]');
      console.log('');
      return;
    }

    // Find BrowserStack SDK
    const browserstackCmd = findBrowserStackCommand();
    console.log(`📦 Using BrowserStack SDK: ${browserstackCmd}`);
    
    // Find Jest Parallel Worker
    const jestParallelBin = findJestParallelBinary();
    console.log(`🔧 Using Jest Parallel Worker: ${jestParallelBin}`);
    
    // Build complete command
    const fullArgs = [];
    
    // Add node and jest-parallel binary
    if (jestParallelBin.includes('npx')) {
      fullArgs.push('npx', 'jest-parallel');
    } else {
      fullArgs.push('node', jestParallelBin);
    }
    
    // Add all user arguments
    fullArgs.push(...jestParallelArgs);
    
    console.log(`🚀 Executing: ${browserstackCmd} ${fullArgs.join(' ')}`);
    console.log('');

    // Execute with BrowserStack SDK
    const child = spawn(browserstackCmd, fullArgs, {
      stdio: 'inherit',
      cwd: process.cwd(),
      env: process.env
    });

    child.on('close', (code) => {
      if (code === 0) {
        console.log('✅ Tests completed successfully!');
      } else {
        console.log(`❌ Tests failed with exit code ${code}`);
      }
      process.exit(code);
    });

    child.on('error', (error) => {
      console.error('💥 Failed to start BrowserStack execution:', error.message);
      
      // Provide helpful troubleshooting
      console.log('\n🔧 Troubleshooting:');
      if (error.message.includes('ENOENT')) {
        console.log('- Install BrowserStack SDK: npm install browserstack-node-sdk --save-dev');
        console.log('- Or install globally: npm install -g browserstack-node-sdk');
      }
      
      if (error.message.includes('jest-parallel')) {
        console.log('- Ensure jest-parallel-worker is properly installed');
        console.log('- Try: npm install jest-parallel-worker --save-dev');
      }
      
      console.log('- Set BrowserStack credentials:');
      console.log('  export BROWSERSTACK_USERNAME="your_username"');
      console.log('  export BROWSERSTACK_ACCESS_KEY="your_access_key"');
      
      process.exit(1);
    });

  } catch (error) {
    console.error('💥 Execution failed:', error.message);
    process.exit(1);
  }
}

// Handle process signals
process.on('SIGINT', () => {
  console.log('\n⚠️  Interrupted by user');
  process.exit(130);
});

process.on('SIGTERM', () => {
  console.log('\n⚠️  Terminated');
  process.exit(143);
});

// Run if called directly
if (require.main === module) {
  main().catch(error => {
    console.error('💥 Unexpected error:', error);
    process.exit(1);
  });
}
