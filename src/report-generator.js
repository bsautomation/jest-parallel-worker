const fs = require('fs');
const path = require('path');
const chalk = require('chalk');

/**
 * Generates consolidated HTML reports for all test results
 */
class ReportGenerator {
  constructor(options = {}) {
    this.options = {
      outputDir: 'reports',
      reportFilename: 'jest-parallel-report.html',
      ...options
    };
    this.results = [];
    this.startTime = Date.now();
  }

  // Add a test result to the report
  addResult(result) {
    this.results.push({
      ...result,
      timestamp: Date.now()
    });
  }

  // Generate the report after all tests complete
  generateReport(summary) {
    const reportDir = path.resolve(process.cwd(), this.options.outputDir);
    
    // Create the reports directory if it doesn't exist
    if (!fs.existsSync(reportDir)) {
      fs.mkdirSync(reportDir, { recursive: true });
    }
    
    const reportPath = path.join(reportDir, this.options.reportFilename);
    const executionTime = (Date.now() - this.startTime) / 1000;
    
    // Generate HTML content
    const html = this.generateHtml(summary, executionTime);
    
    // Write the report to file
    fs.writeFileSync(reportPath, html);
    
    console.log(chalk.green(`\nHTML report generated at: ${reportPath}`));
    return reportPath;
  }

  generateHtml(summary, executionTime) {
    const { testsRun, passed, failed, skipped = 0 } = summary;
    
    // Sort results by timestamp
    const sortedResults = [...this.results].sort((a, b) => a.timestamp - b.timestamp);
    
    // Generate individual test case rows
    const testRows = sortedResults.map(result => {
      const statusClass = result.success ? 'success' : 'failure';
      
      // Handle different types of duration values safely
      let duration = '?';
      if (result.duration) {
        if (typeof result.duration === 'number') {
          duration = result.duration.toFixed(2);
        } else if (typeof result.duration === 'string' && !isNaN(parseFloat(result.duration))) {
          duration = parseFloat(result.duration).toFixed(2);
        } else {
          duration = String(result.duration);
        }
      }
      
      // Format error details if present
      const errorDetails = !result.success ? 
        `<div class="error-details">
           <pre>${this.escapeHtml(result.errorMessage || 'Unknown error')}</pre>
           ${result.errorDetails ? `<p class="error-context">${this.escapeHtml(result.errorDetails)}</p>` : ''}
           ${result.stackTrace ? `<pre class="error-stack">${this.escapeHtml(result.stackTrace)}</pre>` : ''}
         </div>` : '';
      
      return `
        <tr class="${statusClass}">
          <td>${this.escapeHtml(result.testName)}</td>
          <td>${this.escapeHtml(result.testFile)}</td>
          <td>${result.success ? 'Passed' : 'Failed'}</td>
          <td>${duration}s</td>
          <td>${result.pid || 'unknown'}</td>
          <td>${errorDetails}</td>
        </tr>
      `;
    }).join('');
    
    // Calculate pass percentage
    const total = testsRun || 0;
    const passPercentage = total > 0 ? ((passed / total) * 100).toFixed(2) : 0;
    
    // Generate the full HTML report
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Jest Parallel Worker - Test Report</title>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 1200px;
            margin: 0 auto;
            padding: 20px;
          }
          h1, h2 {
            color: #333;
          }
          .summary {
            display: flex;
            justify-content: space-between;
            background-color: #f8f9fa;
            padding: 20px;
            border-radius: 5px;
            margin-bottom: 20px;
          }
          .summary-item {
            text-align: center;
          }
          .summary-item .count {
            font-size: 32px;
            font-weight: bold;
          }
          .summary-item.passed .count {
            color: #28a745;
          }
          .summary-item.failed .count {
            color: #dc3545;
          }
          .summary-item.skipped .count {
            color: #6c757d;
          }
          .summary-item.total .count {
            color: #007bff;
          }
          .progress-bar {
            height: 10px;
            background-color: #e9ecef;
            border-radius: 5px;
            margin-bottom: 20px;
          }
          .progress {
            height: 100%;
            background-color: #28a745;
            border-radius: 5px;
            width: ${passPercentage}%;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 20px;
          }
          th, td {
            padding: 12px 15px;
            text-align: left;
            border-bottom: 1px solid #ddd;
          }
          th {
            background-color: #f8f9fa;
            position: sticky;
            top: 0;
          }
          tr.success {
            background-color: #f1f9f1;
          }
          tr.failure {
            background-color: #fdf1f1;
          }
          .error-details {
            margin-top: 5px;
            white-space: pre-wrap;
            max-height: 200px;
            overflow: auto;
            background-color: #f8f8f8;
            border-radius: 4px;
            padding: 8px;
            font-family: monospace;
            font-size: 12px;
          }
          .error-context {
            font-weight: bold;
            margin-top: 8px;
            margin-bottom: 8px;
          }
          .error-stack {
            font-size: 11px;
            color: #666;
            margin-top: 8px;
            border-top: 1px solid #ddd;
            padding-top: 8px;
          }
          .execution-info {
            margin-bottom: 20px;
            color: #6c757d;
          }
          .filter-controls {
            margin-bottom: 20px;
            display: flex;
            gap: 10px;
          }
          .filter-controls button {
            padding: 8px 16px;
            border: none;
            border-radius: 4px;
            background-color: #f8f9fa;
            cursor: pointer;
          }
          .filter-controls button.active {
            background-color: #007bff;
            color: white;
          }
          .toggle-details {
            cursor: pointer;
            background: none;
            border: none;
            color: #007bff;
            text-decoration: underline;
          }
        </style>
        <script>
          window.addEventListener('DOMContentLoaded', () => {
            // Add filtering functionality
            const allRows = document.querySelectorAll('tbody tr');
            
            document.getElementById('show-all').addEventListener('click', () => {
              setActiveButton('show-all');
              allRows.forEach(row => row.style.display = '');
            });
            
            document.getElementById('show-passed').addEventListener('click', () => {
              setActiveButton('show-passed');
              allRows.forEach(row => {
                row.style.display = row.classList.contains('success') ? '' : 'none';
              });
            });
            
            document.getElementById('show-failed').addEventListener('click', () => {
              setActiveButton('show-failed');
              allRows.forEach(row => {
                row.style.display = row.classList.contains('failure') ? '' : 'none';
              });
            });
            
            function setActiveButton(id) {
              document.querySelectorAll('.filter-controls button').forEach(btn => {
                btn.classList.remove('active');
              });
              document.getElementById(id).classList.add('active');
            }
            
            // Initialize with "all" active
            setActiveButton('show-all');
            
            // Add toggle for error details
            const toggleDetails = document.getElementById('toggle-details');
            const errorDetails = document.querySelectorAll('.error-details');
            let detailsVisible = true;
            
            if (toggleDetails) {
              toggleDetails.addEventListener('click', () => {
                detailsVisible = !detailsVisible;
                errorDetails.forEach(detail => {
                  detail.style.display = detailsVisible ? 'block' : 'none';
                });
                toggleDetails.textContent = detailsVisible ? 'Hide Error Details' : 'Show Error Details';
              });
            }
          });
        </script>
      </head>
      <body>
        <h1>Jest Parallel Worker - Test Report</h1>
        
