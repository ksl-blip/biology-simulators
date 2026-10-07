/**
 * Syntax-check Code.gs and load it with Apps Script stubs.
 * Usage: node tools/form-generator/test/lint.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const file = path.join(__dirname, '..', 'Code.gs');
const code = fs.readFileSync(file, 'utf8');
new vm.Script(code, { filename: 'Code.gs' });

const sandbox = {
  FormApp: {
    ItemType: { FILE_UPLOAD: 'FILE_UPLOAD' },
    DestinationType: { SPREADSHEET: 'SPREADSHEET' }
  },
  DriveApp: {},
  PropertiesService: {
    getScriptProperties: function () {
      return { getProperty: function () { return null; }, setProperty: function () {} };
    }
  },
  UrlFetchApp: {},
  ScriptApp: {},
  Session: {},
  SpreadsheetApp: {},
  HtmlService: {
    XFrameOptionsMode: { ALLOWALL: 'ALLOWALL' },
    createHtmlOutputFromFile: function () {
      return {
        setTitle: function () { return this; },
        addMetaTag: function () { return this; },
        setXFrameOptionsMode: function () { return this; }
      };
    }
  },
  Utilities: {},
  console: console
};
vm.createContext(sandbox);
vm.runInContext(code, sandbox, { filename: 'Code.gs' });

const required = [
  'doGet', 'getAppState', 'scanTemplate', 'saveTemplate', 'generateForm',
  'closeScheduledForm', 'extractUrls', 'scanFormModel', 'buildUpdatedModel', 'suggestTitle'
];
const missing = required.filter(function (name) { return typeof sandbox[name] !== 'function'; });
if (missing.length) {
  console.error('Missing functions: ' + missing.join(', '));
  process.exit(1);
}
console.log('lint ok');
