/**
 * Browser stand-in for google.script.run. Injected only by the preview server.
 * Uses example links, never student answers.
 */
(function () {
  var AUDIO_OLD = 'https://youtu.be/abcdefghijk';
  var NOTES_OLD = 'https://example.com/biology/notes-template';
  var state = {
    email: 'ksl@fss.edu.hk',
    activeTemplateKey: 'default-2029',
    templates: [{
      key: 'default-2029',
      name: '2029 DSE Biology',
      formId: '1uerPSCadog-u3AsRlM0OR-3mRpJR_GXJCOMlVh75Uvw',
      folderId: '1I5hvOvxqYWIFXzP1HxlfdWdl7RcacUVF',
      titlePrefix: '2029 DSE Biology Homework Submission ',
      audioUrl: AUDIO_OLD,
      notesUrl: NOTES_OLD
    }, {
      key: 'unmapped',
      name: '未掃描的班別',
      formId: '1aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      folderId: '1I5hvOvxqYWIFXzP1HxlfdWdl7RcacUVF',
      titlePrefix: '2029 DSE Biology Homework Submission ',
      audioUrl: '',
      notesUrl: ''
    }],
    history: [{
      formId: 'previewForm1',
      title: '2029 DSE Biology Homework Submission 20261006a',
      createdAt: '2026-10-06T12:00:00.000Z',
      templateName: '2029 DSE Biology',
      audioUrl: 'https://youtu.be/previewAudio1',
      notesUrl: 'https://example.com/biology/notes-20261006',
      publishedUrl: 'https://docs.google.com/forms/d/e/preview/viewform',
      shortUrl: 'https://forms.gle/previewDemo1',
      editUrl: 'https://docs.google.com/forms/d/previewForm1/edit',
      sheetUrl: 'https://docs.google.com/spreadsheets/d/previewSheet1/edit',
      deadline: '2026-10-07T23:59',
      deadlineText: '2026年10月7日 23:59',
      instructions: '',
      autoClose: false,
      whatsapp: '【2029 DSE Biology Homework Submission 20261006a】\n\n請先閱讀筆記，再聽語音，然後用下面的表格交功課（只接受 PDF）。\n\n📒 筆記：\nhttps://example.com/biology/notes-20261006\n\n🎧 語音：\nhttps://youtu.be/previewAudio1\n\n📝 交功課：\nhttps://forms.gle/previewDemo1\n\n📅 截止日期：2026年10月7日 23:59'
    }],
    usedLetters: { '20261007': ['a'] }
  };

  function snapshot() {
    return {
      email: state.email,
      templates: JSON.parse(JSON.stringify(state.templates)),
      activeTemplateKey: state.activeTemplateKey,
      history: JSON.parse(JSON.stringify(state.history)),
      suggestion: { title: suggest(), folderId: '1I5hvOvxqYWIFXzP1HxlfdWdl7RcacUVF', error: '' }
    };
  }

  function suggest() {
    var letters = state.usedLetters['20261007'] || [];
    var next = 'a';
    for (var i = 0; i < 26; i++) {
      var letter = String.fromCharCode(97 + i);
      if (letters.indexOf(letter) === -1) { next = letter; break; }
    }
    return '2029 DSE Biology Homework Submission 20261007' + next;
  }

  function later(fn) {
    setTimeout(fn, 40);
  }

  function runner() {
    var success = function () {};
    var failure = function () {};
    var api = {
      withSuccessHandler: function (fn) { success = fn; return api; },
      withFailureHandler: function (fn) { failure = fn; return api; },
      getAppState: function () { later(function () { success(snapshot()); }); },
      setActiveTemplate: function (req) {
        state.activeTemplateKey = req.key;
        later(function () { success(snapshot()); });
      },
      suggestTitleFor: function () { later(function () { success({ title: suggest(), folderId: '1I5hvOvxqYWIFXzP1HxlfdWdl7RcacUVF' }); }); },
      scanTemplate: function (req) {
        if (!req || String(req.formId).indexOf('missing') !== -1) {
          later(function () { failure({ message: '找不到這個表單或資料夾。請檢查 ID 是否正確，以及檔案有沒有被刪除。' }); });
          return;
        }
        later(function () {
          success({
            formId: '1uerPSCadog-u3AsRlM0OR-3mRpJR_GXJCOMlVh75Uvw',
            title: '2029 DSE Biology Homework Submission 20261006a',
            folderId: '1I5hvOvxqYWIFXzP1HxlfdWdl7RcacUVF',
            fileUploads: [{ index: 3, title: 'Homework (PDF only)' }],
            warnings: [],
            urls: [
              { url: AUDIO_OLD, locations: [{ kind: 'description', label: '表單說明' }, { kind: 'video', label: 'YouTube 影片 6「語音」' }] },
              { url: NOTES_OLD, locations: [{ kind: 'description', label: '表單說明' }, { kind: 'itemHelp', label: '分節 5「資料」說明' }] }
            ]
          });
        });
      },
      saveTemplate: function (req) {
        if (!req.audioUrl || !req.notesUrl) {
          later(function () { failure({ message: '請各選一個網址作為語音連結和筆記連結。' }); });
          return;
        }
        var record = {
          key: req.key || ('t-' + Date.now()),
          name: req.name,
          formId: req.formId,
          folderId: req.folderId,
          titlePrefix: req.titlePrefix,
          audioUrl: req.audioUrl,
          notesUrl: req.notesUrl
        };
        var found = false;
        state.templates = state.templates.map(function (template) {
          if (template.key === record.key) { found = true; return record; }
          return template;
        });
        if (!found) state.templates.push(record);
        state.activeTemplateKey = record.key;
        later(function () { success(snapshot()); });
      },
      deleteTemplate: function (req) {
        state.templates = state.templates.filter(function (template) { return template.key !== req.key; });
        state.activeTemplateKey = state.templates.length ? state.templates[0].key : '';
        later(function () { success(snapshot()); });
      },
      deleteHistoryItem: function (req) {
        state.history = state.history.filter(function (entry) { return entry.formId !== req.formId; });
        later(function () { success({ history: state.history }); });
      },
      generateForm: function (req) {
        if (!req || !req.audioUrl || !req.notesUrl) {
          later(function () { failure({ message: '今次的語音連結必須是以 http:// 或 https:// 開頭的網址。' }); });
          return;
        }
        var template = state.templates.filter(function (item) { return item.key === req.templateKey; })[0];
        if (!template || !template.audioUrl || !template.notesUrl) {
          later(function () { failure({ message: '這個範本還沒有標示語音連結和筆記連結。請先到「範本」頁掃描並儲存。' }); });
          return;
        }
        var letter = suggest().slice(-1);
        state.usedLetters['20261007'].push(letter);
        var title = req.title;
        var deadlineText = '';
        var match = String(req.deadline || '').match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
        if (match) deadlineText = match[1] + '年' + Number(match[2]) + '月' + Number(match[3]) + '日 ' + match[4] + ':' + match[5];
        var formUrl = 'https://forms.gle/previewNew1';
        var lines = ['【' + title + '】', '', '請先閱讀筆記，再聽語音，然後用下面的表格交功課（只接受 PDF）。'];
        if (req.instructions) lines.push('', req.instructions);
        lines.push('', '📒 筆記：', req.notesUrl, '', '🎧 語音：', req.audioUrl, '', '📝 交功課：', formUrl);
        if (deadlineText) lines.push('', '📅 截止日期：' + deadlineText);
        var entry = {
          formId: 'previewNewForm',
          title: title,
          createdAt: new Date().toISOString(),
          templateName: template.name,
          audioUrl: req.audioUrl,
          notesUrl: req.notesUrl,
          publishedUrl: 'https://docs.google.com/forms/d/e/previewNew/viewform',
          shortUrl: formUrl,
          editUrl: 'https://docs.google.com/forms/d/previewNewForm/edit',
          sheetUrl: 'https://docs.google.com/spreadsheets/d/previewNewSheet/edit',
          deadline: req.deadline || '',
          deadlineText: deadlineText,
          instructions: req.instructions || '',
          autoClose: !!req.autoClose,
          whatsapp: lines.join('\n')
        };
        state.history.unshift(entry);
        later(function () {
          success({
            title: title,
            formId: entry.formId,
            publishedUrl: entry.publishedUrl,
            shortUrl: entry.shortUrl,
            editUrl: entry.editUrl,
            sheetUrl: entry.sheetUrl,
            whatsapp: entry.whatsapp,
            warnings: req.autoClose && req.deadline ? [] : [],
            replacedCount: 4,
            changes: [],
            checks: {
              acceptingResponses: true,
              fileUploads: [{ title: 'Homework (PDF only)' }],
              collectSettingsUnchanged: true
            }
          });
        });
      }
    };
    return api;
  }

  window.google = {
    script: {
      get run() { return runner(); }
    }
  };
})();
