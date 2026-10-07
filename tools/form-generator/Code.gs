/**
 * 功課 Google Form 產生器（Apps Script 後備）
 *
 * 平時用 GitHub Pages 的 index.html，以學校帳戶登入後直接產生表單。
 * 學校封鎖 Cloud 專案或第三方應用程式時，才把這個檔貼進 Apps Script。
 * 程式在老師自己的 Google 帳戶裡複製範本、取代語音／筆記連結、
 * 為每次功課另建回應試算表。學生資料只留在該帳戶，不要放進這個程式庫。
 */

var DEFAULT_FORM_ID = '1uerPSCadog-u3AsRlM0OR-3mRpJR_GXJCOMlVh75Uvw';
var DEFAULT_FOLDER_ID = '1I5hvOvxqYWIFXzP1HxlfdWdl7RcacUVF';
var DEFAULT_TITLE_PREFIX = '2029 DSE Biology Homework Submission ';
var DEFAULT_TEMPLATE_NAME = '2029 DSE Biology';
var DEFAULT_TEMPLATE_KEY = 'default-2029';

var KEY_TEMPLATES = 'FG_TEMPLATES';
var KEY_ACTIVE = 'FG_ACTIVE';
var KEY_HISTORY = 'FG_HISTORY';
var KEY_CLOSES = 'FG_CLOSES';
var PROPERTY_MAX_CHARS = 8500;

// ---------------------------------------------------------------------------
// 純邏輯（不呼叫 Google 服務）
// ---------------------------------------------------------------------------

