/* „Zuordnen & Fehler finden" – Render für lernquizzes, rein statisch, clientseitige Auto-Korrektur.
 *
 * Wird von app.js aufgerufen, sobald ein geladener Datensatz "type": "zuordnung"
 * trägt (app.js delegiert dann an window.renderZuordnung). Eigenständiges Modul,
 * damit die MC-Engine (und cloze.js) unberührt bleiben.
 *
 * Datenschema (data/<id>.json):
 *   {
 *     "id": "...", "type": "zuordnung", "title": "...", "subject": "...",
 *     "description": "...", "showGrade": false,
 *     "tasks": [
 *       {
 *         "kind": "merkmal-stoerung" | "fall-diagnose",
 *         "prompt": "Kurze Anweisung. 1–3 Zeilen sind falsch zugeordnet.",
 *         "labels": ["Störung A", "Störung B", ...],   // Auswahlpool für Korrekturen
 *         "rows": [
 *           { "text": "Merkmal/Fall", "assigned": "Störung A" (angezeigt),
 *             "correct": "Störung B" (Wahrheit), "explanation": "DD-Begründung" }
 *         ]
 *       }
 *     ]
 *   }
 *
 * Ein Fehler = row.assigned !== row.correct. Der Nutzer hakt eine Zeile als „falsch"
 * an UND wählt die richtige Zuordnung. „Prüfen" färbt je Zeile grün/rot, zeigt einen
 * Prozent-Score und blendet Lösung + DD-Erklärung erst DANACH ein. Kein Selbstcheck.
 */
