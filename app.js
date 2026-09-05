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
let currentSubject = null;       // aktuell gewähltes Fach (für Zurück-Navigation)
let faecherList = [];            // deklarierte Fächer aus subjects.json (auch ohne Sets)

// Roter-Faden-Navigation: aktuelle Ansicht + Rücksprung nach einem Quiz.
let view = "subjects";           // "subjects" | "map" | "list" | "quiz"
let quizReturn = null;           // Funktion: wohin nach dem Quiz zurück (Map oder Liste)
const mapCache = {};             // slug -> geladene Map (oder null bei fehlender Datei)
const quizCache = {};            // file -> geparstes Quiz (Pool fürs Zufallsquiz)
const RANDOM_COUNT = 45;         // Fragen pro Zufallsquiz

// --- Laden -----------------------------------------------------------------

async function init() {
  try {
    const res = await fetch("data/subjects.json", { cache: "no-store" });
    if (!res.ok) throw new Error(`subjects.json: HTTP ${res.status}`);
    const data = await res.json();
    subjects = Array.isArray(data.subjects) ? data.subjects : [];
    faecherList = Array.isArray(data.faecher) ? data.faecher : [];
    renderSubjects();
  } catch (err) {
    showError(
      "Konnte die Quiz-Übersicht nicht laden. Läuft die App über einen Webserver? " +
      "(Beim Öffnen per Doppelklick blockiert der Browser das Nachladen von Dateien.) " +
      `Details: ${err.message}`
    );
  }
}