function extractUrls(text) {
  var out = [];
  if (!text) return out;
  var re = /https?:\/\/[^\s<>"'，。、）)】\]」]+/gi;
  var match;
  while ((match = re.exec(String(text)))) {
    var url = match[0].replace(/[.,;:!?，。、]+$/g, '');
    if (url && out.indexOf(url) === -1) out.push(url);
  }
  return out;
}

function urlsInValue(value) {
  var text = String(value || '');
  var list = extractUrls(text);
  var trimmed = text.trim().replace(/[.,;:!?，。、]+$/g, '');
  if (/^https?:\/\//i.test(trimmed) && list.indexOf(trimmed) === -1) list.push(trimmed);
  return list;
}

function youtubeId(url) {
  var source = String(url || '').trim();
  if (!source) return '';
  var match = source.match(/(?:youtu\.be\/|(?:www\.|m\.|music\.)?youtube\.com\/(?:watch\?(?:[^#]*&)?v=|embed\/|shorts\/|live\/|v\/))([A-Za-z0-9_-]{11})/i);
  if (match) return match[1];
  if (/^[A-Za-z0-9_-]{11}$/.test(source)) return source;
  return '';
}

function isYouTubeUrl(url) {
  if (youtubeId(url)) return true;
  return /^(https?:\/\/)?(www\.|m\.|music\.)?(youtube\.com|youtu\.be)\//i.test(String(url || '').trim());
}

function urlsMatch(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  var left = youtubeId(a);
  var right = youtubeId(b);
  return !!(left && right && left === right);
}

function replaceExactUrls(text, pairs) {
  var out = text == null ? '' : String(text);
  var active = (pairs || []).filter(function(pair) {
    return pair && pair.oldUrl && pair.oldUrl !== pair.newUrl;
  });
  active.sort(function(a, b) {
    return String(b.oldUrl).length - String(a.oldUrl).length;
  });
  var tokens = [];
  active.forEach(function(pair, index) {
    var token = '\u0000URL' + index + '\u0000';
    if (out.indexOf(pair.oldUrl) === -1) return;
    out = out.split(pair.oldUrl).join(token);
    tokens.push({ token: token, url: pair.newUrl });
  });
  tokens.forEach(function(entry) {
    out = out.split(entry.token).join(entry.url);
  });
  return out;
}

function itemKindLabel(item) {
  var number = (item.index || 0) + 1;
  var name = item.title ? '「' + item.title + '」' : '';
  if (item.type === 'PAGE_BREAK') return '分節 ' + number + name;
  if (item.type === 'TEXT_BLOCK') return '文字區塊 ' + number + name;
  if (item.type === 'VIDEO') return 'YouTube 影片 ' + number + name;
  if (item.type === 'IMAGE') return '圖片 ' + number + name;
  if (item.type === 'FILE_UPLOAD') return '檔案上載題 ' + number + name;
  return '題目 ' + number + name;
}

function scanFormModel(model) {
  var grouped = [];
  function add(url, location) {
    if (!url) return;
    var existing = null;
    for (var i = 0; i < grouped.length; i++) {
      if (grouped[i].url === url) {
        existing = grouped[i];
        break;
      }
    }
    if (!existing) {
      existing = { url: url, locations: [] };
      grouped.push(existing);
    }
    existing.locations.push(location);
  }
  function addValue(value, location) {
    urlsInValue(value).forEach(function(url) {
      add(url, location);
    });
  }

  var form = model || {};
  addValue(form.description, { kind: 'description', label: '表單說明' });
  addValue(form.confirmationMessage, { kind: 'confirmation', label: '提交後訊息' });
  addValue(form.closedMessage, { kind: 'closed', label: '截止後訊息' });
  (form.items || []).forEach(function(item) {
    var label = itemKindLabel(item);
    addValue(item.title, { kind: 'itemTitle', index: item.index, label: label + '標題' });
    addValue(item.helpText, { kind: 'itemHelp', index: item.index, label: label + '說明' });
    addValue(item.extraText, { kind: 'itemExtra', index: item.index, label: label + '補充文字' });
    if (item.type === 'VIDEO') {
      addValue(item.videoUrl, { kind: 'video', index: item.index, label: label });
    }
    if (item.type === 'IMAGE') {
      addValue(item.imageUrl, { kind: 'image', index: item.index, label: label + '來源' });
    }
  });

  return {
    urls: grouped,
    fileUploads: (form.items || []).filter(function(item) {
      return item.type === 'FILE_UPLOAD';
    }).map(function(item) {
      return { index: item.index, title: item.title || '' };
    })
  };
}

function composeDescription(text, options) {
  var opts = options || {};
  var pairs = [];
  if (opts.audioOld && opts.audioNew) pairs.push({ oldUrl: opts.audioOld, newUrl: opts.audioNew });
  if (opts.notesOld && opts.notesNew) pairs.push({ oldUrl: opts.notesOld, newUrl: opts.notesNew });
  var body = replaceExactUrls(text || '', pairs);
  var managed = [];
  if (opts.instructions) managed.push('📝 ' + String(opts.instructions).trim());
  if (opts.labelLinks) {
    if (opts.audioNew) managed.push('🎧 語音：' + opts.audioNew);
    if (opts.notesNew) managed.push('📒 筆記：' + opts.notesNew);
  }
  if (opts.deadlineText) managed.push('📅 截止日期：' + opts.deadlineText);

  body = body.split('\n').filter(function(line) {
    if (opts.instructions && /^\s*📝/.test(line)) return false;
    if (opts.deadlineText && /^\s*📅/.test(line)) return false;
    if (opts.labelLinks && /^\s*[🎧📒]/.test(line)) return false;
    return true;
  }).join('\n').replace(/\n{3,}/g, '\n\n').trim();

  if (!managed.length) return body;
  return managed.join('\n') + (body ? '\n\n' + body : '');
}

function nextVideoUrl(current, audioOld, notesOld, audioNew, videoCount) {
  current = current || '';
  if (!isYouTubeUrl(audioNew)) return current;
  if (urlsMatch(current, notesOld)) return current;
  if (urlsMatch(current, audioOld)) return audioNew;
  if (videoCount === 1) return audioNew;
  return current;
}

function buildUpdatedModel(model, options) {
  var opts = options || {};
  var audioOld = String(opts.audioOld || '').trim();
  var notesOld = String(opts.notesOld || '').trim();
  var audioNew = String(opts.audioNew || '').trim();
  var notesNew = String(opts.notesNew || '').trim();
  var pairs = [];
  if (audioOld && audioNew) pairs.push({ oldUrl: audioOld, newUrl: audioNew });
  if (notesOld && notesNew) pairs.push({ oldUrl: notesOld, newUrl: notesNew });

  function swap(value) {
    return replaceExactUrls(value || '', pairs);
  }

  var source = model || { items: [] };
  var changes = [];
  function track(location, before, after) {
    if ((before || '') !== (after || '')) {
      changes.push({ location: location, before: before || '', after: after || '' });
    }
  }

  var descriptionOptions = {
    audioOld: audioOld,
    notesOld: notesOld,
    audioNew: audioNew,
    notesNew: notesNew,
    labelLinks: !!opts.labelLinks,
    instructions: opts.instructions || '',
    deadlineText: opts.deadlineText || ''
  };
  var description = composeDescription(source.description || '', descriptionOptions);
  track('表單說明', source.description || '', description);
  var confirmation = swap(source.confirmationMessage || '');
  track('提交後訊息', source.confirmationMessage || '', confirmation);
  var closed = swap(source.closedMessage || '');
  track('截止後訊息', source.closedMessage || '', closed);

  var videoCount = (source.items || []).filter(function(item) {
    return item.type === 'VIDEO';
  }).length;
  var guessedVideo = false;

  var items = (source.items || []).map(function(item) {
    var next = {
      index: item.index,
      itemId: item.itemId || '',
      type: item.type,
      title: swap(item.title || ''),
      helpText: swap(item.helpText || ''),
      extraText: swap(item.extraText || ''),
      videoUrl: item.videoUrl || '',
      imageUrl: item.type === 'IMAGE' ? swap(item.imageUrl || '') : (item.imageUrl || '')
    };
    var label = itemKindLabel(item);
    track(label + '標題', item.title || '', next.title);
    track(label + '說明', item.helpText || '', next.helpText);
    track(label + '補充文字', item.extraText || '', next.extraText);
    if (item.type === 'VIDEO') {
      next.videoUrl = nextVideoUrl(item.videoUrl || '', audioOld, notesOld, audioNew, videoCount);
      track(label, item.videoUrl || '', next.videoUrl);
      if (next.videoUrl !== (item.videoUrl || '') && !urlsMatch(item.videoUrl || '', audioOld)) {
        guessedVideo = true;
      }
    }
    if (item.type === 'IMAGE') track(label + '來源', item.imageUrl || '', next.imageUrl);
    return next;
  });

  var warnings = [];
  if (isYouTubeUrl(audioNew) && videoCount > 1) {
    var changedVideo = items.some(function(item, index) {
      return item.type === 'VIDEO' && item.videoUrl !== ((source.items[index] && source.items[index].videoUrl) || '');
    });
    if (!changedVideo) {
      warnings.push('有多於一段 YouTube 影片，而且都對不上已標示的語音連結，所以沒有改影片。');
    }
  }
  if (guessedVideo) {
    warnings.push('已把表單上的 YouTube 影片改成新的語音連結。請在發給學生前打開編輯頁確認影片正確。');
  }
  if (isYouTubeUrl(audioNew) && videoCount === 1) {
    var only = null;
    source.items.forEach(function(item) {
      if (item.type === 'VIDEO') only = item;
    });
    var updatedOnly = items.filter(function(item) { return item.type === 'VIDEO'; })[0];
    if (only && updatedOnly && updatedOnly.videoUrl === (only.videoUrl || '') && urlsMatch(only.videoUrl, notesOld)) {
      warnings.push('唯一的 YouTube 影片對上的是筆記連結，所以沒有改成語音。');
    }
  }

  return {
    model: {
      title: opts.title || source.title || '',
      description: description,
      confirmationMessage: confirmation,
      closedMessage: closed,
      items: items
    },
    changes: changes,
    warnings: warnings
  };
}

function buildMediaUpdateRequests(originalItems, updatedItems) {
  var requests = [];
  (updatedItems || []).forEach(function(item, index) {
    var prev = (originalItems || [])[index] || {};
    if (item.type === 'IMAGE' && item.imageUrl && item.imageUrl !== (prev.imageUrl || '')) {
      var image = { sourceUri: item.imageUrl };
      var mask = 'imageItem.image.sourceUri';
      if ((item.extraText || '') !== (prev.extraText || '')) {
        image.altText = item.extraText || '';
        mask += ',imageItem.image.altText';
      }
      requests.push({
        updateItem: {
          item: {
            itemId: item.itemId || '',
            imageItem: { image: image }
          },
          location: { index: item.index },
          updateMask: mask
        }
      });
    } else if (item.type === 'VIDEO' && (item.extraText || '') !== (prev.extraText || '')) {
      requests.push({
        updateItem: {
          item: {
            itemId: item.itemId || '',
            videoItem: {
              caption: item.extraText || ''
            }
          },
          location: { index: item.index },
          updateMask: 'videoItem.caption'
        }
      });
    } else if (item.type === 'IMAGE' && (item.extraText || '') !== (prev.extraText || '')) {
      requests.push({
        updateItem: {
          item: {
            itemId: item.itemId || '',
            imageItem: { image: { altText: item.extraText || '' } }
          },
          location: { index: item.index },
          updateMask: 'imageItem.image.altText'
        }
      });
    }
  });
  return requests;
}

function suggestTitle(existingTitles, yyyymmdd, prefix) {
  var stem = (prefix == null ? DEFAULT_TITLE_PREFIX : prefix) + String(yyyymmdd || '');
  var used = {};
  (existingTitles || []).forEach(function(name) {
    var title = String(name || '').trim();
    if (title.indexOf(stem) !== 0) return;
    var suffix = title.slice(stem.length);
    if (/^[a-zA-Z]$/.test(suffix)) used[suffix.toLowerCase()] = true;
  });
  for (var i = 0; i < 26; i++) {
    var letter = String.fromCharCode(97 + i);
    if (!used[letter]) return stem + letter;
  }
  return stem + 'aa';
}

function yyyymmddInHongKong(date) {
  var shifted = new Date(date.getTime() + 8 * 60 * 60 * 1000);
  return String(shifted.getUTCFullYear()) + twoDigits_(shifted.getUTCMonth() + 1) + twoDigits_(shifted.getUTCDate());
}

function twoDigits_(number) {
  return (number < 10 ? '0' : '') + number;
}

function formatDeadlineText(datetimeLocal) {
  var match = String(datetimeLocal || '').match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!match) return '';
  return match[1] + '年' + Number(match[2]) + '月' + Number(match[3]) + '日 ' + match[4] + ':' + match[5];
}

function parseDeadlineHKT(datetimeLocal) {
  var match = String(datetimeLocal || '').match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!match) return null;
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]) - 8, Number(match[5]), 0));
}

function buildWhatsAppMessage(fields) {
  var data = fields || {};
  var lines = [];
  lines.push('【' + (data.title || '家課') + '】');
  lines.push('');
  lines.push('請先閱讀筆記，再聽語音，然後用下面的表格交功課（只接受 PDF）。');
  if (data.instructions) {
    lines.push('');
    lines.push(String(data.instructions).trim());
  }
  lines.push('');
  lines.push('📒 筆記：');
  lines.push(data.notesUrl || '');
  lines.push('');
  lines.push('🎧 語音：');
  lines.push(data.audioUrl || '');
  lines.push('');
  lines.push('📝 交功課：');
  lines.push(data.formUrl || '');
  if (data.deadlineText) {
    lines.push('');
    lines.push('📅 截止日期：' + data.deadlineText);
  }
  return lines.join('\n');
}

function parseFormId(input) {
  var source = String(input || '').trim();
  if (!source) return { error: '請輸入範本表單 ID。' };
  if (/\/forms\/d\/e\//i.test(source) || /^1FAIpQLS/i.test(source)) {
    return { error: '這是學生用的發佈連結（網址含有 /e/），不是範本檔案 ID。請打開範本，按右上角鉛筆進入編輯，再複製網址中 /d/ 與 /edit 之間的那一段。' };
  }
  var edit = source.match(/\/forms\/d\/([a-zA-Z0-9_-]+)/);
  if (edit) return { id: edit[1] };
  var query = source.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (query) return { id: query[1] };
  if (/^[a-zA-Z0-9_-]{20,}$/.test(source)) return { id: source };
  return { error: '無法讀取表單 ID。請貼上編輯網址，或 /d/ 後面的檔案 ID。' };
}

function parseFolderId(input) {
  var source = String(input || '').trim();
  if (!source) return { id: '' };
  var folder = source.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (folder) return { id: folder[1] };
  var query = source.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (query) return { id: query[1] };
  if (/^[a-zA-Z0-9_-]{20,}$/.test(source)) return { id: source };
  return { error: '無法讀取資料夾 ID。請貼上雲端硬碟資料夾網址。' };
}

function assertHttpUrl(url, label) {
  var value = String(url || '').trim();
  if (!/^https?:\/\/\S+$/i.test(value)) {
    throw new Error(label + '必須是以 http:// 或 https:// 開頭的網址。');
  }
  return value;
}

function toChineseError(err) {
  var msg = String((err && err.message) || err || '未知錯誤');
  msg = msg.replace(/^Exception:\s*/i, '').replace(/^Error:\s*/i, '');
  if (/[\u4e00-\u9fff]/.test(msg)) return msg;
  var lower = msg.toLowerCase();
  if (/access_not_configured|accessnotconfigured|has not been used|it is disabled|service_disabled/.test(lower)) {
    return '尚未啟用 Google Forms API。請在指令碼編輯器左側「服務」按加號，加入 Google Forms API，儲存後再掃描。表單說明和題目文字裡的連結仍會掃描。';
  }
  if (/file not found|not found/.test(lower) || /\b404\b/.test(lower)) {
    return '找不到這個表單或資料夾。請檢查 ID 是否正確，以及檔案有沒有被刪除。';
  }
  if (/permission|access denied|unauthorized/.test(lower) || /\b401\b/.test(lower) || /\b403\b/.test(lower)) {
    return '沒有權限。請用 ksl@fss.edu.hk 登入，並在授權畫面允許這個程式使用 Google 雲端硬碟、表單和試算表。';
  }
  if (/invalid argument/.test(lower)) {
    return '提供的 ID 或網址不正確。表單請用編輯網址（含 /d/ 而不是 /e/），資料夾請用雲端硬碟資料夾網址。';
  }
  if (/timeout|timed out/.test(lower)) return 'Google 服務沒有及時回應，請稍後再試。';
  if (/too many times|rate limit|quota/.test(lower)) return '短時間內要求太多，請等一分鐘再試。';
  if (/already.*destination|destination.*already/.test(lower)) {
    return '這個表單已經連結了回應試算表，不能再指定另一個。';
  }
  return '發生錯誤：' + msg;
}

function collectSettingsUnchanged(before, after) {
  var keys = ['collectsEmail', 'limitOneResponsePerUser', 'publishingSummary', 'canEditResponse', 'showLinkToRespondAgain'];
  var changed = [];
  keys.forEach(function(key) {
    if ((before || {})[key] !== (after || {})[key]) changed.push(key);
  });
  return { ok: changed.length === 0, changed: changed };
}

function fileUploadsPreserved(before, after) {
  if (!before || !after || before.length !== after.length) return false;
  for (var i = 0; i < before.length; i++) {
    if ((before[i].types || '') !== (after[i].types || '')) return false;
  }
  return true;
}

function fitPropertyList(list, maxChars) {
  var copy = (list || []).slice();
  var guard = 0;
  while (copy.length > 1 && JSON.stringify(copy).length > maxChars && guard < 200) {
    copy.pop();
    guard++;
  }
  return copy;
}

function apiItemType(item) {
  if (!item) return 'UNKNOWN';
  if (item.videoItem) return 'VIDEO';
  if (item.imageItem) return 'IMAGE';
  if (item.pageBreakItem) return 'PAGE_BREAK';
  if (item.textItem) return 'TEXT_BLOCK';
  if (item.questionGroupItem) return 'QUESTION_GROUP';
  if (item.questionItem) {
    var question = item.questionItem.question || {};
    if (question.fileUploadQuestion) return 'FILE_UPLOAD';
    if (question.choiceQuestion) return 'CHOICE';
    if (question.textQuestion) return 'TEXT';
    return 'QUESTION';
  }
  return 'UNKNOWN';
}

function modelFromApiResource(resource) {
  var info = (resource && resource.info) || {};
  var items = ((resource && resource.items) || []).map(function(item, index) {
    var type = apiItemType(item);
    var image = item.imageItem && item.imageItem.image || {};
    return {
      index: index,
      itemId: item.itemId || '',
      type: type,
      title: item.title || '',
      helpText: item.description || '',
      extraText: (item.videoItem && item.videoItem.caption) || image.altText || '',
      videoUrl: (item.videoItem && item.videoItem.video && item.videoItem.video.youtubeUri) || '',
      imageUrl: image.sourceUri || ''
    };
  });
  return {
    title: info.title || '',
    description: info.description || '',
    confirmationMessage: '',
    closedMessage: '',
    items: items
  };
}

function normalizeItemType(type) {
  var name = String(type || '');
  var known = ['FILE_UPLOAD', 'VIDEO', 'IMAGE', 'PAGE_BREAK', 'SECTION_HEADER', 'TEXT', 'MULTIPLE_CHOICE', 'LIST', 'CHECKBOX', 'PARAGRAPH_TEXT', 'TEXT_BLOCK'];
  for (var i = 0; i < known.length; i++) {
    if (name.indexOf(known[i]) !== -1) {
      if (known[i] === 'SECTION_HEADER') return 'PAGE_BREAK';
      if (known[i] === 'MULTIPLE_CHOICE' || known[i] === 'LIST' || known[i] === 'CHECKBOX') return 'CHOICE';
      if (known[i] === 'PARAGRAPH_TEXT') return 'TEXT';
      return known[i];
    }
  }
  return name || 'UNKNOWN';
}

function modelFromFormLike(form) {
  var items = [];
  var rawItems = form.getItems ? form.getItems() : [];
  for (var i = 0; i < rawItems.length; i++) {
    var item = rawItems[i];
    var type = normalizeItemType(item.getType ? item.getType() : '');
    var videoUrl = '';
    var imageUrl = '';
    var extraText = '';
    if (type === 'VIDEO' && item.asVideoItem) {
      try {
        var video = item.asVideoItem();
        if (video && typeof video.getVideoUrl === 'function') videoUrl = video.getVideoUrl() || '';
      } catch (err) {
        videoUrl = '';
      }
    }
    if (type === 'IMAGE' && item.asImageItem) {
      try {
        var image = item.asImageItem();
        if (image && typeof image.getSourceUrl === 'function') imageUrl = image.getSourceUrl() || '';
        if (image && typeof image.getAltText === 'function') extraText = image.getAltText() || '';
      } catch (err2) {
        imageUrl = '';
      }
    }
    items.push({
      index: item.getIndex ? item.getIndex() : i,
      itemId: item.getId ? String(item.getId()) : '',
      type: type,
      title: item.getTitle ? (item.getTitle() || '') : '',
      helpText: item.getHelpText ? (item.getHelpText() || '') : '',
      extraText: extraText,
      videoUrl: videoUrl,
      imageUrl: imageUrl
    });
  }
  var closed = '';
  try {
    closed = form.getCustomClosedFormMessage ? (form.getCustomClosedFormMessage() || '') : '';
  } catch (err3) {
    closed = '';
  }
  return {
    title: form.getTitle ? (form.getTitle() || '') : '',
    description: form.getDescription ? (form.getDescription() || '') : '',
    confirmationMessage: form.getConfirmationMessage ? (form.getConfirmationMessage() || '') : '',
    closedMessage: closed,
    items: items
  };
}

function mergeItemModels(apiItems, appItems) {
  var count = Math.max(apiItems.length, appItems.length);
  var merged = [];
  for (var i = 0; i < count; i++) {
    var fromApi = apiItems[i] || {};
    var fromApp = appItems[i] || {};
    merged.push({
      index: fromApi.index != null ? fromApi.index : (fromApp.index != null ? fromApp.index : i),
      itemId: fromApi.itemId || fromApp.itemId || '',
      type: fromApi.type || fromApp.type || 'UNKNOWN',
      title: fromApi.title || fromApp.title || '',
      helpText: fromApi.helpText || fromApp.helpText || '',
      extraText: fromApi.extraText || fromApp.extraText || '',
      videoUrl: fromApi.videoUrl || fromApp.videoUrl || '',
      imageUrl: fromApi.imageUrl || fromApp.imageUrl || ''
    });
  }
  return merged;
}

function defaultTemplate_() {
  return {
    key: DEFAULT_TEMPLATE_KEY,
    name: DEFAULT_TEMPLATE_NAME,
    formId: DEFAULT_FORM_ID,
    folderId: DEFAULT_FOLDER_ID,
    titlePrefix: DEFAULT_TITLE_PREFIX,
    audioUrl: '',
    notesUrl: ''
  };
}

// ---------------------------------------------------------------------------
// 指令碼屬性
// ---------------------------------------------------------------------------

function props_() {
  return PropertiesService.getScriptProperties();
}

function readJson_(key, fallback) {
  var raw = props_().getProperty(key);
  if (raw == null || raw === '') return fallback;
  try {
    return JSON.parse(raw);
  } catch (err) {
    return fallback;
  }
}

function writeJson_(key, value) {
  props_().setProperty(key, JSON.stringify(value));
}

function newKey_() {
  if (typeof Utilities !== 'undefined' && Utilities.getUuid) return 't-' + Utilities.getUuid();
  return 't-' + new Date().getTime().toString(36) + '-' + Math.floor(Math.random() * 1000000).toString(36);
}

function normalizeTemplate(template) {
  var source = template || {};
  return {
    key: source.key || newKey_(),
    name: String(source.name || '').trim() || '未命名範本',
    formId: String(source.formId || '').trim(),
    folderId: String(source.folderId || '').trim(),
    titlePrefix: source.titlePrefix == null || source.titlePrefix === '' ? DEFAULT_TITLE_PREFIX : String(source.titlePrefix),
    audioUrl: String(source.audioUrl || '').trim(),
    notesUrl: String(source.notesUrl || '').trim()
  };
}

function loadTemplates_() {
  var raw = props_().getProperty(KEY_TEMPLATES);
  if (raw == null || raw === '') {
    var seeded = [normalizeTemplate(defaultTemplate_())];
    writeJson_(KEY_TEMPLATES, seeded);
    if (!props_().getProperty(KEY_ACTIVE)) props_().setProperty(KEY_ACTIVE, seeded[0].key);
    return seeded;
  }
  try {
    var parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeTemplate);
  } catch (err) {
    return [];
  }
}

