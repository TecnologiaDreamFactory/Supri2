/**
 * Animação em canvas: rede de nós pulsando (estética “processamento”).
 * Tema default (IA): ciano/azul vivo. Tema simple: verde (comparação rápida).
 */
(function (global) {
  "use strict";

  var rafId = null;
  var resizeObserver = null;
  var canvas = null;
  var ctx = null;
  var nodes = [];
  var w = 0;
  var h = 0;
  var t0 = 0;

  /** @type {{ bg: string[]; line: function(number): string; ring: function(number): string; node: string[]; center: string[] }} */
  var theme = null;

  var THEME_IA = {
    bg: ["rgba(0, 169, 255, 0.11)", "rgba(0, 71, 255, 0.05)", "rgba(255, 255, 255, 0.02)"],
    line: function (a) {
      return "rgba(0, 169, 255, " + a + ")";
    },
    ring: function (a) {
      return "rgba(0, 169, 255, " + a + ")";
    },
    node: ["rgba(0, 220, 255, 0.85)", "rgba(0, 169, 255, 0.45)", "rgba(0, 71, 255, 0.08)"],
    center: ["rgba(255, 255, 255, 0.35)", "rgba(0, 200, 255, 0.35)", "rgba(0, 71, 255, 0)"]
  };

  var THEME_SIMPLE = {
    bg: ["rgba(0, 190, 130, 0.12)", "rgba(0, 120, 85, 0.08)", "rgba(255, 255, 255, 0.02)"],
    line: function (a) {
      return "rgba(0, 175, 120, " + a + ")";
    },
    ring: function (a) {
      return "rgba(0, 155, 105, " + a + ")";
    },
    node: ["rgba(160, 245, 210, 0.9)", "rgba(0, 175, 125, 0.5)", "rgba(0, 95, 70, 0.1)"],
    center: ["rgba(240, 255, 248, 0.4)", "rgba(0, 200, 140, 0.38)", "rgba(0, 90, 60, 0)"]
  };

  function onResize() {
    if (!canvas || !canvas.parentElement) return;
    var rect = canvas.parentElement.getBoundingClientRect();
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = Math.max(1, Math.floor(rect.width));
    h = Math.max(1, Math.floor(rect.height));
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
    if (!ctx) ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    spawnNodes();
  }

  function spawnNodes() {
    var target = Math.min(
      24,
      Math.max(10, Math.floor((w * h) / 14000))
    );
    nodes = [];
    for (var i = 0; i < target; i++) {
      nodes.push({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.55,
        vy: (Math.random() - 0.5) * 0.55,
        r: 2.5 + Math.random() * 5,
        phase: Math.random() * Math.PI * 2
      });
    }
  }

  function step(ts) {
    if (!ctx || !canvas || !theme) return;
    if (!t0) t0 = ts;
    var t = (ts - t0) * 0.001;
    ctx.clearRect(0, 0, w, h);

    var g = ctx.createRadialGradient(w * 0.35, h * 0.25, 0, w * 0.5, h * 0.55, Math.max(w, h) * 0.85);
    g.addColorStop(0, theme.bg[0]);
    g.addColorStop(0.45, theme.bg[1]);
    g.addColorStop(1, theme.bg[2]);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    var i;
    var j;
    for (i = 0; i < nodes.length; i++) {
      for (j = i + 1; j < nodes.length; j++) {
        var dx = nodes[i].x - nodes[j].x;
        var dy = nodes[i].y - nodes[j].y;
        var d = Math.sqrt(dx * dx + dy * dy);
        if (d < 130) {
          var a = (1 - d / 130) * (0.12 + 0.18 * Math.sin(t * 2.1 + i * 0.7 + j * 0.3));
          ctx.strokeStyle = theme.line(a);
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(nodes[i].x, nodes[i].y);
          ctx.lineTo(nodes[j].x, nodes[j].y);
          ctx.stroke();
        }
      }
    }

    var cx = w * 0.5;
    var cy = h * 0.44;
    var rings = 3;
    for (var r = 0; r < rings; r++) {
      var rad = 22 + r * 18 + 6 * Math.sin(t * (2.4 + r * 0.4) + r);
      ctx.beginPath();
      ctx.arc(cx, cy, rad, 0, Math.PI * 2);
      ctx.strokeStyle = theme.ring(0.12 + 0.1 * Math.sin(t * 3 + r));
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    for (i = 0; i < nodes.length; i++) {
      var nd = nodes[i];
      nd.x += nd.vx;
      nd.y += nd.vy;
      if (nd.x < 4 || nd.x > w - 4) nd.vx *= -1;
      if (nd.y < 4 || nd.y > h - 4) nd.vy *= -1;
      nd.x = Math.max(4, Math.min(w - 4, nd.x));
      nd.y = Math.max(4, Math.min(h - 4, nd.y));
      var pulse = 0.55 + 0.45 * Math.sin(t * 3.2 + nd.phase);
      ctx.beginPath();
      ctx.arc(nd.x, nd.y, nd.r * pulse, 0, Math.PI * 2);
      var gn = ctx.createRadialGradient(nd.x, nd.y, 0, nd.x, nd.y, nd.r * pulse * 2);
      gn.addColorStop(0, theme.node[0]);
      gn.addColorStop(0.55, theme.node[1]);
      gn.addColorStop(1, theme.node[2]);
      ctx.fillStyle = gn;
      ctx.fill();
    }

    ctx.beginPath();
    ctx.arc(cx, cy, 10 + 4 * Math.sin(t * 4), 0, Math.PI * 2);
    var gc = ctx.createRadialGradient(cx, cy, 0, cx, cy, 28);
    gc.addColorStop(0, theme.center[0]);
    gc.addColorStop(0.4, theme.center[1]);
    gc.addColorStop(1, theme.center[2]);
    ctx.fillStyle = gc;
    ctx.fill();

    rafId = global.requestAnimationFrame(step);
  }

  /**
   * @param {HTMLCanvasElement} canvasEl
   * @param {{ theme?: 'ia' | 'simple' }} [opts]
   */
  function start(canvasEl, opts) {
    stop();
    canvas = canvasEl;
    if (!canvas) return;
    theme = opts && opts.theme === "simple" ? THEME_SIMPLE : THEME_IA;
    ctx = canvas.getContext("2d");
    t0 = 0;
    onResize();
    global.addEventListener("resize", onResize);
    if (typeof ResizeObserver !== "undefined" && canvas.parentElement) {
      resizeObserver = new ResizeObserver(function () {
        onResize();
      });
      resizeObserver.observe(canvas.parentElement);
    }
    rafId = global.requestAnimationFrame(step);
  }

  function stop() {
    if (rafId) global.cancelAnimationFrame(rafId);
    rafId = null;
    global.removeEventListener("resize", onResize);
    if (resizeObserver) {
      resizeObserver.disconnect();
      resizeObserver = null;
    }
    ctx = null;
    canvas = null;
    t0 = 0;
    theme = null;
  }

  global.AiThinkingCanvas = { start: start, stop: stop };
})(typeof window !== "undefined" ? window : globalThis);
