// AI Fashion Runway — demo flow controller.
// DEMO BUILD: everything runs locally in the browser. No photo is uploaded,
// no video is generated. The waiting + result screens are honest UI demos.
(function () {
  const $ = (s) => document.querySelector(s);
  const screens = ["screen-upload", "screen-template", "screen-waiting", "screen-result"];
  let photoURL = null;
  let selectedTemplate = "golden-sheer-wings";
  const templateNames = {
    "golden-sheer-wings": "Golden Sheer Wings",
    "supermodel-walk": "Supermodel Walk",
    "dream-angel": "Dream Angel",
  };

  function goto(id) {
    screens.forEach((s) => document.getElementById(s).classList.toggle("active", s === id));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  document.querySelectorAll("[data-goto]").forEach((el) =>
    el.addEventListener("click", () => goto(el.dataset.goto))
  );

  // --- upload ---
  const input = $("#photoInput");
  input.addEventListener("change", () => {
    const file = input.files && input.files[0];
    if (!file) return;
    if (photoURL) URL.revokeObjectURL(photoURL);
    photoURL = URL.createObjectURL(file);
    $("#previewImg").src = photoURL;
    $("#resultPhoto").src = photoURL;
    const ut = $("#uploadTitle");
    if (ut) ut.textContent = "Photo ready ✓ — tap to change";
    goto("screen-template");
  });

  // --- template select (wizard cards + hero pills stay in sync) ---
  function setTemplate(name) {
    selectedTemplate = name;
    document.querySelectorAll(".tpl").forEach((b) =>
      b.classList.toggle("selected", b.dataset.template === name));
    document.querySelectorAll(".hpill").forEach((b) =>
      b.classList.toggle("selected", b.dataset.template === name));
  }
  document.querySelectorAll(".tpl").forEach((btn) =>
    btn.addEventListener("click", () => setTemplate(btn.dataset.template))
  );
  document.querySelectorAll(".hpill").forEach((btn) =>
    btn.addEventListener("click", () => setTemplate(btn.dataset.template))
  );

  // --- hero CTA: upload first if no photo, otherwise continue to template step ---
  const heroCta = $("#heroCta");
  if (heroCta) heroCta.addEventListener("click", () => {
    if (!photoURL) input.click();
    else goto("screen-template");
  });

  // --- generate (demo simulation of the waiting experience only) ---
  $("#generateBtn").addEventListener("click", () => {
    // Ask the server whether live generation is connected. In this demo build
    // the answer is always "demo"; when FAL_KEY is configured server-side the
    // same call returns a request id and the UI polls /api/status instead.
    fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ template: selectedTemplate, demo: true }),
    }).catch(() => null);

    $("#resultTplName").textContent = templateNames[selectedTemplate] || "runway";
    goto("screen-waiting");
    runDemoProgress();
  });

  function runDemoProgress() {
    const bar = $("#ringBar"), pct = $("#ringPct");
    const steps = Array.from(document.querySelectorAll("#genSteps li"));
    steps.forEach((li) => li.classList.remove("doing", "done"));
    const total = 6000; // 6s demo (live mode takes ~1-4 min)
    const t0 = performance.now();
    function frame(now) {
      const p = Math.min(1, (now - t0) / total);
      const deg = Math.round(p * 360);
      bar.style.background = `conic-gradient(var(--gold) ${deg}deg, #23232e ${deg}deg)`;
      pct.textContent = Math.round(p * 100) + "%";
      const stage = Math.min(3, Math.floor(p * 4));
      steps.forEach((li, i) => {
        li.classList.toggle("done", i < stage || p === 1);
        li.classList.toggle("doing", i === stage && p < 1);
      });
      if (p < 1) requestAnimationFrame(frame);
      else setTimeout(() => goto("screen-result"), 450);
    }
    requestAnimationFrame(frame);
  }
})();

// Debug helper: ?dbg=1 writes viewport/scroll widths into <title> for headless checks.
if (new URLSearchParams(location.search).has("dbg")) {
  addEventListener("load", () => {
    document.title = "DBG innerW=" + window.innerWidth +
      " scrollW=" + document.documentElement.scrollWidth +
      " bodyH=" + document.body.scrollHeight;
  });
}
