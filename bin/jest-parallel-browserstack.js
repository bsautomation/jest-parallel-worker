#!/usr/bin/env node

/**
 * BrowserStack-enabled Jest Parallel Worker CLI
 * Programmatic integration with BrowserStack SDK for test observability
 * Usage: jest-parallel-browserstack [jest-parallel-args]
 * 
 * This provides deep BrowserStack integration using their programmatic API
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

/**
 * Initialize BrowserStack SDK programmatically
 */
async function initializeBrowserStack() {
  try {
    // Dynamic import of BrowserStack SDK
    const { start } = await import('browserstack-node-sdk');
    
    console.log('🌐 Initializing BrowserStack SDK...');
    await start({ 
      framework: 'jest', 
      testFramework: 'custom',
      projectName: 'Jest Parallel Worker Tests',
      buildName: process.env.BROWSERSTACK_BUILD_NAME || 'Jest Parallel Build',
      sessionName: process.env.BROWSERSTACK_SESSION_NAME || 'Jest Parallel Session'
    });
    
    console.log('✅ BrowserStack SDK initialized successfully');
    return true;
  } catch (error) {
    console.warn('⚠️  BrowserStack SDK not available:', error.message);
    console.log('💡 To enable BrowserStack integration:');
    console.log('   npm install browserstack-node-sdk --save-dev');
    console.log('   export BROWSERSTACK_USERNAME="your_username"');
    console.log('   export BROWSERSTACK_ACCESS_KEY="your_access_key"');
    return false;
  }
}

/**
 * Mark test status in BrowserStack
 */
async function markTestStatus(status, description, testName) {
  try {
    const { markTestStatus } = await import('browserstack-node-sdk');
    await markTestStatus(status, description, testName);
  } catch (error) {
    // Silent fail if SDK not available
  }
}

/**
 * Parse Jest output to extract test results and push to BrowserStack
 */
function setupBrowserStackReporting(child, browserstackInitialized) {
  if (!browserstackInitialized) return;

  let outputBuffer = '';
  
  // Capture stdout to parse test results
  if (child.stdout) {
    child.stdout.on('data', async (data) => {
      outputBuffer += data.toString();
      
      // Look for test completion patterns in Jest Parallel Worker output
      const lines = outputBuffer.split('\n');
      for (const line of lines) {
        // Match test completion logs: "✓ sample test (3ms) [Worker: 0]"
        const testMatch = line.match(/\s*[✓✗]\s+(.+?)\s+\((\d+)ms\)\s+\[Worker:\s*\d+\]/);
        if (testMatch) {
          const testName = testMatch[1].trim();
          const isPass = line.includes('✓');
          const status = isPass ? 'passed' : 'failed';
          const description = `${testName} - ${status} in ${testMatch[2]}ms`;
          
          console.log(`📊 Reporting to BrowserStack: ${testName} - ${status}`);
          await markTestStatus(status, description, testName);
        }
        
        // Match file completion logs: "📁 sample.test.js completed: ✅ 1 passed, ❌ 0 failed"
        const fileMatch = line.match(/📁\s+(.+?)\s+completed:\s*✅\s*(\d+)\s+passed,\s*❌\s*(\d+)\s+failed/);
        if (fileMatch) {
          const fileName = fileMatch[1];
          const passed = parseInt(fileMatch[2]);
          const failed = parseInt(fileMatch[3]);
          
          if (failed > 0) {
            await markTestStatus('failed', `File ${fileName}: ${failed} tests failed`, fileName);
          } else if (passed > 0) {
            await markTestStatus('passed', `File ${fileName}: ${passed} tests passed`, fileName);
          }
        }
      }
      
      // Keep only the last few lines to avoid memory issues
      const lastLines = lines.slice(-10);
      outputBuffer = lastLines.join('\n');
    });
  }
}
async function finalizeBrowserStack() {
  try {
    const { end } = await import('browserstack-node-sdk');
    await end();
    console.log('📊 BrowserStack session ended - data available in dashboard');
  } catch (error) {
    // Silent fail if SDK not available
  }
}

/**
 * Find BrowserStack SDK command (fallback for direct CLI usage)
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
 * Find the Jest Parallel Worker binary
 * @returns {string|null} Path to the binary or null for npx usage
 */
function findJestParallelBinary() {
  // Check if we're running from an external package installation 
  // (when installed via npm in another project's node_modules)
  const isExternalPackage = __dirname.includes('node_modules') && 
                          !process.cwd().includes('/jest-parallel-worker');
  
  console.log(`🔍 External package context: ${isExternalPackage}`);
  
  const possiblePaths = [
    // For external packages, look for installed jest-parallel-worker
    isExternalPackage ? path.join(process.cwd(), 'node_modules', 'jest-parallel-worker', 'bin', 'jest-parallel.js') : null,
    // If we're in jest-parallel-worker repo, look for local binary
    !isExternalPackage ? path.join(__dirname, 'jest-parallel.js') : null,
    // Alternative: installed via npm in project
    path.join(process.cwd(), 'node_modules', '.bin', 'jest-parallel'),
    // Development fallback
    path.join(__dirname, '..', 'bin', 'jest-parallel.js'),
  ].filter(Boolean); // Remove null entries

  for (const binPath of possiblePaths) {
    if (fs.existsSync(binPath)) {
      console.log(`🔍 Found Jest Parallel binary at: ${binPath}`);
      return binPath;
    }
  }

  // Only use npx as absolute last resort
  console.log('🔍 Binary not found locally - using npx as fallback');
  return null; // This will trigger npx usage
}

