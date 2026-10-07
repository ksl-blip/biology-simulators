/**
 * Pure helpers for the browser form generator.
 * No network, no tokens, no student data.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.FormGenLogic = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
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

  function buildFormBatchRequests(resource, options) {
    var opts = options || {};
    var model = modelFromApiResource(resource);
    var updated = buildUpdatedModel(model, opts);
    var requests = [];
    var info = {};
    var infoMask = [];
    var nextTitle = opts.title || model.title || '';
    if (nextTitle !== (model.title || '')) {
      info.title = nextTitle;
      infoMask.push('title');
    }
    if ((updated.model.description || '') !== (model.description || '')) {
      info.description = updated.model.description || '';
      infoMask.push('description');
    }
    if (infoMask.length) {
      requests.push({ updateFormInfo: { info: info, updateMask: infoMask.join(',') } });
    }
    updated.model.items.forEach(function(item, index) {
      var prev = model.items[index] || {};
      var mask = [];
      var partial = {};
      if (item.itemId) partial.itemId = item.itemId;
      if ((item.title || '') !== (prev.title || '')) {
        partial.title = item.title || '';
        mask.push('title');
      }
      if ((item.helpText || '') !== (prev.helpText || '')) {
        partial.description = item.helpText || '';
        mask.push('description');
      }
      if (item.type === 'VIDEO' && (item.videoUrl || '') !== (prev.videoUrl || '')) {
        partial.videoItem = { video: { youtubeUri: item.videoUrl || '' } };
        mask.push('videoItem.video.youtubeUri');
      }
      if (item.type === 'VIDEO' && (item.extraText || '') !== (prev.extraText || '')) {
        partial.videoItem = partial.videoItem || {};
        partial.videoItem.caption = item.extraText || '';
        mask.push('videoItem.caption');
      }
      if (item.type === 'IMAGE' && (item.imageUrl || '') !== (prev.imageUrl || '')) {
        partial.imageItem = { image: { sourceUri: item.imageUrl || '' } };
        mask.push('imageItem.image.sourceUri');
      }
      if (item.type === 'IMAGE' && (item.extraText || '') !== (prev.extraText || '')) {
        partial.imageItem = partial.imageItem || { image: {} };
        partial.imageItem.image.altText = item.extraText || '';
        mask.push('imageItem.image.altText');
      }
      if (!mask.length) return;
      requests.push({
        updateItem: {
          item: partial,
          location: { index: item.index == null ? index : item.index },
          updateMask: mask.join(',')
        }
      });
    });
    return {
      requests: requests,
      warnings: updated.warnings,
      changes: updated.changes,
      model: updated.model
    };
  }

  function toChineseApiError(status, body) {
    var json = body;
    var raw = '';
    if (typeof body === 'string') {
      raw = body;
      try { json = JSON.parse(body); } catch (err) { json = {}; }
    }
    var message = (json && json.error && (json.error.message || json.error.status)) || '';
    var reason = '';
    try {
      reason = json.error.errors[0].reason || '';
    } catch (err2) { reason = ''; }
    var blob = (String(status) + ' ' + message + ' ' + reason + ' ' + raw).toLowerCase();
    var driveLib = 'https://console.cloud.google.com/apis/library/drive.googleapis.com';
    var formsLib = 'https://console.cloud.google.com/apis/library/forms.googleapis.com';
    if (/accessnotconfigured|access_not_configured|has not been used|service_disabled|it is disabled/.test(blob)) {
      return '尚未啟用 Google Drive API 或 Google Forms API。請開啟 ' + driveLib + ' 和 ' + formsLib + ' ，啟用後等一兩分鐘再試。';
    }
    if (status === 401 || /invalid authentication|invalid credentials|unauthenticated|login required/.test(blob)) {
      return '登入已過期或尚未登入。請再按一次「用學校帳戶登入」，並選擇 ksl@fss.edu.hk。';
    }
    if (/admin_policy_enforced|app_not_authorized|org_internal|access_denied/.test(blob)) {
      return '學校管理員可能限制了 Cloud 專案或第三方應用程式。請改用頁底的 Apps Script 做法，或請管理員允許這個內部應用程式。';
    }
    if (status === 404 || /file not found|not found/.test(blob)) {
      return '找不到這個表單或資料夾。請檢查 ID，並確認你是用 ksl@fss.edu.hk 登入。';
    }
    if (status === 403) {
      return '沒有權限開啟這個範本。請確認你是用 ksl@fss.edu.hk 登入，而且這個表單屬於你。';
    }
    if (/timeout|timed out/.test(blob)) return 'Google 沒有及時回應，請稍後再試。';
    if (/quota|rate limit|too many/.test(blob)) return '短時間內要求太多，請等一分鐘再試。';
    return 'Google 回應錯誤（' + status + '）。' + (message ? ' ' + message : '');
  }

  function signInErrorMessage(type) {
    var kind = String(type || '');
    if (kind === 'popup_failed_to_open') return '登入視窗被瀏覽器擋住。請允許這個網站的彈出式視窗，然後再按登入。';
    if (kind === 'popup_closed') return '登入視窗已關閉，尚未完成登入。';
    if (/access_denied|admin_policy_enforced|app_not_authorized/i.test(kind)) {
      return '學校管理員可能限制了 Cloud 專案或第三方應用程式。請改用頁底的 Apps Script 做法，或請管理員允許這個內部應用程式。';
    }
    if (!kind) return '未能登入。請再試一次，並選擇 ksl@fss.edu.hk。';
    return '未能登入（' + kind + '）。請再試一次。若學校封鎖了這個應用程式，請改用 Apps Script 做法。';
  }

  return {
    DEFAULT_FORM_ID: DEFAULT_FORM_ID,
    DEFAULT_FOLDER_ID: DEFAULT_FOLDER_ID,
    DEFAULT_TITLE_PREFIX: DEFAULT_TITLE_PREFIX,
    DEFAULT_TEMPLATE_NAME: DEFAULT_TEMPLATE_NAME,
    DEFAULT_TEMPLATE_KEY: DEFAULT_TEMPLATE_KEY,
    extractUrls: extractUrls,
    youtubeId: youtubeId,
    isYouTubeUrl: isYouTubeUrl,
    replaceExactUrls: replaceExactUrls,
    scanFormModel: scanFormModel,
    composeDescription: composeDescription,
    buildUpdatedModel: buildUpdatedModel,
    suggestTitle: suggestTitle,
    yyyymmddInHongKong: yyyymmddInHongKong,
    formatDeadlineText: formatDeadlineText,
    parseDeadlineHKT: parseDeadlineHKT,
    buildWhatsAppMessage: buildWhatsAppMessage,
    parseFormId: parseFormId,
    parseFolderId: parseFolderId,
    assertHttpUrl: assertHttpUrl,
    modelFromApiResource: modelFromApiResource,
    fitPropertyList: fitPropertyList,
    buildFormBatchRequests: buildFormBatchRequests,
    toChineseApiError: toChineseApiError,
    signInErrorMessage: signInErrorMessage
  };
});
