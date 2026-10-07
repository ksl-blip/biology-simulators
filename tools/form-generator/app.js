/**
 * Browser client. No backend.
 *
 * Scopes requested from Google Identity Services:
 *   https://www.googleapis.com/auth/drive
 *   https://www.googleapis.com/auth/forms.body
 *
 * drive.file plus the Picker is not enough for this tool. The Picker grants
 * access only to the one file the teacher selects. Listing the homework
 * folder (to pick the next free title letter a/b/c) would then miss forms
 * already in that folder, and files.copy of a template the teacher already
 * owns would fail until that exact file had been picked. The full drive
 * scope can copy that existing form by id and read the folder. forms.body
 * is the Forms API scope used to read items, batchUpdate text and YouTube
 * videos, and publish the copy. The consent screen should be Internal, so
 * only the school domain can approve it.
 *
 * The access token stays in memory. Template ids and generated links stay
 * in localStorage. Do not store student answers.
 */
(function () {
  var L = window.FormGenLogic;
  var SCOPES = [
    'https://www.googleapis.com/auth/drive',
    'https://www.googleapis.com/auth/forms.body'
  ].join(' ');
  var LS_CLIENT = 'fg.clientId';
  var LS_TEMPLATES = 'fg.templates';
  var LS_ACTIVE = 'fg.active';
  var LS_HISTORY = 'fg.history';

  var accessToken = '';
  var tokenClient = null;
  var titleDirty = false;
  var editor = blankEditor();

  function $(id) { return document.getElementById(id); }

  function blankEditor() {
    return {
      key: '',
      name: '',
      formId: '',
      folderId: '',
      titlePrefix: L.DEFAULT_TITLE_PREFIX,
      audioUrl: '',
      notesUrl: '',
      baseFormId: ''
    };
  }

  function defaultTemplate() {
    return {
      key: L.DEFAULT_TEMPLATE_KEY,
      name: L.DEFAULT_TEMPLATE_NAME,
      formId: L.DEFAULT_FORM_ID,
      folderId: L.DEFAULT_FOLDER_ID,
      titlePrefix: L.DEFAULT_TITLE_PREFIX,
      audioUrl: '',
      notesUrl: ''
    };
  }

  function readJson(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      if (!raw) return fallback;
      return JSON.parse(raw);
    } catch (err) {
      return fallback;
    }
  }

  function clientId() {
    var stored = (localStorage.getItem(LS_CLIENT) || '').trim();
    if (stored) return stored;
    return (window.CLIENT_ID || '').trim();
  }

  function templates() {
    var list = readJson(LS_TEMPLATES, null);
    if (!Array.isArray(list)) {
      list = [defaultTemplate()];
      localStorage.setItem(LS_TEMPLATES, JSON.stringify(list));
      if (!localStorage.getItem(LS_ACTIVE)) localStorage.setItem(LS_ACTIVE, list[0].key);
    }
    return list;
  }

  function saveTemplates(list) {
    localStorage.setItem(LS_TEMPLATES, JSON.stringify(list));
  }

  function activeTemplate() {
    var list = templates();
    var key = localStorage.getItem(LS_ACTIVE) || '';
    for (var i = 0; i < list.length; i++) if (list[i].key === key) return list[i];
    return list[0] || null;
  }

  function showBanner(kind, message) {
    var box = $('banner');
    box.innerHTML = '';
    if (!message) {
      box.className = 'banner hidden';
      return;
    }
    box.className = 'banner ' + (kind || 'error');
    var parts = String(message).split(/(https?:\/\/[^\s]+)/g);
    parts.forEach(function (part) {
      if (/^https?:\/\//.test(part)) {
        var link = document.createElement('a');
        link.href = part;
        link.target = '_blank';
        link.rel = 'noopener';
        link.textContent = part;
        box.appendChild(link);
      } else {
        box.appendChild(document.createTextNode(part));
      }
    });
  }

  function showView(name) {
    ['generate', 'template', 'history', 'settings'].forEach(function (view) {
      $('view-' + view).classList.toggle('hidden', view !== name);
      $('tab-' + view).setAttribute('aria-selected', view === name ? 'true' : 'false');
    });
  }

  function previewMessage() {
    var deadlineText = L.formatDeadlineText($('deadline').value);
    var lines = ['【' + ($('title').value.trim() || '家課') + '】', '', '請先閱讀筆記，再聽語音，然後用下面的表格交功課（只接受 PDF）。'];
    if ($('instructions').value.trim()) lines.push('', $('instructions').value.trim());
    lines.push('', '📒 筆記：', $('notes').value.trim() || '（未填）', '', '🎧 語音：', $('audio').value.trim() || '（未填）', '', '📝 交功課：', '（產生後會放上表單連結）');
    if (deadlineText) lines.push('', '📅 截止日期：' + deadlineText);
    $('preview').textContent = lines.join('\n');
  }

  function renderSession() {
    var id = clientId();
    $('setup-needed').classList.toggle('hidden', !!id);
    $('client-id').value = id;
    $('sign-in').classList.toggle('hidden', !id || !!accessToken);
    $('sign-out').classList.toggle('hidden', !accessToken);
    $('who').textContent = accessToken ? '已用學校 Google 帳戶登入' : (id ? '尚未登入' : '請先貼上 OAuth 用戶端 ID');
  }

  function renderGenerate() {
    var select = $('template-select');
    var list = templates();
    var current = activeTemplate();
    select.innerHTML = '';
    list.forEach(function (template) {
      var option = document.createElement('option');
      option.value = template.key;
      option.textContent = template.name;
      if (current && template.key === current.key) option.selected = true;
      select.appendChild(option);
    });
    var chip = $('map-chip');
    if (current && current.audioUrl && current.notesUrl) {
      chip.className = 'chip ok';
      chip.textContent = '已標示語音和筆記';
      $('map-hint').textContent = '下面填今次的新連結。程式會在範本裡找出已標示的舊網址並整段取代。';
    } else {
      chip.className = 'chip todo';
      chip.textContent = '尚未標示連結';
      $('map-hint').textContent = '請先到「範本」掃描，標明哪一個是語音、哪一個是筆記。';
    }
    previewMessage();
  }

  function renderTemplates() {
    var list = $('template-list');
    list.innerHTML = '';
    templates().forEach(function (template) {
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'ghost';
      var mapped = template.audioUrl && template.notesUrl;
      var current = activeTemplate();
      button.textContent = template.name + (mapped ? ' · 已標示連結' : ' · 未掃描') + (current && template.key === current.key ? ' · 使用中' : '');
      button.addEventListener('click', function () { loadEditor(template); });
      list.appendChild(button);
    });
    fillEditor();
  }

  function loadEditor(template) {
    editor = {
      key: template.key,
      name: template.name,
      formId: template.formId,
      folderId: template.folderId,
      titlePrefix: template.titlePrefix,
      audioUrl: template.audioUrl || '',
      notesUrl: template.notesUrl || '',
      baseFormId: template.formId
    };
    $('scan-box').innerHTML = '';
    fillEditor();
  }

  function fillEditor() {
    $('tpl-name').value = editor.name || '';
    $('tpl-form').value = editor.formId || '';
    $('tpl-folder').value = editor.folderId || '';
    $('tpl-prefix').value = editor.titlePrefix || L.DEFAULT_TITLE_PREFIX;
    $('template-heading').textContent = editor.key ? '編輯範本' : '新範本';
    $('delete-template').classList.toggle('hidden', !editor.key);
    $('tpl-status').textContent = (editor.audioUrl && editor.notesUrl)
      ? '已記住範本裡的語音和筆記網址。換了範本內容後請再掃描。'
      : '尚未標示。請掃描後選擇哪一個網址是語音、哪一個是筆記。';
  }

  function renderHistory() {
    var host = $('history-list');
    host.innerHTML = '';
    var list = readJson(LS_HISTORY, []);
    if (!list.length) {
      var empty = document.createElement('div');
      empty.className = 'card';
      empty.textContent = '這部瀏覽器還沒有產生過表單。';
      host.appendChild(empty);
      return;
    }
    list.forEach(function (entry) {
      var card = document.createElement('article');
      card.className = 'card';
      var title = document.createElement('h2');
      title.textContent = entry.title || '';
      card.appendChild(title);
      var meta = document.createElement('p');
      meta.className = 'muted';
      meta.textContent = (entry.createdAt || '').replace('T', ' ').slice(0, 16);
      card.appendChild(meta);
      addLink(card, '學生連結', entry.publishedUrl);
      addLink(card, '編輯', entry.editUrl);
      var note = document.createElement('p');
      note.className = 'muted';
      note.textContent = '回應試算表要自己在編輯頁按「回應」→「連結至試算表」。這個網頁版不能代勞，也沒有 forms.gle 短網址。';
      card.appendChild(note);
      var box = document.createElement('textarea');
      box.className = 'whatsapp';
      box.readOnly = true;
      box.value = L.buildWhatsAppMessage({
        title: entry.title,
        notesUrl: entry.notesUrl,
        audioUrl: entry.audioUrl,
        formUrl: entry.publishedUrl,
        deadlineText: entry.deadlineText,
        instructions: entry.instructions
      });
      card.appendChild(box);
      var row = document.createElement('div');
      row.className = 'row';
      row.appendChild(copyButton('複製 WhatsApp', box.value));
      var reuse = document.createElement('button');
      reuse.type = 'button';
      reuse.className = 'ghost';
      reuse.textContent = '填入產生頁';
      reuse.addEventListener('click', function () {
        $('audio').value = entry.audioUrl || '';
        $('notes').value = entry.notesUrl || '';
        $('instructions').value = entry.instructions || '';
        showView('generate');
        previewMessage();
        showBanner('info', '已填入該次的語音、筆記和說明。請改標題和今次的新連結。');
      });
      row.appendChild(reuse);
      var remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'danger';
      remove.textContent = '刪除紀錄';
      remove.addEventListener('click', function () {
        var next = readJson(LS_HISTORY, []).filter(function (item) { return item.formId !== entry.formId; });
        localStorage.setItem(LS_HISTORY, JSON.stringify(next));
        renderHistory();
      });
      row.appendChild(remove);
      card.appendChild(row);
      host.appendChild(card);
    });
  }

  function addLink(parent, label, url) {
    var row = document.createElement('div');
    row.className = 'link-row';
    var block = document.createElement('div');
    var strong = document.createElement('strong');
    strong.textContent = label;
    block.appendChild(strong);
    if (url && /^https?:\/\//i.test(url)) {
      var anchor = document.createElement('a');
      anchor.href = url;
      anchor.target = '_blank';
      anchor.rel = 'noopener';
      anchor.textContent = url;
      block.appendChild(document.createElement('br'));
      block.appendChild(anchor);
    } else {
      var missing = document.createElement('div');
      missing.className = 'muted';
      missing.textContent = '沒有連結';
      block.appendChild(missing);
    }
    row.appendChild(block);
    if (url) row.appendChild(copyButton('複製', url));
    parent.appendChild(row);
  }

  function copyButton(label, text) {
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'ghost';
    button.textContent = label;
    button.addEventListener('click', function () { copyText(text, button, label); });
    return button;
  }

  function copyText(text, button, label) {
    var done = function () {
      if (!button) return;
      button.textContent = '已複製';
      setTimeout(function () { button.textContent = label; }, 1400);
    };
    var write = navigator.clipboard && navigator.clipboard.writeText
      ? navigator.clipboard.writeText(text)
      : Promise.reject();
    write.then(done).catch(function () {
      var area = document.createElement('textarea');
      area.value = text;
      document.body.appendChild(area);
      area.select();
      document.execCommand('copy');
      area.remove();
      done();
    });
  }

  function api(url, options) {
    if (!accessToken) return Promise.reject(new Error('請先用 ksl@fss.edu.hk 登入。'));
    var opts = options || {};
    return fetch(url, {
      method: opts.method || 'GET',
      headers: {
        Authorization: 'Bearer ' + accessToken,
        'Content-Type': 'application/json'
      },
      body: opts.body ? JSON.stringify(opts.body) : undefined
    }).then(function (res) {
      return res.text().then(function (text) {
        var json = {};
        if (text) {
          try { json = JSON.parse(text); } catch (err) { json = {}; }
        }
        if (!res.ok) {
          if (res.status === 401) accessToken = '';
          renderSession();
          throw new Error(L.toChineseApiError(res.status, json.error ? json : text));
        }
        return json;
      });
    });
  }

  function listTitles(folderId) {
    var titles = [];
    function page(token) {
      var url = 'https://www.googleapis.com/drive/v3/files?pageSize=1000'
        + '&supportsAllDrives=true&includeItemsFromAllDrives=true'
        + '&fields=nextPageToken,files(name)'
        + '&q=' + encodeURIComponent("'" + String(folderId).replace(/'/g, "\\'") + "' in parents and trashed = false");
      if (token) url += '&pageToken=' + encodeURIComponent(token);
      return api(url).then(function (data) {
        (data.files || []).forEach(function (file) { titles.push(file.name); });
        if (data.nextPageToken) return page(data.nextPageToken);
        return titles;
      });
    }
    return page('');
  }

  function suggestNow() {
    var current = activeTemplate();
    var prefix = (current && current.titlePrefix) || L.DEFAULT_TITLE_PREFIX;
    var today = L.yyyymmddInHongKong(new Date());
    var folder = $('folder-id').value.trim() || (current && current.folderId) || '';
    if (!accessToken || !folder) {
      if (!titleDirty) $('title').value = L.suggestTitle([], today, prefix);
      if (!accessToken) showBanner('info', '登入後會按資料夾裡現有的表單決定 a、b、c。');
      previewMessage();
      return Promise.resolve();
    }
    return listTitles(folder).then(function (titles) {
      if (!titleDirty) $('title').value = L.suggestTitle(titles, today, prefix);
      showBanner('');
      previewMessage();
    }).catch(function (err) {
      if (!titleDirty) $('title').value = L.suggestTitle([], today, prefix);
      showBanner('warn', err.message || String(err));
    });
  }

  function signIn() {
    if (!clientId()) {
      showBanner('error', '請先在「設定」貼上 OAuth 用戶端 ID。');
      showView('settings');
      return;
    }
    if (!(window.google && google.accounts && google.accounts.oauth2)) {
      showBanner('error', '登入元件未載入。請檢查網絡，或學校網絡有沒有擋住 accounts.google.com。');
      return;
    }
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: clientId(),
      scope: SCOPES,
      callback: function (resp) {
        if (resp && resp.error) {
          showBanner('error', L.signInErrorMessage(resp.error));
          return;
        }
        accessToken = resp.access_token || '';
        renderSession();
        showBanner('info', '已登入。請核對標題，貼上今次的兩個連結。');
        suggestNow();
      },
      error_callback: function (err) {
        showBanner('error', L.signInErrorMessage(err && (err.type || err.message)));
      }
    });
    // select_account lets him choose ksl@fss.edu.hk when several Google
    // accounts are signed in. Consent appears automatically if needed.
    tokenClient.requestAccessToken({ prompt: 'select_account' });
  }

  function signOut() {
    var token = accessToken;
    accessToken = '';
    tokenClient = null;
    if (token && window.google && google.accounts && google.accounts.oauth2.revoke) {
      google.accounts.oauth2.revoke(token, function () {});
    }
    renderSession();
    showBanner('info', '已登出。範本和紀錄仍留在這部瀏覽器。');
  }

  function scan(formId) {
    return api('https://forms.googleapis.com/v1/forms/' + encodeURIComponent(formId)).then(function (resource) {
      var model = L.modelFromApiResource(resource);
      var found = L.scanFormModel(model);
      return {
        title: model.title,
        urls: found.urls,
        fileUploads: found.fileUploads
      };
    });
  }

  function renderScan(result) {
    var box = $('scan-box');
    box.innerHTML = '';
    var head = document.createElement('p');
    head.textContent = '掃到的表單：「' + (result.title || '') + '」';
    box.appendChild(head);
    (result.fileUploads || []).forEach(function (item) {
      var line = document.createElement('p');
      line.className = 'muted';
      line.textContent = '找到檔案上載題：' + (item.title || '（沒有標題）');
      box.appendChild(line);
    });
    if (!result.urls.length) {
      var none = document.createElement('p');
      none.textContent = '在表單說明、題目、分節、圖片和影片都找不到網址。請把兩個連結寫進範本說明，然後再掃描。';
      box.appendChild(none);
      return;
    }
    result.urls.forEach(function (entry, index) {
      var card = document.createElement('div');
      card.className = 'pick';
      var url = document.createElement('p');
      url.textContent = entry.url;
      card.appendChild(url);
      var places = document.createElement('p');
      places.className = 'muted';
      places.textContent = '出現位置：' + entry.locations.map(function (location) { return location.label; }).join('、');
      card.appendChild(places);
      var roles = document.createElement('div');
      roles.className = 'roles';
      [['audio', '語音連結'], ['notes', '筆記連結'], ['ignore', '不用取代']].forEach(function (pair) {
        var label = document.createElement('label');
        var input = document.createElement('input');
        input.type = 'radio';
        input.name = 'role-' + index;
        input.value = pair[0];
        input.setAttribute('data-url', entry.url);
        if ((pair[0] === 'audio' && entry.url === editor.audioUrl) ||
            (pair[0] === 'notes' && entry.url === editor.notesUrl) ||
            (pair[0] === 'ignore' && entry.url !== editor.audioUrl && entry.url !== editor.notesUrl)) {
          input.checked = true;
        }
        label.appendChild(input);
        label.appendChild(document.createTextNode(' ' + pair[1]));
        roles.appendChild(label);
      });
      card.appendChild(roles);
      box.appendChild(card);
    });
  }

  function selectedRoles() {
    var audio = '';
    var notes = '';
    document.querySelectorAll('#scan-box input[type="radio"]:checked').forEach(function (input) {
      if (input.value === 'audio') audio = input.getAttribute('data-url');
      if (input.value === 'notes') notes = input.getAttribute('data-url');
    });
    return { audioUrl: audio, notesUrl: notes };
  }

  function rememberHistory(entry) {
    var list = readJson(LS_HISTORY, []);
    list.unshift(entry);
    if (list.length > 30) list = list.slice(0, 30);
    list = L.fitPropertyList(list, 200000);
    localStorage.setItem(LS_HISTORY, JSON.stringify(list));
  }

  function generate() {
    var current = activeTemplate();
    if (!clientId()) return Promise.reject(new Error('請先在「設定」貼上 OAuth 用戶端 ID。'));
    if (!accessToken) return Promise.reject(new Error('請先用 ksl@fss.edu.hk 登入。'));
    if (!current) return Promise.reject(new Error('請先到「範本」頁加入範本。'));
    if (!current.audioUrl || !current.notesUrl) {
      return Promise.reject(new Error('這個範本還沒有標示語音連結和筆記連結。請先到「範本」頁掃描並儲存。'));
    }
    var title = $('title').value.trim();
    if (!title) return Promise.reject(new Error('請輸入新表單標題。'));
    if (/[\\/]/.test(title)) return Promise.reject(new Error('標題不能包含斜線 / 。'));
    var audioNew, notesNew;
    try {
      audioNew = L.assertHttpUrl($('audio').value, '今次的語音連結');
      notesNew = L.assertHttpUrl($('notes').value, '今次的筆記連結');
    } catch (err) {
      return Promise.reject(err);
    }
    var instructions = $('instructions').value.trim();
    if (instructions.length > 500) return Promise.reject(new Error('補充說明請保持在 500 字以內。'));
    var deadline = $('deadline').value;
    var deadlineText = deadline ? L.formatDeadlineText(deadline) : '';
    if (deadline && !deadlineText) return Promise.reject(new Error('截止日期格式不正確。'));
    var folderSource = $('folder-id').value.trim() || current.folderId || '';
    var folderParsed = L.parseFolderId(folderSource);
    if (folderParsed.error) return Promise.reject(new Error(folderParsed.error));
    var folderId = folderParsed.id;
    if (!folderId) return Promise.reject(new Error('請填上要放入的資料夾。'));
    var copiedId = '';
    var warnings = [];
    return api('https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(current.formId) + '/copy?supportsAllDrives=true', {
      method: 'POST',
      body: { name: title, parents: [folderId] }
    }).then(function (copied) {
      copiedId = copied.id;
      if (!copiedId) throw new Error('Google 沒有交回新表單的 ID。');
      return api('https://forms.googleapis.com/v1/forms/' + encodeURIComponent(copiedId));
    }).then(function (resource) {
      var uploads = (resource.items || []).filter(function (item) {
        return item.questionItem && item.questionItem.question && item.questionItem.question.fileUploadQuestion;
      });
      if (!uploads.length) warnings.push('範本裡找不到檔案上載題。請先打開編輯頁確認，再發給學生。');
      var built = L.buildFormBatchRequests(resource, {
        title: title,
        audioOld: current.audioUrl,
        notesOld: current.notesUrl,
        audioNew: audioNew,
        notesNew: notesNew,
        labelLinks: $('label-links').checked,
        instructions: instructions,
        deadlineText: deadlineText
      });
      warnings = warnings.concat(built.warnings);
      var uploadIds = {};
      uploads.forEach(function (item) { uploadIds[item.itemId] = true; });
      built.requests.forEach(function (request) {
        var item = request.updateItem && request.updateItem.item;
        if (item && uploadIds[item.itemId] && /questionItem/.test(request.updateItem.updateMask || '')) {
          warnings.push('程式本應不會改寫檔案上載題的設定。請打開編輯頁確認是否仍只接受 PDF。');
        }
      });
      if (!built.requests.length) return null;
      return api('https://forms.googleapis.com/v1/forms/' + encodeURIComponent(copiedId) + ':batchUpdate', {
        method: 'POST',
        body: { requests: built.requests }
      });
    }).then(function () {
      return api('https://forms.googleapis.com/v1/forms/' + encodeURIComponent(copiedId) + ':setPublishSettings', {
        method: 'POST',
        body: {
          publishSettings: { publishState: { isPublished: true, isAcceptingResponses: true } },
          updateMask: 'publishState'
        }
      }).catch(function () {
        warnings.push('未能用 API 發佈表單。如果學生打不開連結，請打開編輯頁按「發佈」。');
      });
    }).then(function () {
      return api('https://forms.googleapis.com/v1/forms/' + encodeURIComponent(copiedId));
    }).then(function (resource) {
      var published = resource.responderUri || '';
      if (!published) warnings.push('未取得學生連結。請打開編輯頁，確認表單已發佈。');
      var entry = {
        formId: copiedId,
        title: title,
        createdAt: new Date().toISOString(),
        audioUrl: audioNew,
        notesUrl: notesNew,
        publishedUrl: published,
        editUrl: 'https://docs.google.com/forms/d/' + copiedId + '/edit',
        deadlineText: deadlineText,
        instructions: instructions
      };
      rememberHistory(entry);
      return { entry: entry, warnings: warnings };
    }).catch(function (err) {
      var message = err && err.message ? err.message : String(err);
      if (copiedId) message += ' 已複製的表單：https://docs.google.com/forms/d/' + copiedId + '/edit';
      throw new Error(message);
    });
  }

  function showResult(result) {
    $('result').classList.remove('hidden');
    $('result-title').textContent = result.entry.title;
    $('result-checks').textContent = '檔案上載題沒有被改寫。表單已要求發佈並接受回應。';
    var warnings = $('result-warnings');
    warnings.innerHTML = '';
    (result.warnings || []).forEach(function (warning) {
      var div = document.createElement('div');
      div.className = 'banner warn';
      div.textContent = warning;
      warnings.appendChild(div);
    });
    var links = $('result-links');
    links.innerHTML = '';
    addLink(links, '學生連結', result.entry.publishedUrl);
    addLink(links, '編輯連結', result.entry.editUrl);
    var hint = document.createElement('p');
    hint.className = 'muted';
    hint.textContent = '如需回應試算表，打開編輯連結，按「回應」→「連結至試算表」。這個網頁版不能自動連結試算表，也不能產生 forms.gle 短網址或到時自動關閉。';
    links.appendChild(hint);
    var message = L.buildWhatsAppMessage({
      title: result.entry.title,
      notesUrl: result.entry.notesUrl,
      audioUrl: result.entry.audioUrl,
      formUrl: result.entry.publishedUrl,
      deadlineText: result.entry.deadlineText,
      instructions: result.entry.instructions
    });
    $('whatsapp').value = message;
    $('result').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function wire() {
    $('tab-generate').addEventListener('click', function () { showView('generate'); });
    $('tab-template').addEventListener('click', function () { showView('template'); });
    $('tab-history').addEventListener('click', function () { showView('history'); });
    $('tab-settings').addEventListener('click', function () { showView('settings'); });
    document.querySelectorAll('a[href="#view-settings"]').forEach(function (link) {
      link.addEventListener('click', function (event) {
        event.preventDefault();
        showView('settings');
      });
    });
    $('sign-in').addEventListener('click', signIn);
    $('sign-out').addEventListener('click', signOut);
    $('save-client').addEventListener('click', function () {
      var value = $('client-id').value.trim();
      if (!value) {
        localStorage.removeItem(LS_CLIENT);
        accessToken = '';
        renderSession();
        showBanner('error', '請貼上 OAuth 用戶端 ID。');
        return;
      }
      if (!/\.apps\.googleusercontent\.com$/.test(value)) {
        showBanner('warn', '這個 ID 看起來不像 Google 的用戶端 ID（通常以 .apps.googleusercontent.com 結尾）。已照樣儲存。');
      } else {
        showBanner('info', '已儲存用戶端 ID。請按「用學校帳戶登入」。');
      }
      localStorage.setItem(LS_CLIENT, value);
      accessToken = '';
      tokenClient = null;
      renderSession();
    });
    ['title', 'audio', 'notes', 'instructions', 'deadline'].forEach(function (id) {
      $(id).addEventListener('input', function () {
        if (id === 'title') titleDirty = true;
        previewMessage();
      });
    });
    $('template-select').addEventListener('change', function () {
      localStorage.setItem(LS_ACTIVE, $('template-select').value);
      titleDirty = false;
      renderGenerate();
      renderTemplates();
      if (accessToken) suggestNow();
    });
    $('refresh-title').addEventListener('click', function () {
      titleDirty = false;
      suggestNow();
    });
    $('gen-form').addEventListener('submit', function (event) {
      event.preventDefault();
      var button = $('generate-btn');
      button.disabled = true;
      button.textContent = '正在產生…';
      showBanner('');
      generate().then(function (result) {
        showResult(result);
        renderHistory();
      }).catch(function (err) {
        showBanner('error', err.message || String(err));
      }).then(function () {
        button.disabled = false;
        button.textContent = '產生表單';
      });
    });
    $('copy-whatsapp').addEventListener('click', function () {
      copyText($('whatsapp').value, $('copy-whatsapp'), '複製 WhatsApp 訊息');
    });
    $('new-template').addEventListener('click', function () {
      editor = blankEditor();
      $('scan-box').innerHTML = '';
      fillEditor();
    });
    $('use-default').addEventListener('click', function () {
      editor = blankEditor();
      editor.name = L.DEFAULT_TEMPLATE_NAME;
      editor.formId = L.DEFAULT_FORM_ID;
      editor.folderId = L.DEFAULT_FOLDER_ID;
      editor.titlePrefix = L.DEFAULT_TITLE_PREFIX;
      $('scan-box').innerHTML = '';
      fillEditor();
      showBanner('info', '已填入 2029 預設範本。請掃描並標示語音和筆記連結，然後儲存。');
    });
    $('tpl-form').addEventListener('input', function () {
      if ($('tpl-form').value.trim() !== editor.baseFormId) {
        editor.audioUrl = '';
        editor.notesUrl = '';
        $('tpl-status').textContent = '表單 ID 已更改，請重新掃描再標示連結。';
      }
    });
    $('scan-btn').addEventListener('click', function () {
      var parsed = L.parseFormId($('tpl-form').value);
      if (parsed.error) { showBanner('error', parsed.error); return; }
      if (!accessToken) { showBanner('error', '請先用 ksl@fss.edu.hk 登入。'); return; }
      var button = $('scan-btn');
      button.disabled = true;
      scan(parsed.id).then(function (result) {
        renderScan(result);
        showBanner('info', result.urls.length ? '請標示語音和筆記，然後按儲存範本。' : '');
      }).catch(function (err) {
        showBanner('error', err.message || String(err));
      }).then(function () { button.disabled = false; });
    });
    $('template-form').addEventListener('submit', function (event) {
      event.preventDefault();
      var name = $('tpl-name').value.trim();
      if (!name) { showBanner('error', '請為範本起一個名稱，例如「2029 DSE Biology」。'); return; }
      var parsed = L.parseFormId($('tpl-form').value);
      if (parsed.error) { showBanner('error', parsed.error); return; }
      var folder = L.parseFolderId($('tpl-folder').value);
      if (folder.error) { showBanner('error', folder.error); return; }
      var roles = selectedRoles();
      var picks = document.querySelectorAll('#scan-box input[type="radio"]');
      var audioUrl = picks.length ? roles.audioUrl : editor.audioUrl;
      var notesUrl = picks.length ? roles.notesUrl : editor.notesUrl;
      if (picks.length && (!audioUrl || !notesUrl)) {
        showBanner('error', '請各選一個網址作為語音連結和筆記連結。');
        return;
      }
      if (audioUrl && notesUrl && audioUrl === notesUrl) {
        showBanner('error', '語音和筆記不能是同一個網址。');
        return;
      }
      var list = templates().slice();
      var key = editor.key || ('t-' + Date.now().toString(36));
      var record = {
        key: key,
        name: name,
        formId: parsed.id,
        folderId: folder.id || '',
        titlePrefix: $('tpl-prefix').value || L.DEFAULT_TITLE_PREFIX,
        audioUrl: audioUrl || '',
        notesUrl: notesUrl || ''
      };
      var replaced = false;
      list = list.map(function (template) {
        if (template.key === key) { replaced = true; return record; }
        return template;
      });
      if (!replaced) list.push(record);
      saveTemplates(list);
      localStorage.setItem(LS_ACTIVE, key);
      titleDirty = false;
      loadEditor(record);
      renderGenerate();
      renderTemplates();
      showBanner('info', '範本已儲存。');
      if (accessToken) suggestNow();
    });
    $('delete-template').addEventListener('click', function () {
      if (!editor.key) return;
      if (!window.confirm('刪除這個範本設定？已經產生的 Google Form 不會被刪掉。')) return;
      var list = templates().filter(function (template) { return template.key !== editor.key; });
      saveTemplates(list);
      if (localStorage.getItem(LS_ACTIVE) === editor.key) {
        localStorage.setItem(LS_ACTIVE, list.length ? list[0].key : '');
      }
      editor = blankEditor();
      renderGenerate();
      renderTemplates();
      showBanner('info', '已刪除範本設定。');
    });
  }

  function init() {
    if (!window.FormGenLogic) return;
    wire();
    var current = activeTemplate();
    if (current) loadEditor(current);
    renderSession();
    renderGenerate();
    renderTemplates();
    renderHistory();
    if (!titleDirty) $('title').value = L.suggestTitle([], L.yyyymmddInHongKong(new Date()), (current && current.titlePrefix) || L.DEFAULT_TITLE_PREFIX);
    previewMessage();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
