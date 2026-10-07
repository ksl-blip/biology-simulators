const test = require('node:test');
const assert = require('node:assert/strict');
const { loadAppsScript } = require('./load');

const gas = loadAppsScript();

const AUDIO_OLD = 'https://youtu.be/abcdefghijk';
const AUDIO_WATCH = 'https://www.youtube.com/watch?v=abcdefghijk';
const AUDIO_NEW = 'https://youtu.be/ZYXWVUTSRQP';
const NOTES_OLD = 'https://example.com/biology/notes-template';
const NOTES_NEW = 'https://example.com/biology/notes-20261007';
const PREFIX = '2029 DSE Biology Homework Submission ';

function sampleModel() {
  return {
    title: PREFIX + '20261006a',
    description: '聽 ' + AUDIO_OLD + ' 再讀 ' + NOTES_OLD + '。',
    confirmationMessage: '已收到。筆記仍是 ' + NOTES_OLD,
    closedMessage: '',
    items: [
      { index: 0, itemId: '1', type: 'TEXT', title: 'English Full Name (e.g. Chan Tai Man)', helpText: '', extraText: '', videoUrl: '', imageUrl: '' },
      { index: 1, itemId: '2', type: 'CHOICE', title: 'Class ', helpText: '', extraText: '', videoUrl: '', imageUrl: '' },
      { index: 2, itemId: '3', type: 'TEXT', title: 'Class No.', helpText: '', extraText: '', videoUrl: '', imageUrl: '' },
      { index: 3, itemId: '4', type: 'FILE_UPLOAD', title: 'Homework (PDF only)', helpText: '只接受 PDF', extraText: '', videoUrl: '', imageUrl: '' },
      { index: 4, itemId: '5', type: 'PAGE_BREAK', title: '資料', helpText: '筆記 ' + NOTES_OLD, extraText: '', videoUrl: '', imageUrl: '' },
      { index: 5, itemId: '6', type: 'VIDEO', title: '語音', helpText: '', extraText: '', videoUrl: AUDIO_WATCH, imageUrl: '' },
      { index: 6, itemId: '7', type: 'IMAGE', title: '圖', helpText: '', extraText: '圖', videoUrl: '', imageUrl: NOTES_OLD }
    ]
  };
}

test('extractUrls trims punctuation and dedupes', function () {
  const urls = gas.extractUrls('見 ' + NOTES_OLD + '。 以及 ' + NOTES_OLD + ' 和 ' + AUDIO_OLD + '?x=1');
  assert.deepEqual(Array.from(urls), [NOTES_OLD, AUDIO_OLD + '?x=1']);
});

test('youtube ids match watch, short, embed and shorts links', function () {
  assert.equal(gas.youtubeId(AUDIO_WATCH), 'abcdefghijk');
  assert.equal(gas.youtubeId(AUDIO_OLD), 'abcdefghijk');
  assert.equal(gas.youtubeId('https://www.youtube.com/embed/abcdefghijk'), 'abcdefghijk');
  assert.equal(gas.youtubeId('https://www.youtube.com/shorts/abcdefghijk'), 'abcdefghijk');
  assert.equal(gas.isYouTubeUrl(AUDIO_NEW), true);
  assert.equal(gas.isYouTubeUrl(NOTES_OLD), false);
});

test('replaceExactUrls prefers the longer url and does not rewrite the new value', function () {
  const text = 'A https://example.com/audio B https://example.com/audio/full';
  const out = gas.replaceExactUrls(text, [
    { oldUrl: 'https://example.com/audio', newUrl: 'https://new.example/a' },
    { oldUrl: 'https://example.com/audio/full', newUrl: 'https://new.example/notes' }
  ]);
  assert.equal(out, 'A https://new.example/a B https://new.example/notes');
  assert.equal(gas.replaceExactUrls('https://old.example/a', [
    { oldUrl: 'https://old.example/a', newUrl: 'https://old.example/a/extra' }
  ]), 'https://old.example/a/extra');
});

