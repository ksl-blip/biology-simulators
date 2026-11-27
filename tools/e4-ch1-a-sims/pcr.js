/* PCR temperature cycle + N × 2^n. Figure 1 of the E4 Ch.1 paper A quiz. */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.E4Pcr = api;
  if (typeof document !== "undefined" && document.getElementById("pcr-app")) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", function () { api.mount(); });
    } else {
      api.mount();
    }
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var GRAPH = [
    { t: 0, temp: 25 },
    { t: 0.15, temp: 25 },
    { t: 0.24, temp: 95 },
    { t: 1.0, temp: 95 },
    { t: 1.07, temp: 55 },
    { t: 1.5, temp: 55 },
    { t: 1.58, temp: 72 },
    { t: 3.0, temp: 72 }
  ];

  var POSES = [
    { t: 0.08, id: "start", label: "起始 · 約 25°C" },
    { t: 0.62, id: "P", label: "P · 變性 · 95°C" },
    { t: 1.28, id: "Q", label: "Q · 退火 · 55°C" },
    { t: 2.3, id: "R", label: "R · 延伸 · 72°C" }
  ];

  var SUP = "⁰¹²³⁴⁵⁶⁷⁸⁹";

  function copies(startN, cycles) {
    return startN * Math.pow(2, cycles);
  }

  function sup(n) {
    return String(n).split("").map(function (ch) {
      return SUP[Number(ch)] || ch;
    }).join("");
  }

  function tempAt(t) {
    if (t <= GRAPH[0].t) return GRAPH[0].temp;
    if (t >= GRAPH[GRAPH.length - 1].t) return GRAPH[GRAPH.length - 1].temp;
    var i, a, b, u;
    for (i = 1; i < GRAPH.length; i++) {
      if (t <= GRAPH[i].t) {
        a = GRAPH[i - 1];
        b = GRAPH[i];
        u = (t - a.t) / (b.t - a.t);
        return a.temp + (b.temp - a.temp) * u;
      }
    }
    return 72;
  }

  function phaseAt(t) {
    if (t < 0.2) return "start";
    if (t < 1.02) return "P";
    if (t < 1.54) return "Q";
    return "R";
  }

  function selfCheck() {
    var errs = [];
    function eq(name, got, want) {
      if (got !== want) errs.push(name + " got " + got + " want " + want);
    }
    eq("c10x6", copies(10, 6), 640);
    eq("c10x0", copies(10, 0), 10);
    eq("c1x3", copies(1, 3), 8);
    eq("c2x4", copies(2, 4), 32);
    if (Math.abs(tempAt(0.6) - 95) > 0.2) errs.push("temp P " + tempAt(0.6));
    if (Math.abs(tempAt(1.25) - 55) > 0.2) errs.push("temp Q " + tempAt(1.25));
    if (Math.abs(tempAt(2.2) - 72) > 0.2) errs.push("temp R " + tempAt(2.2));
    if (Math.abs(tempAt(0.05) - 25) > 0.2) errs.push("temp start");
    if (phaseAt(0.6) !== "P" || phaseAt(1.25) !== "Q" || phaseAt(2.2) !== "R") errs.push("phase");
    if (phaseAt(0.05) !== "start") errs.push("phase start");
    return errs;
  }

  function mount() {
    var $ = function (id) { return document.getElementById(id); };
    var reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var playing = false;
    var playT = 0.08;
    var completed = 0;
    var pose = 0;
    var raf = 0;
    var timerKind = "";
    var lastTs = 0;
    var secondsPerCycle = 5.4;

    function startN() { return Number($("startN").value); }
    function targetN() { return Number($("targetCycles").value); }

    function gx(t) { return 78 + (t / 3) * 500; }
    function gy(temp) { return 36 + ((100 - temp) / 80) * 280; }

    function graphPath(until) {
      var pts = [];
      var t, step = 0.02;
      for (t = 0; t <= until + 0.0001; t += step) {
        pts.push(gx(Math.min(t, 3)).toFixed(1) + "," + gy(tempAt(Math.min(t, 3))).toFixed(1));
      }
      return pts.join(" ");
    }

    function drawGraph() {
      var temp = tempAt(playT);
      var html = [];
      html.push('<rect x="58" y="24" width="540" height="308" fill="#fff" stroke="#e0d2c0" rx="8"/>');
      var g;
      for (g = 20; g <= 100; g += 10) {
        html.push('<line x1="78" y1="' + gy(g) + '" x2="578" y2="' + gy(g) + '" stroke="#e7e5e4" stroke-width="1"/>');
        html.push('<text x="72" y="' + (gy(g) + 4) + '" text-anchor="end" font-size="11" fill="#5a493c">' + g + "</text>");
      }
      var m;
      for (m = 0; m <= 3; m += 0.5) {
        html.push('<line x1="' + gx(m) + '" y1="36" x2="' + gx(m) + '" y2="316" stroke="#f5f5f4" stroke-width="1"/>');
        html.push('<text x="' + gx(m) + '" y="334" text-anchor="middle" font-size="11" fill="#5a493c">' + m.toFixed(1) + "</text>");
      }
      html.push('<text x="40" y="176" text-anchor="middle" font-size="12" fill="#5a493c" transform="rotate(-90 40 176)">溫度（°C）</text>');
      html.push('<text x="328" y="358" text-anchor="middle" font-size="12" fill="#5a493c">時間（分鐘）</text>');
      html.push('<polyline points="' + graphPath(3) + '" fill="none" stroke="#86efac" stroke-width="3"/>');
      html.push('<polyline points="' + graphPath(playT) + '" fill="none" stroke="#166534" stroke-width="3.5"/>');
      html.push('<circle cx="' + gx(playT) + '" cy="' + gy(temp) + '" r="7" fill="#b42318" stroke="#fff" stroke-width="2"/>');
      html.push('<text x="' + gx(0.62) + '" y="' + (gy(95) - 14) + '" text-anchor="middle" font-size="14" font-weight="800" fill="#166534">P　95°C</text>');
      html.push('<text x="' + gx(1.28) + '" y="' + (gy(55) + 22) + '" text-anchor="middle" font-size="14" font-weight="800" fill="#1d4ed8">Q　55°C</text>');
      html.push('<text x="' + gx(2.25) + '" y="' + (gy(72) - 14) + '" text-anchor="middle" font-size="14" font-weight="800" fill="#b45309">R　72°C</text>');
      $("graph").innerHTML = html.join("");
    }

    function strand(x1, x2, y, color, width) {
      return '<line x1="' + x1 + '" y1="' + y + '" x2="' + x2 + '" y2="' + y + '" stroke="' + color + '" stroke-width="' + (width || 5) + '" stroke-linecap="round"/>';
    }

    function drawDNA() {
      var t = playT;
      var phase = phaseAt(t);
      var sep = 0;
      if (t >= 0.18 && t < 0.42) sep = ((t - 0.18) / 0.24) * 46;
      else if (t >= 0.42 && t < 2.82) sep = 46;
      else if (t >= 2.82) sep = 46 * (1 - (t - 2.82) / 0.18);
      sep = Math.max(0, Math.min(46, sep));

      var yTop = 140 - sep;
      var yBot = 186 + sep;
      var html = [];
      var primerIn = 0;
      if (t >= 1.02 && t < 1.24) primerIn = (t - 1.02) / 0.22;
      else if (t >= 1.24 && t < 2.9) primerIn = 1;
      var ext = 0;
      if (t >= 1.58 && t < 2.85) ext = (t - 1.58) / 1.2;
      else if (t >= 2.85 && t < 2.95) ext = 1;
      ext = Math.max(0, Math.min(1, ext));

      html.push('<text x="320" y="28" text-anchor="middle" font-size="15" font-weight="800" fill="#2b241c">' + phaseTitle(phase) + "</text>");

      if (t >= 2.9 || (completed > 0 && t < 0.16)) {
        html.push(duplex(150, 120, "產物 1"));
        html.push(duplex(150, 250, "產物 2"));
        html.push('<text x="320" y="360" text-anchor="middle" font-size="13" font-weight="800" fill="#14532d">一個循環完結：這批目標分子 ×2</text>');
      } else if (phase === "start") {
        html.push(helixSvg());
      } else {
        var bonds = sep < 20;
        var i, x;
        if (bonds) {
          for (i = 0; i < 8; i++) {
            x = 120 + i * 52;
            html.push('<line x1="' + x + '" y1="' + (yTop + 4) + '" x2="' + x + '" y2="' + (yBot - 4) + '" stroke="#64748b" stroke-width="1.6"/>');
          }
        } else if (phase === "P") {
          html.push('<g class="' + (reduced ? "" : "anim-heat") + '">');
          html.push('<text x="320" y="' + ((yTop + yBot) / 2 + 4) + '" text-anchor="middle" font-size="13" font-weight="800" fill="#b42318">氫鍵斷裂</text>');
          html.push("</g>");
        }
        html.push(strand(90, 560, yTop, "#2563eb", 5));
        html.push(strand(90, 560, yBot, "#db2777", 5));
        html.push('<text x="78" y="' + (yTop + 4) + '" text-anchor="end" font-size="11" fill="#1e3a8a">3\'</text>');
        html.push('<text x="572" y="' + (yTop + 4) + '" font-size="11" fill="#1e3a8a">5\'</text>');
        html.push('<text x="78" y="' + (yBot + 4) + '" text-anchor="end" font-size="11" fill="#9d174d">5\'</text>');
        html.push('<text x="572" y="' + (yBot + 4) + '" font-size="11" fill="#9d174d">3\'</text>');
        html.push('<text x="320" y="' + (yTop - 10) + '" text-anchor="middle" font-size="12" font-weight="700" fill="#1e3a8a">模板</text>');
        html.push('<text x="320" y="' + (yBot + 18) + '" text-anchor="middle" font-size="12" font-weight="700" fill="#9d174d">模板</text>');

        if (primerIn > 0) {
          var shift = (1 - primerIn) * 70;
          var topPrimerX = 400 + shift;
          var botPrimerX = 100 - shift;
          html.push('<g>');
          html.push(strand(topPrimerX, topPrimerX + 70, yTop + 10, "#d97706", 7));
          html.push('<polygon points="' + (topPrimerX - 2) + "," + (yTop + 10) + " " + (topPrimerX - 14) + "," + (yTop + 4) + " " + (topPrimerX - 14) + "," + (yTop + 16) + '" fill="#d97706"/>');
          html.push('<text x="' + (topPrimerX + 28) + '" y="' + (yTop + 28) + '" text-anchor="middle" font-size="11" font-weight="800" fill="#92400e">引物</text>');
          html.push(strand(botPrimerX, botPrimerX + 70, yBot - 10, "#d97706", 7));
          html.push('<polygon points="' + (botPrimerX + 72) + "," + (yBot - 10) + " " + (botPrimerX + 84) + "," + (yBot - 16) + " " + (botPrimerX + 84) + "," + (yBot - 4) + '" fill="#d97706"/>');
          html.push('<text x="' + (botPrimerX + 40) + '" y="' + (yBot - 18) + '" text-anchor="middle" font-size="11" font-weight="800" fill="#92400e">引物</text>');
          html.push("</g>");
          if (primerIn > 0.85 && ext < 0.05) {
            html.push('<text x="180" y="78" font-size="12" font-weight="800" fill="#14532d">A–T　G–C　互補結合</text>');
            html.push('<text x="180" y="96" font-size="12" fill="#5a493c">引物標示擴增區域的兩端</text>');
          }
        }

        if (ext > 0) {
          var growTop = 70 + ext * 250;
          var growBot = 70 + ext * 250;
          html.push(strand(400 - growTop + 70, 470, yTop + 10, "#16a34a", 5));
          html.push(strand(170, 170 + growBot, yBot - 10, "#16a34a", 5));
          var polX = 400 - growTop + 70;
          var polY = yTop + 10;
          html.push('<ellipse cx="' + polX + '" cy="' + polY + '" rx="26" ry="14" fill="#7c3aed"/>');
          html.push('<text x="' + polX + '" y="' + (polY + 4) + '" text-anchor="middle" font-size="10" font-weight="800" fill="#fff">Pol</text>');
          html.push('<text x="320" y="78" text-anchor="middle" font-size="12" font-weight="800" fill="#14532d">游離核苷酸從引物的 3\' 端接上（5\'→3\'）</text>');
          html.push('<text x="320" y="360" text-anchor="middle" font-size="12" font-weight="700" fill="#5b21b6">耐熱 DNA 聚合酶在 95°C 仍有活性，毋須每循環重新加入</text>');
        }
      }
      $("scene").innerHTML = html.join("");
    }

    function helixSvg() {
      var ox = 90, oy = 190, len = 440, amp = 26, turns = 3.5, n = 70;
      var pts1 = [], pts2 = [], i, u, x, y1, y2, html = "";
      for (i = 0; i <= n; i++) {
        u = i / n;
        x = ox + u * len;
        y1 = oy + Math.sin(u * turns * Math.PI * 2) * amp;
        y2 = oy + Math.sin(u * turns * Math.PI * 2 + Math.PI) * amp;
        pts1.push(x.toFixed(1) + "," + y1.toFixed(1));
        pts2.push(x.toFixed(1) + "," + y2.toFixed(1));
        if (i % 5 === 0) {
          html += '<line x1="' + x.toFixed(1) + '" y1="' + y1.toFixed(1) + '" x2="' + x.toFixed(1) + '" y2="' + y2.toFixed(1) + '" stroke="#94a3b8" stroke-width="1.5"/>';
        }
      }
      html += '<polyline points="' + pts1.join(" ") + '" fill="none" stroke="#2563eb" stroke-width="4" stroke-linecap="round"/>';
      html += '<polyline points="' + pts2.join(" ") + '" fill="none" stroke="#db2777" stroke-width="4" stroke-linecap="round"/>';
      html += '<text x="320" y="260" text-anchor="middle" font-size="14" font-weight="800" fill="#334155">雙鏈 · 鹼基對以氫鍵相連</text>';
      return html;
    }

    function duplex(x, y, label) {
      var html = '<g>';
      var i;
      for (i = 0; i < 7; i++) {
        html += '<line x1="' + (x + 20 + i * 28) + '" y1="' + (y - 8) + '" x2="' + (x + 20 + i * 28) + '" y2="' + (y + 8) + '" stroke="#94a3b8" stroke-width="1.3"/>';
      }
      html += strand(x, x + 210, y - 10, "#2563eb", 4);
      html += strand(x, x + 210, y + 10, "#db2777", 4);
      html += '<text x="' + (x + 230) + '" y="' + (y + 4) + '" font-size="12" font-weight="800" fill="#14532d">' + label + "</text>";
      html += "</g>";
      return html;
    }

    function phaseTitle(phase) {
      if (phase === "P") return "P　變性　約 95°C　氫鍵斷裂 → 單鏈模板";
      if (phase === "Q") return "Q　退火　約 55°C　引物結合到兩端";
      if (phase === "R") return "R　延伸　約 72°C　聚合酶合成新鏈";
      return "起始　雙鏈 DNA　尚未變性";
    }

    function captionFor(phase) {
      if (phase === "P") {
        return "階段 P：溫度升至約 <strong class='key'>95°C</strong>。<strong class='key'>氫鍵斷裂</strong>，雙螺旋解開成兩條<strong class='key'>單鏈模板</strong>。";
      }
      if (phase === "Q") {
        return "階段 Q：溫度降至約 <strong class='key'>55°C</strong>。引物與互補鹼基結合（<strong class='key'>退火</strong>），標示要擴增區域的<strong class='key'>兩端</strong>。";
      }
      if (phase === "R") {
        return "階段 R：約 <strong class='key'>72°C</strong>。<strong class='key'>游離核苷酸</strong>由引物開始接上。酶來自<strong class='key'>嗜熱細菌</strong>，經過 95°C 也不會變性，所以<strong class='key'>毋須每次重新加入</strong>。普通的酶會在階段 P 失效。";
      }
      return "循環開始前，目標 DNA 仍是雙鏈，鹼基對以氫鍵相連。接着升溫進入階段 P。";
    }

    function renderBars() {
      var row = $("bars");
      var html = [];
      var i, h, on;
      for (i = 0; i <= 8; i++) {
        on = i <= completed;
        h = 8 + (Math.pow(2, i) / 256) * 78;
        html.push('<div class="bar' + (on ? " on" : "") + '" style="height:' + h + 'px" title="2^' + i + ' = ' + Math.pow(2, i) + '"><span>' + i + "</span></div>");
      }
      row.innerHTML = html.join("");
    }

    function render() {
      var n0 = startN();
      var phase = phaseAt(playT);
      var temp = Math.round(tempAt(playT));
      $("startNOut").textContent = "N = " + n0;
      $("targetOut").textContent = "n = " + targetN();
      $("formulaNow").textContent = "現時： " + n0 + " × 2" + sup(completed) + " = " + copies(n0, completed);
      $("formulaTarget").textContent = "播放至 " + targetN() + " 個完整循環： " + n0 + " × 2" + sup(targetN()) + " = " + copies(n0, targetN());
      $("statPhase").textContent = phase === "start" ? "起始" : phase;
      $("statTemp").textContent = temp + "°C";
      $("statMol").textContent = String(copies(n0, completed));
      $("poseTag").textContent = "循環 " + completed + " · " + (phase === "start" ? "起始" : phase);
      $("caption").innerHTML = captionFor(phase);
      ["P", "Q", "R"].forEach(function (id) {
        $("card" + id).classList.toggle("on", phase === id);
      });
      var stage = $("dnaStage");
      stage.classList.remove("hot", "cool", "warm");
      if (phase === "P") stage.classList.add("hot");
      else if (phase === "Q") stage.classList.add("cool");
      else if (phase === "R") stage.classList.add("warm");
      $("graph").setAttribute("aria-label", "溫度曲線，現時約 " + temp + " 度，階段 " + phase);
      drawGraph();
      drawDNA();
      renderBars();
      var done = completed >= targetN() && !playing && playT < 0.2 && completed > 0;
      $("btnPlay").textContent = playing ? "暫停" : (done ? "重播" : "播放");
      $("btnPlay").setAttribute("aria-pressed", playing ? "true" : "false");
    }

    function stop() {
      playing = false;
      if (timerKind === "raf" && raf) cancelAnimationFrame(raf);
      if (timerKind === "timeout" && raf) clearTimeout(raf);
      raf = 0;
      timerKind = "";
      lastTs = 0;
    }

    function frame(ts) {
      if (!playing) return;
      if (!lastTs) lastTs = ts;
      var dt = Math.min(0.05, (ts - lastTs) / 1000);
      lastTs = ts;
      if (reduced) {
        pose = (pose + 1) % POSES.length;
        playT = POSES[pose].t;
        if (pose === 0) {
          completed += 1;
          if (completed >= targetN()) {
            stop();
            playT = 0.08;
          }
        }
        render();
        if (playing) {
          timerKind = "timeout";
          raf = setTimeout(function () { frame(performance.now()); }, 700);
        }
        return;
      }
      playT += dt * (3 / secondsPerCycle);
      if (playT >= 3) {
        playT = 0.02;
        completed += 1;
        pose = 0;
        if (completed >= targetN()) {
          stop();
          playT = 0.08;
        }
      } else {
        var p;
        for (p = 0; p < POSES.length; p++) {
          if (Math.abs(POSES[p].t - playT) < 0.08) pose = p;
        }
      }
      render();
      if (playing) {
        timerKind = "raf";
        raf = requestAnimationFrame(frame);
      }
    }

    function play() {
      if (playing) {
        stop();
        render();
        return;
      }
      if (completed >= targetN()) {
        completed = 0;
        playT = 0.08;
        pose = 0;
      }
      playing = true;
      lastTs = 0;
      render();
      if (reduced) {
        timerKind = "timeout";
        raf = setTimeout(function () { frame(performance.now()); }, 700);
      } else {
        timerKind = "raf";
        raf = requestAnimationFrame(frame);
      }
    }

    function step() {
      stop();
      pose += 1;
      if (pose >= POSES.length) {
        pose = 0;
        completed += 1;
        if (completed > 10) completed = 10;
      }
      playT = POSES[pose].t;
      render();
    }

    function reset() {
      stop();
      completed = 0;
      pose = 0;
      playT = 0.08;
      $("startN").value = "10";
      $("targetCycles").value = "6";
      $("quizMsg").textContent = "";
      render();
    }

    $("btnPlay").addEventListener("click", play);
    $("btnStep").addEventListener("click", step);
    $("btnReset").addEventListener("click", reset);
    $("startN").addEventListener("input", render);
    $("targetCycles").addEventListener("input", function () {
      if (completed >= targetN()) stop();
      render();
    });
    $("quizForm").addEventListener("submit", function (e) {
      e.preventDefault();
      var v = Number($("quizAns").value);
      var msg = $("quizMsg");
      if (v === 640) {
        msg.innerHTML = "<strong class='key'>正確。</strong> 10 × 2⁶ = 10 × 64 = 640。每個完整循環，目標分子數加倍，所以是 2 的指數，不是 10 × 6。";
      } else if (v === 64) {
        msg.textContent = "64 是 2⁶。題目開始時有 10 個，要再乘 10。";
      } else if (v === 60) {
        msg.textContent = "不是 10 × 6。每個循環是加倍，不是加 10。";
      } else if (v === 320) {
        msg.textContent = "320 = 10 × 2⁵，那是 5 個循環。題目問 6 個完整循環。";
      } else if (v === 1280) {
        msg.textContent = "1280 = 10 × 2⁷，那是 7 個循環。";
      } else {
        msg.textContent = "再算一次：起始 10 個，6 個循環後是 10 × 2⁶。";
      }
    });
    document.addEventListener("keydown", function (e) {
      var tag = document.activeElement && document.activeElement.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === " ") { e.preventDefault(); play(); }
      if (e.key === "ArrowRight") { e.preventDefault(); step(); }
    });

    if (location.search.indexOf("selftest=1") >= 0) {
      var errs = selfCheck();
      document.documentElement.dataset.selftest = errs.length ? "FAIL" : "PASS";
      document.title = (errs.length ? "FAIL " : "PASS ") + errs.join("; ");
    }
    render();
  }

  return {
    copies: copies,
    tempAt: tempAt,
    phaseAt: phaseAt,
    selfCheck: selfCheck,
    mount: mount
  };
});