function saveTemplates_(templates) {
  writeJson_(KEY_TEMPLATES, templates.map(normalizeTemplate));
}

function loadHistory_() {
  var list = readJson_(KEY_HISTORY, []);
  return Array.isArray(list) ? list : [];
}

function saveHistoryList_(list) {
  var fitted = fitPropertyList(list, PROPERTY_MAX_CHARS);
  var text = JSON.stringify(fitted);
  if (text.length > 9000) throw new Error('紀錄太長，請先刪除舊紀錄。');
  props_().setProperty(KEY_HISTORY, text);
  return fitted;
}

function withChineseErrors_(fn) {
  try {
    return fn();
  } catch (err) {
    throw new Error(toChineseError(err));
  }
}

function safeEmail_() {
  try {
    var active = Session.getActiveUser && Session.getActiveUser().getEmail();
    if (active) return active;
    return (Session.getEffectiveUser && Session.getEffectiveUser().getEmail()) || '';
  } catch (err) {
    return '';
  }
}

function publicHistory_(entry) {
  var deadlineText = entry.deadlineText || (entry.deadline ? formatDeadlineText(entry.deadline) : '');
  return {
    formId: entry.formId,
    title: entry.title,
    createdAt: entry.createdAt,
    templateKey: entry.templateKey || '',
    templateName: entry.templateName || '',
    audioUrl: entry.audioUrl || '',
    notesUrl: entry.notesUrl || '',
    publishedUrl: entry.publishedUrl || '',
    shortUrl: entry.shortUrl || '',
    editUrl: entry.editUrl || '',
    sheetUrl: entry.sheetUrl || '',
    deadline: entry.deadline || '',
    deadlineText: deadlineText,
    instructions: entry.instructions || '',
    autoClose: !!entry.autoClose,
    whatsapp: buildWhatsAppMessage({
      title: entry.title,
      notesUrl: entry.notesUrl,
      audioUrl: entry.audioUrl,
      formUrl: entry.shortUrl || entry.publishedUrl,
      deadlineText: deadlineText,
      instructions: entry.instructions || ''
    })
  };
}

