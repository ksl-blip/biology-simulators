(() => {
  const SUPPORTED = new Set([
    ".docx", ".doc", ".xlsx", ".xls", ".pptx", ".ppt",
    ".pdf", ".zip", ".odt", ".ods", ".odp",
  ]);

  const dropzone = document.getElementById("dropzone");
  const fileInput = document.getElementById("fileInput");
  const fileList = document.getElementById("fileList");
  const fileListSection = document.getElementById("fileListSection");
  const clearBtn = document.getElementById("clearBtn");
  const convertBtn = document.getElementById("convertBtn");
  const downloadBtn = document.getElementById("downloadBtn");
  const progressSection = document.getElementById("progressSection");
  const progressFill = document.getElementById("progressFill");
  const progressText = document.getElementById("progressText");
  const resultList = document.getElementById("resultList");
  const engineBadge = document.getElementById("engineBadge");

  /** @type {File[]} */
  let files = [];

  function extOf(name) {
    const i = name.lastIndexOf(".");
    return i >= 0 ? name.slice(i).toLowerCase() : "";
  }

  function extClass(ext) {
    if (ext === ".zip") return "zip";
    if (ext === ".pdf") return "pdf";
    if (ext === ".xlsx" || ext === ".xls" || ext === ".ods") return "sheet";
    if (ext === ".pptx" || ext === ".ppt" || ext === ".odp") return "slides";
    return "";
  }

  function formatSize(n) {
    if (n < 1024) return n + " B";
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + " KB";
    return (n / (1024 * 1024)).toFixed(1) + " MB";
  }

  function renderFiles() {
    fileList.innerHTML = "";
    if (!files.length) {
      fileListSection.classList.add("hidden");
      convertBtn.disabled = true;
      return;
    }
    fileListSection.classList.remove("hidden");
    convertBtn.disabled = false;
    files.forEach((f, idx) => {
      const ext = extOf(f.name);
      const li = document.createElement("li");
      li.className = "file-item";
      li.innerHTML = `
        <span class="ext-tag ${extClass(ext)}">${ext.slice(1) || "?"}</span>
        <div class="meta">
          <div class="name" title="${escapeAttr(f.name)}">${escapeHtml(f.name)}</div>
          <div class="size">${formatSize(f.size)}</div>
        </div>
        <button type="button" class="remove" data-idx="${idx}" aria-label="移除">✕</button>
      `;
      fileList.appendChild(li);
    });
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
  function escapeAttr(s) {
    return escapeHtml(s).replace(/'/g, "&#39;");
  }

  function addFiles(list) {
    const rejected = [];
    for (const f of list) {
      const ext = extOf(f.name);
      if (!SUPPORTED.has(ext)) {
        rejected.push(f.name);
        continue;
      }
      // de-dupe by name+size
      if (files.some((x) => x.name === f.name && x.size === f.size)) continue;
      files.push(f);
    }
    if (rejected.length) {
      alert(
        "以下檔案格式唔支援，已略過：\n" +
          rejected.slice(0, 8).join("\n") +
          (rejected.length > 8 ? `\n…另有 ${rejected.length - 8} 個` : "")
      );
    }
    downloadBtn.classList.add("hidden");
    renderFiles();
  }

  dropzone.addEventListener("click", () => fileInput.click());
  dropzone.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      fileInput.click();
    }
  });
  fileInput.addEventListener("change", () => {
    addFiles(fileInput.files || []);
    fileInput.value = "";
  });

  ["dragenter", "dragover"].forEach((ev) => {
    dropzone.addEventListener(ev, (e) => {
      e.preventDefault();
      dropzone.classList.add("dragover");
    });
  });
  ["dragleave", "drop"].forEach((ev) => {
    dropzone.addEventListener(ev, (e) => {
      e.preventDefault();
      dropzone.classList.remove("dragover");
    });
  });
  dropzone.addEventListener("drop", (e) => {
    addFiles(e.dataTransfer?.files || []);
  });

  fileList.addEventListener("click", (e) => {
    const btn = e.target.closest(".remove");
    if (!btn) return;
    const idx = Number(btn.dataset.idx);
    files.splice(idx, 1);
    renderFiles();
  });

  clearBtn.addEventListener("click", () => {
    files = [];
    renderFiles();
    progressSection.classList.add("hidden");
    downloadBtn.classList.add("hidden");
  });

  function selectedMode() {
    const el = document.querySelector('input[name="mode"]:checked');
    return el ? el.value : "merge";
  }

  convertBtn.addEventListener("click", async () => {
    if (!files.length) return;
    convertBtn.disabled = true;
    downloadBtn.classList.add("hidden");
    progressSection.classList.remove("hidden");
    resultList.innerHTML = "";
    progressFill.style.width = "12%";
    progressText.textContent = "上載同轉換中…（LibreOffice 處理緊，請稍候）";

    const fd = new FormData();
    fd.append("mode", selectedMode());
    files.forEach((f) => fd.append("files", f, f.name));

    // Fake progress while waiting
    let fake = 12;
    const timer = setInterval(() => {
      fake = Math.min(fake + Math.random() * 8, 88);
      progressFill.style.width = fake + "%";
    }, 600);

    try {
      const res = await fetch("/api/convert", { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
      clearInterval(timer);

      if (!res.ok || !data.ok) {
        progressFill.style.width = "100%";
        progressText.textContent = data.error || "轉換失敗";
        (data.results || []).forEach(renderResult);
        if (!data.results?.length) {
          resultList.innerHTML = `<li class="result-item err"><span class="status">失敗</span><div class="detail"><div class="n">${escapeHtml(data.error || "未知錯誤")}</div></div></li>`;
        }
        convertBtn.disabled = false;
        return;
      }

      progressFill.style.width = "100%";
      progressText.textContent =
        data.mode === "merge"
          ? `完成！已合併 ${data.count} 個 PDF`
          : `完成！已產生 ${data.count} 個 PDF（ZIP）`;

      (data.results || []).forEach(renderResult);

      downloadBtn.href = data.download_url;
      downloadBtn.download = data.download_name || "download";
      downloadBtn.textContent =
        data.mode === "merge" ? "下載合併 PDF" : "下載 ZIP";
      downloadBtn.classList.remove("hidden");
    } catch (err) {
      clearInterval(timer);
      progressFill.style.width = "100%";
      progressText.textContent = "網絡或伺服器錯誤：" + (err.message || err);
    } finally {
      convertBtn.disabled = files.length === 0;
    }
  });

  function renderResult(r) {
    const ok = r.status === "ok";
    const li = document.createElement("li");
    li.className = "result-item " + (ok ? "ok" : "err");
    li.innerHTML = `
      <span class="status">${ok ? "成功" : "失敗"}</span>
      <div class="detail">
        <div class="n">${escapeHtml(r.name || "")}</div>
        <div class="m">${escapeHtml(r.message || "")}</div>
      </div>
    `;
    resultList.appendChild(li);
  }

  // Health check
  fetch("/api/health")
    .then((r) => r.json())
    .then((d) => {
      if (d.ok) {
        engineBadge.textContent = "LibreOffice 就緒";
        engineBadge.className = "badge ok";
        engineBadge.title = d.version || "";
      } else {
        engineBadge.textContent = "引擎不可用";
        engineBadge.className = "badge bad";
      }
    })
    .catch(() => {
      engineBadge.textContent = "伺服器未連接";
      engineBadge.className = "badge bad";
    });
})();
