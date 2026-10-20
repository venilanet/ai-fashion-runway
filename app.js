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

  // ---- analytics (GA4) ----
  // Replace GA_ID with the real Measurement ID to activate. Events carry no
  // photos, emails, or other personal data — only anonymous interaction counts.
  const GA_ID = "G-1QX3D9DVXL";
  window.dataLayer = window.dataLayer || [];
  window.gtag = function () { window.dataLayer.push(arguments); };
  const gaOn = /^G-[A-Z0-9]{6,}$/.test(GA_ID);
  if (gaOn) {
    const gs = document.createElement("script");
    gs.async = true;
    gs.src = "https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(GA_ID);
    document.head.appendChild(gs);
    gtag("js", new Date());
    gtag("config", GA_ID, { anonymize_ip: true }); // page_view is sent automatically
  }
  function trackEvent(name, params) {
    try { if (gaOn) gtag("event", name, params || {}); }
    catch (e) { /* analytics must never break the page */ }
  }

  // ---- site config (support email, generation/payment status) ----
  fetch("/api/config").then((r) => r.json()).then((cfg) => {
    generationLive = !!cfg.generationLive;
    if (cfg.paymentsLive) {
      document.querySelectorAll(".price-cta").forEach((b) => { b.textContent = "Buy now — $9.99"; });
    }
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
    trackEvent("style_selected", { style: name });
  }
  document.querySelectorAll("[data-template]").forEach((btn) =>
    btn.addEventListener("click", () => setTemplate(btn.dataset.template))
  );

  // ---- CTAs ----
  const heroCta = $("#heroCta");
  if (heroCta) heroCta.addEventListener("click", () => {
    trackEvent("create_intent_click", { source: "hero" });
    if (!photoURL) input.click();
    else goto("screen-template");
  });
  const startBtn = $("#startBtn");
  if (startBtn) startBtn.addEventListener("click", () => {
    trackEvent("create_intent_click", { source: "how_it_works" });
    if (!photoURL) input.click();
    else goto("screen-template");
  });
  document.querySelectorAll(".price-cta").forEach((btn) =>
    btn.addEventListener("click", async () => {
      trackEvent("create_intent_click", { source: "pricing" });
      // When payments go live this creates a real Stripe Checkout session
      // carrying the chosen template; until then it opens the waitlist.
      try {
        const r = await fetch("/api/config").then((x) => x.json());
        if (r.paymentsLive) {
          btn.disabled = true;
          const c = await fetch("/api/checkout", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ template: selectedTemplate }),
          }).then((x) => x.json());
          if (c.ok && c.url) { location.href = c.url; return; }
          btn.disabled = false;
        }
      } catch (e) { /* fall through to waitlist */ }
      goto("screen-waitlist");
    })
  );

  // ---- generate ----
  // Closed testing: no public generation. The paid flow (checkout → /success/)
  // is the only path that creates generation tasks, and only when enabled.
  const genBtn = $("#generateBtn");
  if (genBtn) genBtn.addEventListener("click", () => {
    if (!photoURL) { input.click(); return; }
    goto("screen-waitlist");
  });

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
      if (data.ok) { trackEvent("early_access_signup"); goto("screen-waitlist-done"); }
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