// ---------------------------------------------------------------------------
// 讀寫 Google 表單
// ---------------------------------------------------------------------------

function formsFetch_(method, url, body) {
  var options = {
    method: method,
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
    muteHttpExceptions: true
  };
  if (body) options.payload = JSON.stringify(body);
  var response = UrlFetchApp.fetch(url, options);
  var code = response.getResponseCode();
  var text = response.getContentText() || '';
  var json = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch (err) {
    json = {};
  }
  if (code < 200 || code >= 300) {
    throw new Error(formsApiErrorMessage_(code, json, text));
  }
  return json;
}

function formsApiErrorMessage_(code, json, text) {
  var apiMsg = (json && json.error && (json.error.message || json.error.status)) || '';
  var blob = apiMsg + ' ' + text;
  if (code === 403 && /accessNotConfigured|SERVICE_DISABLED|has not been used|it is disabled/i.test(blob)) {
    return 'Google Forms API has not been used or it is disabled';
  }
  if (code === 404) return 'Not found';
  if (code === 401 || code === 403) return 'Permission denied ' + apiMsg;
  return 'Forms API ' + code + ' ' + String(apiMsg || text).slice(0, 240);
}

function fetchFormResource_(formId) {
  return formsFetch_('get', 'https://forms.googleapis.com/v1/forms/' + encodeURIComponent(formId));
}

