# Projekt: Lernquiz

Statische Web-App für interaktive Lernquizze. Reines HTML/CSS/JS, **kein Build-Schritt**,
**keine Abhängigkeiten**. Deploybar auf GitHub Pages.

## Aufbau

- `index.html` – Grundgerüst
- `styles.css` – Styling
- `app.js` – gesamte Logik (Übersicht → Quiz → Ergebnis)
- `data/subjects.json` – Manifest: Liste aller verfügbaren Quizze
- `data/<id>.json` – je eine Datei pro Quiz

Die App lädt zuerst `data/subjects.json`, zeigt eine Kachel pro Eintrag und lädt bei Klick
die zugehörige Quiz-Datei.

## Ein neues Quiz hinzufügen (wichtigster Task)

Wenn der Nutzer sinngemäß sagt „erstelle ein Quiz aus diesem Stoff/Skript/Thema", tue **genau zwei Dinge**:

1. Lege `data/<id>.json` nach dem Schema unten an (`<id>` = kleinbuchstaben, mit Bindestrichen, z. B. `bio-genetik`).
2. Ergänze **einen** Eintrag in `data/subjects.json` im Array `subjects`.

Danach ist das Quiz sofort verfügbar. Keine weiteren Codeänderungen nötig.

**Standard-Stil (immer so erzeugen): wie `data/psym20-uebung-set2.json`.**
Das heißt konkret für jedes neue Quiz:
- Jede Frage bekommt ein `topic` (Themenbereich). So funktionieren Themenfilter und
  Auswertung pro Thema. Frei erfundene Themen sind ok – sinnvoll gruppieren.
- Schwere Fragen mit `"hard": true` markieren.
- Wo es eine typische Denkfalle gibt, einen kurzen `trap`-Hinweis ergänzen.
- Jede Frage bekommt eine `explanation`, die begründet, warum die richtige Antwort
  richtig und die Distraktoren falsch sind.
- `showGrade` auf `true`, wenn es ein benotetes Prüfungs-Fach ist (dt. Notenskala);
  bei Vokabeln/Faktenwissen weglassen.
Nur wenn der Nutzer ausdrücklich ein schlichtes Quiz will, dürfen `topic`/`hard`/`trap` entfallen.

### Schema einer Quiz-Datei (`data/<id>.json`)

```json
{
  "id": "bio-genetik",
  "title": "Genetik – Grundbegriffe",
  "subject": "Biologie",
  "description": "Kurze Beschreibung fürs Übersichts-Kärtchen.",
  "showGrade": false,
  "questions": [
    {
      "question": "Fragetext? Code mit `Backticks` wird als <code> dargestellt.",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "answer": 0,
      "explanation": "Warum diese Antwort richtig ist (wird nach dem Antworten gezeigt).",
      "topic": "Vererbung",
      "hard": true,
      "trap": "Kurzer Hinweis auf die typische Denkfalle."
    }
  ]
}
```

Pflichtfelder pro Frage: `question`, `options`, `answer`.

Regeln:
- `answer` ist der **0-basierte Index** der richtigen Option (0 = erste Option).
- 2–6 Optionen pro Frage. Es gibt genau eine richtige Antwort (Single Choice).
- `explanation` ist optional, aber empfohlen – gutes Lernfeedback.
- Für Code/Formeln im Text `Backticks` verwenden – daraus wird `<code>`.
- `id` in der Datei sollte mit dem Dateinamen und dem Manifest-Eintrag übereinstimmen.

Optionale Felder (schalten Zusatzfunktionen frei; weglassen = schlichtes Quiz):
- `topic` (Frage): Themen-Tag. Sobald mind. eine Frage ein Thema hat, erscheinen
  Themenfilter-Chips und eine Auswertung pro Thema. Farben werden automatisch vergeben.
- `hard` (Frage, true/false): zeigt ein „SCHWER“-Badge.
- `trap` (Frage): kurzer Fallen-Hinweis, wird über der Erklärung angezeigt.
- `showGrade` (Quiz, true/false): zeigt am Ende eine Notenschätzung (dt. Skala).
  Nur für benotete Fächer sinnvoll – bei z. B. Vokabeln weglassen.

### Manifest-Eintrag (`data/subjects.json`)

```json
{ "id": "bio-genetik", "file": "bio-genetik.json", "title": "Genetik – Grundbegriffe", "subject": "Biologie", "description": "Kurze Beschreibung." }
```

## Qualität von generierten Quizzen

- Fragen eindeutig formulieren, genau eine klar richtige Option.
- Distraktoren (falsche Optionen) plausibel, nicht offensichtlich absurd.
- Erklärungen kurz halten (1–3 Sätze) und den Kern begründen.
- Nach dem Anlegen prüfen: ist das JSON valide? (`python3 -m json.tool data/<id>.json`)

## Nicht tun

- Keine Frameworks, kein npm, kein Build-System einführen (Ziel: bleibt copy-&-deploy-fähig).
- `answer` nie als 1-basiert schreiben.
