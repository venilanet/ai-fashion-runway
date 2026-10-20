// AI Fashion Runway — production flow controller.
(function () {
  "use strict";
  const $ = (s) => document.querySelector(s);
  const screens = ["screen-upload", "screen-template", "screen-waiting", "screen-result", "screen-waitlist", "screen-waitlist-done"];
  let photoURL = null;
  let selectedTemplate = "golden-sheer-wings";
  let generationLive = false; // set from /api/config (true only when server key is configured)
  const templateNames = {
    "golden-sheer-wings": "Golden Sheer Wings",
    "supermodel-walk": "Supermodel Walk",
    "dream-angel": "Dream Angel",
  };

  // ---- site config (support email, generation/payment status) ----
  fetch("/api/config").then((r) => r.json()).then((cfg) => {
    generationLive = !!cfg.generationLive;
    document.querySelectorAll("[data-support-email]").forEach((el) => {
      if (cfg.supportEmail) {
        el.textContent = cfg.supportEmail; el.href = "mailto:" + cfg.supportEmail;
        const row = el.closest("[data-email-row]");
        if (row) row.hidden = false;
      }
    });
  }).catch(() => {});

  // ---- navigation between steps ----
  function goto(id) {
    screens.forEach((s) => {
      const el = document.getElementById(s);
      if (el) el.classList.toggle("active", s === id);
    });
    const app = document.getElementById("app");
    if (app) app.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  document.querySelectorAll("[data-goto]").forEach((el) =>
    el.addEventListener("click", () => goto(el.dataset.goto))
  );

  // ---- upload ----
  const input = $("#photoInput");
  if (input) input.addEventListener("change", () => {
    const file = input.files && input.files[0];
    if (!file) return;
    if (photoURL) URL.revokeObjectURL(photoURL);
    photoURL = URL.createObjectURL(file);
    const pv = $("#previewImg"); if (pv) pv.src = photoURL;
    const rp = $("#resultPhoto"); if (rp) rp.src = photoURL;
    const ut = $("#uploadTitle");
    if (ut) ut.textContent = "Photo ready ✓ — tap to change";
    goto("screen-template");
  });

  // ---- style select (hero pills + style cards + wizard cards stay in sync) ----
  function setTemplate(name) {
    selectedTemplate = name;
    document.querySelectorAll("[data-template]").forEach((b) =>
      b.classList.toggle("selected", b.dataset.template === name));
  }
  document.querySelectorAll("[data-template]").forEach((btn) =>
    btn.addEventListener("click", () => setTemplate(btn.dataset.template))
  );

  // ---- CTAs ----
  const heroCta = $("#heroCta");
  if (heroCta) heroCta.addEventListener("click", () => {
    if (!photoURL) input.click();
    else goto("screen-template");
  });
  const startBtn = $("#startBtn");
  if (startBtn) startBtn.addEventListener("click", () => {
    if (!photoURL) input.click();
    else goto("screen-template");
  });
  document.querySelectorAll(".price-cta").forEach((btn) =>
    btn.addEventListener("click", () => goto("screen-waitlist"))
  );

  // ---- generate ----
  const genBtn = $("#generateBtn");
  if (genBtn) genBtn.addEventListener("click", async () => {
    if (!photoURL) { input.click(); return; }
    if (!generationLive) { goto("screen-waitlist"); return; }
    // Live mode: submit to server, poll status.
    const tplName = $("#resultTplName");
    goto("screen-waiting");
    runProgress();
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ template: selectedTemplate }),
      });
      const data = await res.json();
      if (data.request_id) pollStatus(data.request_id);
      else showFailure("The generation service returned an unexpected response. Your credit was not used.");
    } catch (e) {
      showFailure("Could not reach the generation service. Your credit was not used — please try again.");
    }
  });

  async function pollStatus(id) {
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 15000));
      try {
        const res = await fetch("/api/status?id=" + encodeURIComponent(id));
        const data = await res.json();
        if (data.status === "completed" && data.video_url) { showVideo(data.video_url); return; }
        if (data.status === "failed") { showFailure("The video model could not complete this request. Your credit has been returned."); return; }
      } catch (e) { /* keep polling */ }
    }
    showFailure("Generation is taking longer than expected. Your credit has been returned — please try again or contact support.");
  }

  function showVideo(url) {
    const v = $("#resultVideo");
    v.src = url; v.hidden = false;
    const img = $("#resultPhoto"); if (img) img.hidden = true;
    const ov = $("#resultOverlay"); if (ov) ov.hidden = true;
    const dl = $("#downloadBtn");
    dl.textContent = "Download video";
    dl.onclick = () => { const a = document.createElement("a"); a.href = url; a.download = "ai-fashion-runway.mp4"; a.click(); };
    goto("screen-result");
  }

  function showFailure(msg) {
    const v = $("#resultVideo"); if (v) v.hidden = true;
    const img = $("#resultPhoto"); if (img) { img.hidden = false; }
    const ov = $("#resultOverlay"); if (ov) ov.hidden = false;
    const err = $("#resultError"); if (err) err.innerHTML = msg + ' <a href="/support/">Contact support</a>.';
    const dl = $("#downloadBtn");
    dl.textContent = "No video to download";
    dl.onclick = () => goto("screen-template");
    goto("screen-result");
  }

  function runProgress() {
    const bar = $("#ringBar"), pct = $("#ringPct");
    if (!bar) return;
    const steps = Array.from(document.querySelectorAll("#genSteps li"));
    steps.forEach((li) => li.classList.remove("doing", "done"));
    const t0 = performance.now();
    (function frame(now) {
      const p = Math.min(1, (now - t0) / 240000); // ~4 min cap for the animation
      const deg = Math.round(p * 360);
      bar.style.background = `conic-gradient(var(--gold) ${deg}deg, #23232e ${deg}deg)`;
      pct.textContent = Math.round(p * 100) + "%";
      const stage = Math.min(3, Math.floor(p * 4));
      steps.forEach((li, i) => {
        li.classList.toggle("done", i < stage);
        li.classList.toggle("doing", i === stage);
      });
      if (p < 1 && document.getElementById("screen-waiting").classList.contains("active"))
        requestAnimationFrame(frame);
    })(t0);
  }

  // ---- waitlist ----
  const wForm = $("#waitlistForm");
  if (wForm) wForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = $("#waitlistEmail").value.trim();
    const msg = $("#waitlistMsg");
    msg.className = "form-msg"; msg.textContent = "Joining…";
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (data.ok) { goto("screen-waitlist-done"); }
      else { msg.classList.add("err"); msg.textContent = data.message || "Please try again."; }
    } catch (err) {
      msg.classList.add("err"); msg.textContent = "Network error — please try again.";
    }
  });

  // ---- video examples (rendered only when real samples exist) ----
  const SAMPLES = [
    // { src: "/samples/golden-sheer-wings.mp4", poster: "/samples/golden-sheer-wings.jpg",
    //   style: "Golden Sheer Wings", note: "Generated from a single photo · 13s" },
  ];
  (function renderExamples() {
    if (!SAMPLES.length) return;
    const sec = document.getElementById("examples");
    const grid = document.getElementById("exampleGrid");
    const nav = document.getElementById("navExamples");
    sec.hidden = false; if (nav) nav.hidden = false;
    SAMPLES.forEach((s) => {
      const card = document.createElement("div");
      card.className = "example-card";
      card.innerHTML =
        '<video controls playsinline preload="metadata"' + (s.poster ? ' poster="' + s.poster + '"' : "") + '>' +
        '<source src="' + s.src + '" type="video/mp4"></video>' +
        '<div class="ex-meta"><p class="ex-label">EXAMPLE VIDEO</p><strong>' + s.style + "</strong><p>" + s.note + "</p></div>";
      grid.appendChild(card);
    });
  })();

  // Debug helper: ?dbg=1 writes viewport/scroll widths into <title> for headless checks.
  if (new URLSearchParams(location.search).has("dbg")) {
    addEventListener("load", () => {
      document.title = "DBG innerW=" + window.innerWidth +
        " scrollW=" + document.documentElement.scrollWidth +
        " bodyH=" + document.body.scrollHeight;
    });
  }
})();
