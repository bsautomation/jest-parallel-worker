const fs = require('fs');
const path = require('path');
const chalk = require('chalk');

/**
 * Logger utility that writes to both console and log file
 */
class Logger {
  constructor(options = {}) {
    // Find package root directory (where package.json is located)
    let rootDir = process.cwd();
    
    // Walk up to find package.json (max 5 levels up)
    for (let i = 0; i < 5; i++) {
      if (fs.existsSync(path.join(rootDir, 'package.json'))) {
        break;
      }
      const parentDir = path.dirname(rootDir);
      if (parentDir === rootDir) {
        break; // We've reached the filesystem root
      }
      rootDir = parentDir;
    }
    
    this.options = {
      rootDir,
      logDir: path.join(rootDir, 'logs'),
      logFile: 'jest_parallel_runner.log',
      timestamp: true,
      ...options
    };

    this.setupLogDir();
    this.logFilePath = path.join(this.options.logDir, this.options.logFile);
    
    // Create or clear the log file
    fs.writeFileSync(this.logFilePath, '', 'utf8');
    
    // Log the file location for user reference
    this._internalLog(`Logs will be written to: ${this.logFilePath}`);
  }

  setupLogDir() {
    // Ensure the log directory exists
    if (!fs.existsSync(this.options.logDir)) {
      fs.mkdirSync(this.options.logDir, { recursive: true });
    }
  }

  getTimestamp() {
    if (!this.options.timestamp) return '';
    
    const now = new Date();
    return `[${now.toISOString()}] `;
  }

  write(message, logToConsole = true) {
    const timestamp = this.getTimestamp();
    const logMessage = `${timestamp}${message}\n`;
    
    // Append to log file
    fs.appendFileSync(this.logFilePath, logMessage, 'utf8');
    
    // Also log to console if requested
    if (logToConsole) {
      // Strip ANSI color codes for file logging but keep them for console
      process.stdout.write(logMessage);
    }
  }

  log(message) {
    this.write(message);
  }

  info(message) {
    const coloredMessage = chalk.blue(message);
    this.write(coloredMessage);
    // Write uncolored version to file
    this.write(message, false);
  }

  success(message) {
    const coloredMessage = chalk.green(message);
    this.write(coloredMessage);
    // Write uncolored version to file
    this.write(message, false);
  }

  warn(message) {
    const coloredMessage = chalk.yellow(message);
    this.write(coloredMessage);
    // Write uncolored version to file
    this.write(message, false);
  }

  error(message) {
    const coloredMessage = chalk.red(message);
    this.write(coloredMessage);
    // Write uncolored version to file
    this.write(message, false);
  }

  // Create a logger for test results
  testResult(success, message) {
    if (success) {
      this.success(message);
    } else {
      this.error(message);
    }
  }
  
  // Internal logging that doesn't get written to the log file
  _internalLog(message) {
    console.log(chalk.gray(`[Logger] ${message}`));
  }
}

// Create and export a singleton instance
const logger = new Logger();

module.exports = logger;