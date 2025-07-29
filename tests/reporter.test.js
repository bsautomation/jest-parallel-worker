const { ReportGenerator } = require('../src/core/reporter');
const { Logger } = require('../src/utils/logger');
const fs = require('fs').promises;
const path = require('path');

describe('ReportGenerator', () => {
  let reportGenerator;
  let logger;
  let tempDir;

  beforeAll(async () => {
    logger = new Logger(false, true); // silent mode for tests
    tempDir = path.join(__dirname, 'temp-reports');
    
    reportGenerator = new ReportGenerator({
      outputDir: tempDir,
      reporter: 'both'
    }, logger);
  });

  afterAll(async () => {
    // Clean up temp directory
    try {
      await fs.rmdir(tempDir, { recursive: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  it('should process test results correctly', () => {
    const mockResults = [
      {
        testId: 'test1',
        testName: 'test 1',
        filePath: '/path/to/file1.test.js',
        status: 'passed',
        duration: 100,
        workerId: 1
      },
      {
        testId: 'test2',
        testName: 'test 2',
        filePath: '/path/to/file1.test.js',
        status: 'failed',
        duration: 200,
        error: 'Test failed',
        workerId: 2
      }
    ];

    const mockSummary = {
      startTime: Date.now() - 1000,
      endTime: Date.now()
    };

    const reportData = reportGenerator.processResults(mockResults, mockSummary, 'parallel-test');

    expect(reportData.summary.totalTests).toBe(2);
    expect(reportData.summary.passed).toBe(1);
    expect(reportData.summary.failed).toBe(1);
    expect(reportData.summary.mode).toBe('parallel-test');
    expect(reportData.testResults).toHaveLength(2);
    expect(reportData.metadata).toHaveProperty('timestamp');
    expect(reportData.metadata).toHaveProperty('pid');
    expect(reportData.metadata).toHaveProperty('memoryUsage');
  });

  it('should format duration correctly', () => {
    expect(reportGenerator.formatDuration(500)).toBe('500ms');
    expect(reportGenerator.formatDuration(1500)).toBe('1.5s');
    expect(reportGenerator.formatDuration(65000)).toBe('1m 5s');
  });

  it('should calculate time savings', () => {
    const results = [
      { duration: 1000 },
      { duration: 2000 },
      { duration: 1500 }
    ];

    const estimatedSequential = reportGenerator.estimateSequentialTime(results);
    expect(estimatedSequential).toBe(4500);
  });

  it('should generate HTML report', async () => {
    const mockReportData = {
      summary: {
        mode: 'parallel-test',
        totalTests: 2,
        passed: 1,
        failed: 1,
        totalDuration: 1000,
        estimatedSequentialTime: 2000,
        timeSaved: 1000,
        timeSavedPercentage: 50,
        files: 1
      },
      testResults: [],
      fileResults: {},
      metadata: {
        timestamp: new Date().toISOString(),
        pid: process.pid,
        memoryUsage: { rss: 100, heapTotal: 200, heapUsed: 150, external: 50 }
      }
    };

    const htmlContent = reportGenerator.generateHtmlContent(mockReportData);
    
    expect(htmlContent).toContain('<!DOCTYPE html>');
    expect(htmlContent).toContain('Jest Parallel Worker');
    expect(htmlContent).toContain('parallel-test');
    expect(htmlContent).toContain('50.0%');
  });

  it('should create output directory if it does not exist', async () => {
    await reportGenerator.ensureOutputDir();
    
    const stats = await fs.stat(tempDir);
    expect(stats.isDirectory()).toBe(true);
  });
});
