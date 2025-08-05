const fs = require('fs').promises;
const path = require('path');

class ReportGenerator {
  constructor(options, logger) {
    this.outputDir = options.outputDir || './reports';
    this.reportType = options.reporter || 'both';
    this.logger = logger;
  }

  async generateReports(results, summary, mode) {
    await this.ensureOutputDir();
    
    const reportData = this.processResults(results, summary, mode);
    
    if (this.reportType === 'console' || this.reportType === 'both') {
      this.generateConsoleReport(reportData);
    }
    
    if (this.reportType === 'html' || this.reportType === 'both') {
      await this.generateHtmlReport(reportData);
    }
    
    return reportData;
  }

  async ensureOutputDir() {
    try {
      await fs.mkdir(this.outputDir, { recursive: true });
    } catch (error) {
      this.logger.warn(`Failed to create output directory: ${error.message}`);
    }
  }

  processResults(results, summary, mode) {
    const startTime = summary.startTime;
    const endTime = summary.endTime;
    const totalDuration = endTime - startTime;
    
    const fileResults = {};
    const testResults = [];
    
    let passed = 0;
    let failed = 0;
    let skipped = 0;
    let totalTests = 0;

    results.forEach(result => {
      if (result.testId) {
        // Individual test result
        testResults.push(result);
        totalTests++;
        if (result.status === 'passed') passed++;
        if (result.status === 'failed') failed++;
        if (result.status === 'skipped') skipped++;
        
        const fileName = path.basename(result.filePath || '');
        if (fileName && !fileResults[fileName]) {
          fileResults[fileName] = {
            filePath: result.filePath,
            tests: [],
            passed: 0,
            failed: 0,
            skipped: 0,
            duration: 0
          };
        }
        
        if (fileName && fileResults[fileName]) {
          if (!fileResults[fileName].tests) {
            fileResults[fileName].tests = [];
          }
          fileResults[fileName].tests.push(result);
          fileResults[fileName][result.status]++;
          fileResults[fileName].duration += result.duration || 0;
        }
      } else if (result.filePath) {
        // File-level result
        const fileName = path.basename(result.filePath);
        if (!fileResults[fileName]) {
          fileResults[fileName] = {
            filePath: result.filePath,
            status: result.status,
            tests: [],
            passed: 0,
            failed: 0,
            skipped: 0,
            duration: result.duration || 0,
            hooks: result.hookInfo || {
              beforeAll: { duration: 0, status: 'not_found' },
              beforeEach: { duration: 0, status: 'not_found' },
              afterAll: { duration: 0, status: 'not_found' },
              afterEach: { duration: 0, status: 'not_found' }
            }
          };
        }
        
        // If this file result has parsed test results, add them
        if (result.testResults && Array.isArray(result.testResults)) {
          result.testResults.forEach(testResult => {
            // Clean and validate test name
            let cleanTestName = testResult.testName || testResult.name || 'Unknown Test';
            if (cleanTestName === '\n' || cleanTestName.trim() === '' || cleanTestName === 'undefined') {
              cleanTestName = testResult.suite ? `${testResult.suite} - Test` : 'Unknown Test';
            }
            
            // Clean and format error message for Jest-style output
            let formattedError = null;
            if (testResult.error) {
              formattedError = this.formatJestError(testResult.error);
            }
            
            const individualTest = {
              testId: testResult.testId || `${result.filePath}:${cleanTestName}`,
              testName: cleanTestName,
              filePath: result.filePath,
              status: testResult.status,
              duration: testResult.duration || 0,
              workerId: result.workerId,
              mode: result.mode,
              error: formattedError,
              suite: testResult.suite
            };
            
            testResults.push(individualTest);
            if (!fileResults[fileName].tests) {
              fileResults[fileName].tests = [];
            }
            fileResults[fileName].tests.push(individualTest);
            
            // Update file-level counters
            if (testResult.status === 'passed') {
              fileResults[fileName].passed = (fileResults[fileName].passed || 0) + 1;
            } else if (testResult.status === 'failed') {
              fileResults[fileName].failed = (fileResults[fileName].failed || 0) + 1;
            } else if (testResult.status === 'skipped') {
              fileResults[fileName].skipped = (fileResults[fileName].skipped || 0) + 1;
            }
          });
          
          // Count individual test results instead of file-level testCount
          totalTests += result.testResults.length;
          const passedCount = result.testResults.filter(t => t.status === 'passed').length;
          const failedCount = result.testResults.filter(t => t.status === 'failed').length;
          const skippedCount = result.testResults.filter(t => t.status === 'skipped').length;
          passed += passedCount;
          failed += failedCount;
          skipped += skippedCount;
        } else {
          // Fallback to file-level counting if no individual test results
          totalTests += result.testCount || 0;
          if (result.status === 'passed') passed += result.testCount || 0;
          if (result.status === 'failed') failed += result.testCount || 0;
        }
      }
    });

    // Calculate time savings estimation
    const estimatedSequentialTime = this.estimateSequentialTime(results);
    const timeSaved = Math.max(0, estimatedSequentialTime - totalDuration);
    const timeSavedPercentage = estimatedSequentialTime > 0 ? ((timeSaved / estimatedSequentialTime) * 100) : 0;

    return {
      summary: {
        mode,
        totalTests,
        passed,
        failed,
        skipped,
        startTime,
        endTime,
        totalDuration,
        estimatedSequentialTime,
        timeSaved,
        timeSavedPercentage,
        files: Object.keys(fileResults).length
      },
      fileResults,
      testResults,
      metadata: {
        timestamp: new Date().toISOString(),
        pid: process.pid,
        memoryUsage: this.getMemoryUsage()
      }
    };
  }

