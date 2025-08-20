const { JestOutputParser } = require('./jest-output-parser');
const { ErrorResultFormatter } = require('./error-result-formatter');

/**
 * Index file for the parsers module
 * Provides centralized Jest output parsing and error formatting
 */

// Main parser instance (singleton for performance)
let parserInstance = null;
let formatterInstance = null;

/**
 * Get or create parser instance
 * @param {Object} logger - Optional logger instance
 * @returns {JestOutputParser} Parser instance
 */
function getParser(logger = null) {
  if (!parserInstance) {
    parserInstance = new JestOutputParser(logger);
  }
  return parserInstance;
}

/**
 * Get or create formatter instance
 * @param {Object} logger - Optional logger instance
 * @returns {ErrorResultFormatter} Formatter instance
 */
function getFormatter(logger = null) {
  if (!formatterInstance) {
    formatterInstance = new ErrorResultFormatter(logger);
  }
  return formatterInstance;
}

/**
 * Convenience function to parse Jest output
 * @param {string} output - Jest output to parse
 * @param {Object} workItem - Work item context
 * @param {Object} logger - Optional logger
 * @returns {Object} Parsed results
 */
function parseJestOutput(output, workItem = {}, logger = null) {
  const parser = getParser(logger);
  return parser.parseJestOutput(output, workItem);
}

/**
 * Convenience function to format errors for console
 * @param {Object} parsedResult - Parsed Jest result
 * @param {Object} options - Formatting options
 * @param {Object} logger - Optional logger
 * @returns {string} Formatted console output
 */
function formatForConsole(parsedResult, options = {}, logger = null) {
  const formatter = getFormatter(logger);
  return formatter.formatForConsole(parsedResult, options);
}

/**
 * Convenience function to format errors for HTML
 * @param {Object} parsedResult - Parsed Jest result
 * @param {Object} options - Formatting options
 * @param {Object} logger - Optional logger
 * @returns {Object} HTML-formatted data
 */
function formatForHTML(parsedResult, options = {}, logger = null) {
  const formatter = getFormatter(logger);
  return formatter.formatForHTML(parsedResult, options);
}

/**
 * Convenience function to generate error classification
 * @param {Object} parsedResult - Parsed Jest result
 * @param {Object} logger - Optional logger
 * @returns {Object} Error classification report
 */
function classifyErrors(parsedResult, logger = null) {
  const formatter = getFormatter(logger);
  return formatter.generateErrorClassificationReport(parsedResult);
}

/**
 * Parse and format Jest output in one step
 * @param {string} output - Jest output to parse
 * @param {Object} workItem - Work item context
 * @param {Object} options - Formatting options
 * @param {Object} logger - Optional logger
 * @returns {Object} Complete result with parsed data and formatted output
 */
function parseAndFormat(output, workItem = {}, options = {}, logger = null) {
  const parsedResult = parseJestOutput(output, workItem, logger);
  
  const {
    includeConsole = true,
    includeHTML = true,
    includeClassification = false,
    consoleOptions = {},
    htmlOptions = {}
  } = options;

  const result = {
    parsed: parsedResult,
    formatted: {}
  };

  if (includeConsole) {
    result.formatted.console = formatForConsole(parsedResult, consoleOptions, logger);
  }

  if (includeHTML) {
    result.formatted.html = formatForHTML(parsedResult, htmlOptions, logger);
  }

  if (includeClassification) {
    result.formatted.classification = classifyErrors(parsedResult, logger);
  }

  return result;
}

module.exports = {
  // Classes
  JestOutputParser,
  ErrorResultFormatter,
  
  // Convenience functions
  parseJestOutput,
  formatForConsole,
  formatForHTML,
  classifyErrors,
  parseAndFormat,
  
  // Instance getters
  getParser,
  getFormatter
};
