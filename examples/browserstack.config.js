// Example BrowserStack configuration file
module.exports = {
  userName: process.env.BROWSERSTACK_USERNAME || 'your_username',
  accessKey: process.env.BROWSERSTACK_ACCESS_KEY || 'your_access_key',
  buildName: process.env.BROWSERSTACK_BUILD_NAME || 'Jest Parallel Worker Demo',
  projectName: process.env.BROWSERSTACK_PROJECT_NAME || 'Demo Project',
  local: process.env.BROWSERSTACK_LOCAL === 'true',
  
  // Additional BrowserStack capabilities
  capabilities: [
    {
      browserName: 'chrome',
      browserVersion: 'latest',
      os: 'Windows',
      osVersion: '10'
    },
    {
      browserName: 'firefox', 
      browserVersion: 'latest',
      os: 'Windows',
      osVersion: '10'
    }
  ]
};