// Einzelne Quiz-Datei laden (gecacht) – Basis für loadQuiz und den Zufallspool.
async function loadQuizFile(file) {
  if (quizCache[file]) return quizCache[file];
  const res = await fetch(`data/${file}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`${file}: HTTP ${res.status}`);
  const q = await res.json();
  quizCache[file] = q;
  return q;
}

async function loadQuiz(file) {
  app.innerHTML = `<p class="loading">Lade Quiz …</p>`;
  try {
    const q = await loadQuizFile(file);
    // Lückentext-Sets tragen "type":"lueckentext" und werden an cloze.js delegiert;
    // die MC-Engine bleibt davon unberührt.
    if (q.type === "lueckentext") {
      if (typeof window.renderCloze !== "function") throw new Error("Lückentext-Render (cloze.js) fehlt.");
      quiz = null;
      view = "quiz";
      currentSubject = currentSubject || q.subject || null;
      const back = quizReturn || (() => renderSets(currentSubject));
      window.renderCloze(q, { onBack: back });
      return;
    }
        // Zuordnungs-Sets tragen "type":"zuordnung" und werden an zuordnung.js delegiert;
    // MC-Engine und cloze.js bleiben unberührt.
    if (q.type === "zuordnung") {
      if (typeof window.renderZuordnung !== "function") throw new Error("Zuordnungs-Render (zuordnung.js) fehlt.");
      quiz = null;
      view = "quiz";
      currentSubject = currentSubject || q.subject || null;
      const back = quizReturn || (() => renderSets(currentSubject));
      window.renderZuordnung(q, { onBack: back });
      return;
    }
    if (!q.questions || !q.questions.length) throw new Error("Quiz enthält keine Fragen.");
    quiz = q;
    view = "quiz";
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

// Ebene 1: Fächer (eindeutige subject-Werte). Klick -> Sets dieses Fachs.
function renderSubjects() {
  homeBtn.hidden = true;
  appTitle.textContent = "Lernquiz";
  quiz = null;
  view = "subjects";
  quizReturn = null;

  if (!subjects.length) {
    showError("Noch keine Quizze vorhanden. Lege eins in data/ an und trage es in subjects.json ein.");
    return;
  }

  // Anzahl der Sets je Fach.
  const counts = {};
  subjects.forEach((s) => {
    const subj = s.subject || "Ohne Fach";
    counts[subj] = (counts[subj] || 0) + 1;
  });
  // Level-1-Menü: deklarierte Fächer (auch ohne Sets); sonst aus den Sets abgeleitet.
  const faecher = faecherList.length ? faecherList : Object.keys(counts);

  const cards = faecher.map((subj) => {
    const n = counts[subj] || 0;
    return `
    <button class="subject-card" data-subject="${escapeHtml(subj)}">
      <h3>${escapeHtml(subj)}</h3>
      <p class="count">${n} ${n === 1 ? "Set" : "Sets"}</p>
    </button>`;
  }).join("");

  app.innerHTML = `
    ${randomCard(null)}
    <p class="lead">Wähle ein Fach:</p>
    <div class="subject-grid">${cards}</div>
  `;
  bindRandomCard();
  app.querySelectorAll(".subject-card").forEach((btn) => {
    btn.addEventListener("click", () => renderMap(btn.dataset.subject));
  });
}

// Ebene 2 (Liste): alle Sets eines Fachs – schlichte Fallback-Ansicht neben der Map.
function renderSets(subject) {
  homeBtn.hidden = false;          // Zurück-Button führt zurück zur Map
  appTitle.textContent = "Lernquiz";
  quiz = null;
  view = "list";
  currentSubject = subject;

  const sets = subjects.filter((s) => (s.subject || "Ohne Fach") === subject);

  const cards = sets.map((s) => `
    <button class="subject-card" data-file="${escapeHtml(s.file)}">
      ${s.subject ? `<span class="tag">${escapeHtml(s.subject)}</span>` : ""}
      <h3>${escapeHtml(s.title || s.file)}</h3>
      <p>${escapeHtml(s.description || "")}</p>
    </button>
  `).join("");

  const body = sets.length
    ? `<div class="subject-grid">${cards}</div>`
    : `<p class="lead">Für dieses Fach gibt es noch keine Sets.</p>`;

  app.innerHTML = `
    ${sets.length ? randomCard(subject) : ""}
    <div class="rf-toolbar">
      <p class="lead">${escapeHtml(subject)} – alle Quizze:</p>
      <button class="ghost-btn" data-tomap="1">Zur Struktur (roter Faden)</button>
    </div>
    ${body}
  `;
  bindRandomCard();
  const tm = app.querySelector("[data-tomap]");
  if (tm) tm.onclick = () => renderMap(subject);
  app.querySelectorAll(".subject-card").forEach((btn) => {
    btn.addEventListener("click", () => {
      quizReturn = () => renderSets(subject);
      loadQuiz(btn.dataset.file);
    });
  });
}

// --- Zufallsquiz -----------------------------------------------------------

// Kachel für ein Zufallsquiz. subject = null -> fächerübergreifend.
function randomCard(subject) {
  return `
    <button class="random-card" data-random="${subject ? escapeHtml(subject) : ""}">
      <span class="random-icon">🎲</span>
      <span class="random-text">
        <strong>Zufallsquiz${subject ? "" : " – alle Fächer"}</strong>
        <span>Bis zu ${RANDOM_COUNT} zufällige Fragen aus ${subject ? "allen Quizzen dieses Fachs" : "dem gesamten Fragenpool"} – ohne ${subject ? "Themenanzeige" : "Fach- und Themenanzeige"}.</span>
      </span>
    </button>`;
}

function bindRandomCard() {
  const btn = app.querySelector("[data-random]");
  if (btn) btn.onclick = () => startRandomQuiz(btn.dataset.random || null);
}

// Baut ein synthetisches Quiz aus zufälligen Fragen aller passenden Sets.
// Die Fragen werden ohne `topic` übernommen: dadurch entfallen Themen-Chips,
// das Themen-Tag an der Frage und die Auswertung pro Thema – man sieht der
// Frage also weder Thema noch Fach an. Lückentext-Sets bleiben außen vor,
// weil sie keine Single-Choice-Fragen enthalten.
async function startRandomQuiz(subject) {
  app.innerHTML = `<p class="loading">Stelle Zufallsquiz zusammen …</p>`;
  homeBtn.hidden = false;
  view = "quiz";
  currentSubject = subject;
  quizReturn = subject ? () => renderMap(subject) : renderSubjects;

  const sets = subject
    ? subjects.filter((s) => (s.subject || "Ohne Fach") === subject)
    : subjects;

  try {
    const loaded = await Promise.all(sets.map((s) => loadQuizFile(s.file)));
    const pool = [];
    loaded.forEach((q) => {
      if (q.type === "lueckentext") return;
      if (q.type === "zuordnung") return;       // Zuordnungs-Sets gehören nicht in den MC-Pool       // Lückentexte gehören nicht in den MC-Pool
      (q.questions || []).forEach((item) => {
        const { topic, ...rest } = item;           // Thema (und damit das Fach) verbergen
        pool.push(rest);
      });
    });
    if (!pool.length) throw new Error("Keine Fragen im Pool.");

    const picked = shuffleArray(pool.slice()).slice(0, RANDOM_COUNT);
    quiz = {
      id: "__random",
      title: subject ? `${subject} · Zufallsquiz` : "Zufallsquiz · alle Fächer",
      questions: picked,
      _isRandom: true,
      _randomSubject: subject
    };
    topicColors = {};
    state = {
      idx: 0, answers: {}, showResult: false, filterTopic: "Alle",
      order: picked.map((_, i) => i), shuffled: false
    };
    render();
  } catch (err) {
    showError(`Zufallsquiz konnte nicht erstellt werden. Details: ${err.message}`);
  }
}

// --- Roter Faden: fachspezifische Struktur-Grafik --------------------------

function slugify(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

// Map laden (mit Cache); fehlende Datei -> null (Fallback greift beim Auflösen).
async function loadMap(subject) {
  const slug = slugify(subject);
  if (slug in mapCache) return mapCache[slug];
  try {
    const res = await fetch(`data/maps/${slug}.json`, { cache: "no-store" });
    mapCache[slug] = res.ok ? await res.json() : null;
  } catch (_) {
    mapCache[slug] = null;
  }
  return mapCache[slug];
}

// Map + subjects.json zu gerenderten Knoten zusammenführen. Nichts geht verloren:
// nicht zugeordnete Quizze landen im Fallback-Knoten "Weitere Quizze".
function resolveMap(subject, mapData) {
  const entries = subjects.filter((s) => (s.subject || "Ohne Fach") === subject);
  const byId = {};
  entries.forEach((s) => { if (s.id) byId[s.id] = s; });
  const used = new Set();

  let layout = "linear", title = subject, groups = [], nodes = [];
  if (mapData) {
    layout = mapData.layout || "linear";
    title = mapData.title || subject;
    groups = Array.isArray(mapData.groups) ? mapData.groups.map((g) => ({ ...g })) : [];
    nodes = (Array.isArray(mapData.nodes) ? mapData.nodes : []).map((n) => {
      const quizzes = (n.quizIds || []).map((id) => byId[id]).filter(Boolean);
      quizzes.forEach((q) => used.add(q.id));
      return { ...n, quizzes };
    });
  }
  const leftover = entries.filter((s) => !used.has(s.id));
  if (leftover.length) {
    nodes.push({ id: "__fallback", label: "Weitere Quizze", group: "__fallback", order: 9999, quizzes: leftover });
    if (!groups.some((g) => g.id === "__fallback")) groups.push({ id: "__fallback", label: "Weitere Quizze" });
  }
  return { subject, title, layout, groups, nodes };
}

let rfPanelSeq = 0;

function rfNodeHtml(node) {
  const has = node.quizzes && node.quizzes.length > 0;
  if (!has) {
    return `<div class="rf-node empty">
      <span class="rf-node-label">${escapeHtml(node.label)}</span>
      <span class="rf-gap">kein Quiz</span>
    </div>`;
  }
  const pid = `rf-panel-${rfPanelSeq++}`;
  const items = node.quizzes.map((q) => {
    const isLt = q.type === "lueckentext";
    const badge = isLt
      ? `<span class="rf-badge lt">Lückentext</span>`
      : q.type === "zuordnung"
      ? `<span class="rf-badge zo">Zuordnen</span>`
      : `<span class="rf-badge mc">MC</span>`;
    return `<button class="rf-quiz" data-file="${escapeHtml(q.file)}">
      <span class="rf-quiz-title">${escapeHtml(q.title || q.file)}</span>${badge}
    </button>`;
  }).join("");
  return `<button class="rf-node" aria-expanded="false" aria-controls="${pid}">
      <span class="rf-node-label">${escapeHtml(node.label)}</span>
      <span class="rf-count">${node.quizzes.length}</span>
    </button>
    <div class="rf-panel" id="${pid}" role="region" hidden>${items}</div>`;
}

function rfNodesOfGroup(nodes, gid) {
  return nodes.filter((n) => n.group === gid).sort((a, b) => (a.order || 0) - (b.order || 0));
}

function rfRenderColumns(m) {
  const spanGroups = m.groups.filter((g) => g.span);
  const colGroups = m.groups.filter((g) => !g.span);
  let html = "";
  spanGroups.forEach((g) => {
    html += `<section class="rf-band"><h3 class="rf-group-title">${escapeHtml(g.label)}</h3>
      <div class="rf-band-nodes">${rfNodesOfGroup(m.nodes, g.id).map(rfNodeHtml).join("")}</div></section>`;
  });
  html += `<div class="rf-columns">` + colGroups.map((g) =>
    `<div class="rf-column"><h3 class="rf-group-title">${escapeHtml(g.label)}</h3>
      ${rfNodesOfGroup(m.nodes, g.id).map(rfNodeHtml).join("")}</div>`
  ).join("") + `</div>`;
  return html;
}

function rfRenderGrouped(m) {
  return m.groups.map((g) =>
    `<section class="rf-group"><h3 class="rf-group-title">${escapeHtml(g.label)}</h3>
      <div class="rf-group-nodes">${rfNodesOfGroup(m.nodes, g.id).map(rfNodeHtml).join("")}</div></section>`
  ).join("");
}

function rfRenderLinear(m) {
  const chain = m.nodes.filter((n) => !n.group).sort((a, b) => (a.order || 0) - (b.order || 0));
  let html = `<div class="rf-chain">`;
  chain.forEach((n, i) => {
    if (i > 0) html += `<div class="rf-connector" aria-hidden="true"></div>`;
    html += rfNodeHtml(n);
  });
  html += `</div>`;
  // Nebenstränge / übergreifende Knoten als eigene Abschnitte.
  m.groups.forEach((g) => {
    const gn = rfNodesOfGroup(m.nodes, g.id);
    if (gn.length) {
      html += `<section class="rf-group"><h3 class="rf-group-title">${escapeHtml(g.label)}</h3>
        <div class="rf-group-nodes">${gn.map(rfNodeHtml).join("")}</div></section>`;
    }
  });
  return html;
}

async function renderMap(subject) {
  homeBtn.hidden = false;
  appTitle.textContent = "Lernquiz";
  quiz = null;
  view = "map";
  currentSubject = subject;
  quizReturn = () => renderMap(subject);
  rfPanelSeq = 0;

  app.innerHTML = `<p class="loading">Lade Struktur …</p>`;
  const mapData = await loadMap(subject);
  const m = resolveMap(subject, mapData);

  let graph = "";
  if (m.layout === "columns") graph = rfRenderColumns(m);
  else if (m.layout === "grouped") graph = rfRenderGrouped(m);
  else graph = rfRenderLinear(m);

  const hasSets = subjects.some((s) => (s.subject || "Ohne Fach") === subject);
  app.innerHTML = `
    ${hasSets ? randomCard(subject) : ""}
    <div class="rf-toolbar">
      <p class="lead">${escapeHtml(m.title)}</p>
      <button class="ghost-btn" data-tolist="1">Alle Quizze (Liste)</button>
    </div>
    <p class="rf-hint">Wähle einen Knoten, um die zugehörigen Quizze zu öffnen. Knoten ohne Quiz zeigen eine Lücke.</p>
    <div class="rf-map rf-${escapeHtml(m.layout)}">${graph}</div>
  `;

  bindRandomCard();
  const tl = app.querySelector("[data-tolist]");
  if (tl) tl.onclick = () => renderSets(subject);

  app.querySelectorAll(".rf-node").forEach((btn) => {
    btn.addEventListener("click", () => {
      const panel = document.getElementById(btn.getAttribute("aria-controls"));
      const open = btn.getAttribute("aria-expanded") === "true";
      btn.setAttribute("aria-expanded", open ? "false" : "true");
      if (panel) panel.hidden = open;
    });
  });
  app.querySelectorAll(".rf-quiz").forEach((btn) => {
    btn.addEventListener("click", () => {
      quizReturn = () => renderMap(subject);
      loadQuiz(btn.dataset.file);
    });
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
  html += `<span class="metaTags">`;
  if (q.transfer) html += `<span class="transferTag">ANWENDUNG</span>`;
  if (q.hard) html += `<span class="hardTag">SCHWER</span>`;
  html += `</span>`;
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
  app.querySelector("[data-reset]").onclick = () =>
    quiz._isRandom ? startRandomQuiz(quiz._randomSubject) : loadQuiz(quiz._file);
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

// Zurück-Button ist kontextabhängig: aus dem Quiz zurück zur Herkunft (Map oder Liste),
// aus der Liste zur Map, aus der Map zu den Fächern.
homeBtn.addEventListener("click", () => {
  if (view === "quiz") { (quizReturn || (() => renderMap(currentSubject)))(); return; }
  if (view === "list") { renderMap(currentSubject); return; }
  renderSubjects();
});

init();
// Ende
