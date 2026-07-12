/* Lernquiz – Vanilla JS, kein Build-Schritt.
 * Zwei Ansichten: Fach-Übersicht (aus data/subjects.json) und die Quiz-Engine.
 *
 * Quiz-Schema (data/<id>.json):
 *   { id, title, subject, description, showGrade?, questions: [ {
 *       question, options[], answer(index), explanation?, topic?, hard?, trap?
 *   } ] }
 * Optionale Felder (topic/hard/trap/showGrade) schalten Zusatzfunktionen frei;
 * fehlen sie, verhält sich die App wie ein schlichtes Quiz.
 */

const app = document.getElementById("app");
const homeBtn = document.getElementById("home-btn");
const appTitle = document.getElementById("app-title");

const LETTERS = ["A", "B", "C", "D", "E", "F"];
const PALETTE = [
  "#5B6BA8", "#2E8F86", "#2E9E7B", "#C77D52", "#D5764A", "#A65D8E",
  "#B08A4F", "#7A6BB0", "#4C86A8", "#7C8496", "#3b5bdb", "#2b8a3e"
];

let subjects = [];
let quiz = null;                 // aktuell geladenes Quiz
let topicColors = {};            // Thema -> Farbe
let state = { idx: 0, answers: {}, showResult: false, filterTopic: "Alle" };

// --- Laden -----------------------------------------------------------------

async function init() {
  try {
    const res = await fetch("data/subjects.json", { cache: "no-store" });
    if (!res.ok) throw new Error(`subjects.json: HTTP ${res.status}`);
    const data = await res.json();
    subjects = Array.isArray(data.subjects) ? data.subjects : [];
    renderSubjects();
  } catch (err) {
    showError(
      "Konnte die Quiz-Übersicht nicht laden. Läuft die App über einen Webserver? " +
      "(Beim Öffnen per Doppelklick blockiert der Browser das Nachladen von Dateien.) " +
      `Details: ${err.message}`
    );
  }
}

