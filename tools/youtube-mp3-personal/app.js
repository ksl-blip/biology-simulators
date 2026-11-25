(() => {
  const LS_API = "ytmp3.apiBase";
  const LS_FOLDERS = "ytmp3.savedFolders";
  const LS_SELECTED = "ytmp3.selectedFolder";
  const SS_TOKEN = "ytmp3.token";

  const state = {
    token: sessionStorage.getItem(SS_TOKEN) || "",
    jobId: "",
    file: null,
    filename: "",
    title: "",
    objectUrl: "",
    signedIn: false,
    email: "",
    accessToken: "",
    tokenExpiresAt: 0,
    tokenClient: null,
    pollTimer: 0,
  };

  const $ = (id) => document.getElementById(id);

  function apiBase() {
    const saved = (localStorage.getItem(LS_API) || "").trim();
    if (saved) return saved.replace(/\/+$/, "");
    const cfg = (window.APP_CONFIG && window.APP_CONFIG.API_BASE) || "";
    if (cfg) return String(cfg).replace(/\/+$/, "");
    return "";
  }

  function syncApiBaseInputs() {
    const current = apiBase();
    const appInput = $("api-base");
    const gateInput = $("gate-api-base");
    if (appInput) appInput.value = current;
    if (gateInput) gateInput.value = current;
  }

  function saveApiBaseFrom(inputId, statusId) {
    const input = $(inputId);
    const value = (input ? input.value : "").trim().replace(/\/+$/, "");
    if (value) localStorage.setItem(LS_API, value);
    else localStorage.removeItem(LS_API);
    syncApiBaseInputs();
    if (statusId) {
      showStatus(statusId, "good", value ? "已儲存轉換伺服器網址。" : "已改回預設伺服器網址。");
    }
    return value;
  }

  function apiUrl(path) {
    const base = apiBase();
    return (base || "") + path;
  }

  function showStatus(id, kind, text) {
    const el = $(id);
    if (!el) return;
    if (!text) {
      el.hidden = true;
      el.textContent = "";
      el.className = "status";
      return;
    }
    el.hidden = false;
    el.className = "status status-" + kind;
    el.textContent = text;
  }

  function setProgress(pct, visible) {
    const wrap = $("progress-wrap");
    const bar = $("progress-bar");
    if (visible) wrap.classList.remove("hidden");
    else wrap.classList.add("hidden");
    bar.style.width = Math.max(0, Math.min(100, pct || 0)) + "%";
  }

  function folders() {
    try {
      const raw = JSON.parse(localStorage.getItem(LS_FOLDERS) || "[]");
      return Array.isArray(raw) ? raw : [];
    } catch {
      return [];
    }
  }

  function saveFolders(list) {
    localStorage.setItem(LS_FOLDERS, JSON.stringify(list));
  }

  function parseFolderId(raw) {
    const text = String(raw || "").trim();
    if (!text) return "";
    const folderMatch = text.match(/\/folders\/([a-zA-Z0-9_-]+)/);
    if (folderMatch) return folderMatch[1];
    const idMatch = text.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    if (idMatch) return idMatch[1];
    if (/^[a-zA-Z0-9_-]{10,}$/.test(text)) return text;
    return "";
  }

  function refreshFolderSelect() {
    const sel = $("folder-select");
    const list = folders();
    const prev = localStorage.getItem(LS_SELECTED) || sel.value || "";
    sel.innerHTML = '<option value="">— 請選擇已儲存的資料夾 —</option>';
    for (const f of list) {
      const opt = document.createElement("option");
      opt.value = f.id;
      opt.textContent = f.name ? f.name + "（" + f.id.slice(0, 8) + "…）" : f.id;
      sel.appendChild(opt);
    }
    if (prev && list.some((x) => x.id === prev)) sel.value = prev;
    updateUploadEnabled();
  }

  function updateUploadEnabled() {
    $("btn-upload").disabled = !(state.file && $("folder-select").value);
  }

  function formatDuration(sec) {
    if (sec == null || !isFinite(sec)) return "";
    const n = Math.round(Number(sec));
    const m = Math.floor(n / 60);
    const s = n % 60;
    return m + ":" + String(s).padStart(2, "0");
  }

  function formatSize(bytes) {
    if (!bytes) return "";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  }

  function revokeObjectUrl() {
    if (state.objectUrl) {
      URL.revokeObjectURL(state.objectUrl);
      state.objectUrl = "";
    }
  }

  async function api(path, options) {
    const opts = options || {};
    const headers = Object.assign({}, opts.headers || {});
    if (opts.body && !headers["Content-Type"]) headers["Content-Type"] = "application/json";
    if (state.token) headers.Authorization = "Bearer " + state.token;
    const res = await fetch(apiUrl(path), Object.assign({}, opts, { headers }));
    const type = res.headers.get("content-type") || "";
    if (opts.blob) {
      if (!res.ok) {
        let msg = "請求失敗（HTTP " + res.status + "）";
        try {
          const data = await res.json();
          if (data && data.error) msg = data.error;
        } catch {}
        const err = new Error(msg);
        err.status = res.status;
        throw err;
      }
      return res.blob();
    }
    let data = {};
    if (type.includes("application/json")) {
      data = await res.json();
    } else {
      const text = await res.text();
      data = text ? { error: text } : {};
    }
    if (!res.ok) {
      const err = new Error((data && data.error) || "請求失敗（HTTP " + res.status + "）");
      err.status = res.status;
      throw err;
    }
    return data;
  }

  async function unlock(password) {
    const data = await api("/api/login", {
      method: "POST",
      body: JSON.stringify({ password }),
    });
    state.token = data.token;
    sessionStorage.setItem(SS_TOKEN, data.token);
    $("gate").classList.add("hidden");
    $("app").classList.remove("hidden");
  }

  function lock() {
    state.token = "";
    sessionStorage.removeItem(SS_TOKEN);
    if (state.pollTimer) {
      clearTimeout(state.pollTimer);
      state.pollTimer = 0;
    }
    $("app").classList.add("hidden");
    $("gate").classList.remove("hidden");
    $("password").value = "";
    $("password").focus();
  }

  async function tryRestoreSession() {
    if (!state.token) return false;
    try {
      await api("/api/health");
      // Token is validated on convert; health is open. Probe a dummy job path? Skip.
      $("gate").classList.add("hidden");
      $("app").classList.remove("hidden");
      return true;
    } catch {
      state.token = "";
      sessionStorage.removeItem(SS_TOKEN);
      return false;
    }
  }

  async function startConvert(url) {
    if (state.pollTimer) {
      clearTimeout(state.pollTimer);
      state.pollTimer = 0;
    }
    showStatus("convert-status", "info", "正在讀取影片資料…");
    setProgress(4, true);
    $("convert-meta").textContent = "";
    $("btn-convert").disabled = true;
    try {
      const job = await api("/api/convert", {
        method: "POST",
        body: JSON.stringify({ url }),
      });
      state.jobId = job.jobId;
      $("convert-meta").textContent = [job.title, formatDuration(job.duration)]
        .filter(Boolean)
        .join(" · ");
      showStatus("convert-status", "info", job.stage || "開始轉換…");
      setProgress(job.progress || 8, true);
      await pollJob();
    } catch (err) {
      if (err.status === 401) {
        showStatus("convert-status", "bad", "登入已過期，請重新輸入通行密碼。");
        lock();
        showStatus("gate-status", "bad", "登入已過期，請重新輸入通行密碼。");
      } else {
        showStatus("convert-status", "bad", err.message || "轉換失敗。");
        setProgress(0, false);
      }
    } finally {
      $("btn-convert").disabled = false;
    }
  }

  async function pollJob() {
    try {
      const job = await api("/api/jobs/" + state.jobId);
      if (job.title) {
        $("convert-meta").textContent = [job.title, formatDuration(job.duration)]
          .filter(Boolean)
          .join(" · ");
      }
      setProgress(job.progress || 0, true);
      if (job.status === "done") {
        showStatus("convert-status", "info", "正在載入 MP3…");
        await loadFile(job);
        return;
      }
      if (job.status === "error") {
        showStatus("convert-status", "bad", job.error || "轉換失敗。");
        setProgress(0, false);
        return;
      }
      showStatus("convert-status", "info", (job.stage || "轉換中") + "（" + Math.round(job.progress || 0) + "%）");
      state.pollTimer = setTimeout(pollJob, 1000);
    } catch (err) {
      if (err.status === 401) {
        lock();
        showStatus("gate-status", "bad", "登入已過期，請重新輸入通行密碼。");
        return;
      }
      showStatus("convert-status", "bad", err.message || "無法查詢轉換進度。");
    }
  }

  async function loadFile(job) {
    const blob = await api("/api/jobs/" + state.jobId + "/file", { blob: true });
    const file = new File([blob], job.filename || "audio.mp3", { type: "audio/mpeg" });
    revokeObjectUrl();
    state.file = file;
    state.filename = file.name;
    state.title = job.title || file.name;
    state.objectUrl = URL.createObjectURL(file);
    $("player-card").classList.remove("hidden");
    $("track-title").textContent = state.title;
    $("track-meta").textContent = [formatDuration(job.duration), formatSize(job.size || file.size)]
      .filter(Boolean)
      .join(" · ");
    const player = $("player");
    player.src = state.objectUrl;
    showStatus("convert-status", "good", "已轉成 MP3，可以播放、下載或上傳到 Drive。");
    setProgress(100, true);
    updateUploadEnabled();
  }

  function downloadMp3() {
    if (!state.objectUrl) return;
    const a = document.createElement("a");
    a.href = state.objectUrl;
    a.download = state.filename || "audio.mp3";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      if (document.querySelector('script[src="' + src + '"]')) {
        resolve();
        return;
      }
      const s = document.createElement("script");
      s.src = src;
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error("無法載入 Google 登入元件。"));
      document.head.appendChild(s);
    });
  }

  function clientId() {
    return ((window.APP_CONFIG && window.APP_CONFIG.CLIENT_ID) || "").trim();
  }

  function scopes() {
    return ((window.APP_CONFIG && window.APP_CONFIG.SCOPES) || "https://www.googleapis.com/auth/drive").trim();
  }

  async function initGoogle() {
    if (!clientId()) return;
    await loadScript("https://accounts.google.com/gsi/client");
    state.tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: clientId(),
      scope: scopes(),
      callback: () => {},
    });
  }

  function requestGoogleToken(promptConsent) {
    return new Promise((resolve, reject) => {
      if (!state.tokenClient) {
        reject(new Error("Google 登入尚未準備好。請用 GitHub Pages 網址開啟呢頁再試。"));
        return;
      }
      state.tokenClient.callback = async (resp) => {
        if (resp.error) {
          reject(new Error(resp.error_description || resp.error));
          return;
        }
        state.accessToken = resp.access_token;
        const expiresIn = Number(resp.expires_in) || 3600;
        state.tokenExpiresAt = Date.now() + expiresIn * 1000;
        try {
          const res = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
            headers: { Authorization: "Bearer " + state.accessToken },
          });
          const info = await res.json();
          state.email = info.email || "";
        } catch {
          state.email = "";
        }
        state.signedIn = true;
        updateDriveUser();
        resolve();
      };
      const opts = {};
      if (promptConsent || !state.accessToken) opts.prompt = "consent";
      state.tokenClient.requestAccessToken(opts);
    });
  }

  async function ensureDriveToken() {
    if (state.signedIn && state.accessToken && Date.now() < state.tokenExpiresAt - 5000) {
      return state.accessToken;
    }
    await requestGoogleToken(false);
    return state.accessToken;
  }

  function updateDriveUser() {
    if (state.signedIn) {
      $("drive-user").textContent = state.email
        ? "已登入：" + state.email
        : "已登入 Google。";
      $("btn-drive-login").classList.add("hidden");
      $("btn-drive-logout").classList.remove("hidden");
    } else {
      $("drive-user").textContent = "尚未登入 Google。登入後可以將轉好嘅 MP3 上傳到已儲存嘅資料夾。";
      $("btn-drive-login").classList.remove("hidden");
      $("btn-drive-logout").classList.add("hidden");
    }
  }

  function googleSignOut() {
    const token = state.accessToken;
    state.signedIn = false;
    state.email = "";
    state.accessToken = "";
    state.tokenExpiresAt = 0;
    if (token && window.google && google.accounts && google.accounts.oauth2) {
      google.accounts.oauth2.revoke(token, () => {});
    }
    updateDriveUser();
  }

  async function driveFetch(url, options) {
    const token = await ensureDriveToken();
    const res = await fetch(url, Object.assign({}, options, {
      headers: Object.assign({ Authorization: "Bearer " + token }, (options && options.headers) || {}),
    }));
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = (data.error && data.error.message) || "Google Drive 請求失敗（HTTP " + res.status + "）";
      throw new Error(msg);
    }
    return data;
  }

  async function saveFolder() {
    const id = parseFolderId($("folder-url").value);
    if (!id) {
      showStatus("drive-status", "bad", "無法辨識資料夾連結。請貼上類似 https://drive.google.com/drive/folders/XXXX 的網址，或直接貼上資料夾 ID。");
      return;
    }
    showStatus("drive-status", "info", "正在讀取資料夾資訊…");
    let name = "";
    try {
      const meta = await driveFetch(
        "https://www.googleapis.com/drive/v3/files/" +
          encodeURIComponent(id) +
          "?supportsAllDrives=true&fields=id,name,mimeType,trashed"
      );
      if (meta.trashed) throw new Error("呢個資料夾已喺回收筒。");
      if (meta.mimeType && meta.mimeType !== "application/vnd.google-apps.folder") {
        throw new Error("呢個 ID 唔係資料夾。");
      }
      name = meta.name || id;
    } catch (err) {
      showStatus("drive-status", "bad", err.message || "無法讀取資料夾。請先登入 Google。");
      return;
    }
    const list = folders().filter((f) => f.id !== id);
    list.unshift({ id, name, savedAt: Date.now() });
    saveFolders(list);
    localStorage.setItem(LS_SELECTED, id);
    $("folder-url").value = "";
    refreshFolderSelect();
    showStatus("drive-status", "good", "已儲存「" + name + "」。");
  }

  function deleteFolder() {
    const id = $("folder-select").value;
    if (!id) {
      showStatus("drive-status", "warn", "請先選擇要刪除嘅資料夾。");
      return;
    }
    if (!confirm("確定刪除此資料夾登記？（不會刪除 Google Drive 上的實際資料夾）")) return;
    saveFolders(folders().filter((f) => f.id !== id));
    if (localStorage.getItem(LS_SELECTED) === id) localStorage.removeItem(LS_SELECTED);
    refreshFolderSelect();
    showStatus("drive-status", "good", "已從清單刪除，Drive 上的資料夾仍在。");
  }

  async function uploadToDrive() {
    if (!state.file) {
      showStatus("drive-status", "warn", "請先轉換一條影片。");
      return;
    }
    const folderId = $("folder-select").value;
    if (!folderId) {
      showStatus("drive-status", "warn", "請選擇已儲存的資料夾。");
      return;
    }
    $("btn-upload").disabled = true;
    $("drive-link").hidden = true;
    showStatus("drive-status", "info", "正在上傳到 Google Drive…");
    try {
      const token = await ensureDriveToken();
      const metadata = {
        name: state.filename || state.file.name,
        parents: [folderId],
        mimeType: "audio/mpeg",
      };
      const start = await fetch(
        "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true",
        {
          method: "POST",
          headers: {
            Authorization: "Bearer " + token,
            "Content-Type": "application/json; charset=UTF-8",
            "X-Upload-Content-Type": "audio/mpeg",
            "X-Upload-Content-Length": String(state.file.size),
          },
          body: JSON.stringify(metadata),
        }
      );
      if (!start.ok) {
        let msg = "無法開始上傳（HTTP " + start.status + "）";
        try {
          const errBody = await start.json();
          if (errBody.error && errBody.error.message) msg = errBody.error.message;
        } catch {}
        throw new Error(msg);
      }
      const location = start.headers.get("Location");
      if (!location) throw new Error("Google Drive 未傳回上傳位置。");
      const put = await fetch(location, {
        method: "PUT",
        headers: {
          Authorization: "Bearer " + token,
          "Content-Type": "audio/mpeg",
          "Content-Length": String(state.file.size),
        },
        body: state.file,
      });
      const data = await put.json().catch(() => ({}));
      if (!put.ok) {
        throw new Error((data.error && data.error.message) || "上傳失敗（HTTP " + put.status + "）");
      }
      const link = data.webViewLink ||
        (data.id ? "https://drive.google.com/file/d/" + data.id + "/view" : "");
      showStatus("drive-status", "good", "已上傳「" + (data.name || state.filename) + "」。");
      if (link) {
        $("drive-link").hidden = false;
        $("drive-link").innerHTML = 'Drive 檔案：<a class="link" href="' + link + '" target="_blank" rel="noopener">開啟</a>';
      }
    } catch (err) {
      showStatus("drive-status", "bad", err.message || "上傳失敗。");
    } finally {
      updateUploadEnabled();
    }
  }

  function bind() {
    $("gate-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      $("gate-submit").disabled = true;
      showStatus("gate-status", "info", "核對密碼中…");
      try {
        const typed = ($("gate-api-base").value || "").trim().replace(/\/+$/, "");
        if (typed) {
          localStorage.setItem(LS_API, typed);
          syncApiBaseInputs();
        }
        try {
          await api("/api/health");
        } catch (connErr) {
          throw new Error("轉換伺服器連線失敗。請喺上方「轉換伺服器網址」填上有效嘅 HTTPS 網址並撳「儲存」，或稍後再試。");
        }
        await unlock($("password").value);
        showStatus("gate-status");
      } catch (err) {
        showStatus("gate-status", "bad", err.message || "無法進入。");
      } finally {
        $("gate-submit").disabled = false;
      }
    });
    $("btn-lock").addEventListener("click", lock);
    $("convert-form").addEventListener("submit", (e) => {
      e.preventDefault();
      startConvert($("yt-url").value.trim());
    });
    $("btn-download").addEventListener("click", downloadMp3);
    $("btn-save-gate-api").addEventListener("click", () => {
      saveApiBaseFrom("gate-api-base", "gate-status");
    });
    $("btn-save-api").addEventListener("click", () => {
      saveApiBaseFrom("api-base", "convert-status");
    });
    $("btn-drive-login").addEventListener("click", async () => {
      try {
        await requestGoogleToken(true);
        showStatus("drive-status", "good", "已登入 Google。");
      } catch (err) {
        showStatus("drive-status", "bad", err.message || "登入失敗。若喺臨時網址開啟，請改用正式 GitHub Pages 網址。");
      }
    });
    $("btn-drive-logout").addEventListener("click", googleSignOut);
    $("btn-save-folder").addEventListener("click", saveFolder);
    $("btn-delete-folder").addEventListener("click", deleteFolder);
    $("folder-select").addEventListener("change", () => {
      const id = $("folder-select").value;
      if (id) localStorage.setItem(LS_SELECTED, id);
      else localStorage.removeItem(LS_SELECTED);
      updateUploadEnabled();
    });
    $("btn-upload").addEventListener("click", uploadToDrive);
  }

  async function init() {
    bind();
    refreshFolderSelect();
    syncApiBaseInputs();
    initGoogle().catch((err) => {
      console.warn(err);
    });
    if (state.token) {
      try {
        await api("/api/health");
        $("gate").classList.add("hidden");
        $("app").classList.remove("hidden");
      } catch {
        state.token = "";
        sessionStorage.removeItem(SS_TOKEN);
      }
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
