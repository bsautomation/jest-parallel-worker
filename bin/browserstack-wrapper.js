#!/usr/bin/env node

/**
 * Universal BrowserStack integration that works with any Jest Parallel Worker installation
 * This avoids the path resolution issues with direct binary access
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

/**
 * Universal BrowserStack wrapper for Jest Parallel Worker
 * Works regardless of how jest-parallel-worker is installed
 */
async function runWithBrowserStack(jestParallelArgs = [], browserstackOptions = {}) {
  try {
    // Try to find browserstack-node-sdk
    const browserstackCmd = findBrowserStackCommand();
    
    if (!browserstackCmd) {
      throw new Error('browserstack-node-sdk not found. Please install it: npm install browserstack-node-sdk --save-dev');
    }

    // Use 'npx jest-parallel' instead of direct file path
    // This leverages npm's binary resolution which is more reliable
    const jestParallelCmd = 'jest-parallel';
    
    console.log('🌐 Running Jest Parallel Worker with BrowserStack...');
    console.log(`📦 Using BrowserStack SDK: ${browserstackCmd}`);
    
    // Build the complete command
    const fullArgs = ['npx', jestParallelCmd, ...jestParallelArgs];
    
    return new Promise((resolve, reject) => {
      const child = spawn(browserstackCmd, fullArgs, {
        stdio: 'inherit',
        env: {
          ...process.env,
          ...browserstackOptions
        },
        cwd: process.cwd()
      });

      child.on('close', (code) => {
        if (code === 0) {
          console.log('✅ BrowserStack + Jest Parallel Worker execution completed successfully');
          resolve({ success: true, exitCode: code });
        } else {
          console.error(`❌ BrowserStack + Jest Parallel Worker execution failed with code ${code}`);
          reject(new Error(`Execution failed with exit code ${code}`));
        }
      });

      child.on('error', (error) => {
        console.error('❌ Failed to start BrowserStack SDK wrapper:', error);
        reject(error);
      });
    });

  } catch (error) {
    console.error('❌ BrowserStack integration error:', error.message);
    throw error;
  }
}

/**
 * Find BrowserStack command
 */
function findBrowserStackCommand() {
  const possibleCommands = [
    'npx browserstack-node-sdk',
    'npx browserstack-cli',
    './node_modules/.bin/browserstack-node-sdk',
    './node_modules/.bin/browserstack-cli'
  ];

  for (const cmd of possibleCommands) {
    try {
      if (cmd.startsWith('npx')) {
        // For npx commands, just return them - npx will handle resolution
        return cmd.split(' ')[1]; // Return just the package name for npx
      } else {
        // For direct paths, check if they exist
        if (fs.existsSync(cmd)) {
          return cmd;
        }
      }
    } catch (error) {
      continue;
    }
  }

  return null;
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);
  
  // Parse browserstack options from environment
  const browserstackOptions = {
    BROWSERSTACK_USERNAME: process.env.BROWSERSTACK_USERNAME,
    BROWSERSTACK_ACCESS_KEY: process.env.BROWSERSTACK_ACCESS_KEY,
    BROWSERSTACK_BUILD_NAME: process.env.BROWSERSTACK_BUILD_NAME || 'Jest Parallel Worker Tests',
    BROWSERSTACK_PROJECT_NAME: process.env.BROWSERSTACK_PROJECT_NAME || 'Jest Parallel Tests',
    BROWSERSTACK_LOCAL: process.env.BROWSERSTACK_LOCAL || 'false'
  };

  runWithBrowserStack(args, browserstackOptions)
    .then((result) => {
      process.exit(result.exitCode);
    })
    .catch((error) => {
      console.error('❌ Execution failed:', error.message);
      process.exit(1);
    });
}

module.exports = { runWithBrowserStack, findBrowserStackCommand };
