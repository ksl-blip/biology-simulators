/**
 * Stand-in for Google Identity Services and the Drive / Forms HTTP APIs.
 * Loaded only when the preview server serves index.html?mock=1.
 * The production page still loads https://accounts.google.com/gsi/client.
 */
(function () {
  var DEFAULT_FORM = '1uerPSCadog-u3AsRlM0OR-3mRpJR_GXJCOMlVh75Uvw';
  var COPY_ID = 'copiedFormId1234567890123';
  var published = {};

  function hkToday() {
    var shifted = new Date(Date.now() + 8 * 60 * 60 * 1000);
    var month = String(shifted.getUTCMonth() + 1).padStart(2, '0');
    var day = String(shifted.getUTCDate()).padStart(2, '0');
    return String(shifted.getUTCFullYear()) + month + day;
  }

  window.__FORM_MOCK = {
    hkToday: hkToday(),
    copyId: COPY_ID,
    lastBatch: null,
    sawAuth: false,
    calls: []
  };

  function templateItems() {
    return [
      {
        itemId: 'name',
        title: 'English Full Name (e.g. Chan Tai Man)',
        questionItem: { question: { required: true, textQuestion: { paragraph: false } } }
      },
      {
        itemId: 'class',
        title: 'Class',
        questionItem: { question: { choiceQuestion: { type: 'RADIO', options: [{ value: 'A' }, { value: 'B' }] } } }
      },
      {
        itemId: 'no',
        title: 'Class No.',
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
        description: '筆記 https://example.com/biology/notes-template',
        pageBreakItem: {}
      },
      {
        itemId: 'vid',
        title: '語音',
        videoItem: { video: { youtubeUri: 'https://www.youtube.com/watch?v=abcdefghijk' }, caption: '' }
      }
    ];
  }

  function formResource(id) {
    var body = {
      formId: id,
      info: {
        title: '2029 DSE Biology Homework Submission template',
        description: '聽 https://youtu.be/abcdefghijk 再讀 https://example.com/biology/notes-template。'
      },
      items: templateItems()
    };
    if (published[id]) {
      body.responderUri = 'https://docs.google.com/forms/d/e/' + id + '/viewform';
      body.publishSettings = { publishState: { isPublished: true, isAcceptingResponses: true } };
    }
    return body;
  }

  function jsonResponse(status, body) {
    return new Response(JSON.stringify(body), {
      status: status,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  function blocked(id) {
    if (String(id).indexOf('disabled') !== -1) {
      return jsonResponse(403, {
        error: {
          code: 403,
          message: 'Google Forms API has not been used in project 0 before or it is disabled.',
          status: 'PERMISSION_DENIED',
          errors: [{ reason: 'accessNotConfigured', message: 'accessNotConfigured' }]
        }
      });
    }
    if (String(id).indexOf('forbidden') !== -1) {
      return jsonResponse(403, {
        error: {
          code: 403,
          message: 'The caller does not have permission',
          status: 'PERMISSION_DENIED',
          errors: [{ reason: 'forbidden', message: 'forbidden' }]
        }
      });
    }
    return null;
  }

  function formIdFromPath(pathname) {
    var match = pathname.match(/\/forms\/([^:/]+)/);
    return match ? decodeURIComponent(match[1]) : '';
  }

  window.google = {
    accounts: {
      oauth2: {
        initTokenClient: function (cfg) {
          window.__FORM_MOCK.gis = cfg;
          return {
            requestAccessToken: function () {
              var clientId = String((cfg && cfg.client_id) || '');
              if (clientId.indexOf('popup') === 0) {
                if (cfg.error_callback) cfg.error_callback({ type: 'popup_failed_to_open' });
                return;
              }
              if (clientId.indexOf('denied') === 0) {
                if (cfg.callback) cfg.callback({ error: 'access_denied' });
                return;
              }
              if (cfg.callback) cfg.callback({ access_token: 'test-token' });
            }
          };
        },
        revoke: function (token, done) {
          window.__FORM_MOCK.revoked = token || '';
          if (done) done();
        }
      }
    }
  };

  var nativeFetch = window.fetch.bind(window);
  window.fetch = function (input, init) {
    var url = typeof input === 'string' ? input : (input && input.url) || '';
    if (url.indexOf('googleapis.com') === -1) return nativeFetch(input, init);
    var method = ((init && init.method) || 'GET').toUpperCase();
    var headers = (init && init.headers) || {};
    var auth = headers.Authorization || headers.authorization || '';
    window.__FORM_MOCK.sawAuth = auth === 'Bearer test-token';
    window.__FORM_MOCK.calls.push(method + ' ' + url);
    if (auth !== 'Bearer test-token') {
      return Promise.resolve(jsonResponse(401, {
        error: { code: 401, message: 'Invalid Credentials', status: 'UNAUTHENTICATED' }
      }));
    }
    var parsed = new URL(url);
    var body = {};
    if (init && init.body) {
      try { body = JSON.parse(init.body); } catch (err) { body = {}; }
    }

    if (parsed.hostname === 'www.googleapis.com' && parsed.pathname.indexOf('/drive/v3/files') === 0) {
      if (method === 'GET') {
        var today = window.__FORM_MOCK.hkToday;
        return Promise.resolve(jsonResponse(200, {
          files: [
            { name: '2029 DSE Biology Homework Submission ' + today + 'a' },
            { name: '2029 DSE Biology Homework Submission ' + today + 'a（回應）' },
            { name: '2029 DSE Biology Homework Submission 20261006a' }
          ]
        }));
      }
      var copyMatch = parsed.pathname.match(/\/files\/([^/]+)\/copy$/);
      if (method === 'POST' && copyMatch) {
        var denied = blocked(decodeURIComponent(copyMatch[1]));
        if (denied) return Promise.resolve(denied);
        published[COPY_ID] = false;
        return Promise.resolve(jsonResponse(200, { id: COPY_ID, name: body.name || '' }));
      }
    }

    if (parsed.hostname === 'forms.googleapis.com') {
      if (parsed.pathname.indexOf(':setPublishSettings') !== -1) {
        var publishId = formIdFromPath(parsed.pathname);
        published[publishId] = true;
        window.__FORM_MOCK.published = true;
        return Promise.resolve(jsonResponse(200, { formId: publishId }));
      }
      if (parsed.pathname.indexOf(':batchUpdate') !== -1) {
        window.__FORM_MOCK.lastBatch = body;
        return Promise.resolve(jsonResponse(200, { formId: formIdFromPath(parsed.pathname), replies: [] }));
      }
      if (method === 'GET' && parsed.pathname.indexOf('/v1/forms/') === 0) {
        var id = formIdFromPath(parsed.pathname);
        var problem = blocked(id);
        if (problem) return Promise.resolve(problem);
        if (id !== DEFAULT_FORM && id !== COPY_ID) {
          return Promise.resolve(jsonResponse(404, {
            error: { code: 404, message: 'Requested entity was not found.', status: 'NOT_FOUND' }
          }));
        }
        return Promise.resolve(jsonResponse(200, formResource(id)));
      }
    }

    return Promise.resolve(jsonResponse(404, { error: { code: 404, message: 'mock has no route for ' + url } }));
  };
})();
