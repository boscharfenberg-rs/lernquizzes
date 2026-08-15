# Lernquiz

Eine kleine, benutzerfreundliche Web-App für interaktive Lernquizze – ohne Framework,
ohne Build-Schritt, ohne Datenbank. Ein Quiz ist einfach eine JSON-Datei im Ordner `data/`.

## Lokal starten

Weil die App Dateien nachlädt, muss sie über einen kleinen Webserver laufen
(Doppelklick auf `index.html` funktioniert **nicht** – der Browser blockiert das Nachladen).

```bash
cd lernquiz
python3 -m http.server 8000
```

Dann im Browser öffnen: http://localhost:8000

(Alternativ, falls Node installiert ist: `npx serve` )

## Von anderen Geräten öffnen

Es gibt zwei Wege – je nachdem, ob es nur kurz im selben Netz sein soll oder dauerhaft für alle.

**A) Gleiches WLAN (schnell, nur während dein PC läuft).**
`python -m http.server 8000` ist bereits für das ganze Netzwerk erreichbar. Andere im
selben WLAN öffnen einfach `http://<DEINE-IP>:8000`.
- Deine IP findest du unter Windows mit `ipconfig` (Zeile „IPv4-Adresse", z. B. `192.168.0.42`).
- Also z. B. `http://192.168.0.42:8000` auf dem Handy im selben WLAN.
- Beim ersten Mal fragt die Windows-Firewall, ob Python im Netzwerk kommunizieren darf → erlauben.
- Grenzen: nur im selben WLAN, nur solange dein PC den Server laufen lässt.

**B) Dauerhaft & überall (empfohlen zum Teilen).**
Einmal auf GitHub Pages veröffentlichen (siehe unten) → jeder mit dem Link kann es
jederzeit von jedem Gerät öffnen, ganz ohne deinen PC.

## Ein neues Fach / Quiz hinzufügen

Zwei Schritte:

1. Neue Datei `data/<name>.json` anlegen (Vorlage: eine bestehende Datei in `data/` kopieren).
2. In `data/subjects.json` einen Eintrag ergänzen, der auf die Datei zeigt.

Fertig – beim nächsten Neuladen taucht das Fach in der Übersicht auf.
Das genaue Format steht in `CLAUDE.md`.

### …mit Claude Code generieren lassen

Das ist der bequemste Weg. Öffne das Projekt in Claude Code und sag z. B.:

> „Erstelle aus dieser Zusammenfassung ein Quiz mit 10 Fragen und trag es in die Übersicht ein."
> (Skript/Text dazugeben oder Datei referenzieren.)

Claude Code kennt über `CLAUDE.md` das Format, legt die Quiz-Datei an und ergänzt das Manifest automatisch.

## Auf GitHub Pages veröffentlichen (kostenlos, teilbarer Link)

1. Neues GitHub-Repository anlegen und dieses Projekt hineinlegen:
   ```bash
   cd lernquiz
   git init
   git add .
   git commit -m "Lernquiz: erste Version"
   git branch -M main
   git remote add origin https://github.com/<DEIN-NAME>/lernquiz.git
   git push -u origin main
   ```
2. Auf GitHub: **Settings → Pages → Build and deployment → Source: „Deploy from a branch"**,
   Branch `main`, Ordner `/ (root)`, speichern.
3. Nach ein bis zwei Minuten ist die App unter
   `https://<DEIN-NAME>.github.io/lernquiz/` erreichbar – diesen Link kannst du teilen.

Alternative mit ähnlich wenig Aufwand: [Vercel](https://vercel.com) oder [Netlify](https://netlify.com)
(Repository verbinden, kein Build-Befehl nötig, Output-Verzeichnis = Projektwurzel).

## Struktur

```
lernquiz/
├─ index.html
├─ styles.css
├─ app.js
├─ CLAUDE.md            ← Format-Spec & Anweisungen für Claude Code
├─ README.md
└─ data/
   ├─ subjects.json     ← Manifest (Liste aller Quizze)
   ├─ psym20-statistik.json
   └─ hauptstaedte-europa.json
```

## Bedienung

- Thema in der Übersicht wählen.
- Frage per Klick **oder Taste** beantworten (`1`–`6` bzw. `A`–`F`).
- Nach der Antwort erscheint Feedback samt Erklärung; mit `Enter` oder „Weiter" geht es weiter.
- Am Ende: Ergebnis mit „Nochmal" oder „Anderes Thema".

## Roter-Faden-Navigation (Struktur-Grafik je Fach)

Nach der Fach-Auswahl erscheint eine fachspezifische Struktur-Grafik, an deren
Knoten die Quizze hängen. Die Struktur ist **datengetrieben** und ohne Code
editierbar: pro Fach eine Datei `data/maps/<slug>.json`. Der `<slug>` wird aus
dem Fach-Namen abgeleitet (Kleinbuchstaben, Umlaute als ae/oe/ue/ss, alles
Nicht-Alphanumerische zu `-`), z. B. `Psychologische Diagnostik` →
`psychologische-diagnostik.json`.

Schema:

```json
{
  "subject": "<exakter Fach-String aus faecher>",
  "title": "Überschrift der Ansicht",
  "layout": "linear" | "columns" | "grouped",
  "groups": [ { "id": "g1", "label": "Sichtbarer Titel", "span": true } ],
  "nodes":  [ { "id": "n1", "label": "Knoten", "group": "g1", "order": 1,
                "quizIds": ["<id aus subjects.json>", "..."] } ],
  "edges":  [ { "from": "n1", "to": "n2" } ]
}
```

- **layout**: `linear` = vertikale Kette (Knoten ohne `group`, sortiert nach
  `order`; Knoten mit `group` erscheinen als eigene Abschnitte darunter).
  `columns` = `groups` als Spalten nebeneinander (`"span": true` = Querklammer
  über allen Spalten). `grouped` = `groups` als gestapelte Blöcke.
- **Knoten hinzufügen**: neues Objekt in `nodes` mit eindeutiger `id`, `label`,
  passender `group` (bei columns/grouped) und `order`.
- **Quiz zuordnen**: die `id` des Sets (wie in `data/subjects.json`) in `quizIds`
  des gewünschten Knotens eintragen. Ein Set kann an mehreren Knoten hängen.
- **Nichts geht verloren**: Sets, die in keinem Knoten stehen, landen automatisch
  im Knoten „Weitere Quizze". Fehlt die Map-Datei ganz, werden alle Sets des
  Fachs dort gesammelt.
- Knoten ohne Quiz bleiben sichtbar und sind als „kein Quiz" (Abdeckungslücke)
  markiert. MC- und Lückentext-Sets werden am Knoten mit Badge unterschieden.