test('scanFormModel lists each url once with every location', function () {
  const scan = gas.scanFormModel(sampleModel());
  const notes = scan.urls.find(function (entry) { return entry.url === NOTES_OLD; });
  const audio = scan.urls.find(function (entry) { return entry.url === AUDIO_WATCH; });
  assert.ok(notes.locations.some(function (location) { return location.kind === 'description'; }));
  assert.ok(notes.locations.some(function (location) { return location.kind === 'itemHelp'; }));
  assert.ok(notes.locations.some(function (location) { return location.kind === 'image'; }));
  assert.equal(audio.locations[0].kind, 'video');
  assert.equal(scan.fileUploads[0].title, 'Homework (PDF only)');
  assert.equal(scan.urls.filter(function (entry) { return entry.url === NOTES_OLD; }).length, 1);
});

test('API and FormApp mocks both become scannable models', function () {
  const api = gas.modelFromApiResource({
    info: { title: 'T', description: '讀 ' + NOTES_OLD },
    items: [
      { itemId: 'q', title: 'Homework (PDF only)', questionItem: { question: { fileUploadQuestion: {} } } },
      { itemId: 'v', title: '語音', videoItem: { video: { youtubeUri: AUDIO_OLD }, caption: '片' } },
      { itemId: 'i', title: '圖', imageItem: { image: { sourceUri: NOTES_OLD, altText: 'alt' } } }
    ]
  });
  assert.equal(api.items[0].type, 'FILE_UPLOAD');
  assert.equal(api.items[1].videoUrl, AUDIO_OLD);
  assert.equal(api.items[1].extraText, '片');
  assert.equal(api.items[2].imageUrl, NOTES_OLD);
  const scan = gas.scanFormModel(api);
  assert.ok(scan.urls.some(function (entry) { return entry.url === AUDIO_OLD; }));

  const form = gas.modelFromFormLike({
    getTitle: function () { return 'T'; },
    getDescription: function () { return '聽 ' + AUDIO_OLD; },
    getConfirmationMessage: function () { return ''; },
    getCustomClosedFormMessage: function () { return ''; },
    getItems: function () {
      return [
        {
          getType: function () { return 'VIDEO'; },
          getTitle: function () { return '語音'; },
          getHelpText: function () { return NOTES_OLD; },
          getIndex: function () { return 0; },
          getId: function () { return 9; },
          asVideoItem: function () { return { getVideoUrl: function () { return AUDIO_WATCH; } }; }
        },
        {
          getType: function () { return 'FILE_UPLOAD'; },
          getTitle: function () { return 'Homework (PDF only)'; },
          getHelpText: function () { return ''; },
          getIndex: function () { return 1; },
          getId: function () { return 10; }
        }
      ];
    }
  });
  assert.equal(form.items[0].videoUrl, AUDIO_WATCH);
  assert.equal(form.items[1].type, 'FILE_UPLOAD');
  const found = gas.scanFormModel(form);
  assert.ok(found.urls.some(function (entry) { return entry.url === AUDIO_WATCH && entry.locations[0].kind === 'video'; }));
  assert.ok(found.urls.some(function (entry) { return entry.url === NOTES_OLD; }));
});

test('buildUpdatedModel replaces links, keeps the PDF question, and updates YouTube', function () {
  const before = sampleModel();
  const result = gas.buildUpdatedModel(before, {
    title: PREFIX + '20261007b',
    audioOld: AUDIO_OLD,
    notesOld: NOTES_OLD,
    audioNew: AUDIO_NEW,
    notesNew: NOTES_NEW,
    labelLinks: true,
    instructions: '請用 PDF。',
    deadlineText: '2026年10月8日 23:59'
  });
  assert.equal(result.model.items.length, before.items.length);
  assert.equal(result.model.items[3].type, 'FILE_UPLOAD');
  assert.equal(result.model.items[3].title, 'Homework (PDF only)');
  assert.equal(result.model.items[1].title, 'Class ');
  assert.equal(result.model.items[0].title, 'English Full Name (e.g. Chan Tai Man)');
  assert.equal(result.model.items[4].helpText, '筆記 ' + NOTES_NEW);
  assert.equal(result.model.items[5].videoUrl, AUDIO_NEW);
  assert.equal(result.model.items[6].imageUrl, NOTES_NEW);
  assert.match(result.model.description, /🎧 語音：/);
  assert.match(result.model.description, new RegExp(AUDIO_NEW.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.doesNotMatch(result.model.description, /abcdefghijk/);
  assert.match(result.model.description, /📒 筆記：/);
  assert.match(result.model.description, /📅 截止日期：2026年10月8日 23:59/);
  assert.match(result.model.description, /📝 請用 PDF。/);
  assert.equal(result.model.confirmationMessage, '已收到。筆記仍是 ' + NOTES_NEW);
  const requests = gas.buildMediaUpdateRequests(before.items, result.model.items);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].updateItem.updateMask.indexOf('imageItem.image.sourceUri') !== -1, true);
  assert.equal(requests[0].updateItem.item.imageItem.image.sourceUri, NOTES_NEW);
});