function readCollectSettings_(form) {
  function tryCall(name) {
    try {
      if (typeof form[name] === 'function') return form[name]();
    } catch (err) {
      return null;
    }
    return null;
  }
  return {
    collectsEmail: tryCall('collectsEmail'),
    limitOneResponsePerUser: tryCall('hasLimitOneResponsePerUser'),
    publishingSummary: tryCall('isPublishingSummary'),
    canEditResponse: tryCall('canEditResponse'),
    showLinkToRespondAgain: tryCall('isShowingLinkToRespondAgain'),
    acceptingResponses: tryCall('isAcceptingResponses')
  };
}

function readFileUploads_(form) {
  var items = [];
  try {
    items = form.getItems(FormApp.ItemType.FILE_UPLOAD);
  } catch (err) {
    items = (form.getItems() || []).filter(function(item) {
      return normalizeItemType(item.getType()) === 'FILE_UPLOAD';
    });
  }
  return (items || []).map(function(item) {
    var types = '';
    try {
      var upload = item.asFileUploadItem();
      if (upload && typeof upload.getTypes === 'function') {
        types = (upload.getTypes() || []).map(function(type) { return String(type); }).sort().join(',');
      }
    } catch (err2) {
      types = '';
    }
    return { title: item.getTitle ? item.getTitle() : '', types: types };
  });
}

