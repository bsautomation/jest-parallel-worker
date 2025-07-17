const path = require('path');
const fs = require('fs');

/**
 * Factory to create the appropriate adapter based on framework name
 * 
 * @param {string} framework - Name of the test framework
 * @returns {BaseAdapter} - An instance of the appropriate adapter
 */
function createAdapter(framework) {
  // Normalize the framework name
  const normalizedFramework = framework.toLowerCase().trim();
  
  // Try to load the built-in adapter
  try {
    const AdapterClass = require(`./${normalizedFramework}-adapter`);
    return new AdapterClass();
  } catch (err) {
    if (err.code !== 'MODULE_NOT_FOUND') {
      console.error(`Error loading adapter for ${framework}:`, err.message);
    }
    
    // Try to load a custom adapter from the project
    try {
      const customAdapterPath = path.resolve(process.cwd(), `test-parallel-adapter-${normalizedFramework}`);
      const AdapterClass = require(customAdapterPath);
      return new AdapterClass();
    } catch (customErr) {
      // If we can't find the adapter, fall back to Jest
      console.warn(`Adapter for "${framework}" not found, falling back to Jest adapter`);
      const JestAdapter = require('./jest-adapter');
      return new JestAdapter();
    }
  }
}

module.exports = {
  createAdapter
};