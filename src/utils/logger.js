const chalk = require('chalk');

class Logger {
  constructor(verbose = false, silent = false) {
    this.verbose = verbose;
    this.silent = silent;
    this.startTime = Date.now();
  }

  log(...args) {
    if (!this.silent) {
      console.log(this._formatMessage('INFO', ...args));
    }
  }

  info(...args) {
    if (!this.silent) {
      console.log(chalk.blue(this._formatMessage('INFO', ...args)));
    }
  }

  success(...args) {
    if (!this.silent) {
      console.log(chalk.green(this._formatMessage('SUCCESS', ...args)));
    }
  }

  warn(...args) {
    if (!this.silent) {
      console.warn(chalk.yellow(this._formatMessage('WARN', ...args)));
    }
  }

  error(...args) {
    console.error(chalk.red(this._formatMessage('ERROR', ...args)));
  }

  debug(...args) {
    if (this.verbose && !this.silent) {
      console.log(chalk.gray(this._formatMessage('DEBUG', ...args)));
    }
  }

  worker(workerId, ...args) {
    if (!this.silent) {
      const pid = process.pid;
      const memUsage = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
      console.log(chalk.cyan(this._formatMessage(`WORKER-${workerId}`, `[PID:${pid}|MEM:${memUsage}MB]`, ...args)));
    }
  }

  progress(current, total, message = '') {
    if (!this.silent) {
      const percentage = Math.round((current / total) * 100);
      const bar = '█'.repeat(Math.floor(percentage / 2)) + '░'.repeat(50 - Math.floor(percentage / 2));
      process.stdout.write(`\r${chalk.blue('Progress:')} [${bar}] ${percentage}% (${current}/${total}) ${message}`);
      if (current === total) {
        console.log(''); // New line when complete
      }
    }
  }

  _formatMessage(level, ...args) {
    const timestamp = new Date().toISOString();
    const elapsed = Date.now() - this.startTime;
    const pid = process.pid;
    const memUsage = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
    
    return `[${timestamp}] [${elapsed}ms] [PID:${pid}|MEM:${memUsage}MB] [${level}] ${args.join(' ')}`;
  }

  getMemoryUsage() {
    const usage = process.memoryUsage();
    return {
      rss: Math.round(usage.rss / 1024 / 1024),
      heapTotal: Math.round(usage.heapTotal / 1024 / 1024),
      heapUsed: Math.round(usage.heapUsed / 1024 / 1024),
      external: Math.round(usage.external / 1024 / 1024)
    };
  }

  logMemoryUsage(context = '') {
    if (this.verbose) {
      const usage = this.getMemoryUsage();
      this.debug(`Memory Usage ${context}:`, JSON.stringify(usage));
    }
  }
}

module.exports = { Logger };