  estimateSequentialTime(results) {
    return results.reduce((total, result) => {
      return total + (result.duration || 0);
    }, 0);
  }

  formatJestError(error) {
    if (!error) return null;
    
    // If error is already a string, clean it up
    let errorText = typeof error === 'string' ? error : error.message || String(error);
    
    // Remove excessive whitespace and normalize
    errorText = errorText.trim();
    
    // Split by lines and process
    const lines = errorText.split('\n');
    const processedLines = [];
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // Skip empty lines at the beginning
      if (processedLines.length === 0 && line === '') continue;
      
      // Include error message, stack trace, and expect statements
      if (line.includes('expect(') || 
          line.includes('Expected:') || 
          line.includes('Received:') || 
          line.includes('at ') ||
          line.includes('Error:') ||
          line.includes('Failed') ||
          line.includes('Difference:') ||
          line.match(/^\d+\s*\|/) || // Line numbers from Jest diff
          processedLines.length < 10) { // Include first 10 lines regardless
        processedLines.push(line);
      }
      
      // Stop after we have enough context (max 20 lines)
      if (processedLines.length >= 20) break;
    }
    
    return processedLines.join('\n');
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

  generateConsoleReport(reportData) {
    const { summary, fileResults, testResults } = reportData;
    
    console.log('\n' + '='.repeat(80));
    console.log('JEST PARALLEL WORKER - TEST RESULTS');
    console.log('='.repeat(80));
    
    console.log(`\nExecution Mode: ${summary.mode === 'parallel-file-concurrent' ? 'parallel-file (forced concurrent)' : summary.mode}`);
    console.log(`Total Duration: ${this.formatDuration(summary.totalDuration)}`);
    console.log(`Estimated Sequential Time: ${this.formatDuration(summary.estimatedSequentialTime)}`);
    console.log(`Time Saved: ${this.formatDuration(summary.timeSaved)} (${summary.timeSavedPercentage.toFixed(1)}%)`);
    
    console.log(`\nTest Summary:`);
    console.log(`  Total Tests: ${summary.totalTests}`);
    console.log(`  Passed: ${summary.passed}`);
    console.log(`  Failed: ${summary.failed}`);
    console.log(`  Skipped: ${summary.skipped}`);
    console.log(`  Files: ${summary.files}`);
    
    console.log(`\nMemory Usage:`);
    const mem = reportData.metadata.memoryUsage;
    console.log(`  RSS: ${mem.rss}MB`);
    console.log(`  Heap Used: ${mem.heapUsed}MB / ${mem.heapTotal}MB`);
    console.log(`  External: ${mem.external}MB`);
    
    if (testResults.length > 0) {
      console.log('\nTest Details:');
      testResults.forEach(test => {
        const status = test.status === 'passed' ? '✓' : test.status === 'skipped' ? '○' : '✗';
        const duration = this.formatDuration(test.duration);
        console.log(`  ${status} ${test.testName} (${duration}) [Worker: ${test.workerId}]`);
        if (test.error) {
          console.log(`    Error: ${test.error}`);
        }
      });
    }
    
    if (Object.keys(fileResults).length > 0) {
      console.log('\nFile Results:');
      Object.entries(fileResults).forEach(([fileName, fileResult]) => {
        if (fileResult.tests) {
          const skippedText = fileResult.skipped > 0 ? `, ${fileResult.skipped} skipped` : '';
          console.log(`  ${fileName}: ${fileResult.passed} passed, ${fileResult.failed} failed${skippedText}`);
        } else {
          const status = fileResult.status === 'passed' ? '✓' : '✗';
          console.log(`  ${status} ${fileName} (${fileResult.testCount} tests) [Worker: ${fileResult.workerId}]`);
        }
      });
    }
    
    console.log('\n' + '='.repeat(80));
  }