function readFormModel_(form) {
  var warnings = [];
  var appModel = modelFromFormLike(form);
  var apiModel = null;
  try {
    apiModel = modelFromApiResource(fetchFormResource_(form.getId()));
  } catch (err) {
    warnings.push(toChineseError(err));
  }
  if (!apiModel) return { model: appModel, warnings: warnings };
  return {
    model: {
      title: apiModel.title || appModel.title,
      description: apiModel.description || appModel.description,
      confirmationMessage: appModel.confirmationMessage,
      closedMessage: appModel.closedMessage,
      items: mergeItemModels(apiModel.items, appModel.items)
    },
    warnings: warnings
  };
}

function parentFolderId_(file) {
  var parents = file.getParents();
  if (parents.hasNext()) return parents.next().getId();
  return '';
}

function listTitles_(folderId) {
  var folder = DriveApp.getFolderById(folderId);
  var titles = [];
  var files = folder.getFiles();
  while (files.hasNext()) titles.push(files.next().getName());
  return titles;
}

function moveFileToFolder_(fileId, folder) {
  var file = DriveApp.getFileById(fileId);
  if (typeof file.moveTo === 'function') {
    file.moveTo(folder);
    return;
  }
  folder.addFile(file);
  var parents = file.getParents();
  while (parents.hasNext()) {
    var parent = parents.next();
    if (parent.getId() !== folder.getId()) parent.removeFile(file);
  }
}

function applyUpdatedModel_(form, original, updated) {
  if ((updated.description || '') !== (original.description || '')) form.setDescription(updated.description || '');
  if ((updated.confirmationMessage || '') !== (original.confirmationMessage || '')) {
    form.setConfirmationMessage(updated.confirmationMessage || '');
  }
  if ((updated.closedMessage || '') !== (original.closedMessage || '')) {
    form.setCustomClosedFormMessage(updated.closedMessage || '');
  }
  var live = form.getItems();
  (updated.items || []).forEach(function(item, index) {
    var prev = original.items[index];
    var widget = live[index];
    if (!prev || !widget) return;
    if ((item.title || '') !== (prev.title || '')) widget.setTitle(item.title || '');
    if ((item.helpText || '') !== (prev.helpText || '')) widget.setHelpText(item.helpText || '');
    if (item.type === 'VIDEO' && item.videoUrl && item.videoUrl !== (prev.videoUrl || '') && isYouTubeUrl(item.videoUrl)) {
      widget.asVideoItem().setVideoUrl(item.videoUrl);
    }
  });
}

function publishForm_(formId) {
  formsFetch_('post', 'https://forms.googleapis.com/v1/forms/' + encodeURIComponent(formId) + ':setPublishSettings', {
    publishSettings: {
      publishState: {
        isPublished: true,
        isAcceptingResponses: true
      }
    },
    updateMask: 'publishState'
  });
}

function formEditUrl_(formId) {
  return 'https://docs.google.com/forms/d/' + formId + '/edit';
}

function sheetEditUrl_(sheetId) {
  return 'https://docs.google.com/spreadsheets/d/' + sheetId + '/edit';
}

function destinationId_(form) {
  try {
    return form.getDestinationId() || '';
  } catch (err) {
    return '';
  }
}

function findTemplate_(templates, key) {
  for (var i = 0; i < templates.length; i++) {
    if (templates[i].key === key) return templates[i];
  }
  return null;
}

function suggestionFor_(template) {
  var prefix = template.titlePrefix || DEFAULT_TITLE_PREFIX;
  var today = yyyymmddInHongKong(new Date());
  if (!template.folderId) {
    return {
      title: suggestTitle([], today, prefix),
      folderId: '',
      error: '這個範本還沒有資料夾。產生時會放在範本表單所在的資料夾。'
    };
  }
  try {
    var titles = listTitles_(template.folderId);
    return { title: suggestTitle(titles, today, prefix), folderId: template.folderId, error: '' };
  } catch (err) {
    return {
      title: suggestTitle([], today, prefix),
      folderId: template.folderId,
      error: toChineseError(err)
    };
  }
}

// ---------------------------------------------------------------------------
// 網頁應用程式入口
// ---------------------------------------------------------------------------

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('功課 Google Form 產生器')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function getAppState() {
  return withChineseErrors_(function() {
    var templates = loadTemplates_();
    var active = props_().getProperty(KEY_ACTIVE) || '';
    if (!findTemplate_(templates, active)) active = templates.length ? templates[0].key : '';
    var current = findTemplate_(templates, active);
    return {
      email: safeEmail_(),
      templates: templates,
      activeTemplateKey: active,
      history: loadHistory_().map(publicHistory_),
      suggestion: current ? suggestionFor_(current) : { title: '', folderId: '', error: '' }
    };
  });
}

function setActiveTemplate(req) {
  return withChineseErrors_(function() {
    var key = String((req && req.key) || '');
    var templates = loadTemplates_();
    if (!findTemplate_(templates, key)) throw new Error('找不到這個範本。');
    props_().setProperty(KEY_ACTIVE, key);
    return getAppState();
  });
}

function suggestTitleFor(req) {
  return withChineseErrors_(function() {
    var parsed = parseFolderId(req && req.folderId);
    if (parsed.error) throw new Error(parsed.error);
    if (!parsed.id) throw new Error('請先填資料夾 ID。');
    var prefix = req.titlePrefix == null || req.titlePrefix === '' ? DEFAULT_TITLE_PREFIX : String(req.titlePrefix);
    var titles = listTitles_(parsed.id);
    return { title: suggestTitle(titles, yyyymmddInHongKong(new Date()), prefix), folderId: parsed.id };
  });
}

function scanTemplate(req) {
  return withChineseErrors_(function() {
    var parsed = parseFormId(req && req.formId);
    if (parsed.error) throw new Error(parsed.error);
    var file;
    try {
      file = DriveApp.getFileById(parsed.id);
    } catch (err) {
      throw new Error(toChineseError(err));
    }
    var form;
    try {
      form = FormApp.openById(parsed.id);
    } catch (err2) {
      throw new Error(toChineseError(err2));
    }
    var read = readFormModel_(form);
    var scan = scanFormModel(read.model);
    if (!scan.urls.length) {
      read.warnings.push('在表單說明、題目標題、說明文字、分節、圖片和影片都找不到網址。請打開範本，把語音和筆記連結寫進表單說明，然後再掃描。');
    }
    return {
      formId: parsed.id,
      title: read.model.title || file.getName(),
      folderId: parentFolderId_(file),
      urls: scan.urls,
      fileUploads: scan.fileUploads,
      warnings: read.warnings
    };
  });
}

