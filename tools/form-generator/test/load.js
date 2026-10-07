const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadAppsScript() {
  const code = fs.readFileSync(path.join(__dirname, '..', 'Code.gs'), 'utf8');
  const sandbox = {
    FormApp: {},
    DriveApp: {},
    PropertiesService: {},
    UrlFetchApp: {},
    ScriptApp: {},
    Session: {},
    SpreadsheetApp: {},
    HtmlService: {},
    Utilities: {},
    console: console
  };
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: 'Code.gs' });
  return sandbox;
}

module.exports = { loadAppsScript };