/**
 * Main execution function
 */
async function main() {
  let browserstackInitialized = false;
  
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
      console.log('Environment Variables:');
      console.log('  BROWSERSTACK_USERNAME     - Your BrowserStack username');
      console.log('  BROWSERSTACK_ACCESS_KEY   - Your BrowserStack access key');
      console.log('  BROWSERSTACK_BUILD_NAME   - Custom build name (optional)');
      console.log('  BROWSERSTACK_SESSION_NAME - Custom session name (optional)');
      console.log('');
      console.log('This provides deep BrowserStack integration with Jest Parallel Worker.');
      console.log('');
      return;
    }

    // Initialize BrowserStack SDK
    browserstackInitialized = await initializeBrowserStack();
    
    // Find Jest Parallel Worker
    const jestParallelBin = findJestParallelBinary();
    
    // Check if we're in external package context
    const isExternalPackage = __dirname.includes('node_modules') && 
                            !process.cwd().includes('/jest-parallel-worker');
    
    console.log(`🔍 External package context: ${isExternalPackage}`);
    
    // Find the jest-parallel executable
    let jestParallelPath = null;
    if (isExternalPackage) {
      const possiblePaths = [
        path.join(process.cwd(), 'node_modules', '.bin', 'jest-parallel'),
        path.join(process.cwd(), 'node_modules', 'jest-parallel-worker', 'bin', 'jest-parallel.js'),
      ];
      
      for (const testPath of possiblePaths) {
        if (fs.existsSync(testPath)) {
          jestParallelPath = testPath;
          break;
        }
      }
    } else {
      jestParallelPath = jestParallelBin;
    }
    
    if (!jestParallelPath) {
      console.error('❌ Could not find jest-parallel binary');
      console.log('💡 Please ensure jest-parallel-worker is installed:');
      console.log('   npm install jest-parallel-worker --save-dev');
      process.exit(1);
    }
    
    console.log(`📦 Using Jest Parallel Worker: ${jestParallelPath}`);
    console.log(`🚀 Executing with${browserstackInitialized ? '' : 'out'} BrowserStack integration`);
    console.log('');

    // Execute Jest Parallel Worker
    const child = spawn('node', [jestParallelPath, ...jestParallelArgs], {
      stdio: ['inherit', 'pipe', 'pipe'], // Pipe stdout/stderr to capture test results
      cwd: process.cwd(),
      env: {
        ...process.env,
        // Pass BrowserStack status to Jest Parallel Worker if needed
        BROWSERSTACK_INTEGRATED: browserstackInitialized ? 'true' : 'false'
      }
    });

    // Setup BrowserStack test result reporting
    setupBrowserStackReporting(child, browserstackInitialized);
    
    // Forward output to console while capturing for BrowserStack
    if (child.stdout) {
      child.stdout.on('data', (data) => {
        process.stdout.write(data);
      });
    }
    
    if (child.stderr) {
      child.stderr.on('data', (data) => {
        process.stderr.write(data);
      });
    }

    child.on('close', async (code) => {
      console.log('');
      
      if (browserstackInitialized) {
        await finalizeBrowserStack();
      }
      
      if (code === 0) {
        console.log('✅ Tests completed successfully!');
        if (browserstackInitialized) {
          console.log('📊 Test results available in BrowserStack dashboard');
          console.log('🔗 Visit: https://automate.browserstack.com/dashboard');
        }
      } else {
        console.log(`❌ Tests failed with exit code ${code}`);
      }
      process.exit(code);
    });

    child.on('error', async (error) => {
      if (browserstackInitialized) {
        await finalizeBrowserStack();
      }
      
      console.error('💥 Jest Parallel Worker execution failed:', error.message);
      console.log('\n🔧 Troubleshooting:');
      console.log('- Ensure jest-parallel-worker is properly installed');
      console.log('- Try: npm install jest-parallel-worker --save-dev');
      
      if (!browserstackInitialized) {
        console.log('- For BrowserStack integration:');
        console.log('  npm install browserstack-node-sdk --save-dev');
        console.log('  export BROWSERSTACK_USERNAME="your_username"');
        console.log('  export BROWSERSTACK_ACCESS_KEY="your_access_key"');
      }
      
      process.exit(1);
    });

    // Handle process signals for cleanup
    const cleanup = async () => {
      if (browserstackInitialized) {
        console.log('\n� Cleaning up BrowserStack session...');
        await finalizeBrowserStack();
      }
    };

    process.on('SIGINT', async () => {
      console.log('\n⚠️  Interrupted by user');
      await cleanup();
      process.exit(130);
    });

    process.on('SIGTERM', async () => {
      console.log('\n⚠️  Terminated');
      await cleanup();
      process.exit(143);
    });

  } catch (error) {
    if (browserstackInitialized) {
      await finalizeBrowserStack();
    }
    console.error('💥 Execution failed:', error.message);
    process.exit(1);
  }
}

// Handle process signals
process.on('SIGINT', async () => {
  console.log('\n⚠️  Interrupted by user');
  process.exit(130);
});

process.on('SIGTERM', async () => {
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
