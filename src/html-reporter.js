/**
 * Jest HTML Reporter
 * Professional HTML report generator for Jest Parallel Runner
 * 
 * Usage:
 * const HTMLReportGenerator = require('./html-reporter');
 * HTMLReportGenerator.generateReport(results, outputPath, options);
 */

const fs = require('fs');
const path = require('path');

class HTMLReportGenerator {
  constructor(globalConfig = null, options = {}) {
    this.globalConfig = globalConfig;
    this.options = {
      outputPath: options.outputPath || 'reports/jest-report.html',
      pageTitle: options.pageTitle || 'Jest Test Report',
      includeFailureMsg: options.includeFailureMsg !== false,
      includeSuiteFailure: options.includeSuiteFailure !== false,
      ...options
    };
    
    this.testResults = [];
    this.startTime = Date.now();
  }

  // Static method for direct usage (non-Jest reporter)
  static async generateReport(results, outputPath = 'reports/jest-parallel-report.html', options = {}) {
    const reportDir = path.dirname(outputPath);
    if (!fs.existsSync(reportDir)) {
      fs.mkdirSync(reportDir, { recursive: true });
    }

    const totalTests = results.length;
    const passedTests = results.filter(r => r.success).length;
    const failedTests = totalTests - passedTests;
    const totalDuration = results.reduce((sum, r) => sum + (r.duration || 0), 0);
    const avgDuration = totalTests > 0 ? totalDuration / totalTests : 0;
    
    // Memory statistics
    const memoryStats = results
      .filter(r => r.memory && r.memory.final)
      .map(r => r.memory.final.heapUsed);
    const maxMemory = memoryStats.length > 0 ? Math.max(...memoryStats) : 0;

    const pageTitle = options.pageTitle || 'Jest Parallel Test Report';
    
    // Calculate performance comparison
    const sequentialTime = results.reduce((sum, r) => sum + (r.duration || 0), 0);
    const parallelTime = totalDuration;
    const timeSaved = sequentialTime - parallelTime;
    const timeSavedPercentage = sequentialTime > 0 ? ((timeSaved / sequentialTime) * 100).toFixed(1) : 0;
    
    // Calculate worker distribution for metrics
    const workerDistribution = {};
    results.forEach(r => {
      const workerId = r.pid || 'unknown';
      workerDistribution[workerId] = (workerDistribution[workerId] || 0) + 1;
    });
    const uniqueWorkers = Object.keys(workerDistribution).filter(id => id !== 'unknown').length;
    
    // Group tests by file
    const testsByFile = {};
    results.forEach(result => {
      const fileName = path.basename(result.testCase.file || 'unknown');
      if (!testsByFile[fileName]) {
        testsByFile[fileName] = {
          fileName,
          fullPath: result.testCase.file || 'unknown',
          tests: [],
          totalTests: 0,
          passedTests: 0,
          failedTests: 0,
          totalDuration: 0
        };
      }
      testsByFile[fileName].tests.push(result);
      testsByFile[fileName].totalTests++;
      if (result.success) {
        testsByFile[fileName].passedTests++;
      } else {
        testsByFile[fileName].failedTests++;
      }
      testsByFile[fileName].totalDuration += result.duration || 0;
    });
    
    const fileStats = Object.values(testsByFile);
    
    function formatBytes(bytes) {
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

    function escapeHtml(text) {
      if (!text || typeof text !== 'string') return '';
      return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    // Enhanced function to format error messages
    function formatErrorMessage(error) {
      if (!error) return 'Unknown error occurred';
      
      let errorText = '';
      
      // Handle different error input types
      if (typeof error === 'string') {
        errorText = error;
      } else if (error && typeof error === 'object') {
        // Try to extract meaningful error information
        if (error.message) {
          errorText = error.message;
          // Add stack trace if different from message
          if (error.stack && error.stack !== error.message && !error.message.includes(error.stack)) {
            errorText += '\n\nStack Trace:\n' + error.stack;
          }
        } else if (error.toString && error.toString() !== '[object Object]') {
          errorText = error.toString();
        } else {
          // Last resort - try to extract useful info from object
          const keys = Object.keys(error);
          if (keys.length > 0) {
            errorText = keys.map(key => `${key}: ${error[key]}`).join('\n');
          } else {
            errorText = 'Error object with no readable properties';
          }
        }
      } else {
        errorText = String(error);
      }
      
      // Clean up common error patterns for better readability
      errorText = errorText
        .replace(/Process exited with code \d+:\s*/, '')
        .replace(/^\s*at\s+.*worker\.js.*$/gm, '') // Remove worker.js stack traces
        .replace(/^\s*at\s+.*node_modules.*$/gm, '') // Remove node_modules traces
        .replace(/\n\s*\n/g, '\n') // Remove empty lines
        .trim();
      
      return errorText || 'Error occurred but no details available';
    }

    // Helper function to generate file summary table
    function generateFileTable(fileStats) {
      if (fileStats.length === 0) {
        return '<div class="no-results">No test files found</div>';
      }
      
      return `
          <div class="file-results">
              <table class="results-table">
                  <thead>
                      <tr>
                          <th>File</th>
                          <th>Tests</th>
                          <th>Passed</th>
                          <th>Failed</th>
                          <th>Success Rate</th>
                          <th>Duration</th>
                      </tr>
                  </thead>
                  <tbody>
                      ${fileStats.map(file => `
                          <tr class="${file.failedTests > 0 ? 'failure' : 'success'}">
                              <td><code>${file.fileName}</code></td>
                              <td>${file.totalTests}</td>
                              <td><span style="color: #27ae60;">${file.passedTests}</span></td>
                              <td><span style="color: #e74c3c;">${file.failedTests}</span></td>
                              <td>${((file.passedTests / file.totalTests) * 100).toFixed(1)}%</td>
                              <td>${file.totalDuration}ms</td>
                          </tr>
                      `).join('')}
                  </tbody>
              </table>
          </div>
      `;
    }

    // Helper function to generate test table
    function generateTestTable(tests) {
      if (tests.length === 0) {
        return '<div class="no-results">No tests to display</div>';
      }
      
      return `
          <div class="test-results">
              <table class="results-table">
                  <thead>
                      <tr>
                          <th>Status</th>
                          <th>Test Name</th>
                          <th>File</th>
                          <th>Duration</th>
                          <th>PID</th>
                          <th>Memory</th>
                      </tr>
                  </thead>
                  <tbody>
                      ${tests.map(result => `
                          <tr class="${result.success ? 'success' : 'failure'}">
                              <td><span class="status-icon">${result.success ? '✅' : '❌'}</span></td>
                              <td>
                                  <div class="test-name">${escapeHtml(String(result.testCase.fullName || 'Unknown Test'))}</div>
                                  ${!result.success && result.error ? `
                                    <div class="error-section">
                                      <div class="error-label">Error:</div>
                                      <div class="error-message">${escapeHtml(formatErrorMessage(result.error))}</div>
                                    </div>
                                  ` : ''}
                              </td>
                              <td><code>${path.basename(result.testCase.file || 'unknown')}</code></td>
                              <td>${result.duration || 0}ms</td>
                              <td><code>${result.pid}</code></td>
                              <td>${result.memory ? formatBytes(result.memory.final.heapUsed) : 'N/A'}</td>
                          </tr>
                      `).join('')}
                  </tbody>
              </table>
          </div>
      `;
    }

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${pageTitle}</title>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            line-height: 1.6;
            color: #333;
            background: #f5f5f5;
        }
        
        .container { max-width: 1200px; margin: 0 auto; padding: 20px; }
        
        .header {
            background: white;
            padding: 30px;
            border-radius: 10px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            margin-bottom: 30px;
        }
        
        .header h1 {
            color: #2c3e50;
            margin-bottom: 20px;
            font-size: 2.5em;
        }
        
        .metadata {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
        }
        
        .meta-item {
            display: flex;
            flex-direction: column;
        }
        
        .meta-item .label {
            font-weight: 600;
            color: #7f8c8d;
            font-size: 0.9em;
        }
        
        .meta-item .value {
            font-size: 1.2em;
            color: #2c3e50;
            font-weight: 500;
        }
        
        .summary-cards {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
        }
        
        .card {
            background: white;
            padding: 25px;
            border-radius: 10px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            text-align: center;
        }
        
        .card.success { border-left: 5px solid #27ae60; }
        .card.error { border-left: 5px solid #e74c3c; }
        
        .card h3 {
            color: #7f8c8d;
            margin-bottom: 15px;
            font-size: 1em;
            font-weight: 600;
        }
        
        .big-number {
            font-size: 2.5em;
            font-weight: bold;
            color: #2c3e50;
            margin-bottom: 10px;
        }
        
        .detail {
            color: #95a5a6;
            font-size: 0.9em;
        }
        
        section {
            background: white;
            margin-bottom: 30px;
            border-radius: 10px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            overflow: hidden;
        }
        
        section h2 {
            background: #34495e;
            color: white;
            padding: 20px 30px;
            margin: 0;
            font-size: 1.5em;
        }
        
        .charts-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
            gap: 30px;
            padding: 30px;
        }
        
        .chart-container {
            background: #f8f9fa;
            padding: 20px;
            border-radius: 8px;
        }
        
        .chart-container.timeline {
            grid-column: 1 / -1;
        }
        
        .chart-container h3 {
            margin-bottom: 15px;
            color: #2c3e50;
        }
        
        .results-table {
            width: 100%;
            border-collapse: collapse;
            margin: 20px 0;
        }
        
        .results-table th,
        .results-table td {
            padding: 12px;
            text-align: left;
            border-bottom: 1px solid #ecf0f1;
            vertical-align: top;
        }
        
        .results-table th {
            background: #f8f9fa;
            font-weight: 600;
            color: #2c3e50;
        }
        
        .results-table tr.success { background: rgba(39, 174, 96, 0.05); }
        .results-table tr.failure { background: rgba(231, 76, 60, 0.05); }
        
        .test-tabs {
            display: flex;
            background: #ecf0f1;
        }
        
        .tab-button {
            flex: 1;
            padding: 15px;
            border: none;
            background: transparent;
            cursor: pointer;
            font-weight: 500;
            transition: background 0.3s;
        }
        
        .tab-button.active {
            background: white;
            border-bottom: 3px solid #3498db;
        }
        
        .tab-content {
            display: none;
            padding: 30px;
        }
        
        .tab-content.active { display: block; }
        
        .no-results {
            text-align: center;
            padding: 50px;
            color: #95a5a6;
            font-size: 1.2em;
        }
        
        .test-name {
            font-weight: 500;
            color: #2c3e50;
            margin-bottom: 8px;
        }
        
        .error-section {
            margin-top: 8px;
            background: #fff5f5;
            border-left: 3px solid #e74c3c;
            padding: 12px;
            border-radius: 4px;
        }
        
        .error-label {
            font-weight: 600;
            color: #e74c3c;
            font-size: 0.85em;
            margin-bottom: 6px;
            text-transform: uppercase;
        }
        
        .error-message {
            color: #721c24;
            font-size: 0.85em;
            font-family: 'Monaco', 'Consolas', 'SF Mono', monospace;
            white-space: pre-wrap;
            line-height: 1.4;
            background: #ffeaea;
            padding: 8px;
            border-radius: 3px;
            border: 1px solid #f5c6cb;
            max-height: 200px;
            overflow-y: auto;
        }
        
        .status-icon {
            font-size: 1.2em;
        }
        
        code {
            background: #f8f9fa;
            padding: 2px 6px;
            border-radius: 4px;
            font-family: 'Monaco', 'Consolas', monospace;
            font-size: 0.9em;
        }
        
        .usage-bar {
            width: 100px;
            height: 8px;
            background: #ecf0f1;
            border-radius: 4px;
            overflow: hidden;
        }
        
        .usage-fill {
            height: 100%;
            background: linear-gradient(90deg, #3498db, #2980b9);
            transition: width 0.5s ease;
        }
        
        .performance-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 20px;
            margin: 20px 0;
        }
        
        .performance-item {
            background: #f8f9fa;
            padding: 20px;
            border-radius: 8px;
            text-align: center;
            border-left: 4px solid #3498db;
        }
        
        .performance-item h4 {
            color: #2c3e50;
            margin-bottom: 10px;
            font-size: 1.1em;
        }
        
        .performance-value {
            font-size: 2em;
            font-weight: bold;
            color: #3498db;
            margin-bottom: 5px;
        }
        
        .performance-desc {
            color: #7f8c8d;
            font-size: 0.9em;
        }
        
        @media (max-width: 768px) {
            .container { padding: 10px; }
            .summary-cards { grid-template-columns: 1fr; }
            .charts-grid { grid-template-columns: 1fr; }
            .error-message { font-size: 0.8em; }
        }
    </style>
</head>
<body>
    <div class="container">
        <header class="header">
            <h1>🧪 ${pageTitle}</h1>
            <div class="metadata">
                <div class="meta-item">
                    <span class="label">Generated:</span>
                    <span class="value">${new Date().toLocaleString()}</span>
                </div>
                <div class="meta-item">
                    <span class="label">Workers:</span>
                    <span class="value">${uniqueWorkers || 0}</span>
                </div>
                <div class="meta-item">
                    <span class="label">Duration:</span>
                    <span class="value">${totalDuration}ms</span>
                </div>
                <div class="meta-item">
                    <span class="label">Time Saved:</span>
                    <span class="value">${timeSavedPercentage}%</span>
                </div>
            </div>
        </header>

        <section class="summary-cards">
            <div class="card ${failedTests > 0 ? 'error' : 'success'}">
                <h3>Overall Result</h3>
                <div class="big-number">${failedTests > 0 ? '❌ FAILED' : '✅ PASSED'}</div>
                <div class="detail">${((passedTests / totalTests) * 100).toFixed(1)}% Success Rate</div>
            </div>
            <div class="card">
                <h3>Tests</h3>
                <div class="big-number">${totalTests}</div>
                <div class="detail">${passedTests} passed, ${failedTests} failed</div>
            </div>
            <div class="card">
                <h3>Performance</h3>
                <div class="big-number">${timeSavedPercentage}%</div>
                <div class="detail">Time Saved</div>
            </div>
            <div class="card">
                <h3>Avg Duration</h3>
                <div class="big-number">${(avgDuration).toFixed(0)}ms</div>
                <div class="detail">per test</div>
            </div>
        </section>

        <section class="performance-section">
            <h2>📊 Performance Comparison</h2>
            <div class="performance-details" style="padding: 30px;">
                <div class="performance-grid">
                    <div class="performance-item">
                        <h4>Sequential Time</h4>
                        <div class="performance-value">${sequentialTime}ms</div>
                        <div class="performance-desc">Time if tests ran one by one</div>
                    </div>
                    <div class="performance-item">
                        <h4>Parallel Time</h4>
                        <div class="performance-value">${parallelTime}ms</div>
                        <div class="performance-desc">Actual parallel execution time</div>
                    </div>
                    <div class="performance-item">
                        <h4>Time Saved</h4>
                        <div class="performance-value">${timeSaved}ms</div>
                        <div class="performance-desc">${timeSavedPercentage}% improvement</div>
                    </div>
                </div>
            </div>
        </section>

        <section class="files-section">
            <h2>📁 Test Files Summary</h2>
            <div style="padding: 30px;">
                ${generateFileTable(fileStats)}
            </div>
        </section>

        <section class="charts-section">
            <h2>📊 Test Timeline</h2>
            <div style="padding: 30px;">
                <div class="chart-container timeline">
                    <h3>Test Execution Timeline</h3>
                    <div style="height: 400px; position: relative;">
                        <canvas id="timelineChart"></canvas>
                    </div>
                </div>
            </div>
        </section>

        <section class="tests-section">
            <h2>🧪 Test Results</h2>
            
            <div class="test-tabs">
                <button class="tab-button active" onclick="showTab('all')">All Tests (${totalTests})</button>
                <button class="tab-button" onclick="showTab('failed')">Failed (${failedTests})</button>
                <button class="tab-button" onclick="showTab('slowest')">Slowest (${Math.min(10, totalTests)})</button>
                <button class="tab-button" onclick="showTab('fastest')">Fastest (${Math.min(10, totalTests)})</button>
            </div>

            <div id="tab-all" class="tab-content active">
                ${generateTestTable(results)}
            </div>

            <div id="tab-failed" class="tab-content">
                ${failedTests > 0 ? generateTestTable(results.filter(r => !r.success)) : '<div class="no-results">🎉 No failed tests!</div>'}
            </div>

            <div id="tab-slowest" class="tab-content">
                ${generateTestTable([...results].sort((a, b) => (b.duration || 0) - (a.duration || 0)).slice(0, 10))}
            </div>

            <div id="tab-fastest" class="tab-content">
                ${generateTestTable([...results].sort((a, b) => (a.duration || 0) - (b.duration || 0)).slice(0, 10))}
            </div>
        </section>
    </div>

    <script>
        function showTab(tabName) {
            document.querySelectorAll('.tab-content').forEach(tab => {
                tab.classList.remove('active');
            });
            document.querySelectorAll('.tab-button').forEach(btn => {
                btn.classList.remove('active');
            });
            
            document.getElementById('tab-' + tabName).classList.add('active');
            event.target.classList.add('active');
        }

        // Chart data
        const testData = ${JSON.stringify(results)};
        
        // Test Timeline Chart
        new Chart(document.getElementById('timelineChart'), {
            type: 'bar',
            data: {
                labels: testData.map((t, i) => 'Test ' + (i + 1)),
                datasets: [{
                    label: 'Test Duration (ms)',
                    data: testData.map(t => t.duration || 0),
                    backgroundColor: testData.map(t => t.success ? 'rgba(39, 174, 96, 0.7)' : 'rgba(231, 76, 60, 0.7)'),
                    borderColor: testData.map(t => t.success ? 'rgba(39, 174, 96, 1)' : 'rgba(231, 76, 60, 1)'),
                    borderWidth: 1,
                    borderRadius: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: {
                        title: {
                            display: true,
                            text: 'Tests'
                        },
                        ticks: {
                            autoSkip: true,
                            maxRotation: 0,
                            maxTicksLimit: 20
                        }
                    },
                    y: {
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: 'Duration (ms)'
                        }
                    }
                },
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        callbacks: {
                            title: function(context) {
                                const testIndex = context[0].dataIndex;
                                const test = testData[testIndex];
                                if (!test) return 'Unknown Test';
                                return test.testCase.name || test.testCase.fullName || 'Test ' + (testIndex + 1);
                            },
                            afterBody: function(context) {
                                const testIndex = context[0].dataIndex;
                                const test = testData[testIndex];
                                if (!test) return '';
                                return [
                                    'File: ' + (test.testCase.file ? path.basename(test.testCase.file) : 'Unknown'),
                                    'Status: ' + (test.success ? 'Passed' : 'Failed'),
                                    'Duration: ' + (test.duration || 0) + 'ms'
                                ];
                            }
                        }
                    }
                }
            }
        });
    </script>
</body>
</html>`;

    fs.writeFileSync(outputPath, html);
    return outputPath;
  }

  // Jest reporter methods (for integration with Jest)
  onRunStart() {
    this.startTime = Date.now();
    console.log('📊 Jest HTML Reporter: Starting test run...');
  }

  onTestResult(test, testResult) {
    // Convert Jest test result to our format
    const results = testResult.testResults.map(result => ({
      testCase: {
        name: result.title,
        fullName: `${testResult.testFilePath} › ${result.ancestorTitles.join(' › ')} › ${result.title}`,
        file: testResult.testFilePath
      },
      success: result.status === 'passed',
      duration: result.duration || 0,
      pid: process.pid,
      memory: {
        initial: { heapUsed: 0 },
        final: { heapUsed: process.memoryUsage().heapUsed },
        delta: { heapUsed: 0 },
        peak: process.memoryUsage().heapUsed
      },
      error: result.status === 'failed' ? {
        message: result.failureMessages ? result.failureMessages.join('\n') : 'Test failed'
      } : undefined,
      output: '',
      stderr: result.failureMessages ? result.failureMessages.join('\n') : '',
      exitCode: result.status === 'passed' ? 0 : 1
    }));

    this.testResults.push(...results);
  }

  onRunComplete() {
    const totalDuration = Date.now() - this.startTime;
    
    console.log(`📊 Jest HTML Reporter: Generating report at ${this.options.outputPath}...`);
    
    try {
      HTMLReportGenerator.generateReport(this.testResults, this.options.outputPath, {
        pageTitle: this.options.pageTitle
      });
      console.log(`✅ HTML Report generated: ${this.options.outputPath}`);
    } catch (error) {
      console.error('❌ Failed to generate HTML report:', error.message);
    }
  }
}

module.exports = HTMLReportGenerator;