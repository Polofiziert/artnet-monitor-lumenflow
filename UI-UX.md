Wenn man von der **User Experience (UX)** kommt, baut man Werkzeuge, die sich wie eine Verlängerung des eigenen Denkens anfühlen, statt wie ein Hindernisparcours aus Eingabefeldern.

Um das „Apple-Niveau“ an Intuition zu erreichen, nutzen wir Erkenntnisse aus der **Kognitionspsychologie** und der **Informationsvisualisierung** (nach Edward Tufte und Ben Shneiderman).

Hier ist der UI-Masterplan für die „Eierlegende Wollmilchsau“ des Art-Net Monitorings.

---

### 1. Die UI-Philosophie: "Progressive Disclosure"

Das Hauptproblem von DMX Workshop ist der _Cognitive Overload_. Unser Programm folgt dem Prinzip: **Overview first, zoom and filter, then details-on-demand.**

- **Keine Fenster-Wüste:** Alles findet in einem Single-Page-Interface mit klaren Layern statt.
- **Pre-attentive Processing:** Wir nutzen Farben und Formen so, dass das Gehirn Fehler erkennt, _bevor_ man den Text liest (z.B. ein rotes Pulsieren bei Frame-Verlust).

---

### 2. Die drei Kern-Ansichten (Layout)

#### A. Die "Universe Map" (Globaler Überblick)

Anstatt einer Liste nutzen wir ein **Treemap- oder Heatmap-Layout** für alle 32.768 Universen.

- **Visualisierung:** Ein großes Raster aus winzigen Quadraten. Jedes Quadrat ist ein Universum.
- **Verhalten:** Die Helligkeit eines Quadrats zeigt die Daten-Aktivität (LTP/HTP Merge wird durch Mischfarben dargestellt).
- **Wissenschaftlicher Kniff:** Wir nutzen **Horizon Charts** für die Netzwerkauslastung. Sie erlauben es, enorme Datenmengen auf kleinstem Raum präzise darzustellen, indem sie zyklische Daten überlagern.

#### B. Die "Routing Matrix" (Der Dante-Moment)

Inspiriert vom Dante Controller, aber verbessert.

- **Intuition:** Links die Quellen (Pulte, Media Server), oben die Senken (Nodes, Dimmer).
- **Smart-Lines:** Linien zwischen Geräten zeigen nicht nur die Verbindung, sondern fließen visuell (wie kleine Lichtpunkte), um die Datenrate zu symbolisieren.
- **Art-Address Integration:** Ein Klick auf einen Kreuzungspunkt öffnet ein Overlay, um das Universum des Nodes direkt umzuprogrammieren, ohne die Ansicht zu verlassen.

#### C. Der "Channel Inspector" (Mikroskop-Ansicht)

Wenn du ein Universum auswählst, wechselt die Ansicht flüssig (Zoom-Animation) in den Inspector.

- **Der "Sparkline-Grid":** Anstatt nur nackte Zahlen (0-255) zu zeigen, hat jeder Kanal eine kleine **Sparkline (Mini-Graph)** im Hintergrund. Man sieht sofort: „Kanal 5 hat vor 3 Sekunden gewackelt.“
- **Flicker-Detection:** Kanäle, die instabile Werte senden, werden gelb umrandet (Automatisierte Fehlererkennung).

---

### 3. Exklusive Features & Wissenschaftliche Visualisierung

- **Der "Jitter-Oszilloskop":** Für die Netzwerk-Stabilität nutzen wir keine Tabellen, sondern ein **Histogramm der Inter-Packet-Arrival-Time**. Wenn die Balken streuen, ist das Netzwerk instabil. Ein schmaler, hoher Balken bedeutet perfektes Timing.
- **ArtSync-Visualisierung:** Das Tool zeigt visuell an, ob `ArtSync` Pakete im Netzwerk sind und ob die Nodes „im Gleichtakt“ feuern (wichtig für LED-Walls und komplexe Pixelmappings).
- **Semantic Zoom:** Wenn du rauszoomst, verschwinden die Einzelwerte und werden zu farbigen Flächen. Wenn du reinzoomst, erscheinen Bit-Details und RDM-Infos.

---

### 4. Abgleich mit dem Art-Net 4 Standard

Wir stellen sicher, dass alle Protokoll-Features intuitiv abgebildet sind:

1. **ArtPoll / ArtPollReply:** Automatische grafische Darstellung im Netzwerk-Baum.
2. **ArtDmx:** Echtzeit-Visualisierung im Channel Inspector.
3. **ArtAddress:** Per Drag-and-Drop in der Matrix.
4. **ArtRDM:** Ein Klick auf ein Gerät öffnet die RDM-Parameter in einer Sidebar (kein neues Fenster!).
5. **ArtTimeCode:** Eine große, zentrale Clock-Analyse am oberen Bildschirmrand, falls Timecode im Netz erkannt wird.

---

### UI-Design Entwurf

Ich generiere dir nun eine Visualisierung, wie dieses Interface aussehen könnte: Ein moderner "Dark Mode", der am FOH (Front of House) nicht blendet, mit Fokus auf die Matrix und die Daten-Visualisierung.

**Bild 1:** Die Haupt-Übersicht (Universe Map & Matrix).
**Bild 2:** Der Detail-Inspector für ein einzelnes Universum mit Sparklines und Jitter-Analyse.

---

### Zusammenfassung der UX-Highlights

- **Kein Rechtsklick-Zwang:** Alles Wichtige ist über direkte Interaktion oder Hover erreichbar.
- **Farbschema:** Angelehnt an thermische Kameras (Blau = Inaktiv, Gelb/Weiß = Voller Traffic), optimiert für schnelle Fehlererkennung unter Stress.
- **Ein-Klick-Diagnose:** Ein "Fix-it"-Button, der bei IP-Konflikten automatisch Vorschläge macht.
