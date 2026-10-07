/**
 * Chrome check of the GitHub Pages app against mock-google.js.
 * Requires the preview server and puppeteer-core.
 * Usage: node tools/form-generator/test/browser-client.mjs
 */
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const require = createRequire(import.meta.url);
let puppeteer;
try {
  puppeteer = require('puppeteer-core');
} catch (err) {
  puppeteer = require('/tmp/preview-test/node_modules/puppeteer-core');
}

const base = process.env.FORM_PREVIEW || 'http://127.0.0.1:8765';
const outDir = process.env.FORM_SHOTS || '/opt/cursor/artifacts';
const chrome = process.env.CHROME || '/usr/local/bin/google-chrome';

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

const browser = await puppeteer.launch({
  executablePath: chrome,
  headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--lang=zh-HK']
});

const page = await browser.newPage();
page.setDefaultTimeout(15000);
await page.setViewport({ width: 1100, height: 900 });
await mkdir(outDir, { recursive: true });

try {
  await page.goto(base + '/index.html?mock=1', { waitUntil: 'networkidle0' });
  await page.waitForFunction(() => window.google && window.google.accounts);
  await page.waitForSelector('#setup-needed');
  const setupText = await page.$eval('#setup-needed', el => el.textContent);
  assert(setupText.includes('OAuth'), 'setup card missing');
  await page.screenshot({ path: path.join(outDir, 'pages_form_setup.png'), fullPage: true });

  await page.click('a[href="#view-settings"]');
  await page.waitForSelector('#view-settings:not(.hidden) #client-id');
  await page.type('#client-id', 'school-test.apps.googleusercontent.com');
  await page.click('#save-client');
  await page.waitForFunction(() => document.getElementById('who').textContent.includes('尚未登入'));
  await page.click('#sign-in');
  await page.waitForFunction(() => {
    const hk = window.__FORM_MOCK && window.__FORM_MOCK.hkToday;
    const title = document.getElementById('title').value;
    return hk && title.endsWith(hk + 'b');
  });

  const hk = await page.evaluate(() => window.__FORM_MOCK.hkToday);
  const title = await page.$eval('#title', el => el.value);
  assert(title === '2029 DSE Biology Homework Submission ' + hk + 'b', 'title was ' + title);
  await page.click('#tab-generate');
  await page.waitForSelector('#view-generate:not(.hidden)');
  await page.screenshot({ path: path.join(outDir, 'pages_form_generate.png'), fullPage: true });

  await page.click('#tab-template');
  await page.waitForSelector('#scan-btn');
  await page.click('#scan-btn');
  await page.waitForFunction(() => document.querySelectorAll('#scan-box .pick').length >= 2);
  const scanText = await page.$eval('#scan-box', el => el.textContent);
  assert(scanText.includes('Homework (PDF only)'), 'file upload title missing from scan');
  assert(scanText.includes('https://youtu.be/abcdefghijk'), 'audio url missing');
  assert(scanText.includes('https://example.com/biology/notes-template'), 'notes url missing');
  assert(scanText.includes('出現位置'), 'locations missing');
  await page.screenshot({ path: path.join(outDir, 'pages_form_scan.png'), fullPage: true });

  await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('#scan-box .pick'));
    cards.forEach(card => {
      const url = card.querySelector('p').textContent;
      const want = url.indexOf('youtu.be/abcdefghijk') !== -1 ? 'audio'
        : url.indexOf('example.com/biology/notes-template') !== -1 ? 'notes'
        : 'ignore';
      const input = card.querySelector('input[value="' + want + '"]');
      input.checked = true;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
  });
  await page.click('#save-template');
  await page.waitForFunction(() => document.getElementById('map-chip').textContent.includes('已標示'));

  await page.click('#tab-generate');
  await page.type('#audio', 'https://youtu.be/ZYXWVUTSRQP');
  await page.type('#notes', 'https://example.com/biology/notes-20261007');
  await page.type('#instructions', '先看第 3 章');
  await page.$eval('#deadline', el => {
    el.value = '2026-10-08T23:59';
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.click('#generate-btn');
  await page.waitForSelector('#result:not(.hidden)');
  const resultText = await page.$eval('#result', el => el.textContent);
  assert(resultText.includes('docs.google.com/forms/d/e/copiedFormId1234567890123/viewform'), 'responder uri missing');
  assert(resultText.includes('/forms/d/copiedFormId1234567890123/edit'), 'edit link missing');
  assert(resultText.includes('連結至試算表'), 'sheet hint missing');
  assert(resultText.includes('不能產生 forms.gle'), 'short-link limitation not explained');
  const hrefs = await page.$$eval('#result a', links => links.map(link => link.href));
  assert(hrefs.every(href => href.indexOf('forms.gle') === -1), 'forms.gle anchor present');
  const whatsapp = await page.$eval('#whatsapp', el => el.value);
  assert(whatsapp.includes('https://youtu.be/ZYXWVUTSRQP'), 'whatsapp audio missing');
  assert(whatsapp.includes('https://example.com/biology/notes-20261007'), 'whatsapp notes missing');
  assert(whatsapp.includes('2026年10月8日 23:59'), 'whatsapp deadline missing');

  const batch = await page.evaluate(() => window.__FORM_MOCK.lastBatch);
  const requests = batch.requests || [];
  const video = requests.find(request => request.updateItem && request.updateItem.item.itemId === 'vid');
  assert(video && video.updateItem.item.videoItem.video.youtubeUri === 'https://youtu.be/ZYXWVUTSRQP', 'youtube not updated');
  assert(requests.every(request => !request.updateItem || request.updateItem.updateMask.indexOf('questionItem') === -1), 'questionItem was patched');
  assert(!requests.some(request => request.updateItem && request.updateItem.item.itemId === 'file'), 'pdf item was updated');
  const info = requests.find(request => request.updateFormInfo);
  assert(info, 'no updateFormInfo in ' + JSON.stringify(requests).slice(0, 500));
  assert(info.updateFormInfo.info.description.includes('📅 截止日期：2026年10月8日 23:59'), 'deadline not in description');
  assert(info.updateFormInfo.info.description.includes('🎧 語音：'), 'labelled audio line missing');
  await page.screenshot({ path: path.join(outDir, 'pages_form_result.png'), fullPage: true });

  await page.click('#tab-history');
  await page.waitForFunction((expected) => document.getElementById('history-list').textContent.includes(expected), {}, title);
  await page.screenshot({ path: path.join(outDir, 'pages_form_history.png'), fullPage: true });

  await page.reload({ waitUntil: 'networkidle0' });
  await page.waitForFunction(() => window.google && window.google.accounts);
  const stillThere = await page.evaluate(() => {
    const raw = localStorage.getItem('fg.history') || '[]';
    return JSON.parse(raw).length;
  });
  assert(stillThere >= 1, 'history did not survive reload');
  const signedOut = await page.$eval('#who', el => el.textContent);
  assert(signedOut.includes('尚未登入'), 'token should not persist, got ' + signedOut);
  await page.click('#sign-in');
  await page.waitForFunction(() => document.getElementById('who').textContent.includes('已用學校'));
  await page.click('#tab-history');
  await page.waitForFunction((expected) => document.getElementById('history-list').textContent.includes(expected), {}, title);

  await page.click('#tab-template');
  await page.$eval('#tpl-form', el => { el.value = ''; });
  await page.type('#tpl-form', 'forbiddenFormId1234567890');
  await page.click('#scan-btn');
  await page.waitForFunction(() => document.getElementById('banner').textContent.includes('沒有權限'));
  await page.screenshot({ path: path.join(outDir, 'pages_form_error.png'), fullPage: true });

  await page.click('#tab-settings');
  await page.$eval('#client-id', el => { el.value = ''; });
  await page.type('#client-id', 'popup.apps.googleusercontent.com');
  await page.click('#save-client');
  await page.click('#sign-in');
  await page.waitForFunction(() => document.getElementById('banner').textContent.includes('登入視窗被瀏覽器擋住'));

  await page.setViewport({ width: 390, height: 844 });
  await page.click('#tab-generate');
  await page.waitForSelector('#gen-form');
  await page.screenshot({ path: path.join(outDir, 'pages_form_mobile.png'), fullPage: true });

  await writeFile(path.join(outDir, 'pages_form_browser_ok.txt'), 'ok ' + title + '\n');
  console.log('browser ok ' + title);
} catch (err) {
  const debug = await page.evaluate(() => ({
    banner: document.getElementById('banner') && document.getElementById('banner').textContent,
    title: document.getElementById('title') && document.getElementById('title').value,
    calls: window.__FORM_MOCK && window.__FORM_MOCK.calls
  })).catch(() => ({}));
  console.error(JSON.stringify(debug, null, 2));
  await page.screenshot({ path: path.join(outDir, 'pages_form_failure.png'), fullPage: true }).catch(() => {});
  console.error(err);
  process.exitCode = 1;
} finally {
  await browser.close();
}
