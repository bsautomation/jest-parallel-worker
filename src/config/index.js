const fs = require('fs');
const path = require('path');

/**
 * Configuration loader for Jest Parallel Worker
 */
class ConfigLoader {
  /**
   * Load configuration from various sources
   * @param {string} configPath - Optional specific config file path
   * @returns {Object} Configuration object
   */
  static loadConfig(configPath) {
    const possiblePaths = [
      configPath,
      'jest-parallel.config.js',
      'jest-parallel.config.json',
      '.jest-parallelrc',
      '.jest-parallelrc.js',
      '.jest-parallelrc.json'
    ].filter(Boolean);

    // Try to load from config files
    for (const configFile of possiblePaths) {
      const fullPath = path.resolve(configFile);
      if (fs.existsSync(fullPath)) {
        try {
          if (configFile.endsWith('.json') || configFile.startsWith('.jest-parallelrc')) {
            const content = fs.readFileSync(fullPath, 'utf8');
            return JSON.parse(content);
          } else if (configFile.endsWith('.js')) {
            // Clear require cache to allow reloading
            delete require.cache[require.resolve(fullPath)];
            return require(fullPath);
          }
        } catch (error) {
          console.warn(`Warning: Failed to load config from ${configFile}:`, error.message);
        }
      }
    }

    // Check package.json for jest-parallel config
    const packageJsonPath = path.resolve('package.json');
    if (fs.existsSync(packageJsonPath)) {
      try {
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
        if (packageJson['jest-parallel']) {
          return packageJson['jest-parallel'];
        }
      } catch (error) {
        console.warn('Warning: Failed to read package.json:', error.message);
      }
    }

    return {};
  }

  /**
   * Get default configuration
   * @returns {Object} Default configuration
   */
  static getDefaultConfig() {
    return {
      mode: 'native-parallel',
      testMatch: 'tests/**/*.test.js',
      maxWorkers: require('os').cpus().length,
      timeout: 30000,
      forceConcurrent: false,
      verbose: false,
      outputDir: 'reports',
      reporter: 'both'
    };
  }

  /**
   * Merge configurations with precedence: CLI > config file > defaults
   * @param {Object} cliOptions - CLI provided options
   * @param {Object} fileConfig - Configuration from file
   * @returns {Object} Merged configuration
   */
  static mergeConfigs(cliOptions = {}, fileConfig = {}) {
    const defaultConfig = ConfigLoader.getDefaultConfig();
    
    // Merge with precedence: CLI > file > defaults
    return {
      ...defaultConfig,
      ...fileConfig,
      ...Object.fromEntries(
        Object.entries(cliOptions).filter(([_, value]) => value !== undefined && value !== null)
      )
    };
  }

  /**
   * Validate configuration object
   * @param {Object} config - Configuration to validate
   * @returns {Array} Array of validation errors (empty if valid)
   */
  static validateConfig(config) {
    const errors = [];
    
    if (!config.testMatch) {
      errors.push('testMatch is required');
    }
    
    const validModes = ['native-parallel', 'parallel-test', 'parallel-file', 'jest-parallel'];
    if (!validModes.includes(config.mode)) {
      errors.push(`Invalid mode: ${config.mode}. Valid modes: ${validModes.join(', ')}`);
    }
    
    if (config.maxWorkers && (typeof config.maxWorkers !== 'number' || config.maxWorkers < 1)) {
      errors.push('maxWorkers must be a number >= 1');
    }
    
    if (config.timeout && (typeof config.timeout !== 'number' || config.timeout < 1000)) {
      errors.push('timeout must be a number >= 1000ms');
    }
    
    const validReporters = ['console', 'html', 'both'];
    if (config.reporter && !validReporters.includes(config.reporter)) {
      errors.push(`Invalid reporter: ${config.reporter}. Valid reporters: ${validReporters.join(', ')}`);
    }
    
    return errors;
  }
}

module.exports = {
  ConfigLoader,
  loadConfig: ConfigLoader.loadConfig,
  getDefaultConfig: ConfigLoader.getDefaultConfig,
  mergeConfigs: ConfigLoader.mergeConfigs,
  validateConfig: ConfigLoader.validateConfig
};