        <div class="execution-info">
          <p>Execution time: ${executionTime.toFixed(2)} seconds</p>
          <p>Report generated: ${new Date().toLocaleString()}</p>
        </div>
        
        <div class="summary">
          <div class="summary-item total">
            <div class="count">${total}</div>
            <div class="label">Total</div>
          </div>
          <div class="summary-item passed">
            <div class="count">${passed}</div>
            <div class="label">Passed</div>
          </div>
          <div class="summary-item failed">
            <div class="count">${failed}</div>
            <div class="label">Failed</div>
          </div>
          <div class="summary-item skipped">
            <div class="count">${skipped}</div>
            <div class="label">Skipped</div>
          </div>
        </div>
        
        <div class="progress-bar">
          <div class="progress"></div>
        </div>
        
        <div class="filter-controls">
          <button id="show-all">All Tests</button>
          <button id="show-passed">Passed</button>
          <button id="show-failed">Failed</button>
          ${failed > 0 ? '<button id="toggle-details">Hide Error Details</button>' : ''}
        </div>
        
        <h2>Test Results</h2>
        <table>
          <thead>
            <tr>
              <th>Test Name</th>
              <th>File Path</th>
              <th>Status</th>
              <th>Duration</th>
              <th>Worker PID</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            ${testRows}
          </tbody>
        </table>
      </body>
      </html>
    `;
  }
  
  // Helper function to escape HTML
  escapeHtml(text) {
    if (!text) return '';
    return String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
}

module.exports = ReportGenerator;