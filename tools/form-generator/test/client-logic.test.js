const test = require('node:test');
const assert = require('node:assert/strict');
const logic = require('../logic.js');

const AUDIO_OLD = 'https://youtu.be/abcdefghijk';
const AUDIO_WATCH = 'https://www.youtube.com/watch?v=abcdefghijk';
const AUDIO_NEW = 'https://youtu.be/ZYXWVUTSRQP';
const NOTES_OLD = 'https://example.com/biology/notes-template';
const NOTES_NEW = 'https://example.com/biology/notes-20261007';
const PREFIX = '2029 DSE Biology Homework Submission ';

function resource() {
  return {
    formId: logic.DEFAULT_FORM_ID,
    info: {
      title: 'template',
      description: '聽 ' + AUDIO_OLD + ' 再讀 ' + NOTES_OLD + '。'
    },
    items: [
      {
        itemId: 'name',
        title: 'English Full Name (e.g. Chan Tai Man)',
        questionItem: { question: { textQuestion: {} } }
      },
      {
        itemId: 'file',
        title: 'Homework (PDF only)',
        description: '只接受 PDF',
        questionItem: { question: { fileUploadQuestion: { types: ['PDF'] } } }
      },
      {
        itemId: 'sec',
        title: '資料',
        description: '筆記 ' + NOTES_OLD,
        pageBreakItem: {}
      },
      {
        itemId: 'vid',
        title: '語音',
        videoItem: { video: { youtubeUri: AUDIO_WATCH }, caption: '片' }
      },
      {
        itemId: 'img',
        title: '圖',
        imageItem: { image: { sourceUri: NOTES_OLD, altText: '圖' } }
      }
    ]
  };
}

function options() {
  return {
    title: PREFIX + '20261007b',
    audioOld: AUDIO_OLD,
    notesOld: NOTES_OLD,
    audioNew: AUDIO_NEW,
    notesNew: NOTES_NEW,
    labelLinks: true,
    instructions: '先看筆記',
    deadlineText: '2026年10月8日 23:59'
  };
}

test('default template ids stay the teacher forms', function () {
  assert.equal(logic.DEFAULT_FORM_ID, '1uerPSCadog-u3AsRlM0OR-3mRpJR_GXJCOMlVh75Uvw');
  assert.equal(logic.DEFAULT_FOLDER_ID, '1I5hvOvxqYWIFXzP1HxlfdWdl7RcacUVF');
});

test('Hong Kong date is UTC+8 with no daylight saving', function () {
  assert.equal(logic.yyyymmddInHongKong(new Date('2026-10-06T15:59:00Z')), '20261006');
  assert.equal(logic.yyyymmddInHongKong(new Date('2026-10-06T16:00:00Z')), '20261007');
});

test('suggestTitle skips a used letter and ignores response-sheet names', function () {
  const titles = [
    PREFIX + '20261007a',
    PREFIX + '20261007a（回應）',
    PREFIX + '20261006a'
  ];
  assert.equal(logic.suggestTitle(titles, '20261007', PREFIX), PREFIX + '20261007b');
  assert.equal(logic.suggestTitle([], '20261007', PREFIX), PREFIX + '20261007a');
});

test('batch update rewrites text and YouTube but leaves the PDF question alone', function () {
  const built = logic.buildFormBatchRequests(resource(), options());
  const masks = built.requests.map(function (request) {
    if (request.updateFormInfo) return 'info:' + request.updateFormInfo.updateMask;
    return request.updateItem.item.itemId + ':' + request.updateItem.updateMask;
  });
  assert.equal(masks.some(function (mask) { return mask.indexOf('questionItem') !== -1; }), false);
  assert.equal(built.requests.some(function (request) {
    return request.updateItem && request.updateItem.item.itemId === 'file';
  }), false);

  const info = built.requests.find(function (request) { return request.updateFormInfo; }).updateFormInfo;
  assert.equal(info.info.title, PREFIX + '20261007b');
  assert.match(info.info.description, /🎧 語音：https:\/\/youtu\.be\/ZYXWVUTSRQP/);
  assert.match(info.info.description, /📒 筆記：https:\/\/example.com\/biology\/notes-20261007/);
  assert.match(info.info.description, /📅 截止日期：2026年10月8日 23:59/);
  assert.match(info.info.description, /📝 先看筆記/);
  assert.equal(info.info.description.indexOf(NOTES_OLD), -1);
  assert.equal(info.info.description.indexOf(AUDIO_OLD), -1);

  const section = built.requests.find(function (request) {
    return request.updateItem && request.updateItem.item.itemId === 'sec';
  });
  assert.equal(section.updateItem.item.description, '筆記 ' + NOTES_NEW);
  assert.equal(section.updateItem.updateMask.indexOf('questionItem'), -1);

  const video = built.requests.find(function (request) {
    return request.updateItem && request.updateItem.item.itemId === 'vid';
  });
  assert.equal(video.updateItem.item.videoItem.video.youtubeUri, AUDIO_NEW);
  assert.match(video.updateItem.updateMask, /videoItem\.video\.youtubeUri/);
  assert.equal(video.updateItem.item.questionItem, undefined);

  const image = built.requests.find(function (request) {
    return request.updateItem && request.updateItem.item.itemId === 'img';
  });
  assert.equal(image.updateItem.item.imageItem.image.sourceUri, NOTES_NEW);
});

test('API errors become Traditional Chinese guidance', function () {
  const disabled = logic.toChineseApiError(403, {
    error: {
      message: 'Forms API has not been used or it is disabled',
      errors: [{ reason: 'accessNotConfigured' }]
    }
  });
  assert.match(disabled, /尚未啟用/);
  assert.match(disabled, /drive\.googleapis\.com/);
  assert.match(disabled, /forms\.googleapis\.com/);
  assert.match(logic.toChineseApiError(401, { error: { message: 'Invalid Credentials' } }), /再按一次/);
  assert.match(logic.toChineseApiError(403, { error: { message: 'admin_policy_enforced' } }), /Apps Script/);
  assert.match(logic.toChineseApiError(404, 'Requested entity was not found.'), /找不到/);
  assert.match(logic.toChineseApiError(403, { error: { message: 'The caller does not have permission' } }), /沒有權限/);
  assert.match(logic.signInErrorMessage('popup_failed_to_open'), /擋住/);
  assert.match(logic.signInErrorMessage('popup_closed'), /已關閉/);
  assert.match(logic.signInErrorMessage('access_denied'), /管理員/);
});