test('file-upload help text can change without changing the question type', function () {
  const model = sampleModel();
  model.items[3].helpText = '上載前先看 ' + NOTES_OLD;
  const result = gas.buildUpdatedModel(model, {
    audioOld: AUDIO_OLD,
    notesOld: NOTES_OLD,
    audioNew: AUDIO_NEW,
    notesNew: NOTES_NEW,
    labelLinks: false
  });
  assert.equal(result.model.items[3].type, 'FILE_UPLOAD');
  assert.equal(result.model.items[3].helpText, '上載前先看 ' + NOTES_NEW);
  assert.equal(gas.fileUploadsPreserved(
    [{ title: 'Homework (PDF only)', types: 'PDF' }],
    [{ title: 'Homework (PDF only)', types: 'PDF' }]
  ), true);
  assert.equal(gas.fileUploadsPreserved(
    [{ types: 'PDF' }],
    [{ types: 'PDF,IMAGE' }]
  ), false);
});

test('a non-YouTube audio link does not replace the video, and multiple videos only follow a match', function () {
  const drive = gas.buildUpdatedModel(sampleModel(), {
    audioOld: AUDIO_OLD,
    notesOld: NOTES_OLD,
    audioNew: 'https://drive.google.com/file/d/abc/view',
    notesNew: NOTES_NEW,
    labelLinks: false
  });
  assert.equal(drive.model.items[5].videoUrl, AUDIO_WATCH);

  const model = sampleModel();
  model.items.push({
    index: 7, itemId: '8', type: 'VIDEO', title: '其他', helpText: '', extraText: '',
    videoUrl: 'https://youtu.be/aaaaaaaaaaa', imageUrl: ''
  });
  const multi = gas.buildUpdatedModel(model, {
    audioOld: AUDIO_OLD,
    notesOld: NOTES_OLD,
    audioNew: AUDIO_NEW,
    notesNew: NOTES_NEW,
    labelLinks: false
  });
  assert.equal(multi.model.items[5].videoUrl, AUDIO_NEW);
  assert.equal(multi.model.items[7].videoUrl, 'https://youtu.be/aaaaaaaaaaa');

  const notesVideo = sampleModel();
  notesVideo.items[5].videoUrl = NOTES_OLD;
  const skipped = gas.buildUpdatedModel(notesVideo, {
    audioOld: 'https://drive.google.com/file/d/old-audio/view',
    notesOld: NOTES_OLD,
    audioNew: AUDIO_NEW,
    notesNew: NOTES_NEW,
    labelLinks: false
  });
  assert.equal(skipped.model.items[5].videoUrl, NOTES_OLD);
  assert.ok(skipped.warnings.some(function (warning) { return warning.indexOf('筆記') !== -1; }));
});

test('labelled description lines are replaced rather than duplicated', function () {
  const text = '🎧 語音：' + AUDIO_OLD + '\n📒 筆記：' + NOTES_OLD + '\n\n原有說明';
  const out = gas.composeDescription(text, {
    audioOld: AUDIO_OLD,
    notesOld: NOTES_OLD,
    audioNew: AUDIO_NEW,
    notesNew: NOTES_NEW,
    labelLinks: true
  });
  assert.equal(out.split('🎧').length, 2);
  assert.equal(out.split('📒').length, 2);
  assert.match(out, /原有說明/);
  assert.doesNotMatch(out, /abcdefghijk/);
});

test('suggestTitle uses the first free letter for that date', function () {
  assert.equal(gas.suggestTitle([], '20261007', PREFIX), PREFIX + '20261007a');
  assert.equal(gas.suggestTitle([
    PREFIX + '20261007a',
    PREFIX + '20261006a',
    '其他檔案'
  ], '20261007', PREFIX), PREFIX + '20261007b');
  assert.equal(gas.suggestTitle([
    PREFIX + '20261007a',
    PREFIX + '20261007c'
  ], '20261007', PREFIX), PREFIX + '20261007b');
  assert.equal(gas.suggestTitle([
    PREFIX + '20261007A',
    PREFIX + '20261007a（回應）'
  ], '20261007', PREFIX), PREFIX + '20261007b');
  let titles = [];
  for (let i = 0; i < 26; i++) titles.push(PREFIX + '20261007' + String.fromCharCode(97 + i));
  assert.equal(gas.suggestTitle(titles, '20261007', PREFIX), PREFIX + '20261007aa');
});

