/* Lückentext-Render für lernquizzes – rein statisch, clientseitige Auto-Korrektur.
 *
 * Wird von app.js aufgerufen, sobald ein geladener Datensatz "type": "lueckentext"
 * trägt (app.js delegiert dann an window.renderCloze). Eigenständiges Modul, damit
 * die MC-Engine unberührt bleibt.
 *
 * Datenschema (data/<id>.json):
 *   {
 *     "id": "...", "type": "lueckentext", "title": "...", "subject": "...",
 *     "description": "...",
 *     "wordbank": ["Begriff A", "Begriff B", ...],  // alle Lösungen + Distraktoren, mehr als Lücken
 *     "items": [
 *       { "text": "Aussage mit einer {{gap}} pro Satz.", "answer": "Begriff A",
 *         "transfer": false, "hint": "optional, erst nach dem Prüfen sichtbar" }
 *     ]
 *   }
 *
 * Auto-Korrektur: pro Lücke ein Dropdown mit der KOMPLETTEN Wortbank (kein Ausschluss
 * durch Abzählen). "Prüfen" färbt je Lücke grün/rot, zeigt Prozent-Score und blendet die
 * korrekte Lösung erst DANACH ein. Kein Selbstcheck.
 */
(function () {
  const mount = document.getElementById("app");
  const homeBtn = document.getElementById("home-btn");
  const appTitle = document.getElementById("app-title");

  const GAP = /\{\{\s*gap\s*\}\}/;

  function esc(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  // Erst escapen, dann `Code` in <code> umwandeln – identisch zur MC-Engine.
  function fmt(s) { return esc(s).replace(/`([^`]+)`/g, "<code>$1</code>"); }
  function shuffle(a) {
    a = a.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  const norm = (s) => String(s ?? "").trim();

  let data = null, ctx = null, bankOrder = [], given = {}, checked = false;

  window.renderCloze = function (d, c) {
    data = d;
    ctx = c || {};
    given = {};
    checked = false;
    bankOrder = shuffle(data.wordbank || []);   // Anzeigereihenfolge pro Sitzung mischen
    appTitle.textContent = data.title || "Lückentext";
    homeBtn.hidden = true;                        // eigener Zurück-Button (kein Konflikt mit app.js-Header)
    render();
  };

  function render() {
    const items = data.items || [];
    let html = "";

    html += `<div class="clozeTop">
      <button class="ghost-btn" data-cloze-back="1">← Zurück zu den Sets</button>
      <span class="clozeType">Lückentext</span>
    </div>`;

    html += `<div class="cloze-card">`;
    if (data.description) html += `<p class="clozeIntro">${fmt(data.description)}</p>`;

    // Wortbank als Referenzüberblick (die eigentliche Auswahl passiert pro Lücke im Dropdown).
    html += `<div class="wordbank"><span class="wbLabel">Wortbank</span>`;
    bankOrder.forEach((w) => { html += `<span class="wbChip">${fmt(w)}</span>`; });
    html += `</div>`;

    html += `<ol class="clozeItems">`;
    items.forEach((it, idx) => {
      const parts = String(it.text).split(GAP);
      const before = parts[0] ?? "";
      const after = parts.length > 1 ? parts.slice(1).join("") : "";
      html += `<li class="clozeItem" data-i="${idx}">`;
      if (it.transfer) html += `<span class="transferTag">ANWENDUNG</span>`;
      html += `<span class="clozeText">${fmt(before)}`;
      const sel = given[idx] ?? "";
      html += `<select class="clozeSelect" data-i="${idx}" aria-label="Lücke ${idx + 1}"${checked ? " disabled" : ""}>`;
      html += `<option value=""${sel === "" ? " selected" : ""}>– wählen –</option>`;
      bankOrder.forEach((w) => {
        html += `<option value="${esc(w)}"${norm(w) === norm(sel) ? " selected" : ""}>${esc(w)}</option>`;
      });
      html += `</select>`;
      html += `${fmt(after)}</span>`;
      html += `<span class="clozeMark" data-mark="${idx}"></span>`;
      html += `<div class="clozeSolution" data-sol="${idx}"${checked ? "" : " hidden"}></div>`;
      html += `</li>`;
    });
    html += `</ol>`;

    html += `<div class="clozeActions">
      <button class="primary-btn" data-cloze-check="1"${checked ? " disabled" : ""}>Prüfen</button>
      <button class="ghost-btn" data-cloze-reset="1">Zurücksetzen</button>
      <span class="clozeScore" data-score="1"></span>
    </div>`;
    html += `</div>`;

    mount.innerHTML = html;
    bind();
    if (checked) applyMarks();
  }

  function bind() {
    mount.querySelectorAll(".clozeSelect").forEach((s) => {
      s.onchange = () => { given[s.dataset.i] = s.value; };
    });
    const back = mount.querySelector("[data-cloze-back]");
    if (back) back.onclick = () => { if (typeof ctx.onBack === "function") ctx.onBack(); };
    const chk = mount.querySelector("[data-cloze-check]");
    if (chk) chk.onclick = doCheck;
    const rst = mount.querySelector("[data-cloze-reset]");
    if (rst) rst.onclick = doReset;
  }

  function doCheck() {
    // aktuelle Auswahl aus dem DOM übernehmen (falls change nicht gefeuert hat)
    mount.querySelectorAll(".clozeSelect").forEach((s) => { given[s.dataset.i] = s.value; });
    checked = true;
    render();       // rendert mit disabled + eingeblendeten Lösungen, dann applyMarks()
  }

  function doReset() {
    given = {};
    checked = false;
    bankOrder = shuffle(data.wordbank || []);
    render();
  }

  function applyMarks() {
    const items = data.items || [];
    let correct = 0;
    items.forEach((it, idx) => {
      const val = norm(given[idx]);
      const ok = val !== "" && norm(val) === norm(it.answer);
      if (ok) correct++;
      const li = mount.querySelector(`.clozeItem[data-i="${idx}"]`);
      const sel = mount.querySelector(`.clozeSelect[data-i="${idx}"]`);
      const mark = mount.querySelector(`[data-mark="${idx}"]`);
      const sol = mount.querySelector(`[data-sol="${idx}"]`);
      if (li) li.classList.add(ok ? "isCorrect" : "isWrong");
      if (sel) sel.classList.add(ok ? "selCorrect" : "selWrong");
      if (mark) mark.textContent = ok ? "✓" : "✗";
      if (sol) {
        sol.hidden = false;
        if (ok) {
          sol.innerHTML = `<span class="solOk">Richtig</span>`;
        } else {
          const chosen = val === "" ? "– keine Auswahl –" : val;
          sol.innerHTML = `<span class="solNo">Richtige Lösung: <strong>${fmt(it.answer)}</strong></span>` +
            `<span class="solChosen">deine Wahl: ${fmt(chosen)}</span>`;
        }
        if (it.hint) sol.innerHTML += `<span class="solHint">${fmt(it.hint)}</span>`;
      }
    });
    const total = items.length || 1;
    const pct = Math.round((correct / total) * 100);
    const score = mount.querySelector("[data-score]");
    if (score) {
      score.textContent = `${correct} / ${items.length} richtig · ${pct}%`;
      score.classList.add(pct >= 70 ? "scoreGood" : pct >= 50 ? "scoreMid" : "scoreLow");
    }
  }
})();
