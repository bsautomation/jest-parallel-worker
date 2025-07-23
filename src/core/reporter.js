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
    let totalTests = 0;

    results.forEach(result => {
      if (result.testId) {
        // Individual test result
        testResults.push(result);
        totalTests++;
        if (result.status === 'passed') passed++;
        if (result.status === 'failed') failed++;
        
        const fileName = path.basename(result.filePath || '');
        if (fileName && !fileResults[fileName]) {
          fileResults[fileName] = {
            filePath: result.filePath,
            tests: [],
            passed: 0,
            failed: 0,
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
            testCount: result.testCount,
            duration: result.duration || 0,
            output: result.output,
            errorOutput: result.errorOutput,
            workerId: result.workerId,
            tests: [],
            passed: 0,
            failed: 0
          };
        }
        
        // If this file result has parsed test results, add them
        if (result.testResults && Array.isArray(result.testResults)) {
          result.testResults.forEach(testResult => {
            const individualTest = {
              testId: testResult.testId || `${result.filePath}:${testResult.testName || testResult.name}`,
              testName: testResult.testName || testResult.name,
              filePath: result.filePath,
              status: testResult.status,
              duration: testResult.duration || 0,
              workerId: result.workerId,
              mode: result.mode,
              error: testResult.error,
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
            }
          });
          
          // Count individual test results instead of file-level testCount
          totalTests += result.testResults.length;
          const passedCount = result.testResults.filter(t => t.status === 'passed').length;
          const failedCount = result.testResults.filter(t => t.status === 'failed').length;
          passed += passedCount;
          failed += failedCount;
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
    console.log(`  Files: ${summary.files}`);
    
    console.log(`\nMemory Usage:`);
    const mem = reportData.metadata.memoryUsage;
    console.log(`  RSS: ${mem.rss}MB`);
    console.log(`  Heap Used: ${mem.heapUsed}MB / ${mem.heapTotal}MB`);
    console.log(`  External: ${mem.external}MB`);
    
    if (testResults.length > 0) {
      console.log('\nTest Details:');
      testResults.forEach(test => {
        const status = test.status === 'passed' ? '✓' : '✗';
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
          console.log(`  ${fileName}: ${fileResult.passed} passed, ${fileResult.failed} failed`);
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
    
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Jest Parallel Worker - Test Report</title>
    <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }
        .container { max-width: 1200px; margin: 0 auto; background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .header { border-bottom: 3px solid #007acc; padding-bottom: 20px; margin-bottom: 30px; }
        .header h1 { color: #007acc; margin: 0; font-size: 2.5em; }
        .header .subtitle { color: #666; font-size: 1.1em; margin-top: 5px; }
        .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-bottom: 30px; }
        .summary-card { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 8px; text-align: center; }
        .summary-card.success { background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%); }
        .summary-card.danger { background: linear-gradient(135deg, #ff416c 0%, #ff4b2b 100%); }
        .summary-card.info { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); }
        .summary-card h3 { margin: 0 0 10px 0; font-size: 2em; }
        .summary-card p { margin: 0; opacity: 0.9; }
        .section { margin-bottom: 30px; }
        .section h2 { color: #333; border-bottom: 2px solid #eee; padding-bottom: 10px; }
        .test-list, .file-list { border: 1px solid #ddd; border-radius: 8px; overflow: hidden; }
        .test-item, .file-item { padding: 15px; border-bottom: 1px solid #eee; display: flex; justify-content: space-between; align-items: center; }
        .test-item:last-child, .file-item:last-child { border-bottom: none; }
        .test-item.passed { background: #f8fff8; border-left: 4px solid #28a745; }
        .test-item.failed { background: #fff8f8; border-left: 4px solid #dc3545; }
        .file-item.passed { background: #f8fff8; border-left: 4px solid #28a745; }
        .file-item.failed { background: #fff8f8; border-left: 4px solid #dc3545; }
        .file-header { display: flex; justify-content: space-between; align-items: center; padding: 15px; background: #f8f9fa; border-bottom: 1px solid #eee; font-weight: bold; }
        .file-tests { margin: 0; }
        .nested-test { padding: 10px 15px 10px 30px; border-bottom: 1px solid #f0f0f0; font-size: 0.9em; display: flex; justify-content: space-between; align-items: center; }
        .nested-test:last-child { border-bottom: none; }
        .nested-test.passed { background: #f8fff8; border-left: 3px solid #28a745; margin-left: 15px; }
        .nested-test.failed { background: #fff8f8; border-left: 3px solid #dc3545; margin-left: 15px; }
        .suite-name { color: #666; font-size: 0.8em; font-style: italic; }
        .test-name { font-weight: 500; }
        .test-meta { color: #666; font-size: 0.9em; }
        .error { background: #fff5f5; border: 1px solid #fed7d7; border-radius: 4px; padding: 10px; margin-top: 10px; color: #e53e3e; font-family: monospace; font-size: 0.9em; white-space: pre-wrap; overflow-x: auto; }
        .duration { background: #e3f2fd; color: #1976d2; padding: 4px 8px; border-radius: 4px; font-size: 0.8em; font-weight: 500; }
        .worker-id { background: #f3e5f5; color: #7b1fa2; padding: 4px 8px; border-radius: 4px; font-size: 0.8em; font-weight: 500; }
        .performance { background: #f8f9fa; padding: 20px; border-radius: 8px; border-left: 4px solid #007acc; }
        .performance h3 { margin-top: 0; color: #007acc; }
        .metadata { background: #f8f9fa; padding: 15px; border-radius: 8px; font-size: 0.9em; color: #666; }
        .metadata strong { color: #333; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Jest Parallel Worker</h1>
            <div class="subtitle">Test Execution Report - ${new Date(metadata.timestamp).toLocaleString()}</div>
        </div>

        <div class="summary">
            <div class="summary-card info">
                <h3>${summary.totalTests}</h3>
                <p>Total Tests</p>
            </div>
            <div class="summary-card success">
                <h3>${summary.passed}</h3>
                <p>Passed</p>
            </div>
            <div class="summary-card ${summary.failed > 0 ? 'danger' : 'success'}">
                <h3>${summary.failed}</h3>
                <p>Failed</p>
            </div>
            <div class="summary-card info">
                <h3>${summary.files}</h3>
                <p>Files</p>
            </div>
        </div>

        <div class="performance">
            <h3>Performance Metrics</h3>
            <p><strong>Execution Mode:</strong> ${summary.mode === 'parallel-file-concurrent' ? 'parallel-file (forced concurrent)' : summary.mode}</p>
            <p><strong>Total Duration:</strong> ${this.formatDuration(summary.totalDuration)}</p>
            <p><strong>Estimated Sequential Time:</strong> ${this.formatDuration(summary.estimatedSequentialTime)}</p>
            <p><strong>Time Saved:</strong> ${this.formatDuration(summary.timeSaved)} (${summary.timeSavedPercentage.toFixed(1)}%)</p>
        </div>

        ${testResults.length > 0 ? `
        <div class="section">
            <h2>Test Results</h2>
            <div class="test-list">
                ${testResults.map(test => `
                    <div class="test-item ${test.status}">
                        <div>
                            <div class="test-name">${test.testName}</div>
                            <div class="test-meta">${path.basename(test.filePath)}</div>
                            ${test.error ? `<div class="error">${this.escapeHtml(test.error)}</div>` : ''}
                        </div>
                        <div>
                            <span class="duration">${this.formatDuration(test.duration)}</span>
                            <span class="worker-id">Worker ${test.workerId}</span>
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>
        ` : ''}

        ${Object.keys(fileResults).length > 0 ? `
        <div class="section">
            <h2>File Results with Test Details</h2>
            <div class="file-list">
                ${Object.entries(fileResults).map(([fileName, fileResult]) => {
                  // Check if this file has individual test results
                  const fileTestResults = testResults.filter(test => path.basename(test.filePath) === fileName);
                  
                  return `
                    <div class="file-item ${fileResult.status || (fileResult.failed > 0 ? 'failed' : 'passed')}">
                        <div class="file-header">
                            <div>
                                <div class="test-name">${fileName}</div>
                                <div class="test-meta">
                                    ${fileResult.tests ? 
                                        `${fileResult.passed} passed, ${fileResult.failed} failed` : 
                                        `${fileResult.testCount} tests`
                                    }
                                </div>
                            </div>
                            <div>
                                <span class="duration">${this.formatDuration(fileResult.duration || 0)}</span>
                                ${fileResult.workerId !== undefined ? `<span class="worker-id">Worker ${fileResult.workerId}</span>` : ''}
                            </div>
                        </div>
                        ${fileTestResults.length > 0 ? `
                            <div class="file-tests">
                                ${fileTestResults.map(test => `
                                    <div class="nested-test ${test.status}">
                                        <div>
                                            <div class="test-name">${test.testName}</div>
                                            ${test.suite ? `<div class="suite-name">${test.suite}</div>` : ''}
                                            ${test.error ? `<div class="error">${this.escapeHtml(test.error)}</div>` : ''}
                                        </div>
                                        <div>
                                            <span class="duration">${this.formatDuration(test.duration)}</span>
                                        </div>
                                    </div>
                                `).join('')}
                            </div>
                        ` : ''}
                    </div>
                  `;
                }).join('')}
            </div>
        </div>
        ` : ''}

        <div class="metadata">
            <strong>Report Metadata:</strong><br>
            Generated: ${new Date(metadata.timestamp).toLocaleString()}<br>
            Process ID: ${metadata.pid}<br>
            Memory Usage: RSS ${metadata.memoryUsage.rss}MB, Heap ${metadata.memoryUsage.heapUsed}/${metadata.memoryUsage.heapTotal}MB, External ${metadata.memoryUsage.external}MB
        </div>
    </div>
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
