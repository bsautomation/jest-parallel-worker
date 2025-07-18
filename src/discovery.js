const fs = require('fs');
const path = require('path');

// Logger utility
class Logger {
  constructor(logFilePath) {
    this.logFilePath = logFilePath;
    this.ensureLogDirectory();
  }

  ensureLogDirectory() {
    const logDir = path.dirname(this.logFilePath);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
  }

  log(level, message, data = null) {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level,
      message,
      data
    };

    // Console output
    const consoleMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}`;
    if (level === 'error') {
      console.error(consoleMessage);
    } else {
      console.log(consoleMessage);
    }

    // File output
    try {
      const logLine = JSON.stringify(logEntry) + '\n';
      fs.appendFileSync(this.logFilePath, logLine);
    } catch (error) {
      console.error('Failed to write to log file:', error.message);
    }
  }

  info(message, data) {
    this.log('info', message, data);
  }

  error(message, data) {
    this.log('error', message, data);
  }

  debug(message, data) {
    this.log('debug', message, data);
  }
}

// HTML Report Generator
class HTMLReportGenerator {
  static generateReport(results, outputPath = 'reports/jest-parallel-report.html') {
    const reportDir = path.dirname(outputPath);
    if (!fs.existsSync(reportDir)) {
      fs.mkdirSync(reportDir, { recursive: true });
    }

    const totalTests = results.length;
    const passedTests = results.filter(r => r.success).length;
    const failedTests = totalTests - passedTests;
    const totalDuration = results.reduce((sum, r) => sum + (r.duration || 0), 0);
    const avgDuration = totalDuration / totalTests;
    
    // Memory statistics
    const memoryStats = results
      .filter(r => r.memory && r.memory.final)
      .map(r => r.memory.final.heapUsed);
    const maxMemory = memoryStats.length > 0 ? Math.max(...memoryStats) : 0;
    const avgMemory = memoryStats.length > 0 ? memoryStats.reduce((sum, mem) => sum + mem, 0) / memoryStats.length : 0;

    const html = this.generateHTMLContent({
      totalTests,
      passedTests,
      failedTests,
      totalDuration,
      avgDuration,
      maxMemory,
      avgMemory,
      results,
      generatedAt: new Date().toISOString()
    });

    fs.writeFileSync(outputPath, html);
    return outputPath;
  }

  static generateHTMLContent(data) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Jest Parallel Test Report</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #f5f5f5; color: #333; }
        .container { max-width: 1200px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; border-radius: 10px; margin-bottom: 30px; text-align: center; }
        .header h1 { font-size: 2.5em; margin-bottom: 10px; }
        .header p { font-size: 1.1em; opacity: 0.9; }
        .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-bottom: 30px; }
        .stat-card { background: white; padding: 20px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); text-align: center; }
        .stat-number { font-size: 2em; font-weight: bold; margin-bottom: 5px; }
        .stat-label { color: #666; font-size: 0.9em; }
        .passed { color: #28a745; }
        .failed { color: #dc3545; }
        .duration { color: #17a2b8; }
        .memory { color: #6f42c1; }
        .section { background: white; padding: 25px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); margin-bottom: 30px; }
        .section h2 { margin-bottom: 20px; color: #333; border-bottom: 2px solid #eee; padding-bottom: 10px; }
        .test-grid { display: grid; gap: 15px; }
        .test-item { padding: 15px; border-radius: 8px; border-left: 4px solid; }
        .test-passed { background: #f8fff9; border-left-color: #28a745; }
        .test-failed { background: #fff8f8; border-left-color: #dc3545; }
        .test-name { font-weight: bold; margin-bottom: 8px; }
        .test-details { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; font-size: 0.9em; color: #666; }
        .test-error { background: #fff5f5; border: 1px solid #feb2b2; border-radius: 4px; padding: 10px; margin-top: 10px; font-family: monospace; font-size: 0.8em; white-space: pre-wrap; }
        .progress-bar { background: #e9ecef; border-radius: 4px; height: 8px; margin: 10px 0; overflow: hidden; }
        .progress-fill { height: 100%; transition: width 0.3s ease; }
        .progress-passed { background: #28a745; }
        .progress-failed { background: #dc3545; }
        .footer { text-align: center; margin-top: 30px; color: #666; font-size: 0.9em; }
        .chart-container { height: 300px; margin: 20px 0; }
        @media (max-width: 768px) { .stats-grid { grid-template-columns: 1fr 1fr; } .test-details { grid-template-columns: 1fr; } }
    </style>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🚀 Jest Parallel Test Report</h1>
            <p>Generated on ${new Date(data.generatedAt).toLocaleString()}</p>
        </div>

        <div class="stats-grid">
            <div class="stat-card">
                <div class="stat-number">${data.totalTests}</div>
                <div class="stat-label">Total Tests</div>
            </div>
            <div class="stat-card">
                <div class="stat-number passed">${data.passedTests}</div>
                <div class="stat-label">Passed</div>
            </div>
            <div class="stat-card">
                <div class="stat-number failed">${data.failedTests}</div>
                <div class="stat-label">Failed</div>
            </div>
            <div class="stat-card">
                <div class="stat-number duration">${(data.totalDuration / 1000).toFixed(1)}s</div>
                <div class="stat-label">Total Duration</div>
            </div>
            <div class="stat-card">
                <div class="stat-number duration">${(data.avgDuration / 1000).toFixed(1)}s</div>
                <div class="stat-label">Avg Duration</div>
            </div>
            <div class="stat-card">
                <div class="stat-number memory">${this.formatBytes(data.maxMemory)}</div>
                <div class="stat-label">Peak Memory</div>
            </div>
        </div>

        <div class="section">
            <h2>📊 Test Results Overview</h2>
            <div class="progress-bar">
                <div class="progress-fill progress-passed" style="width: ${(data.passedTests / data.totalTests * 100).toFixed(1)}%"></div>
            </div>
            <p style="text-align: center; margin-top: 10px;">
                ${data.passedTests} passed (${(data.passedTests / data.totalTests * 100).toFixed(1)}%) • 
                ${data.failedTests} failed (${(data.failedTests / data.totalTests * 100).toFixed(1)}%)
            </p>
            
            <div class="chart-container">
                <canvas id="durationChart"></canvas>
            </div>
        </div>

        ${data.failedTests > 0 ? `
        <div class="section">
            <h2>❌ Failed Tests</h2>
            <div class="test-grid">
                ${data.results.filter(r => !r.success).map(result => `
                    <div class="test-item test-failed">
                        <div class="test-name">${this.escapeHtml(result.testCase.fullName)}</div>
                        <div class="test-details">
                            <div><strong>Duration:</strong> ${result.duration || 0}ms</div>
                            <div><strong>PID:</strong> ${result.pid}</div>
                            <div><strong>Memory:</strong> ${result.memory ? this.formatBytes(result.memory.final.heapUsed) : 'N/A'}</div>
                        </div>
                        ${result.error ? `<div class="test-error">${this.escapeHtml(result.error.message || result.error)}</div>` : ''}
                    </div>
                `).join('')}
            </div>
        </div>
        ` : ''}

        <div class="section">
            <h2>📋 All Test Results</h2>
            <div class="test-grid">
                ${data.results.map(result => `
                    <div class="test-item ${result.success ? 'test-passed' : 'test-failed'}">
                        <div class="test-name">
                            ${result.success ? '✅' : '❌'} ${this.escapeHtml(result.testCase.fullName)}
                        </div>
                        <div class="test-details">
                            <div><strong>Duration:</strong> ${result.duration || 0}ms</div>
                            <div><strong>PID:</strong> ${result.pid}</div>
                            <div><strong>Memory:</strong> ${result.memory ? this.formatBytes(result.memory.final.heapUsed) : 'N/A'}</div>
                            <div><strong>Status:</strong> ${result.success ? 'PASSED' : 'FAILED'}</div>
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>

        <div class="footer">
            <p>Report generated by Jest Parallel Runner • ${new Date(data.generatedAt).toLocaleString()}</p>
        </div>
    </div>

    <script>
        // Duration Chart
        const ctx = document.getElementById('durationChart').getContext('2d');
        const testData = ${JSON.stringify(data.results)};
        
        new Chart(ctx, {
            type: 'bar',
            data: {
                labels: testData.map((_, i) => \`Test \${i + 1}\`),
                datasets: [{
                    label: 'Test Duration (ms)',
                    data: testData.map(r => r.duration || 0),
                    backgroundColor: testData.map(r => r.success ? '#28a745' : '#dc3545'),
                    borderColor: testData.map(r => r.success ? '#1e7e34' : '#c82333'),
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: 'Duration (ms)'
                        }
                    },
                    x: {
                        title: {
                            display: true,
                            text: 'Tests'
                        }
                    }
                },
                plugins: {
                    title: {
                        display: true,
                        text: 'Test Execution Duration'
                    },
                    legend: {
                        display: false
                    }
                }
            }
        });
    </script>
</body>
</html>`;
  }

  static formatBytes(bytes) {
    if (typeof bytes !== 'number' || isNaN(bytes)) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = Math.abs(bytes);
    let unitIndex = 0;
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    return `${size.toFixed(2)} ${units[unitIndex]}`;
  }

  static escapeHtml(text) {
    if (!text) return '';
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}

const { spawn } = require('child_process');

const babel = require('@babel/core');
const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;

class TestDiscovery {
  static async discoverTests(testFiles) {
    const allTests = [];
    
    for (const file of testFiles) {
      try {
        const tests = await this.extractTestsFromFile(file);
        allTests.push(...tests);
      } catch (error) {
        console.warn(`Could not parse ${file}:`, error.message);
        // Fallback to regex-based discovery
        const fallbackTests = await this.extractTestsWithRegex(file);
        allTests.push(...fallbackTests);
      }
    }
    
    return allTests;
  }

  static async extractTestsFromFile(filePath) {
    const content = fs.readFileSync(filePath, 'utf8');
    const tests = [];
    
    try {
      const ast = parser.parse(content, {
        sourceType: 'module',
        plugins: [
          'typescript', 
          'jsx', 
          'decorators-legacy',
          'classProperties',
          'objectRestSpread',
          'asyncGenerators',
          'functionBind',
          'dynamicImport'
        ],
        allowImportExportEverywhere: true,
        allowReturnOutsideFunction: true,
        errorRecovery: true
      });

      let currentDescribe = '';
      let describeStack = [];
      let describeDepth = 0;
      
      traverse(ast, {
        CallExpression: {
          enter(path) {
            try {
              const { node } = path;
              
              // Handle describe blocks
              if (node.callee.name === 'describe' || 
                  (node.callee.type === 'MemberExpression' && 
                   node.callee.object && node.callee.object.name === 'describe')) {
                
                const describeTitle = TestDiscovery.getStringValue(node.arguments[0]) || '';
                describeStack.push(describeTitle);
                currentDescribe = describeStack.join(' ');
                describeDepth++;
              }
              
              // Handle test blocks (it, test, fit, xit, etc.)
              if ((node.callee.name === 'it' || node.callee.name === 'test' ||
                   node.callee.name === 'fit' || node.callee.name === 'xit') ||
                  (node.callee.type === 'MemberExpression' && 
                   node.callee.object && 
                   (node.callee.object.name === 'it' || node.callee.object.name === 'test'))) {
                
                const testTitle = TestDiscovery.getStringValue(node.arguments[0]) || '';
                const fullName = currentDescribe ? `${currentDescribe} ${testTitle}` : testTitle;
                
                tests.push({
                  name: testTitle,
                  file: filePath,
                  fullName,
                  describe: currentDescribe,
                  timeout: TestDiscovery.extractTimeout(node),
                  skip: TestDiscovery.isSkipped(node),
                  only: TestDiscovery.isOnly(node)
                });
              }
            } catch (nodeError) {
              // Continue processing other nodes if one fails
              console.warn(`Error processing node in ${filePath}:`, nodeError.message);
            }
          },
          
          exit(path) {
            try {
              const { node } = path;
              
              // When exiting a describe block, pop from stack
              if (node.callee.name === 'describe' || 
                  (node.callee.type === 'MemberExpression' && 
                   node.callee.object && node.callee.object.name === 'describe')) {
                
                if (describeStack.length > 0) {
                  describeStack.pop();
                  currentDescribe = describeStack.join(' ');
                  describeDepth--;
                }
              }
            } catch (nodeError) {
              // Continue processing
            }
          }
        }
      });
    } catch (error) {
      throw new Error(`AST parsing failed: ${error.message}`);
    }
    
    return tests;
  }

  static async extractTestsWithRegex(filePath) {
    const content = fs.readFileSync(filePath, 'utf8');
    const tests = [];
    
    // Enhanced regex patterns to capture more test variations
    const patterns = [
      // Standard test patterns
      /(?:^|\s)(it|test|fit|xit)\s*\(\s*['"`]([^'"`]+)['"`]/gm,
      // Method chaining patterns (it.skip, test.only, etc.)
      /(?:^|\s)(it|test)\.(?:skip|only)\s*\(\s*['"`]([^'"`]+)['"`]/gm,
      // Template literal patterns
      /(?:^|\s)(it|test|fit|xit)\s*\(\s*`([^`]+)`/gm
    ];
    
    let currentDescribe = '';
    
    // First, find describe blocks to get context
    const describePattern = /describe\s*\(\s*['"`]([^'"`]+)['"`]/g;
    const lines = content.split('\n');
    const testsByLine = new Map();
    
    // Extract describe blocks by line number
    lines.forEach((line, index) => {
      const describeMatch = describePattern.exec(line);
      if (describeMatch) {
        // Simple approach: assume describe applies to subsequent tests
        // This is not perfect but works for most cases
        currentDescribe = describeMatch[1];
      }
      
      // Reset regex state
      describePattern.lastIndex = 0;
    });
    
    // Now extract tests with all patterns
    patterns.forEach(pattern => {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const testFunction = match[1]; // it, test, fit, xit, etc.
        const testName = match[2];
        
        // Determine if test is skipped or focused
        const isSkipped = testFunction.includes('x') || match[0].includes('.skip');
        const isFocused = testFunction.includes('f') || match[0].includes('.only');
        
        // Try to find the enclosing describe by looking backwards in content
        const beforeMatch = content.substring(0, match.index);
        const describeMatches = [...beforeMatch.matchAll(/describe\s*\(\s*['"`]([^'"`]+)['"`]/g)];
        const lastDescribe = describeMatches.length > 0 ? 
          describeMatches[describeMatches.length - 1][1] : '';
        
        const fullName = lastDescribe ? `${lastDescribe} ${testName}` : testName;
        
        tests.push({
          name: testName,
          file: filePath,
          fullName,
          describe: lastDescribe,
          skip: isSkipped,
          only: isFocused
        });
      }
      
      // Reset regex state
      pattern.lastIndex = 0;
    });
    
    return tests;
  }

  static getStringValue(node) {
    if (!node) return '';
    if (node.type === 'StringLiteral') return node.value;
    if (node.type === 'Literal') return node.value;
    if (node.type === 'TemplateLiteral' && node.quasis.length === 1) {
      return node.quasis[0].value.cooked;
    }
    return '';
  }

  static extractTimeout(node) {
    if (node.arguments[2] && node.arguments[2].type === 'NumericLiteral') {
      return node.arguments[2].value;
    }
    return undefined;
  }

  static isSkipped(node) {
    // Check for .skip method calls (it.skip, test.skip)
    if (node.callee.type === 'MemberExpression' && 
        node.callee.property && 
        node.callee.property.name === 'skip') {
      return true;
    }
    
    // Check for xit() or xtest() functions
    if (node.callee.name === 'xit' || node.callee.name === 'xtest') {
      return true;
    }
    
    return false;
  }

  static isOnly(node) {
    // Check for .only method calls (it.only, test.only)
    if (node.callee.type === 'MemberExpression' && 
        node.callee.property && 
        node.callee.property.name === 'only') {
      return true;
    }
    
    // Check for fit() or ftest() functions
    if (node.callee.name === 'fit' || node.callee.name === 'ftest') {
      return true;
    }
    
    return false;
  }
}

class ProcessPool {
  constructor(workerCount, jestConfig, jestArgs = [], logFilePath = 'logs/jest-parallel-runner.log', options = {}) {
    this.workerCount = workerCount;
    this.jestConfig = jestConfig;
    this.jestArgs = jestArgs;
    this.runningProcesses = new Map();
    this.queue = [];
    this.activeCount = 0;
    this.logger = new Logger(logFilePath);
    
    // Set timeout values, using CLI options or defaults
    this.timeouts = {
      jest: options.jestTimeout || 300000,      // Jest's own timeout (default: 120s)
      worker: options.workerTimeout || 300000,  // Graceful shutdown timeout (default: 125s)
      force: options.forceTimeout || 300000     // Force kill timeout (default: 130s)
    };
    
    this.logger.info('ProcessPool initialized', {
      workerCount,
      jestConfig,
      jestArgs: jestArgs.length,
      timeouts: this.timeouts
    });
  }

  async runTest(testCase) {
    this.logger.info('Test queued', { testName: testCase.fullName });
    return new Promise((resolve, reject) => {
      this.queue.push({ testCase, resolve, reject });
      this.processQueue();
    });
  }

  processQueue() {
    // High-level progress logging
    if (this.queue.length > 0 || this.activeCount > 0) {
      console.error(`🔄 Workers: ${this.activeCount}/${this.workerCount} active | Queue: ${this.queue.length} pending`);
    }
    
    while (this.queue.length > 0 && this.activeCount < this.workerCount) {
      const { testCase, resolve, reject } = this.queue.shift();
      this.activeCount++;
      
      this.spawnTestProcess(testCase)
        .then(result => {
          this.logger.info('Test completed', {
            testName: testCase.fullName,
            success: result.success,
            duration: result.duration,
            pid: result.pid
          });
          resolve(result);
        })
        .catch(error => {
          this.logger.error('Test failed', {
            testName: testCase.fullName,
            error: error.message
          });
          reject(error);
        })
        .finally(() => {
          this.activeCount--;
          
          // Process next tests in queue
          setTimeout(() => {
            this.processQueue();
          }, 10);
        });
    }
    
    if (this.queue.length === 0 && this.activeCount === 0) {
      console.error(`🎉 All tests completed!`);
    }
  }

  async spawnTestProcess(testCase) {
    const workerScript = path.join(__dirname, 'worker.js');
    
    // Encode test data as base64 to avoid command line parsing issues
    const testData = {
      testCase,
      jestConfig: this.jestConfig,
      jestArgs: this.jestArgs
    };
    const encodedData = Buffer.from(JSON.stringify(testData)).toString('base64');
    
    return new Promise((resolve, reject) => {
      // Simplified worker spawning (removed verbose logging)
      
      const child = spawn('node', [
        workerScript,
        '--run-test',
        `--test-data=${encodedData}`
      ], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { 
          ...process.env, 
          NODE_ENV: 'test',
          JEST_WORKER_ID: Math.random().toString(36).substr(2, 9)
        }
      });

      const childPID = child.pid;
      
      let stdout = '';
      let stderr = '';
      let completed = false;

      child.stdout.on('data', (data) => {
        const chunk = data.toString();
        stdout += chunk;
        
        // Check if we have a complete result in the current stdout buffer
        const resultMatch = stdout.match(/__JEST_PARALLEL_RESULT_START__(.+?)__JEST_PARALLEL_RESULT_END__/s);
        if (resultMatch && !completed) {
          completed = true;
          
          try {
            const result = JSON.parse(resultMatch[1]);
            result.childProcessPID = childPID;
            result.pid = result.pid || childPID;
            resolve(result);
          } catch (parseError) {
            // Don't resolve here, let the close event handle it
            completed = false;
          }
        }
      });

      child.stderr.on('data', (data) => {
        const chunk = data.toString();
        stderr += chunk;
        // Forward worker logs to main process (simplified)
        process.stderr.write(`[Worker ${childPID}] ${chunk}`);
      });

      child.on('close', (exitCode) => {
        if (completed) {
          return; // Prevent double resolution
        }
        completed = true;
        
        // Simplified close event handling - only log on errors
        try {
          // Extract JSON result from stdout using markers
          const resultMatch = stdout.match(/__JEST_PARALLEL_RESULT_START__(.+?)__JEST_PARALLEL_RESULT_END__/s);
          
          if (resultMatch) {
            const result = JSON.parse(resultMatch[1]);
            result.childProcessPID = childPID;
            result.pid = result.pid || childPID;
            resolve(result);
          } else {
            // Fallback: try to parse the entire stdout if no markers found
            if (stdout.trim()) {
              try {
                const result = JSON.parse(stdout.trim());
                result.childProcessPID = childPID;
                result.pid = result.pid || childPID;
                resolve(result);
              } catch (parseError) {
                console.error(`[${new Date().toISOString()}] [Main] 💥 Failed to parse result for ${testCase.fullName}: ${parseError.message}`);
                resolve({
                  testCase,
                  success: false,
                  duration: 0,
                  pid: childPID,
                  childProcessPID: childPID,
                  error: new Error(`Parse error: ${parseError.message}`),
                  output: stdout,
                  stderr: stderr,
                  exitCode: exitCode
                });
              }
            } else {
              console.error(`[${new Date().toISOString()}] [Main] ❌ No output from worker for test: ${testCase.fullName}`);
              resolve({
                testCase,
                success: false,
                duration: 0,
                pid: childPID,
                childProcessPID: childPID,
                error: new Error(`No output from worker process`),
                output: stdout,
                stderr: stderr,
                exitCode: exitCode
              });
            }
          }
        } catch (parseError) {
          console.error(`[${new Date().toISOString()}] [Main] 💥 Failed to parse result for ${testCase.fullName}: ${parseError.message}`);
          resolve({
            testCase,
            success: false,
            duration: 0,
            pid: childPID,
            childProcessPID: childPID,
            error: new Error(`Failed to parse result: ${parseError.message}`),
            output: stdout,
            stderr: stderr,
            exitCode: exitCode
          });
        }
      });

      child.on('error', (error) => {
        if (completed) return;
        completed = true;
        
        console.error(`[${new Date().toISOString()}] [Main] 💥 Worker ${childPID} error:`, error.message);
        resolve({
          testCase,
          success: false,
          duration: 0,
          pid: childPID || 'unknown',
          childProcessPID: childPID || 'unknown',
          error: error,
          output: '',
          stderr: error.message,
          exitCode: 1
        });
      });

      // Timeout handling - Using configurable timeouts
      const jestTimeout = setTimeout(() => {
        if (completed) return;
        console.error(`[${new Date().toISOString()}] [Main] ⏰ Jest timeout (${this.timeouts.jest/1000}s) reached for test: ${testCase.fullName}, PID: ${childPID}`);
        // Don't kill yet, give Jest a chance to timeout internally
      }, this.timeouts.jest); // Jest's own timeout
      
      const workerTimeout = setTimeout(() => {
        if (completed) return;
        console.error(`[${new Date().toISOString()}] [Main] ⏰ Worker timeout (${this.timeouts.worker/1000}s) reached for test: ${testCase.fullName}, sending SIGTERM to PID: ${childPID}`);
        child.kill('SIGTERM'); // Try graceful shutdown first
      }, this.timeouts.worker); // Graceful shutdown timeout
      
      const forceTimeout = setTimeout(() => {
        if (completed) return;
        completed = true;
        
        console.error(`[${new Date().toISOString()}] [Main] ⏰ Force timeout (${this.timeouts.force/1000}s) reached for test: ${testCase.fullName}, killing PID: ${childPID}`);
        child.kill('SIGKILL'); // Force kill
        resolve({
          testCase,
          success: false,
          duration: this.timeouts.force,
          pid: childPID,
          childProcessPID: childPID,
          error: new Error(`Test process timeout - killed by main process after ${this.timeouts.force/1000}s`),
          output: stdout,
          stderr: stderr + '\nProcess killed due to timeout',
          exitCode: 1
        });
      }, this.timeouts.force); // Force kill timeout

      child.on('close', () => {
        clearTimeout(jestTimeout);
        clearTimeout(workerTimeout);
        clearTimeout(forceTimeout);
      });
    });
  }

  async terminate() {
    // Wait for all running processes to complete
    const promises = Array.from(this.runningProcesses.values());
    await Promise.allSettled(promises);
    this.runningProcesses.clear();
  }
}

// Helper function for formatting bytes
function formatBytes(bytes) {
  if (typeof bytes !== 'number' || isNaN(bytes)) {
    return '0 B';
  }
  
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = Math.abs(bytes);
  let unitIndex = 0;
  
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  
  const sign = bytes < 0 ? '-' : '';
  return `${sign}${size.toFixed(2)} ${units[unitIndex]}`;
}

// Summary report generation
function generateSummaryReport(results, logger = null, htmlReportPath = null) {
  const totalTests = results.length;
  const passedTests = results.filter(r => r.success).length;
  const failedTests = totalTests - passedTests;
  const totalDuration = results.reduce((sum, r) => sum + (r.duration || 0), 0);
  const avgDuration = totalDuration / totalTests;
  
  // Memory statistics
  const memoryStats = results
    .filter(r => r.memory && r.memory.final)
    .map(r => r.memory.final.heapUsed);
  const maxMemory = Math.max(...memoryStats);
  const avgMemory = memoryStats.reduce((sum, mem) => sum + mem, 0) / memoryStats.length;
  
  const summary = {
    totalTests,
    passedTests,
    failedTests,
    totalDuration,
    avgDuration,
    maxMemory,
    avgMemory,
    results
  };

  // Console output
  console.error('\n📊 TEST EXECUTION SUMMARY');
  console.error('=' .repeat(50));
  console.error(`Total Tests: ${totalTests}`);
  console.error(`✅ Passed: ${passedTests}`);
  console.error(`❌ Failed: ${failedTests}`);
  console.error(`⏱️  Total Duration: ${(totalDuration / 1000).toFixed(2)}s`);
  console.error(`📈 Average Duration: ${(avgDuration / 1000).toFixed(2)}s per test`);
  
  if (memoryStats.length > 0) {
    console.error(`🧠 Peak Memory: ${formatBytes(maxMemory)}`);
    console.error(`📊 Average Memory: ${formatBytes(avgMemory)}`);
  }
  
  // Show failed tests
  if (failedTests > 0) {
    console.error('\n❌ FAILED TESTS:');
    results.filter(r => !r.success).forEach(result => {
      console.error(`   • ${result.testCase.fullName}`);
      if (result.error) {
        console.error(`     Error: ${result.error.message || result.error}`);
      }
    });
  }
  
  console.error('=' .repeat(50));
  console.error(failedTests === 0 ? '🎉 All tests passed!' : `❌ ${failedTests} test(s) failed`);

  // Generate HTML report with custom path
  try {
    const reportPath = htmlReportPath || 'reports/jest-parallel-report.html';
    const htmlPath = HTMLReportGenerator.generateReport(results, reportPath);
    console.error(`📄 HTML Report: ${htmlPath}`);
    if (logger) {
      logger.info('HTML report generated', { path: htmlPath });
    }
  } catch (error) {
    console.error(`❌ Failed to generate HTML report: ${error.message}`);
    if (logger) {
      logger.error('HTML report generation failed', { error: error.message });
    }
  }

  // Log summary to file
  if (logger) {
    logger.info('Test execution completed', summary);
  }

  return summary;
}

module.exports = { 
  TestDiscovery, 
  ProcessPool, 
  Logger, 
  HTMLReportGenerator, 
  generateSummaryReport,
  formatBytes 
};