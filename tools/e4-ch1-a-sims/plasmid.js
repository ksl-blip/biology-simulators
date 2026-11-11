/* HGH insertion into tetR and antibiotic selection. E4 Ch.1 paper A, question 2. */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.E4Plasmid = api;
  if (typeof document !== "undefined" && document.getElementById("plasmid-app")) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", function () { api.mount(); });
    } else {
      api.mount();
    }
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var X_COUNT = 80;
  var Y_COUNT = 30;

  function hghColonies(xCount, yCount) {
    return xCount - yCount;
  }

  function selfCheck() {
    var errs = [];
    if (hghColonies(80, 30) !== 50) errs.push("50");
    if (hghColonies(X_COUNT, Y_COUNT) !== 50) errs.push("const");
    return errs;
  }

  function mount() {
    var $ = function (id) { return document.getElementById(id); };
    var reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var STEPS = [
      {
        title: "起始質粒",
        flow: "質粒有 <span class='key'>ampR</span> 和 <span class='key'>tetR</span>",
        caption: "質粒帶兩個抗性基因。題目把 <strong class='key'>HGH 基因插入四環素抗性基因（tetR）內</strong>。氨苄青霉素抗性基因（ampR）沒有被插入。",
        amp: "完整",
        tet: "完整",
        hgh: "尚未插入"
      },
      {
        title: "同一限制酶切開",
        flow: "限制酶在 tetR 內切割，留下<span class='key'>黏端</span>",
        caption: "用限制酶在 <strong class='key'>tetR 裡面</strong>切開質粒，切口留下黏端。用<strong class='key'>同一種</strong>限制酶切開帶有 HGH 基因的 DNA，切口同樣留下黏端。（各 1 分）",
        amp: "完整",
        tet: "被切開",
        hgh: "片段已切出"
      },
      {
        title: "黏端以氫鍵配對",
        flow: "黏端互補，以<span class='key'>氫鍵</span>連結",
        caption: "HGH 的黏端與質粒黏端上未配對的鹼基<strong class='key'>互補</strong>，可以<strong class='key'>氫鍵</strong>連結。此時骨架上仍有缺口。（1 分）",
        amp: "完整",
        tet: "被插入物撐開",
        hgh: "靠氫鍵暫接"
      },
      {
        title: "DNA 連接酶封口",
        flow: "<span class='key'>DNA 連接酶</span>以共價鍵接合",
        caption: "<strong class='key'>DNA 連接酶</strong>把 HGH 與質粒以<strong class='key'>共價鍵</strong>接起來，缺口封閉。（1 分）",
        amp: "完整",
        tet: "被 HGH 打斷",
        hgh: "已接入 tetR"
      },
      {
        title: "兩種質粒",
        flow: "重組質粒 <span class='key'>AmpR TetS</span>",
        caption: "有插入的是重組質粒：ampR 仍有效，tetR 被 HGH 弄斷，所以是 <strong class='key'>AmpR、對四環素敏感（TetS）</strong>。沒有插入、自己重新接好的質粒仍是 AmpR TetR。",
        amp: "兩種質粒都完整",
        tet: "只有重組質粒失效",
        hgh: "只在重組質粒"
      },
      {
        title: "塗佈 X 與 Y",
        flow: "X 含氨苄青霉素，Y 含四環素",
        caption: "把細菌分別放上培養基 <strong class='key'>X（氨苄青霉素）</strong>和 <strong class='key'>Y（四環素）</strong>。沒有質粒的細菌兩邊都不能長。有質粒的細菌都有 ampR，所以能在 X 生長。",
        amp: "決定能否在 X 生長",
        tet: "決定能否在 Y 生長",
        hgh: "尚未從菌落數推斷"
      },
      {
        title: "80 − 30 = 50",
        flow: "只在 X 生長的 <span class='key'>50</span> 個最可能有 HGH",
        caption: "X 有 <strong class='key'>80</strong> 個菌落，Y 有 <strong class='key'>30</strong> 個。在 X 生長的細菌有 ampR。HGH 插入使 tetR <strong class='key'>失去功能</strong>，所以重組菌<strong class='key'>只在 X 生長、不在 Y 生長</strong>。數目是 <strong class='key'>80 − 30 = 50</strong>。",
        amp: "80 個菌落都有",
        tet: "只有 Y 上 30 個仍有",
        hgh: "50 個（只在 X）"
      },
      {
        title: "抗性質粒的風險",
        flow: "病原體取得質粒後可能<span class='key'>無藥可治</span>",
        caption: "如果<strong class='key'>病原體</strong>取得這些帶有抗生素抗性基因的質粒，它們可能對抗生素產生抗性。<strong class='key'>沒有藥物可以應付</strong>，有機會引發疫症。（2 分）",
        amp: "抗性基因可轉移",
        tet: "抗性基因可轉移",
        hgh: "風險不在 HGH 本身"
      }
    ];

    var step = 0;
    var timer = 0;
    var playing = false;
    var inferred = false;

    function polar(cx, cy, r, degFromTop) {
      var math = (90 - degFromTop) * Math.PI / 180;
      return [cx + r * Math.cos(math), cy - r * Math.sin(math)];
    }

    function arc(cx, cy, r, a0, a1, color, width) {
      var p0 = polar(cx, cy, r, a0);
      var p1 = polar(cx, cy, r, a1);
      var delta = (a1 - a0 + 360) % 360;
      var large = delta > 180 ? 1 : 0;
      return '<path d="M ' + p0[0].toFixed(1) + " " + p0[1].toFixed(1) + " A " + r + " " + r + " 0 " + large + " 1 " + p1[0].toFixed(1) + " " + p1[1].toFixed(1) + '" fill="none" stroke="' + color + '" stroke-width="' + width + '" stroke-linecap="butt"/>';
    }

    function labelAt(cx, cy, r, deg, text, color) {
      var p = polar(cx, cy, r, deg);
      return '<text x="' + p[0].toFixed(1) + '" y="' + p[1].toFixed(1) + '" text-anchor="middle" font-size="13" font-weight="800" fill="' + (color || "#2b241c") + '">' + text + "</text>";
    }

    function ring(cx, cy, r, color) {
      return '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="' + (color || "#1c1917") + '" stroke-width="3"/>';
    }

    function onePlasmid(cx, cy, r, mode) {
      var html = ring(cx, cy, r, "#1c1917");
      var amp0 = 210, amp1 = 350;
      var tet0 = 28, tet1 = 128;
      if (mode === "cut") {
        html += arc(cx, cy, r, amp0, amp1, "#3f8f62", 16);
        html += arc(cx, cy, r, tet0, 68, "#3b82f6", 16);
        html += arc(cx, cy, r, 92, tet1, "#3b82f6", 16);
        html += labelAt(cx, cy, r + 36, 78, "切口", "#b42318");
      } else if (mode === "hgh" || mode === "recomb") {
        html += arc(cx, cy, r, amp0, amp1, "#3f8f62", 16);
        html += arc(cx, cy, r, tet0, 58, "#3b82f6", 16);
        html += arc(cx, cy, r, 102, tet1, "#3b82f6", 16);
        html += arc(cx, cy, r + 2, 58, 102, "#d97706", 12);
        html += labelAt(cx, cy, r + 46, 80, "HGH", "#b45309");
      } else {
        html += arc(cx, cy, r, amp0, amp1, "#3f8f62", 16);
        html += arc(cx, cy, r, tet0, tet1, "#3b82f6", 16);
      }
      html += '<text x="' + cx + '" y="' + (cy + 5) + '" text-anchor="middle" font-size="16" font-weight="900" fill="#1c1917">質粒</text>';
      return html;
    }

    function stickyPair(x, y, joined) {
      var html = '<g font-size="13" font-weight="700">';
      if (!joined) {
        html += '<text x="' + x + '" y="' + y + '" fill="#1e3a8a">5\'-NNNN</text>';
        html += '<text x="' + (x + 92) + '" y="' + y + '" fill="#b45309">AATT…HGH…</text>';
        html += '<text x="' + x + '" y="' + (y + 22) + '" fill="#1e3a8a">3\'-NNNNTTAA</text>';
        html += '<text x="' + (x + 118) + '" y="' + (y + 22) + '" fill="#b45309">…</text>';
        html += '<text x="' + x + '" y="' + (y + 46) + '" fill="#b42318">黏端 = 切口上的一小段單鏈</text>';
      } else {
        html += '<text x="' + x + '" y="' + y + '" fill="#1e3a8a">5\'-NNNN AATT…HGH…</text>';
        html += '<text x="' + x + '" y="' + (y + 22) + '" fill="#1e3a8a">3\'-NNNNTTAA …</text>';
        html += '<text x="' + x + '" y="' + (y + 48) + '" fill="#14532d">' + (joined === "h" ? "互補鹼基以氫鍵相連（虛線）" : "DNA 連接酶封上共價鍵") + "</text>";
      }
      html += "</g>";
      return html;
    }

    function draw() {
      var s = STEPS[step];
      var html = [];
      if (step === 0) {
        html.push(onePlasmid(250, 210, 120, "intact"));
        html.push(labelAt(250, 210, 148, 280, "ampR", "#166534"));
        html.push(labelAt(250, 210, 152, 78, "tetR", "#1d4ed8"));
        html.push('<text x="70" y="400" font-size="14" font-weight="800" fill="#166534">綠色弧　ampR　氨苄青霉素抗性（保持完整）</text>');
        html.push('<text x="70" y="424" font-size="14" font-weight="800" fill="#1d4ed8">藍色弧　tetR　四環素抗性（HGH 插在這裡）</text>');
        var tip = polar(250, 210, 120, 80);
        html.push('<line x1="470" y1="70" x2="' + tip[0].toFixed(1) + '" y2="' + tip[1].toFixed(1) + '" stroke="#db2777" stroke-width="2"/>');
        html.push('<text x="478" y="66" font-size="13" font-weight="800" fill="#9d174d">HGH 插入 tetR</text>');
      } else if (step === 1) {
        html.push(onePlasmid(180, 200, 100, "cut"));
        html.push(labelAt(180, 200, 132, 280, "ampR", "#166534"));
        html.push('<g transform="translate(360,150)">');
        html.push('<rect x="0" y="20" width="250" height="28" rx="6" fill="#fdba74" stroke="#b45309" stroke-width="2"/>');
        html.push('<text x="125" y="39" text-anchor="middle" font-size="14" font-weight="800" fill="#7c2d12">HGH 基因</text>');
        html.push('<text x="0" y="14" font-size="12" fill="#b42318">黏端</text>');
        html.push('<text x="210" y="14" font-size="12" fill="#b42318">黏端</text>');
        html.push("</g>");
        html.push(stickyPair(360, 250, false));
      } else if (step === 2) {
        html.push(onePlasmid(230, 190, 110, "hgh"));
        html.push(stickyPair(80, 360, "h"));
        html.push('<text x="430" y="370" font-size="13" fill="#5a493c">相同酶的黏端才能互補</text>');
      } else if (step === 3) {
        html.push(onePlasmid(230, 190, 110, "hgh"));
        html.push('<ellipse cx="400" cy="150" rx="36" ry="20" fill="#7c3aed"/>');
        html.push('<text x="400" y="154" text-anchor="middle" font-size="12" font-weight="800" fill="#fff">連接酶</text>');
        html.push(stickyPair(80, 360, "ligase"));
      } else if (step === 4) {
        html.push('<text x="160" y="36" text-anchor="middle" font-size="14" font-weight="800" fill="#b45309">重組質粒</text>');
        html.push(onePlasmid(160, 180, 78, "recomb"));
        html.push('<text x="160" y="290" text-anchor="middle" font-size="13" font-weight="800" fill="#b45309">AmpR　TetS　有 HGH</text>');
        html.push('<text x="480" y="36" text-anchor="middle" font-size="14" font-weight="800" fill="#1d4ed8">非重組質粒</text>');
        html.push(onePlasmid(480, 180, 78, "intact"));
        html.push('<text x="480" y="290" text-anchor="middle" font-size="13" font-weight="800" fill="#1d4ed8">AmpR　TetR　無 HGH</text>');
        html.push('<text x="340" y="400" text-anchor="middle" font-size="13" fill="#5a493c">非重組：質粒切開後自己接回，tetR 恢復</text>');
      } else if (step === 7) {
        html.push('<ellipse cx="230" cy="200" rx="70" ry="36" fill="#bbf7d0" stroke="#166534" stroke-width="3"/>');
        html.push('<text x="230" y="204" text-anchor="middle" font-size="14" font-weight="800" fill="#14532d">病原體</text>');
        html.push('<circle cx="420" cy="160" r="42" fill="none" stroke="#1c1917" stroke-width="3"/>');
        html.push('<path d="M378 160 A42 42 0 0 1 420 118" fill="none" stroke="#3f8f62" stroke-width="8"/>');
        html.push('<path d="M430 128 A42 42 0 0 1 458 168" fill="none" stroke="#3b82f6" stroke-width="8"/>');
        html.push('<text x="420" y="164" text-anchor="middle" font-size="12" font-weight="800">抗性質粒</text>');
        html.push('<polygon points="300,150 360,170 300,190" fill="#b42318"/>');
        html.push('<text x="340" y="320" text-anchor="middle" font-size="15" font-weight="800" fill="#b42318">取得抗性基因 → 抗生素可能失效</text>');
        html.push('<text x="340" y="348" text-anchor="middle" font-size="13" fill="#5a493c">參考答案舉的危險：沒有藥物可以應付，可能引發疫症</text>');
      } else {
        html.push('<text x="340" y="48" text-anchor="middle" font-size="15" font-weight="800">細菌攝入質粒後，塗到兩種培養基</text>');
        html.push('<ellipse cx="160" cy="150" rx="46" ry="26" fill="#bbf7d0" stroke="#166534" stroke-width="2"/>');
        html.push('<text x="160" y="154" text-anchor="middle" font-size="12" font-weight="800" fill="#14532d">有質粒</text>');
        html.push('<ellipse cx="340" cy="150" rx="46" ry="26" fill="#e7e5e4" stroke="#78716c" stroke-width="2"/>');
        html.push('<text x="340" y="154" text-anchor="middle" font-size="12" font-weight="800" fill="#57534e">無質粒</text>');
        html.push('<text x="500" y="154" font-size="13" fill="#b42318">無質粒 → X 和 Y 都不長</text>');
        html.push('<text x="340" y="250" text-anchor="middle" font-size="14">X：ampR 仍在 → 重組和非重組都能長</text>');
        html.push('<text x="340" y="278" text-anchor="middle" font-size="14">Y：要 tetR 完整 → 只有非重組能長</text>');
      }
      $("scene").innerHTML = html.join("");
      $("sceneTitle").textContent = s.title;
      $("caption").innerHTML = s.caption;
      $("statAmp").textContent = s.amp;
      $("statTet").textContent = s.tet;
      $("statHgh").textContent = s.hgh;
      $("stepTag").textContent = "步驟 " + (step + 1) + " / " + STEPS.length;
      $("plateBlock").hidden = step < 5 || step > 6;
      var buttons = document.querySelectorAll("#flowSteps .step");
      Array.prototype.forEach.call(buttons, function (btn, i) {
        btn.classList.toggle("active", i === step);
        btn.classList.toggle("done", i < step);
      });
      $("btnPlay").textContent = playing ? "暫停" : (step === STEPS.length - 1 ? "重播" : "播放");
      $("btnPlay").setAttribute("aria-pressed", playing ? "true" : "false");
    }

    function mulberry32(a) {
      return function () {
        a |= 0;
        a = (a + 0x6d2b79f5) | 0;
        var t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    }

    function spots(n, rnd) {
      var pts = [];
      var guard = 0;
      while (pts.length < n && guard < 8000) {
        guard += 1;
        var ang = rnd() * Math.PI * 2;
        var rad = Math.sqrt(rnd()) * 0.78;
        var x = 50 + Math.cos(ang) * rad * 50;
        var y = 50 + Math.sin(ang) * rad * 50;
        var ok = true;
        var j;
        for (j = 0; j < pts.length; j++) {
          var dx = pts[j].x - x;
          var dy = pts[j].y - y;
          if (dx * dx + dy * dy < 18) { ok = false; break; }
        }
        if (ok) pts.push({ x: x, y: y });
      }
      return pts;
    }

    function paintPlates() {
      var rnd = mulberry32(20260315);
      var allX = spots(X_COUNT, rnd);
      var ySpots = spots(Y_COUNT, rnd);
      var dx = $("dishX");
      var dy = $("dishY");
      dx.innerHTML = "";
      dy.innerHTML = "";
      allX.forEach(function (p, i) {
        var dot = document.createElement("span");
        dot.className = "colony" + (reduced ? "" : " pop");
        if (inferred) {
          dot.classList.add(i < hghColonies(X_COUNT, Y_COUNT) ? "recomb" : "plain");
        }
        dot.style.left = p.x + "%";
        dot.style.top = p.y + "%";
        dot.style.width = "8px";
        dot.style.height = "8px";
        dot.style.animationDelay = reduced ? "0s" : (i * 0.004) + "s";
        dx.appendChild(dot);
      });
      ySpots.forEach(function (p, i) {
        var dot = document.createElement("span");
        dot.className = "colony" + (reduced ? "" : " pop") + (inferred ? " plain" : "");
        dot.style.left = p.x + "%";
        dot.style.top = p.y + "%";
        dot.style.width = "8px";
        dot.style.height = "8px";
        dy.appendChild(dot);
      });
    }

    function buildFlow() {
      var box = $("flowSteps");
      box.innerHTML = STEPS.map(function (s, i) {
        return '<button type="button" class="step" data-i="' + i + '"><span class="n">' + (i + 1) + '</span><span class="txt">' + s.flow + "</span></button>";
      }).join("");
      box.addEventListener("click", function (e) {
        var btn = e.target.closest(".step");
        if (!btn) return;
        stop();
        step = Number(btn.getAttribute("data-i"));
        draw();
        if (step >= 5 && step <= 6) paintPlates();
      });
    }

    function stop() {
      playing = false;
      if (timer) clearInterval(timer);
      timer = 0;
    }

    function go(next) {
      step = next;
      if (step < 0) step = 0;
      if (step >= STEPS.length) step = STEPS.length - 1;
      draw();
      if (step >= 5 && step <= 6) paintPlates();
    }

    function play() {
      if (playing) {
        stop();
        draw();
        return;
      }
      if (step >= STEPS.length - 1) step = 0;
      playing = true;
      draw();
      timer = setInterval(function () {
        if (step >= STEPS.length - 1) {
          stop();
          draw();
          return;
        }
        go(step + 1);
      }, reduced ? 900 : 2800);
    }

    $("btnPlay").addEventListener("click", play);
    $("btnNext").addEventListener("click", function () { stop(); go(step + 1); });
    $("btnPrev").addEventListener("click", function () { stop(); go(step - 1); });
    $("btnReset").addEventListener("click", function () {
      stop();
      inferred = false;
      $("btnInfer").setAttribute("aria-pressed", "false");
      $("btnInfer").textContent = "推斷哪些菌落帶有 HGH";
      $("quizMsg").textContent = "";
      go(0);
    });
    $("btnInfer").addEventListener("click", function () {
      inferred = !inferred;
      $("btnInfer").setAttribute("aria-pressed", inferred ? "true" : "false");
      $("btnInfer").textContent = inferred ? "還原菌落外觀" : "推斷哪些菌落帶有 HGH";
      if (step >= 5 && step <= 6) paintPlates();
    });
    $("quizForm").addEventListener("submit", function (e) {
      e.preventDefault();
      var v = Number($("quizAns").value);
      var msg = $("quizMsg");
      if (v === 50) {
        msg.innerHTML = "<strong class='key'>正確。</strong> 80 − 30 = 50。它們在 X 生長（ampR 完整），不在 Y 生長（tetR 被 HGH 打斷），所以是 AmpR TetS。";
      } else if (v === 80) {
        msg.textContent = "80 是 X 上全部菌落，包括沒有 HGH、tetR 仍完整的 30 個。";
      } else if (v === 30) {
        msg.textContent = "30 是 Y 上的菌落。它們的 tetR 仍有效，所以質粒裡沒有插入 HGH。";
      } else {
        msg.textContent = "用 X 的菌落數減去 Y 的菌落數。";
      }
    });
    document.addEventListener("keydown", function (e) {
      var tag = document.activeElement && document.activeElement.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "ArrowRight") { e.preventDefault(); stop(); go(step + 1); }
      if (e.key === "ArrowLeft") { e.preventDefault(); stop(); go(step - 1); }
      if (e.key === " ") { e.preventDefault(); play(); }
    });

    buildFlow();
    if (location.search.indexOf("selftest=1") >= 0) {
      var errs = selfCheck();
      document.documentElement.dataset.selftest = errs.length ? "FAIL" : "PASS";
      document.title = (errs.length ? "FAIL " : "PASS ") + errs.join("; ");
    }
    draw();
  }

  return { hghColonies: hghColonies, selfCheck: selfCheck, X_COUNT: X_COUNT, Y_COUNT: Y_COUNT, mount: mount };
});