test('Hong Kong date and deadline parsing', function () {
  assert.equal(gas.yyyymmddInHongKong(new Date(Date.UTC(2026, 9, 6, 16, 0))), '20261007');
  assert.equal(gas.yyyymmddInHongKong(new Date(Date.UTC(2026, 9, 6, 15, 59))), '20261006');
  assert.equal(gas.formatDeadlineText('2026-10-08T23:59'), '2026年10月8日 23:59');
  assert.equal(gas.parseDeadlineHKT('2026-10-08T23:59').toISOString(), '2026-10-08T15:59:00.000Z');
  assert.equal(gas.parseDeadlineHKT('2026-10-08T00:30').toISOString(), '2026-10-07T16:30:00.000Z');
});

test('WhatsApp message includes the task, both links, the form and the deadline', function () {
  const message = gas.buildWhatsAppMessage({
    title: PREFIX + '20261007a',
    notesUrl: NOTES_NEW,
    audioUrl: AUDIO_NEW,
    formUrl: 'https://forms.gle/example',
    deadlineText: '2026年10月8日 23:59',
    instructions: '記得寫姓名。'
  });
  assert.match(message, /20261007a/);
  assert.match(message, new RegExp(NOTES_NEW));
  assert.match(message, new RegExp(AUDIO_NEW));
  assert.match(message, /https:\/\/forms\.gle\/example/);
  assert.match(message, /2026年10月8日 23:59/);
  assert.match(message, /記得寫姓名。/);
  assert.match(message, /PDF/);
});

test('form and folder ids parse, and the responder link is rejected', function () {
  assert.equal(gas.parseFormId(gas.DEFAULT_FORM_ID).id, gas.DEFAULT_FORM_ID);
  assert.equal(gas.parseFormId('https://docs.google.com/forms/d/' + gas.DEFAULT_FORM_ID + '/edit').id, gas.DEFAULT_FORM_ID);
  assert.match(gas.parseFormId('https://docs.google.com/forms/d/e/1FAIpQLScKGxJsAf7w1tmKvHLQdANl-keLTZR1jElrHyZEdNTPbzafMQ/viewform').error, /\/e\//);
  assert.equal(gas.parseFolderId('https://drive.google.com/drive/folders/' + gas.DEFAULT_FOLDER_ID).id, gas.DEFAULT_FOLDER_ID);
  assert.equal(gas.DEFAULT_FORM_ID, '1uerPSCadog-u3AsRlM0OR-3mRpJR_GXJCOMlVh75Uvw');
  assert.equal(gas.DEFAULT_FOLDER_ID, '1I5hvOvxqYWIFXzP1HxlfdWdl7RcacUVF');
});

test('errors that the teacher can act on stay in Chinese', function () {
  assert.match(gas.toChineseError(new Error('Permission denied')), /沒有權限/);
  assert.match(gas.toChineseError('File not found'), /找不到/);
  assert.match(gas.toChineseError('Google Forms API has not been used or it is disabled'), /Forms API/);
  assert.equal(gas.toChineseError(new Error('請先掃描範本')), '請先掃描範本');
  assert.equal(gas.collectSettingsUnchanged(
    { collectsEmail: false, limitOneResponsePerUser: true, publishingSummary: false, canEditResponse: false, showLinkToRespondAgain: false },
    { collectsEmail: false, limitOneResponsePerUser: true, publishingSummary: false, canEditResponse: false, showLinkToRespondAgain: false }
  ).ok, true);
  assert.equal(gas.collectSettingsUnchanged({ collectsEmail: false }, { collectsEmail: true }).ok, false);
});

test('history payload is trimmed from the oldest end', function () {
  const list = [];
  for (let i = 0; i < 5; i++) list.push({ id: i, blob: 'x'.repeat(100) });
  const fitted = gas.fitPropertyList(list, 250);
  assert.ok(fitted.length < list.length);
  assert.equal(fitted[0].id, 0);
  assert.ok(JSON.stringify(fitted).length <= 250);
});
