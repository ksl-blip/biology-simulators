/* EcoRI sites W X Y Z, fragment lengths, and gel bands. */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.E4Restrict = api;
  if (typeof document !== "undefined" && document.getElementById("restriction-app")) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", function () { api.mount(); });
    } else {
      api.mount();
    }
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var ORDER = ["W", "X", "Y", "Z"];
  var FIGURE = { W: 10, X: 10, Y: 25, Z: 50 };
  var MARK = { W: 10, X: 15, Y: 25, Z: 50 };
  var PAIRS = [["W", "X"], ["W", "Y"], ["W", "Z"], ["X", "Y"], ["X", "Z"], ["Y", "Z"]];

  function path(from, to, dist) {
    var idx = { W: 0, X: 1, Y: 2, Z: 3 };
    var sites = [from];
    var len = 0;
    var i = idx[from];
    var guard = 0;
    while (sites[sites.length - 1] !== to && guard < 4) {
      guard += 1;
      len += dist[ORDER[i]];
      i = (i + 1) % 4;
      sites.push(ORDER[i]);
    }
    return { sites: sites, len: len };
  }

  function fragments(a, b, dist) {
    var list = [path(a, b, dist), path(b, a, dist)];
    list.sort(function (u, v) { return v.len - u.len; });
    return list;
  }

  function sumDist(dist) {
    return dist.W + dist.X + dist.Y + dist.Z;
  }

  function selfCheck() {
    var errs = [];
    function eq(name, got, want) {
      if (got !== want) errs.push(name + " got " + got + " want " + want);
    }
    var fig = fragments("X", "Z", FIGURE);
    eq("fig long", fig[0].len, 60);
    eq("fig short", fig[1].len, 35);
    eq("fig via W", fig[0].sites.join(""), "ZWX");
    eq("fig via Y", fig[1].sites.join(""), "XYZ");
    var mark = fragments("Z", "X", MARK);
    eq("mark long", mark[0].len, 60);
    eq("mark short", mark[1].len, 40);
    var wx = fragments("W", "X", FIGURE);
    eq("wx", wx[0].len + wx[1].len, 95);
    eq("wx short", Math.min(wx[0].len, wx[1].len), 10);
    eq("sum fig", sumDist(FIGURE), 95);
    eq("sum mark", sumDist(MARK), 100);
    var yz = fragments("Y", "Z", FIGURE);
    eq("yz short", Math.min(yz[0].len, yz[1].len), 25);
    return errs;
  }

  function mount() {
    var $ = function (id) { return document.getElementById(id); };
    var reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var selected = [];
    var mode = "figure";

    function dist() { return mode === "mark" ? MARK : FIGURE; }

    function polar(cx, cy, r, degFromTop) {
      var math = (90 - degFromTop) * Math.PI / 180;
      return [cx + r * Math.cos(math), cy - r * Math.sin(math)];
    }

    function arcPath(cx, cy, r, a0, a1) {
      var p0 = polar(cx, cy, r, a0);
      var p1 = polar(cx, cy, r, a1);
      var delta = (a1 - a0 + 360) % 360;
      if (delta < 0.5) return "";
      var large = delta > 180 ? 1 : 0;
      return "M " + p0[0].toFixed(1) + " " + p0[1].toFixed(1) + " A " + r + " " + r + " 0 " + large + " 1 " + p1[0].toFixed(1) + " " + p1[1].toFixed(1);
    }

    function siteAngles(d) {
      var total = sumDist(d);
      var ang = { X: 0 };
      ang.Y = (d.X / total) * 360;
      ang.Z = ((d.X + d.Y) / total) * 360;
      ang.W = ((d.X + d.Y + d.Z) / total) * 360;
      return ang;
    }

    function midAngle(a, b) {
      var delta = (b - a + 360) % 360;
      return (a + delta / 2) % 360;
    }

    function toggle(site) {
      var i = selected.indexOf(site);
      if (i >= 0) selected.splice(i, 1);
      else if (selected.length < 2) selected.push(site);
      else {
        selected.shift();
        selected.push(site);
      }
      render();
    }

    function bandY(kb) {
      var y = 118 + (60 - kb) * 5;
      if (y < 78) y = 78;
      if (y > 330) y = 330;
      return y;
    }

    function gelBand(x, kb, tone) {
      var y = bandY(kb);
      var cls = reduced ? "" : "band-anim";
      return '<g class="' + cls + '">'
        + '<rect x="' + x + '" y="' + y + '" width="88" height="16" rx="3" fill="' + tone + '"/>'
        + "</g>";
    }

    function drawGel(frags) {
      var html = [];
      html.push('<rect x="70" y="36" width="300" height="340" fill="#f8fafc" stroke="#1c1917" stroke-width="3"/>');
      html.push('<text x="220" y="24" text-anchor="middle" font-size="14" font-weight="800">凝膠</text>');
      html.push('<text x="140" y="58" text-anchor="middle" font-size="12" fill="#5a493c">題目結果</text>');
      html.push('<text x="290" y="58" text-anchor="middle" font-size="12" fill="#5a493c">你的計算</text>');
      html.push('<rect x="100" y="68" width="88" height="10" fill="#1c1917"/>');
      html.push('<rect x="250" y="68" width="88" height="10" fill="#1c1917"/>');
      html.push(gelBand(100, 60, "#15803d"));
      html.push(gelBand(100, 40, "#15803d"));
      html.push('<text x="196" y="' + (bandY(60) + 13) + '" font-size="12" font-weight="800">60 kb</text>');
      html.push('<text x="196" y="' + (bandY(40) + 13) + '" font-size="12" font-weight="800">40 kb</text>');
      if (frags) {
        html.push(gelBand(250, frags[0].len, "#0f766e"));
        html.push(gelBand(250, frags[1].len, "#0f766e"));
        html.push('<text x="346" y="' + (bandY(frags[0].len) + 13) + '" font-size="12" font-weight="800">' + frags[0].len + " kb</text>");
        html.push('<text x="346" y="' + (bandY(frags[1].len) + 13) + '" font-size="12" font-weight="800">' + frags[1].len + " kb</text>");
      } else {
        html.push('<text x="294" y="200" text-anchor="middle" font-size="13" fill="#5a493c">選兩個切位</text>');
      }
      html.push('<text x="220" y="400" text-anchor="middle" font-size="12" fill="#5a493c">電泳方向 ↓　較小片段走得較遠</text>');
      $("gel").innerHTML = html.join("");
    }

    function drawPlasmid() {
      var d = dist();
      var ang = siteAngles(d);
      var cx = 300, cy = 250, r = 150;
      var html = [];
      html.push('<text x="320" y="28" text-anchor="middle" font-size="15" font-weight="800">質粒上的 EcoRI 識別部位</text>');
      var orderClock = ["X", "Y", "Z", "W"];
      var i, a0, a1, site, next, delta, gap, p;
      for (i = 0; i < orderClock.length; i++) {
        site = orderClock[i];
        next = orderClock[(i + 1) % 4];
        a0 = ang[site];
        a1 = ang[next];
        if (a1 <= a0) a1 += 360;
        gap = 0;
        if (selected.indexOf(site) >= 0) a0 += 7;
        if (selected.indexOf(next) >= 0) a1 -= 7;
        var dPath = arcPath(cx, cy, r, a0, a1);
        if (dPath) html.push('<path d="' + dPath + '" fill="none" stroke="#1c1917" stroke-width="4"/>');
        delta = (ang[next] - ang[site] + 360) % 360;
        var mid = (ang[site] + delta / 2) % 360;
        var kb = d[site];
        var col = (mode === "mark" && site === "X") ? "#b42318" : "#1c1917";
        p = polar(cx, cy, r + 42, mid);
        html.push('<text x="' + p[0].toFixed(1) + '" y="' + p[1].toFixed(1) + '" text-anchor="middle" font-size="15" font-weight="800" fill="' + col + '">' + kb + " kb</text>");
      }
      ORDER.forEach(function (name) {
        var pt = polar(cx, cy, r, ang[name]);
        var on = selected.indexOf(name) >= 0;
        html.push('<circle cx="' + pt[0].toFixed(1) + '" cy="' + pt[1].toFixed(1) + '" r="22" fill="' + (on ? "#fff3c4" : "#fff") + '" stroke="' + (on ? "#b45309" : "#1c1917") + '" stroke-width="2" data-site="' + name + '" style="cursor:pointer"/>');
        html.push('<text x="' + pt[0].toFixed(1) + '" y="' + (pt[1] + 5).toFixed(1) + '" text-anchor="middle" font-size="16" font-weight="900" data-site="' + name + '" style="cursor:pointer">' + name + "</text>");
        if (on && !reduced) {
          html.push('<g class="snip" transform="translate(' + (pt[0] + 16).toFixed(1) + " " + (pt[1] - 28).toFixed(1) + ')">');
          html.push('<path d="M0 0 l10 6 l-10 6 z M0 16 l10 -6 l-10 -6 z" fill="#b42318"/>');
          html.push("</g>");
        }
      });
      html.push('<text x="' + cx + '" y="' + (cy - 8) + '" text-anchor="middle" font-size="16" font-weight="900">總長 100 kb</text>');
      html.push('<text x="' + cx + '" y="' + (cy + 16) + '" text-anchor="middle" font-size="13" fill="#5a493c">標示加總 ' + sumDist(d) + " kb</text>");
      if (mode === "mark") {
        html.push('<text x="' + cx + '" y="' + (cy + 36) + '" text-anchor="middle" font-size="12" fill="#b42318">X–Y 改為 15 kb</text>');
      }
      $("plasmid").innerHTML = html.join("");
    }

    function describe(fr) {
      var pieces = [];
      var i;
      for (i = 0; i < fr.sites.length - 1; i++) pieces.push(dist()[fr.sites[i]] + " kb");
      return fr.sites.join(" → ") + "（" + pieces.join(" + ") + "）＝ <strong>" + fr.len + " kb</strong>";
    }

    function render() {
      var d = dist();
      drawPlasmid();
      document.querySelectorAll(".site-btn").forEach(function (btn) {
        var on = selected.indexOf(btn.getAttribute("data-site")) >= 0;
        btn.setAttribute("aria-pressed", on ? "true" : "false");
      });
      $("modeFigure").setAttribute("aria-pressed", mode === "figure" ? "true" : "false");
      $("modeMark").setAttribute("aria-pressed", mode === "mark" ? "true" : "false");
      $("pickTag").textContent = selected.length ? "已選 " + selected.join("、") : "未選擇";

      var frags = null;
      if (selected.length === 2) frags = fragments(selected[0], selected[1], d);
      drawGel(frags);

      var box = $("fragBox");
      var fb = $("feedback");
      fb.classList.remove("ok", "bad");
      if (!frags) {
        box.textContent = "選擇兩個部位後，這裡會沿順時針列出兩段弧，並把它們的 kb 相加。";
        fb.innerHTML = "題目：EcoRI 切開其中<strong>兩個</strong>識別部位。凝膠上有約 <strong class='key'>60 kb</strong> 和約 <strong class='key'>40 kb</strong> 兩條帶。";
      } else {
        box.innerHTML = "<p>較長：" + describe(frags[0]) + "</p><p>較短：" + describe(frags[1]) + "</p>";
        var xz = selected.slice().sort().join("") === "XZ";
        if (xz && mode === "figure") {
          fb.classList.add("ok");
          fb.innerHTML = "這對切點就是參考答案：<strong class='key'>X 和 Z</strong>。"
            + "沿 W 的一段是 <strong class='key'>10 kb + 50 kb = 60 kb</strong>，對上上方的帶。"
            + "沿 Y 的一段按圖 3 是 <strong>10 kb + 25 kb = 35 kb</strong>。"
            + "參考答案把第二條帶寫成 <strong class='key'>15 kb + 25 kb = 40 kb</strong>。可切換到「參考答案寫法」看兩條帶重疊。"
            + "其他切法都得不到 60 kb。";
        } else if (xz && mode === "mark") {
          fb.classList.add("ok");
          fb.innerHTML = "符合參考答案。<strong class='key'>X 和 Z</strong> 被切開。"
            + "60 kb 的片段由 <strong class='key'>10 kb 和 50 kb</strong> 組成（經過 W）。"
            + "40 kb 的片段由 <strong class='key'>15 kb 和 25 kb</strong> 組成（經過 Y）。"
            + "圖 3 把 X–Y 印成 10 kb，四段加總是 95 kb，圓心卻寫 100 kb。作答時用參考答案這組數字。";
        } else {
          fb.classList.add("bad");
          fb.innerHTML = "這兩個部位切出 <strong>" + frags[0].len + " kb</strong> 和 <strong>" + frags[1].len + " kb</strong>，對不上約 60 kb 與約 40 kb。"
            + "要找到一段剛好是 <strong class='key'>10 kb + 50 kb</strong> 的弧，切點在這段弧的兩端。";
        }
      }

      var body = $("pairTable").querySelector("tbody");
      body.innerHTML = PAIRS.map(function (pair) {
        var fr = fragments(pair[0], pair[1], d);
        var key = pair.slice().sort().join("");
        var picked = selected.length === 2 && selected.slice().sort().join("") === key;
        var hit = key === "XZ";
        var match = (mode === "mark" && fr[0].len === 60 && fr[1].len === 40) || (mode === "figure" && key === "XZ");
        return "<tr class='" + (hit ? "hit " : "") + (picked ? "pick" : "") + "'><td>" + pair.join(" + ") + "</td><td>" + fr[0].len + " kb</td><td>" + fr[1].len + " kb</td><td>" + (match ? "是" : "否") + "</td></tr>";
      }).join("");
    }

    document.querySelectorAll(".site-btn").forEach(function (btn) {
      btn.addEventListener("click", function () { toggle(btn.getAttribute("data-site")); });
    });
    $("plasmid").addEventListener("click", function (e) {
      var node = e.target;
      var site = node.getAttribute && node.getAttribute("data-site");
      if (site) toggle(site);
    });
    $("btnClear").addEventListener("click", function () {
      selected = [];
      render();
    });
    $("modeFigure").addEventListener("click", function () { mode = "figure"; render(); });
    $("modeMark").addEventListener("click", function () { mode = "mark"; render(); });

    if (location.search.indexOf("selftest=1") >= 0) {
      var errs = selfCheck();
      document.documentElement.dataset.selftest = errs.length ? "FAIL" : "PASS";
      document.title = (errs.length ? "FAIL " : "PASS ") + errs.join("; ");
    }
    render();
  }

  return {
    ORDER: ORDER,
    FIGURE: FIGURE,
    MARK: MARK,
    path: path,
    fragments: fragments,
    sumDist: sumDist,
    selfCheck: selfCheck,
    mount: mount
  };
});