function saveTemplate(req) {
  return withChineseErrors_(function() {
    var input = req || {};
    var name = String(input.name || '').trim();
    if (!name) throw new Error('請為範本起一個名稱，例如「2029 DSE Biology」。');
    var parsed = parseFormId(input.formId);
    if (parsed.error) throw new Error(parsed.error);
    var folder = parseFolderId(input.folderId || '');
    if (folder.error) throw new Error(folder.error);
    var audioUrl = String(input.audioUrl || '').trim();
    var notesUrl = String(input.notesUrl || '').trim();
    if (audioUrl) audioUrl = assertHttpUrl(audioUrl, '範本裡的語音連結');
    if (notesUrl) notesUrl = assertHttpUrl(notesUrl, '範本裡的筆記連結');
    if (audioUrl && notesUrl && audioUrl === notesUrl) {
      throw new Error('語音連結和筆記連結是同一個網址，無法分開取代。請在範本裡放兩個不同的網址。');
    }
    var templates = loadTemplates_();
    var key = String(input.key || '');
    var existing = key ? findTemplate_(templates, key) : null;
    if (key && !existing) throw new Error('找不到要更新的範本。');
    var record = normalizeTemplate({
      key: existing ? existing.key : (key || newKey_()),
      name: name,
      formId: parsed.id,
      folderId: folder.id || '',
      titlePrefix: input.titlePrefix,
      audioUrl: audioUrl,
      notesUrl: notesUrl
    });
    var next = [];
    var replaced = false;
    templates.forEach(function(template) {
      if (template.key === record.key) {
        next.push(record);
        replaced = true;
      } else {
        next.push(template);
      }
    });
    if (!replaced) next.push(record);
    saveTemplates_(next);
    if (input.makeActive !== false) props_().setProperty(KEY_ACTIVE, record.key);
    return getAppState();
  });
}

function deleteTemplate(req) {
  return withChineseErrors_(function() {
    var key = String((req && req.key) || '');
    var templates = loadTemplates_().filter(function(template) {
      return template.key !== key;
    });
    saveTemplates_(templates);
    if (props_().getProperty(KEY_ACTIVE) === key) {
      props_().setProperty(KEY_ACTIVE, templates.length ? templates[0].key : '');
    }
    return getAppState();
  });
}

function deleteHistoryItem(req) {
  return withChineseErrors_(function() {
    var formId = String((req && req.formId) || '');
    var list = loadHistory_().filter(function(entry) {
      return entry.formId !== formId;
    });
    saveHistoryList_(list);
    return { history: list.map(publicHistory_) };
  });
}

function scheduleClose_(formId, when) {
  var trigger = ScriptApp.newTrigger('closeScheduledForm').timeBased().at(when).create();
  var map = readJson_(KEY_CLOSES, {});
  map[trigger.getUniqueId()] = formId;
  writeJson_(KEY_CLOSES, map);
}

function closeScheduledForm(event) {
  var uid = event && event.triggerUid;
  try {
    var map = readJson_(KEY_CLOSES, {});
    var formId = uid && map[uid];
    if (formId) {
      var form = FormApp.openById(formId);
      form.setAcceptingResponses(false);
      var existing = '';
      try {
        existing = form.getCustomClosedFormMessage() || '';
      } catch (err) {
        existing = '';
      }
      if (!existing) form.setCustomClosedFormMessage('此功課已截止，不再接受提交。');
      delete map[uid];
      writeJson_(KEY_CLOSES, map);
    }
  } catch (err2) {
    console.error(toChineseError(err2));
  }
  if (!uid || typeof ScriptApp === 'undefined' || !ScriptApp.getProjectTriggers) return;
  try {
    ScriptApp.getProjectTriggers().forEach(function(trigger) {
      if (trigger.getUniqueId() === uid) ScriptApp.deleteTrigger(trigger);
    });
  } catch (err3) {
    console.error(toChineseError(err3));
  }
}