(function () {
  const mount = document.getElementById("app");
  const homeBtn = document.getElementById("home-btn");
  const appTitle = document.getElementById("app-title");

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

  let data = null, ctx = null, state = {}, labelOrders = [], checked = false;

  function initState() {
    state = {};
    labelOrders = [];
    (data.tasks || []).forEach((task, ti) => {
      labelOrders[ti] = shuffle(task.labels || []);   // Dropdown-Reihenfolge pro Sitzung mischen
      (task.rows || []).forEach((_, ri) => { state[ti + "_" + ri] = { flag: false, choice: "" }; });
    });
  }

  window.renderZuordnung = function (d, c) {
    data = d;
    ctx = c || {};
    checked = false;
    initState();
    appTitle.textContent = data.title || "Zuordnen & Fehler finden";
    homeBtn.hidden = true;                             // eigener Zurück-Button (kein Konflikt mit app.js-Header)
    render();
  };

  function kindLabel(kind) {
    return kind === "fall-diagnose" ? "Fall → Diagnose" : "Merkmal → Störung";
  }

  function render() {
    const tasks = data.tasks || [];
    let html = "";

    html += `<div class="zoTop">
      <button class="ghost-btn" data-zo-back="1">← Zurück zu den Sets</button>
      <span class="zoType">Zuordnen &amp; Fehler finden</span>
    </div>`;

    html += `<div class="zo-card">`;
    if (data.description) html += `<p class="zoIntro">${fmt(data.description)}</p>`;
    html += `<p class="zoHowto">Prüfe jede Zuordnung. Hake an, was <strong>falsch</strong> zugeordnet ist, und wähle die richtige Zuordnung. Pro Aufgabe sind 1–3 Zeilen falsch (Anzahl nicht angezeigt). „Prüfen" wertet aus.</p>`;

    tasks.forEach((task, ti) => {
      html += `<section class="zoTask">`;
      html += `<div class="zoTaskHead">
        <span class="zoKind ${task.kind === "fall-diagnose" ? "kFall" : "kMerk"}">${esc(kindLabel(task.kind))}</span>
      </div>`;
      if (task.prompt) html += `<p class="zoPrompt">${fmt(task.prompt)}</p>`;
      html += `<ul class="zoRows">`;
      (task.rows || []).forEach((row, ri) => {
        const key = ti + "_" + ri;
        const st = state[key] || { flag: false, choice: "" };
        html += `<li class="zoRow" data-key="${key}">`;
        html += `<div class="zoRowBody">`;
        html += `<span class="zoRowText">${fmt(row.text)}</span>`;
        html += `<span class="zoAssign">zugeordnet: <strong>${fmt(row.assigned)}</strong></span>`;
        html += `<div class="zoRowCtl">`;
        html += `<label class="zoFlag"><input type="checkbox" data-flag="${key}"${st.flag ? " checked" : ""}${checked ? " disabled" : ""}> als falsch markieren</label>`;
        html += `<select class="zoChoice" data-choice="${key}"${(!st.flag || checked) ? " disabled" : ""}${st.flag ? "" : " hidden"} aria-label="richtige Zuordnung">`;
        html += `<option value="">– richtige Zuordnung –</option>`;
        (labelOrders[ti] || []).forEach((l) => {
          html += `<option value="${esc(l)}"${norm(l) === norm(st.choice) ? " selected" : ""}>${esc(l)}</option>`;
        });
        html += `</select>`;
        html += `</div>`;   // zoRowCtl
        html += `</div>`;   // zoRowBody
        html += `<span class="zoMark" data-mark="${key}"></span>`;
        html += `<div class="zoSol" data-sol="${key}" hidden></div>`;
        html += `</li>`;
      });
      html += `</ul>`;
      html += `</section>`;
    });

    html += `<div class="zoActions">
      <button class="primary-btn" data-zo-check="1"${checked ? " disabled" : ""}>Prüfen</button>
      <button class="ghost-btn" data-zo-reset="1">Zurücksetzen</button>
      <span class="zoScore" data-score></span>
    </div>`;
    html += `</div>`;

    mount.innerHTML = html;
    bind();
    if (checked) applyMarks();
  }

  function bind() {
    mount.querySelectorAll("[data-flag]").forEach((cb) => {
      cb.onchange = () => {
        const k = cb.dataset.flag;
        if (!state[k]) state[k] = { flag: false, choice: "" };
        state[k].flag = cb.checked;
        if (!cb.checked) state[k].choice = "";
        render();       // Dropdown ein-/ausblenden
      };
    });
    mount.querySelectorAll("[data-choice]").forEach((se) => {
      se.onchange = () => { if (state[se.dataset.choice]) state[se.dataset.choice].choice = se.value; };
    });
    const back = mount.querySelector("[data-zo-back]");
    if (back) back.onclick = () => { if (typeof ctx.onBack === "function") ctx.onBack(); };
    const chk = mount.querySelector("[data-zo-check]");
    if (chk) chk.onclick = doCheck;
    const rst = mount.querySelector("[data-zo-reset]");
    if (rst) rst.onclick = doReset;
  }

  function doCheck() {
    // aktuelle Auswahl aus dem DOM übernehmen (falls change nicht gefeuert hat)
    mount.querySelectorAll("[data-choice]").forEach((se) => {
      if (state[se.dataset.choice]) state[se.dataset.choice].choice = se.value;
    });
    checked = true;
    render();
  }

  function doReset() {
    checked = false;
    initState();
    render();
  }

  function applyMarks() {
    const tasks = data.tasks || [];
    let correct = 0, total = 0;
    tasks.forEach((task, ti) => {
      (task.rows || []).forEach((row, ri) => {
        total++;
        const key = ti + "_" + ri;
        const st = state[key] || { flag: false, choice: "" };
        const isError = norm(row.assigned) !== norm(row.correct);
        let ok;
        if (isError) ok = st.flag && norm(st.choice) === norm(row.correct);
        else ok = !st.flag;
        if (ok) correct++;

        const li = mount.querySelector(`.zoRow[data-key="${key}"]`);
        const mark = mount.querySelector(`[data-mark="${key}"]`);
        const sol = mount.querySelector(`[data-sol="${key}"]`);
        if (li) li.classList.add(ok ? "isCorrect" : "isWrong");
        if (mark) mark.textContent = ok ? "✓" : "✗";
        if (sol) {
          sol.hidden = false;
          let inner = "";
          if (isError) {
            inner += `<span class="solNo">Falsch zugeordnet · richtig: <strong>${fmt(row.correct)}</strong></span>`;
            if (row.explanation) inner += `<span class="solWhy">${fmt(row.explanation)}</span>`;
            if (!ok) {
              if (!st.flag) inner += `<span class="solChosen">Nicht als Fehler erkannt.</span>`;
              else inner += `<span class="solChosen">Deine Korrektur: ${fmt(st.choice || "– keine –")}</span>`;
            }
          } else {
            inner += `<span class="solOk2">Korrekt zugeordnet (${fmt(row.correct)}).</span>`;
            if (st.flag) inner += `<span class="solChosen">Fälschlich als Fehler markiert.</span>`;
            if (row.explanation) inner += `<span class="solWhy">${fmt(row.explanation)}</span>`;
          }
          sol.innerHTML = inner;
        }
      });
    });
    const pct = total ? Math.round((correct / total) * 100) : 0;
    const score = mount.querySelector("[data-score]");
    if (score) {
      score.textContent = `${correct} / ${total} richtig · ${pct}%`;
      score.classList.add(pct >= 70 ? "scoreGood" : pct >= 50 ? "scoreMid" : "scoreLow");
    }
  }
})();
