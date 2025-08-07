/**
 * BrowserStack integration for Jest Parallel Worker
 * Provides compatibility with browserstack-node-sdk
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

class BrowserStackIntegration {
  constructor(options = {}) {
    this.options = options;
    this.browserstackConfig = this.loadBrowserStackConfig();
  }

  /**
   * Load BrowserStack configuration from browserstack.yml or environment
   */
  loadBrowserStackConfig() {
    const configPaths = [
      'browserstack.yml',
      'browserstack.yaml',
      '.browserstack.yml',
      '.browserstack.yaml'
    ];

    for (const configPath of configPaths) {
      if (fs.existsSync(configPath)) {
        try {
          const yaml = require('js-yaml');
          const content = fs.readFileSync(configPath, 'utf8');
          return yaml.load(content);
        } catch (error) {
          console.warn(`Warning: Failed to load BrowserStack config from ${configPath}:`, error.message);
        }
      }
    }

    // Fallback to environment variables
    return {
      userName: process.env.BROWSERSTACK_USERNAME,
      accessKey: process.env.BROWSERSTACK_ACCESS_KEY,
      buildName: process.env.BROWSERSTACK_BUILD_NAME || `jest-parallel-${Date.now()}`,
      projectName: process.env.BROWSERSTACK_PROJECT_NAME || 'Jest Parallel Worker Tests',
      local: process.env.BROWSERSTACK_LOCAL === 'true'
    };
  }

  /**
   * Run Jest Parallel Worker with BrowserStack SDK wrapper
   */
  async runWithBrowserStack(jestParallelOptions = {}) {
    // Prepare environment variables
    const env = {
      ...process.env,
      BROWSERSTACK_USERNAME: this.browserstackConfig.userName,
      BROWSERSTACK_ACCESS_KEY: this.browserstackConfig.accessKey,
      BROWSERSTACK_BUILD_NAME: this.browserstackConfig.buildName,
      BROWSERSTACK_PROJECT_NAME: this.browserstackConfig.projectName,
      BROWSERSTACK_LOCAL: this.browserstackConfig.local?.toString() || 'false'
    };

    // Path to jest-parallel binary
    const jestParallelBin = path.resolve(__dirname, '../../bin/jest-parallel.js');
    
    // Build command arguments
    const args = ['run'];
    
    // Add Jest Parallel Worker options
    if (jestParallelOptions.testMatch) {
      args.push('--testMatch', Array.isArray(jestParallelOptions.testMatch) 
        ? jestParallelOptions.testMatch.join(' ') 
        : jestParallelOptions.testMatch);
    }
    
    if (jestParallelOptions.mode) {
      args.push('--mode', jestParallelOptions.mode);
    }
    
    if (jestParallelOptions.maxWorkers) {
      args.push('--maxWorkers', jestParallelOptions.maxWorkers.toString());
    }
    
    if (jestParallelOptions.timeout) {
      args.push('--timeout', jestParallelOptions.timeout.toString());
    }
    
    if (jestParallelOptions.verbose) {
      args.push('--verbose');
    }
    
    if (jestParallelOptions.reporter) {
      args.push('--reporter', jestParallelOptions.reporter);
    }

    // Check if browserstack-node-sdk is available
    const browserstackSdkBin = this.findBrowserStackSdk();
    
    if (browserstackSdkBin) {
      // Use browserstack-node-sdk as wrapper
      return this.runWithSdkWrapper(browserstackSdkBin, jestParallelBin, args, env);
    } else {
      // Run directly with BrowserStack environment
      return this.runDirectly(jestParallelBin, args, env);
    }
  }

  /**
   * Find browserstack-node-sdk binary
   */
  findBrowserStackSdk() {
    const possiblePaths = [
      'node_modules/.bin/browserstack-node-sdk',
      'node_modules/.bin/browserstack-cli',
      path.resolve(process.cwd(), 'node_modules/.bin/browserstack-node-sdk'),
      path.resolve(process.cwd(), 'node_modules/.bin/browserstack-cli')
    ];

    for (const binPath of possiblePaths) {
      if (fs.existsSync(binPath)) {
        return binPath;
      }
    }

    // Try global installation
    try {
      const { execSync } = require('child_process');
      const globalPath = execSync('npm root -g', { encoding: 'utf8' }).trim();
      const globalBin = path.join(globalPath, '.bin', 'browserstack-node-sdk');
      if (fs.existsSync(globalBin)) {
        return globalBin;
      }
    } catch (error) {
      // Ignore errors when checking global installation
    }

    return null;
  }

  /**
   * Run with BrowserStack SDK wrapper
   */
  async runWithSdkWrapper(browserstackSdkBin, jestParallelBin, args, env) {
    return new Promise((resolve, reject) => {
      console.log('🌐 Running Jest Parallel Worker with BrowserStack SDK...');
      
      // Use browserstack-node-sdk as wrapper: browserstack-node-sdk node jest-parallel.js run ...
      const sdkArgs = ['node', jestParallelBin, ...args];
      
      const child = spawn(browserstackSdkBin, sdkArgs, {
        stdio: 'inherit',
        env,
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
  }

  /**
   * Run directly with BrowserStack environment
   */
  async runDirectly(jestParallelBin, args, env) {
    return new Promise((resolve, reject) => {
      console.log('🌐 Running Jest Parallel Worker with BrowserStack environment...');
      console.log('ℹ️  Note: Install browserstack-node-sdk for enhanced BrowserStack features');
      
      const child = spawn('node', [jestParallelBin, ...args], {
        stdio: 'inherit',
        env,
        cwd: process.cwd()
      });

      child.on('close', (code) => {
        if (code === 0) {
          console.log('✅ Jest Parallel Worker execution completed successfully');
          resolve({ success: true, exitCode: code });
        } else {
          console.error(`❌ Jest Parallel Worker execution failed with code ${code}`);
          reject(new Error(`Execution failed with exit code ${code}`));
        }
      });

      child.on('error', (error) => {
        console.error('❌ Failed to start Jest Parallel Worker:', error);
        reject(error);
      });
    });
  }
}

module.exports = { BrowserStackIntegration };