function generateForm(req) {
  return withChineseErrors_(function() {
    var input = req || {};
    var templates = loadTemplates_();
    var template = findTemplate_(templates, String(input.templateKey || props_().getProperty(KEY_ACTIVE) || ''));
    if (!template) throw new Error('請先到「範本」頁加入範本表單。');
    if (!template.audioUrl || !template.notesUrl) {
      throw new Error('這個範本還沒有標示語音連結和筆記連結。請先到「範本」頁掃描並儲存。');
    }
    var title = String(input.title || '').trim();
    if (!title) throw new Error('請輸入新表單標題。');
    if (title.length > 180) throw new Error('標題請保持在 180 字以內。');
    if (/[\\/]/.test(title)) throw new Error('標題不能包含斜線 / 。');
    var audioNew = assertHttpUrl(input.audioUrl, '今次的語音連結');
    var notesNew = assertHttpUrl(input.notesUrl, '今次的筆記連結');
    var instructions = String(input.instructions || '').trim();
    if (instructions.length > 500) throw new Error('補充說明請保持在 500 字以內。');
    var deadline = String(input.deadline || '').trim();
    var deadlineText = deadline ? formatDeadlineText(deadline) : '';
    if (deadline && !deadlineText) throw new Error('截止日期格式不正確。');

    var folderId = '';
    if (String(input.folderId || '').trim()) {
      var parsedFolder = parseFolderId(input.folderId);
      if (parsedFolder.error) throw new Error(parsedFolder.error);
      folderId = parsedFolder.id;
    }
    var templateFile;
    try {
      templateFile = DriveApp.getFileById(template.formId);
    } catch (err) {
      throw new Error(toChineseError(err));
    }
    if (!folderId) folderId = template.folderId || parentFolderId_(templateFile);
    if (!folderId) throw new Error('找不到要放入的資料夾。請在範本設定資料夾，或在產生頁填上資料夾網址。');
    var folder;
    try {
      folder = DriveApp.getFolderById(folderId);
    } catch (err2) {
      throw new Error(toChineseError(err2));
    }

    var templateDest = '';
    try {
      templateDest = destinationId_(FormApp.openById(template.formId));
    } catch (err3) {
      templateDest = '';
    }

    var copy;
    try {
      copy = templateFile.makeCopy(title, folder);
    } catch (err4) {
      throw new Error(toChineseError(err4));
    }
    var formId = copy.getId();
    var form;
    try {
      form = FormApp.openById(formId);
      form.setTitle(title);
    } catch (err5) {
      throw new Error(toChineseError(err5) + ' 已複製的表單：' + formEditUrl_(formId));
    }

    var beforeSettings = readCollectSettings_(form);
    var beforeUploads = readFileUploads_(form);
    var read = readFormModel_(form);
    if (read.model.items.length !== form.getItems().length) {
      throw new Error('讀到的題目數量和表單不一致，已停止取代連結，以免改錯題目。已複製的表單：' + formEditUrl_(formId));
    }
    var updated = buildUpdatedModel(read.model, {
      title: title,
      audioOld: template.audioUrl,
      notesOld: template.notesUrl,
      audioNew: audioNew,
      notesNew: notesNew,
      labelLinks: input.labelLinks !== false,
      instructions: instructions,
      deadlineText: deadlineText
    });
    var warnings = read.warnings.concat(updated.warnings);
    try {
      applyUpdatedModel_(form, read.model, updated.model);
    } catch (err6) {
      throw new Error(toChineseError(err6) + ' 已複製的表單：' + formEditUrl_(formId));
    }
    var mediaRequests = buildMediaUpdateRequests(read.model.items, updated.model.items);
    if (mediaRequests.length) {
      try {
        formsFetch_('post', 'https://forms.googleapis.com/v1/forms/' + encodeURIComponent(formId) + ':batchUpdate', {
          requests: mediaRequests
        });
      } catch (err7) {
        warnings.push('圖片或影片說明未能更新：' + toChineseError(err7));
      }
    }

    form.setAcceptingResponses(true);
    try {
      publishForm_(formId);
    } catch (err8) {
      warnings.push('未能用 Forms API 發佈表單。如果學生打不開連結，請打開編輯頁按「發佈」。');
    }

    var afterSettings = readCollectSettings_(form);
    var settingsCheck = collectSettingsUnchanged(beforeSettings, afterSettings);
    if (!settingsCheck.ok) {
      warnings.push('表單的收集設定可能有變，請打開編輯頁核對（例如是否收集電郵、可否重複提交）。');
    }
    var afterUploads = readFileUploads_(form);
    if (!afterUploads.length) {
      throw new Error('複製後的表單沒有檔案上載題。請確認範本仍有 PDF 功課上載題。已複製的表單：' + formEditUrl_(formId));
    }
    if (!fileUploadsPreserved(beforeUploads, afterUploads)) {
      warnings.push('檔案上載題的檔案類型設定可能有變，請打開編輯頁確認是否仍只接受 PDF。');
    }
    var accepting = true;
    try {
      accepting = form.isAcceptingResponses();
    } catch (err9) {
      accepting = true;
    }
    if (!accepting) warnings.push('表單目前未接受回應，請打開編輯頁重新開啟。');

    var copiedDest = destinationId_(form);
    var sheetUrl = '';
    if (copiedDest && templateDest && copiedDest === templateDest) {
      sheetUrl = sheetEditUrl_(copiedDest);
      warnings.push('複製後的表單仍連到範本的回應試算表。請先打開新表單的「回應」取消連結，再建立新的試算表，然後才發給學生。');
    } else if (copiedDest) {
      sheetUrl = sheetEditUrl_(copiedDest);
    } else {
      try {
        var spreadsheet = SpreadsheetApp.create(title + '（回應）');
        moveFileToFolder_(spreadsheet.getId(), folder);
        form.setDestination(FormApp.DestinationType.SPREADSHEET, spreadsheet.getId());
        sheetUrl = spreadsheet.getUrl ? spreadsheet.getUrl() : sheetEditUrl_(spreadsheet.getId());
      } catch (err10) {
        warnings.push('表單已建立，但未能新建或連結回應試算表：' + toChineseError(err10));
      }
    }

    var publishedUrl = '';
    try {
      publishedUrl = form.getPublishedUrl();
    } catch (err11) {
      publishedUrl = '';
      warnings.push('未能取得學生連結。請打開編輯頁，確認表單已發佈。');
    }
    var shortUrl = publishedUrl;
    if (publishedUrl) {
      try {
        shortUrl = form.shortenFormUrl(publishedUrl) || publishedUrl;
      } catch (err12) {
        shortUrl = publishedUrl;
        warnings.push('未能產生 forms.gle 短網址，已改用完整發佈連結。');
      }
    }
    var editUrl = '';
    try {
      editUrl = form.getEditUrl() || formEditUrl_(formId);
    } catch (err13) {
      editUrl = formEditUrl_(formId);
    }

    var autoClose = !!input.autoClose && !!deadline;
    if (autoClose) {
      var when = parseDeadlineHKT(deadline);
      if (!when || when.getTime() < Date.now() + 2 * 60 * 1000) {
        warnings.push('截止時間已過或太接近現在，沒有設定自動關閉。');
        autoClose = false;
      } else {
        try {
          scheduleClose_(formId, when);
        } catch (err14) {
          autoClose = false;
          warnings.push('未能設定自動關閉（觸發條件可能已滿）。請在截止後自行關閉表單。');
        }
      }
    }

    var entry = {
      formId: formId,
      title: title,
      createdAt: new Date().toISOString(),
      templateKey: template.key,
      templateName: template.name,
      audioUrl: audioNew,
      notesUrl: notesNew,
      publishedUrl: publishedUrl,
      shortUrl: shortUrl,
      editUrl: editUrl,
      sheetUrl: sheetUrl,
      deadline: deadline,
      deadlineText: deadlineText,
      instructions: instructions,
      autoClose: autoClose
    };
    var history = loadHistory_();
    history.unshift(entry);
    if (history.length > 40) history = history.slice(0, 40);
    saveHistoryList_(history);

    var whatsapp = buildWhatsAppMessage({
      title: title,
      notesUrl: notesNew,
      audioUrl: audioNew,
      formUrl: shortUrl || publishedUrl,
      deadlineText: deadlineText,
      instructions: instructions
    });
    return {
      title: title,
      formId: formId,
      publishedUrl: publishedUrl,
      shortUrl: shortUrl,
      editUrl: editUrl,
      sheetUrl: sheetUrl,
      whatsapp: whatsapp,
      warnings: warnings,
      replacedCount: updated.changes.length,
      changes: updated.changes.slice(0, 40),
      checks: {
        acceptingResponses: !!accepting,
        fileUploads: afterUploads.map(function(item) { return { title: item.title }; }),
        collectSettingsUnchanged: settingsCheck.ok
      }
    };
  });
}
