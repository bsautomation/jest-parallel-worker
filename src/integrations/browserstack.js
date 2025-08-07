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
    this.browserstackSdkVersion = this.getBrowserStackSdkVersion();
  }

  /**
   * Get BrowserStack SDK version for compatibility checking
   */
  getBrowserStackSdkVersion() {
    try {
      const browserstackPackagePath = require.resolve('browserstack-node-sdk/package.json');
      const browserstackPackage = require(browserstackPackagePath);
      return browserstackPackage.version;
    } catch (error) {
      return null;
    }
  }

  /**
   * Check if BrowserStack SDK version is compatible
   */
  isCompatibleVersion(version) {
    if (!version) return true; // Assume compatible if version can't be determined
    
    try {
      const [major, minor] = version.split('.').map(Number);
      
      // Support BrowserStack SDK v1.30.0 and above
      // Add future version compatibility rules here
      if (major >= 2) {
        // Future major versions - assume compatible unless proven otherwise
        console.log(`ℹ️  Using BrowserStack SDK v${version} - future version detected, compatibility assumed`);
        return true;
      }
      
      if (major === 1 && minor >= 30) {
        return true;
      }
      
      console.warn(`⚠️  BrowserStack SDK v${version} may not be fully compatible. Recommended: v1.30.0+`);
      return true; // Allow it but warn
    } catch (error) {
      console.warn(`⚠️  Could not parse BrowserStack SDK version: ${version}`);
      return true; // Assume compatible if parsing fails
    }
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
   * Find Jest Parallel Worker binary path
   */
  findJestParallelBinary() {
    const possiblePaths = [
      // When used from the jest-parallel-worker package itself
      path.resolve(__dirname, '../../bin/jest-parallel.js'),
      
      // When jest-parallel-worker is installed as a dependency
      path.resolve(process.cwd(), 'node_modules/jest-parallel-worker/bin/jest-parallel.js'),
      path.resolve(process.cwd(), 'node_modules/.bin/jest-parallel'),
      
      // When used from a different working directory
      path.resolve(__dirname, '../../../jest-parallel-worker/bin/jest-parallel.js'),
      
      // Try to locate via require.resolve
      null // Will be handled in the try-catch below
    ];

    // Try the predefined paths first
    for (const binPath of possiblePaths) {
      if (binPath && fs.existsSync(binPath)) {
        return binPath;
      }
    }

    // Try to resolve using Node.js module resolution
    try {
      const jestParallelPackage = require.resolve('jest-parallel-worker/package.json');
      const packageDir = path.dirname(jestParallelPackage);
      const binPath = path.join(packageDir, 'bin/jest-parallel.js');
      if (fs.existsSync(binPath)) {
        return binPath;
      }
    } catch (error) {
      // Package not found via require.resolve
    }

    // Try global installation
    try {
      const { execSync } = require('child_process');
      const globalPath = execSync('npm root -g', { encoding: 'utf8' }).trim();
      const globalBin = path.join(globalPath, 'jest-parallel-worker', 'bin', 'jest-parallel.js');
      if (fs.existsSync(globalBin)) {
        return globalBin;
      }
    } catch (error) {
      // Ignore errors when checking global installation
    }

    throw new Error('Could not locate jest-parallel binary. Please ensure jest-parallel-worker is properly installed.');
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

    // Find Jest Parallel Worker binary
    const jestParallelBin = this.findJestParallelBinary();
    
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
      // Local project installation
      'node_modules/.bin/browserstack-node-sdk',
      'node_modules/.bin/browserstack-cli',
      path.resolve(process.cwd(), 'node_modules/.bin/browserstack-node-sdk'),
      path.resolve(process.cwd(), 'node_modules/.bin/browserstack-cli'),
      
      // Parent directory installations (when jest-parallel-worker is a dependency)
      path.resolve(process.cwd(), '../.bin/browserstack-node-sdk'),
      path.resolve(process.cwd(), '../.bin/browserstack-cli'),
      path.resolve(process.cwd(), '../../node_modules/.bin/browserstack-node-sdk'),
      path.resolve(process.cwd(), '../../node_modules/.bin/browserstack-cli')
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
      
      // Check version compatibility
      if (this.browserstackSdkVersion) {
        console.log(`📦 BrowserStack SDK version: ${this.browserstackSdkVersion}`);
        if (!this.isCompatibleVersion(this.browserstackSdkVersion)) {
          console.warn('⚠️  Version compatibility warning - proceeding anyway');
        }
      }
      
      // Use browserstack-node-sdk as wrapper with dynamic argument handling
      const sdkArgs = this.buildBrowserStackArgs(jestParallelBin, args);
      
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
   * Build BrowserStack SDK arguments with future-proof handling
   */
  buildBrowserStackArgs(jestParallelBin, args) {
    // Handle different BrowserStack SDK versions and their argument patterns
    const [major, minor] = this.browserstackSdkVersion ? 
      this.browserstackSdkVersion.split('.').map(Number) : [1, 30];
    
    // Future-proof argument building
    if (major >= 2 || (major === 1 && minor >= 40)) {
      // Future versions may have different argument patterns
      // This is extensible for new BrowserStack SDK features
      return ['node', jestParallelBin, ...args];
    } else {
      // Current version pattern
      return ['node', jestParallelBin, ...args];
    }
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