async function loadQuiz(file) {
  app.innerHTML = `<p class="loading">Lade Quiz …</p>`;
  try {
    const res = await fetch(`data/${file}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`${file}: HTTP ${res.status}`);
    const q = await res.json();
    if (!q.questions || !q.questions.length) throw new Error("Quiz enthält keine Fragen.");
    quiz = q;
    quiz._file = file;
    topicColors = buildTopicColors(q.questions);
    state = {
      idx: 0, answers: {}, showResult: false, filterTopic: "Alle",
      order: q.questions.map((_, i) => i), shuffled: false
    };
    render();
  } catch (err) {
    showError(`Quiz konnte nicht geladen werden. Details: ${err.message}`);
  }
}

// --- Übersicht -------------------------------------------------------------

function renderSubjects() {
  homeBtn.hidden = true;
  appTitle.textContent = "Lernquiz";
  quiz = null;

  if (!subjects.length) {
    showError("Noch keine Quizze vorhanden. Lege eins in data/ an und trage es in subjects.json ein.");
    return;
  }

  const cards = subjects.map((s) => `
    <button class="subject-card" data-file="${escapeHtml(s.file)}">
      ${s.subject ? `<span class="tag">${escapeHtml(s.subject)}</span>` : ""}
      <h3>${escapeHtml(s.title || s.file)}</h3>
      <p>${escapeHtml(s.description || "")}</p>
    </button>
  `).join("");

  app.innerHTML = `
    <p class="lead">Wähle ein Thema:</p>
    <div class="subject-grid">${cards}</div>
  `;
  app.querySelectorAll(".subject-card").forEach((btn) => {
    btn.addEventListener("click", () => loadQuiz(btn.dataset.file));
  });
}

// --- Quiz ------------------------------------------------------------------

function hasTopics() {
  return quiz.questions.some((q) => q.topic);
}

function activeIndices() {
  // Reihenfolge aus state.order (ggf. gemischt), danach nach Thema gefiltert.
  return state.order
    .filter((i) => state.filterTopic === "Alle" || quiz.questions[i].topic === state.filterTopic);
}

function render() {
  if (state.showResult) return renderResult();

  homeBtn.hidden = false;
  appTitle.textContent = quiz.title || "Quiz";

  const ai = activeIndices();
  if (state.idx >= ai.length) state.idx = Math.max(0, ai.length - 1);
  const gi = ai[state.idx];
  const q = quiz.questions[gi];
  const chosen = state.answers[gi];
  const answered = chosen !== undefined;
  const accent = q.topic ? topicColors[q.topic] : "var(--accent)";

  const answeredCount = Object.keys(state.answers).length;

  let html = "";

  // Steuerung: Fragen mischen (immer verfügbar)
  html += `<div class="controls">
    <button class="chip-btn" data-shuffle="1">${state.shuffled ? "↩ Originalreihenfolge" : "🔀 Fragen mischen"}</button>
  </div>`;

  // Themenfilter (nur wenn Themen vorhanden)
  if (hasTopics()) {
    const topics = ["Alle", ...distinctTopics(quiz.questions)];
    html += `<div class="filterRow">` + topics.map((t) => {
      const on = state.filterTopic === t;
      const style = on && t !== "Alle" ? `style="background:${topicColors[t]};border-color:${topicColors[t]};color:#fff"` : "";
      return `<button class="filterChip${on ? " active" : ""}" ${style} data-filter="${escapeHtml(t)}">${escapeHtml(t)}</button>`;
    }).join("") + `</div>`;
  }

  // Fortschritt
  const pct = ai.length ? ((state.idx + 1) / ai.length) * 100 : 0;
  html += `
    <div class="progress-wrap">
      <div class="progress-meta">
        <span>Frage ${state.idx + 1} von ${ai.length}</span>
        <span>${answeredCount} / ${quiz.questions.length} beantwortet</span>
      </div>
      <div class="progress-bar"><div class="progress-fill" style="width:${pct}%;background:${accent}"></div></div>
    </div>`;

  // Fragekarte
  html += `<div class="question-card">`;
  html += `<div class="qMeta">`;
  if (q.topic) html += `<span class="topicTag" style="background:${accent}">${escapeHtml(q.topic)}</span>`;
  else html += `<span></span>`;
  if (q.hard) html += `<span class="hardTag">SCHWER</span>`;
  html += `</div>`;

  if (q.isImage) html += `<div class="imageNote">🖼 Bildfrage – im Original mit Grafik. Die markierte Lösung orientiert sich an der Original-Grafik; ohne Bild bitte an der Vorlage verifizieren.</div>`;
  html += `<p class="question-text">${fmt(q.question)}</p>`;
  html += `<div class="options">`;
  q.options.forEach((opt, i) => {
    let cls = "option";
    let keyCls = "key";
    if (answered) {
      if (i === q.answer) { cls += " correct"; keyCls += " correct"; }
      else if (i === chosen) { cls += " wrong"; keyCls += " wrong"; }
      else cls += " dim";
    }
    html += `<button class="${cls}" data-opt="${i}"${answered ? " disabled" : ""}>
      <span class="${keyCls}">${LETTERS[i] || i + 1}</span>
      <span class="label">${fmt(opt)}</span>
    </button>`;
  });
  html += `</div>`;

  // Erklärung
  if (answered) {
    const ok = chosen === q.answer;
    html += `<div class="explanation ${ok ? "ok" : "no"}">`;
    html += `<div class="explainHead">${ok ? "Richtig" : "Nicht ganz"} · richtige Antwort: ${LETTERS[q.answer]}</div>`;
    if (q.trap) html += `<div class="trap">⚠ Falle: ${fmt(q.trap)}</div>`;
    if (q.explanation) html += `<div class="explainBody">${fmt(q.explanation)}</div>`;
    html += `</div>`;
  }

  // Navigation
  html += `<div class="nav">`;
  html += `<button class="navBtn" data-nav="-1"${state.idx === 0 ? " disabled" : ""}>← Zurück</button>`;
  if (state.idx === ai.length - 1) {
    html += `<button class="navBtnPrimary" style="background:${accent}" data-result="1">Auswertung</button>`;
  } else {
    html += `<button class="navBtnPrimary" style="background:${accent}" data-nav="1">Weiter →</button>`;
  }
  html += `</div>`;
  html += `</div>`;

  app.innerHTML = html;
  bindQuiz();
}

function renderResult() {
  homeBtn.hidden = false;
  const total = quiz.questions.length;
  const correct = Object.entries(state.answers).filter(([i, a]) => quiz.questions[i].answer === a).length;
  const pct = Math.round((correct / total) * 100);

  let msg = "Weiter dranbleiben!";
  if (pct >= 90) msg = "Exzellent!";
  else if (pct >= 70) msg = "Gut gemacht.";
  else if (pct >= 50) msg = "Solide – da geht noch mehr.";

  let html = `<div class="result-card">`;
  html += `<div class="resultHeader">Auswertung</div>`;
  html += `<div class="score">${correct}<small> / ${total}</small></div>`;
  const note = quiz.gradeScale ? gradeByCount(correct, quiz.gradeScale) : grade(pct);
  html += `<div class="gradeRow"><span>${pct}% richtig · ${escapeHtml(msg)}</span>`;
  if (quiz.showGrade) html += `<span class="gradePill">Note ≈ ${note}</span>`;
  html += `</div>`;

  // Auswertung pro Thema
  if (hasTopics()) {
    const byTopic = {};
    quiz.questions.forEach((q, i) => {
      const t = q.topic || "Ohne Thema";
      if (!byTopic[t]) byTopic[t] = { c: 0, t: 0 };
      byTopic[t].t++;
      if (state.answers[i] === q.answer) byTopic[t].c++;
    });
    html += `<div class="topicList">`;
    Object.entries(byTopic).forEach(([t, v]) => {
      html += `<div class="topicRow">
        <span class="dot" style="background:${topicColors[t] || "var(--accent)"}"></span>
        <span class="topicName">${escapeHtml(t)}</span>
        <span class="topicScore">${v.c}/${v.t}</span>
      </div>`;
    });
    html += `</div>`;
  }

  html += `<div class="result-actions">
    <button class="primary-btn" data-reset="1">Nochmal</button>
    <button class="ghost-btn" data-back="1">Zurück zu den Fragen</button>
    <button class="ghost-btn" data-home="1">Anderes Thema</button>
  </div>`;
  html += `</div>`;

  app.innerHTML = html;
  bindResult();
}

// --- Events ----------------------------------------------------------------

function bindQuiz() {
  const sh = app.querySelector("[data-shuffle]");
  if (sh) sh.onclick = toggleShuffle;
  app.querySelectorAll("[data-filter]").forEach((b) => {
    b.onclick = () => { state.filterTopic = b.dataset.filter; state.idx = 0; render(); };
  });
  app.querySelectorAll("[data-opt]").forEach((b) => {
    b.onclick = () => selectAnswer(parseInt(b.dataset.opt, 10));
  });
  app.querySelectorAll("[data-nav]").forEach((b) => {
    b.onclick = () => navigate(parseInt(b.dataset.nav, 10));
  });
  const r = app.querySelector("[data-result]");
  if (r) r.onclick = () => { state.showResult = true; render(); };
}

function bindResult() {
  app.querySelector("[data-reset]").onclick = () => loadQuiz(quiz._file);
  app.querySelector("[data-back]").onclick = () => { state.showResult = false; render(); };
  app.querySelector("[data-home]").onclick = renderSubjects;
}

function selectAnswer(chosen) {
  const gi = activeIndices()[state.idx];
  if (state.answers[gi] !== undefined) return; // schon beantwortet
  state.answers[gi] = chosen;
  render();
}

function navigate(delta) {
  const ai = activeIndices();
  const next = state.idx + delta;
  if (next >= 0 && next < ai.length) { state.idx = next; render(); }
}

function toggleShuffle() {
  const natural = quiz.questions.map((_, i) => i);
  state.order = state.shuffled ? natural : shuffleArray(natural);
  state.shuffled = !state.shuffled;
  state.idx = 0; // bei Umsortierung zur ersten Frage; Antworten bleiben erhalten
  render();
}

function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// --- Hilfen ----------------------------------------------------------------

function distinctTopics(questions) {
  return Array.from(new Set(questions.map((q) => q.topic).filter(Boolean)));
}
function buildTopicColors(questions) {
  const map = {};
  distinctTopics(questions).forEach((t, i) => { map[t] = PALETTE[i % PALETTE.length]; });
  return map;
}
function grade(pct) {
  const table = [[95,"1,0"],[90,"1,3"],[85,"1,7"],[80,"2,0"],[73,"2,3"],[68,"2,7"],[62,"3,0"],[57,"3,3"],[52,"3,7"],[50,"4,0"]];
  for (const [min, g] of table) if (pct >= min) return g;
  return "n. b.";
}
// Optionale, quiz-eigene Notentabelle nach Anzahl richtiger Antworten.
function gradeByCount(correct, scale) {
  for (const [min, g] of scale) if (correct >= min) return g;
  return "n. b.";
}

function showError(text) {
  homeBtn.hidden = subjects.length === 0;
  app.innerHTML = `<div class="error">${escapeHtml(text)}</div>`;
}

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
// Sicheres Rendern: erst escapen, dann `Code` in <code> umwandeln.
function fmt(str) {
  return escapeHtml(str).replace(/`([^`]+)`/g, "<code>$1</code>");
}

// Tastatur: 1–6 / A–F zum Antworten, Pfeile / Enter zum Navigieren.
document.addEventListener("keydown", (e) => {
  if (!quiz || state.showResult) return;
  if (e.key === "ArrowRight" || e.key === "Enter") { navigate(1); return; }
  if (e.key === "ArrowLeft") { navigate(-1); return; }
  const gi = activeIndices()[state.idx];
  if (state.answers[gi] !== undefined) return;
  let i = -1;
  if (/^[1-9]$/.test(e.key)) i = parseInt(e.key, 10) - 1;
  else if (/^[a-fA-F]$/.test(e.key)) i = "abcdef".indexOf(e.key.toLowerCase());
  const q = quiz.questions[gi];
  if (i >= 0 && i < q.options.length) selectAnswer(i);
});

homeBtn.addEventListener("click", renderSubjects);

init();
// Ende