  async generateHtmlReport(reportData) {
    const htmlContent = this.generateHtmlContent(reportData);
    const reportPath = path.join(this.outputDir, 'test-report.html');
    
    try {
      await fs.writeFile(reportPath, htmlContent);
      this.logger.success(`HTML report generated: ${reportPath}`);
    } catch (error) {
      this.logger.error(`Failed to generate HTML report: ${error.message}`);
    }
  }

  generateHtmlContent(reportData) {
    const { summary, fileResults, testResults, metadata } = reportData;
    // ...existing code...
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Jest Parallel Worker - Test Report</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; background: #f5f5f5; }
        .container { max-width: 1200px; margin: 0 auto; padding: 20px; }
        .header { background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); margin-bottom: 30px; }
        .header h1 { color: #2c3e50; margin-bottom: 20px; font-size: 2.5em; }
        .metadata { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; }
        .meta-item { display: flex; flex-direction: column; }
        .meta-item .label { font-weight: 600; color: #7f8c8d; font-size: 0.9em; }
        .meta-item .value { font-size: 1.2em; color: #2c3e50; font-weight: 500; }
        .summary-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 20px; margin-bottom: 30px; }
        .card { background: white; padding: 25px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); text-align: center; }
        .card.success { border-left: 5px solid #27ae60; }
        .card.error { border-left: 5px solid #e74c3c; }
        .card h3 { color: #7f8c8d; margin-bottom: 15px; font-size: 1em; font-weight: 600; }
        .big-number { font-size: 2.5em; font-weight: bold; color: #2c3e50; margin-bottom: 10px; }
        .detail { color: #95a5a6; font-size: 0.9em; }
        section { background: white; margin-bottom: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); overflow: hidden; }
        section h2 { background: #34495e; color: white; padding: 20px 30px; margin: 0; font-size: 1.5em; }
        .results-table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        .results-table th, .results-table td { padding: 12px; text-align: left; border-bottom: 1px solid #ecf0f1; }
        .results-table th { background: #f8f9fa; font-weight: 600; color: #2c3e50; }
        .results-table tr.success { background: rgba(39, 174, 96, 0.05); }
        .results-table tr.failure { background: rgba(231, 76, 60, 0.05); }
        .results-table tr.skipped { background: rgba(158, 158, 158, 0.05); }
        .test-tabs { display: flex; background: #ecf0f1; }
        .tab-button { flex: 1; padding: 15px; border: none; background: transparent; cursor: pointer; font-weight: 500; transition: background 0.3s; }
        .tab-button.active { background: white; border-bottom: 3px solid #3498db; }
        .tab-content { display: none; padding: 30px; }
        .tab-content.active { display: block; }
        .no-results { text-align: center; padding: 50px; color: #95a5a6; font-size: 1.2em; }
        .test-name { font-weight: 500; color: #2c3e50; }
        .error-message { color: #e74c3c; font-size: 0.9em; font-style: italic; margin-top: 5px; }
        .source-info { 
          color: #6c757d; 
          font-size: 0.8em; 
          font-family: 'Monaco', 'Consolas', monospace; 
          background: #f8f9fa; 
          padding: 3px 6px; 
          border-radius: 3px; 
          margin-top: 3px; 
          display: inline-block;
        }
        .status-icon { font-size: 1.2em; }
        code { background: #f8f9fa; padding: 2px 6px; border-radius: 4px; font-family: 'Monaco', 'Consolas', monospace; font-size: 0.9em; }
        .usage-bar { width: 100px; height: 8px; background: #ecf0f1; border-radius: 4px; overflow: hidden; }
        .usage-fill { height: 100%; background: linear-gradient(90deg, #3498db, #2980b9); transition: width 0.5s ease; }
        .memory-delta { color: #e67e22; font-weight: 500; }
        .file-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(400px, 1fr)); gap: 20px; padding: 30px; }
        .file-card { border: 1px solid #ecf0f1; border-radius: 8px; overflow: hidden; }
        .file-card.all-passed { border-left: 4px solid #27ae60; }
        .file-card.has-failures { border-left: 4px solid #e74c3c; }
        .file-header { padding: 20px; background: #f8f9fa; }
        .file-header h3 { margin-bottom: 10px; color: #2c3e50; }
        .file-stats { display: flex; gap: 15px; font-size: 0.9em; }
        .file-stats .passed { color: #27ae60; }
        .file-stats .failed { color: #e74c3c; }
        .file-stats .skipped { color: #9e9e9e; }
        .file-stats .duration { color: #7f8c8d; }
        .hook-stats { display: flex; gap: 10px; font-size: 0.8em; margin-top: 8px; flex-wrap: wrap; }
        .hook-info { color: #8e44ad; background: #f8f9fa; padding: 2px 6px; border-radius: 3px; }
        .file-path { padding: 0 20px 10px; color: #7f8c8d; font-size: 0.9em; }
        .test-summary { padding: 20px; }
        .test-item { display: flex; align-items: center; gap: 10px; padding: 8px 0; border-bottom: 1px solid #f1f2f6; }
        .test-item:last-child { border-bottom: none; }
        .test-item .name { flex: 1; font-size: 0.9em; }
        .test-item .duration, .test-item .memory { font-size: 0.8em; color: #7f8c8d; }
        .error-message pre { 
          background: #f8f9fa; 
          border: 1px solid #e9ecef; 
          border-radius: 4px; 
          padding: 8px; 
          font-size: 0.85em; 
          color: #d73027; 
          overflow-x: auto; 
          white-space: pre-wrap; 
          max-width: 500px; 
        }
        @media (max-width: 768px) { .container { padding: 10px; } .summary-cards { grid-template-columns: 1fr; } .file-grid { grid-template-columns: 1fr; } }
    </style>
</head>
<body>
    <div class="container">
        <header class="header">
            <h1>🧪 Jest Parallel Worker - Test Report</h1>
            <div class="metadata">
                <div class="meta-item">
                    <span class="label">Generated:</span>
                    <span class="value">${new Date(metadata.timestamp).toLocaleString()}</span>
                </div>
                <div class="meta-item">
                    <span class="label">Workers:</span>
                    <span class="value">2</span>
                </div>
                <div class="meta-item">
                    <span class="label">Duration:</span>
                    <span class="value">${this.formatDuration(summary.totalDuration)}</span>
                </div>
                <div class="meta-item">
                    <span class="label">Version:</span>
                    <span class="value">1.0.0</span>
                </div>
            </div>
        </header>
        <section class="summary-cards">
            <div class="card ${summary.failed > 0 ? 'error' : 'success'}">
                <h3>Overall Result</h3>
                <div class="big-number">${summary.failed > 0 ? '❌ FAILED' : '✅ PASSED'}</div>
                <div class="detail">${summary.totalTests ? ((summary.passed / summary.totalTests) * 100).toFixed(1) : '0.0'}% Success Rate</div>
            </div>
            <div class="card">
                <h3>Tests</h3>
                <div class="big-number">${summary.totalTests}</div>
                <div class="detail">${summary.passed} passed, ${summary.failed} failed${summary.skipped > 0 ? `, ${summary.skipped} skipped` : ''}</div>
            </div>
            <div class="card">
                <h3>Performance</h3>
                <div class="big-number">${summary.estimatedSequentialTime && summary.totalDuration ? (summary.estimatedSequentialTime / summary.totalDuration).toFixed(1) : '0x'}</div>
                <div class="detail">Speedup (${summary.timeSavedPercentage ? summary.timeSavedPercentage.toFixed(1) : '0.0'}% efficiency)</div>
            </div>
            <div class="card">
                <h3>Time Saved</h3>
                <div class="big-number">${this.formatDuration(summary.timeSaved)}</div>
                <div class="detail">vs Sequential (${this.formatDuration(summary.estimatedSequentialTime)})</div>
            </div>
        </section>

        <section class="tests-section">
            <h2>🧪 Test Results</h2>
            <div class="test-tabs">
                <button class="tab-button active" onclick="showTab('all')">All Tests (${summary.totalTests})</button>
                <button class="tab-button" onclick="showTab('failed')">Failed (${summary.failed})</button>
                <button class="tab-button" onclick="showTab('skipped')">Skipped (${summary.skipped})</button>
                <button class="tab-button" onclick="showTab('slowest')">Slowest (10)</button>
                <button class="tab-button" onclick="showTab('fastest')">Fastest (10)</button>
            </div>
            <div id="tab-all" class="tab-content active">
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
                        ${testResults.map(test => `
                            <tr class="${test.status === 'passed' ? 'success' : test.status === 'skipped' ? 'skipped' : 'failure'}">
                                <td><span class="status-icon">${test.status === 'passed' ? '✅' : test.status === 'skipped' ? '⏭️' : '❌'}</span></td>
                                <td>
                                    <div class="test-name">${this.escapeHtml(test.testName || 'Unknown Test')}</div>
                                    ${test.error ? `<div class="error-message"><pre>${this.escapeHtml(test.error)}</pre></div>` : ''}
                                    ${test.source ? `<div class="source-info">📍 ${this.escapeHtml(test.source.location)}</div>` : ''}
                                </td>
                                <td><code>${test.filePath ? path.basename(test.filePath) : ''}</code></td>
                                <td>${this.formatDuration(test.duration)}</td>
                                <td><code>${test.pid || ''}</code></td>
                                <td>${test.memory || 'N/A'}</td>
                            </tr>
                        `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
            <div id="tab-failed" class="tab-content">
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
                        ${testResults.filter(test => test.status === 'failed').map(test => `
                            <tr class="failure">
                                <td><span class="status-icon">❌</span></td>
                                <td>
                                    <div class="test-name">${this.escapeHtml(test.testName || 'Unknown Test')}</div>
                                    ${test.error ? `<div class="error-message"><pre>${this.escapeHtml(test.error)}</pre></div>` : ''}
                                    ${test.source ? `<div class="source-info">📍 ${this.escapeHtml(test.source.location)}</div>` : ''}
                                </td>
                                <td><code>${test.filePath ? path.basename(test.filePath) : ''}</code></td>
                                <td>${this.formatDuration(test.duration)}</td>
                                <td><code>${test.pid || ''}</code></td>
                                <td>${test.memory || 'N/A'}</td>
                            </tr>
                        `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
            <div id="tab-skipped" class="tab-content">
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
                        ${testResults.filter(test => test.status === 'skipped').map(test => `
                            <tr class="skipped">
                                <td><span class="status-icon">⏭️</span></td>
                                <td>
                                    <div class="test-name">${this.escapeHtml(test.testName || 'Unknown Test')}</div>
                                    ${test.source ? `<div class="source-info">📍 ${this.escapeHtml(test.source.location)}</div>` : ''}
                                </td>
                                <td><code>${test.filePath ? path.basename(test.filePath) : ''}</code></td>
                                <td>${this.formatDuration(test.duration)}</td>
                                <td><code>${test.pid || ''}</code></td>
                                <td>${test.memory || 'N/A'}</td>
                            </tr>
                        `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
            <div id="tab-slowest" class="tab-content">
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
                        ${testResults.slice().sort((a, b) => b.duration - a.duration).slice(0, 10).map(test => `
                            <tr class="${test.status === 'passed' ? 'success' : test.status === 'skipped' ? 'skipped' : 'failure'}">
                                <td><span class="status-icon">${test.status === 'passed' ? '✅' : test.status === 'skipped' ? '⏭️' : '❌'}</span></td>
                                <td>
                                    <div class="test-name">${this.escapeHtml(test.testName || 'Unknown Test')}</div>
                                    ${test.error ? `<div class="error-message"><pre>${this.escapeHtml(test.error)}</pre></div>` : ''}
                                    ${test.source ? `<div class="source-info">📍 ${this.escapeHtml(test.source.location)}</div>` : ''}
                                </td>
                                <td><code>${test.filePath ? path.basename(test.filePath) : ''}</code></td>
                                <td>${this.formatDuration(test.duration)}</td>
                                <td><code>${test.pid || ''}</code></td>
                                <td>${test.memory || 'N/A'}</td>
                            </tr>
                        `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
            <div id="tab-fastest" class="tab-content">
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
                        ${testResults.slice().sort((a, b) => a.duration - b.duration).slice(0, 10).map(test => `
                            <tr class="${test.status === 'passed' ? 'success' : test.status === 'skipped' ? 'skipped' : 'failure'}">
                                <td><span class="status-icon">${test.status === 'passed' ? '✅' : test.status === 'skipped' ? '⏭️' : '❌'}</span></td>
                                <td>
                                    <div class="test-name">${this.escapeHtml(test.testName || 'Unknown Test')}</div>
                                    ${test.error ? `<div class="error-message"><pre>${this.escapeHtml(test.error)}</pre></div>` : ''}
                                    ${test.source ? `<div class="source-info">📍 ${this.escapeHtml(test.source.location)}</div>` : ''}
                                </td>
                                <td><code>${test.filePath ? path.basename(test.filePath) : ''}</code></td>
                                <td>${this.formatDuration(test.duration)}</td>
                                <td><code>${test.pid || ''}</code></td>
                                <td>${test.memory || 'N/A'}</td>
                            </tr>
                        `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        </section>
        <section class="files-section">
            <h2>📁 Results by File</h2>
            <div class="file-grid">
                ${Object.entries(fileResults).map(([fileName, fileResult]) => {
                    const fileTestResults = testResults.filter(test => test.filePath && path.basename(test.filePath) === fileName);
                    const allPassed = fileResult.failed === 0;
                    return `
                    <div class="file-card ${allPassed ? 'all-passed' : 'has-failures'}">
                        <div class="file-header">
                            <h3>${fileName}</h3>
                            <div class="file-stats">
                                <span class="passed">${fileResult.passed || 0} passed</span>
                                <span class="failed">${fileResult.failed || 0} failed</span>
                                ${(fileResult.skipped || 0) > 0 ? `<span class="skipped">${fileResult.skipped} skipped</span>` : ''}
                                <span class="duration">${this.formatDuration(fileResult.duration || 0)} total</span>
                            </div>
                            ${fileResult.hooks && fileResult.hooks.beforeAll && fileResult.hooks.beforeAll.duration > 0 ? `
                                <div class="hook-stats">
                                    <span class="hook-info">⚙️ beforeAll: ${this.formatDuration(fileResult.hooks.beforeAll.duration)}</span>
                                    ${fileResult.hooks.beforeEach && fileResult.hooks.beforeEach.duration > 0 ? 
                                        `<span class="hook-info">🔄 beforeEach: ${this.formatDuration(fileResult.hooks.beforeEach.duration)}</span>` : ''}
                                    ${fileResult.hooks.afterAll && fileResult.hooks.afterAll.duration > 0 ? 
                                        `<span class="hook-info">🏁 afterAll: ${this.formatDuration(fileResult.hooks.afterAll.duration)}</span>` : ''}
                                    ${fileResult.hooks.afterEach && fileResult.hooks.afterEach.duration > 0 ? 
                                        `<span class="hook-info">🔄 afterEach: ${this.formatDuration(fileResult.hooks.afterEach.duration)}</span>` : ''}
                                </div>
                            ` : ''}
                        </div>
                        <div class="file-path"><code>${fileResult.filePath || ''}</code></div>
                        <div class="test-summary">
                            ${fileTestResults.map(test => `
                                <div class="test-item ${test.status === 'passed' ? 'passed' : test.status === 'skipped' ? 'skipped' : 'failed'}">
                                    <span class="status">${test.status === 'passed' ? '✅' : test.status === 'skipped' ? '⏭️' : '❌'}</span>
                                    <span class="name">${test.testName}</span>
                                    <span class="duration">${this.formatDuration(test.duration)}</span>
                                    ${test.error ? `<div class="error-message">${this.escapeHtml(test.error)}</div>` : ''}
                                    ${test.source ? `<div class="source-info">📍 ${this.escapeHtml(test.source.location)}</div>` : ''}
                                </div>
                            `).join('')}
                        </div>
                    </div>
                    `;
                }).join('')}
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
    </script>
</body>
</html>`;
  }

  formatDuration(ms) {
    if (ms < 1000) {
      return `${ms}ms`;
    } else if (ms < 60000) {
      return `${(ms / 1000).toFixed(1)}s`;
    } else {
      const minutes = Math.floor(ms / 60000);
      const seconds = Math.floor((ms % 60000) / 1000);
      return `${minutes}m ${seconds}s`;
    }
  }

  escapeHtml(text) {
    if (!text) return '';
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}

module.exports = { ReportGenerator };
