# Kinnect Adventure — pet igara na pokret

### ▶ Igraj odmah: **https://trbojevicstefan.github.io/interactivo/**

Ne treba instalacija — samo otvori link u Chrome-u ili Edge-u i dozvoli kameru.

---

Igre kao na Kinect-u/Wii-ju, ali u pregledaču. Kamera te prati, **vidiš sebe u igri**,
a igraš telom i rukama. Sve se obrađuje **lokalno u pregledaču** — slika sa kamere
ne napušta računar.

| Igra | Fajl | Šta radiš |
|---|---|---|
| **Kinnect Adventure** (trka) | `index.html` | Skačeš, čučiš i koračaš u stranu kroz prepreke |
| **Voće Ninja** | `ninja.html` | Sečeš voće rukama, izbegavaš bombe |
| **Dron Napad** (pucačina) | `shooter.html` | Ruke su nišani — obaraš dronove, ne diraš ptice |
| **Prođi Kroz Zid** | `wall.html` | Nameštaš telo u pozu isečenu u zidu koji juri ka tebi |
| **Plesni Izazov** | `dance.html` | Ponavljaš pokrete u ritmu muzike, skupljaš zvezdice |

Svaka igra je zasebna stranica sa svojim fajlom u `js/`. Dele samo praćenje tela
(`js/pose.js`) i zvuk (`js/audio.js`), pa izmena jedne igre ne dira ostale.

## Pokretanje

Najlakše: otvori **https://trbojevicstefan.github.io/interactivo/**

Lokalno (za razvoj):

```bash
node server.js
```

Zatim otvori **http://localhost:5173** u Chrome-u ili Edge-u. Kada pregledač pita za kameru — dozvoli.
Iz glavnog menija se prelazi na ostale igre, a svaka ima linkove ka ostalima.

> Kamera radi samo preko `http://localhost` ili `https`. Otvaranje `index.html` duplim klikom
> (`file://`) neće raditi — zato ide preko malog servera.

Prvo pokretanje skine model za prepoznavanje tela (~5 MB, sa `cdn.jsdelivr.net` i
`storage.googleapis.com`). Posle toga pregledač ga kešira i sve igre ga dele.

### Postavljanje kamere
- Stani **2–3 metra** od kamere, tako da te se vidi bar do kolena (za trku), odnosno
  cela gornja polovina tela sa raširenim rukama (za ninju i pucačinu). Za zid je najbolje
  da te se vidi celog.
- Neka iza tebe ne bude jako svetlo (prozor) — model te tada teže vidi.
- Treba ti oko 2 m slobodnog prostora levo-desno.

---

## 1. Kinnect Adventure — trka

| Pokret | Šta radi |
|---|---|
| **Skok na mesto** | preskačeš narandžastu prepreku |
| **Čučanj / saginjanje** | prolaziš ispod plave grede |
| **Korak levo / desno** | izbegavaš crveni zid |
| **Ruke** | hvataš energetske kugle i srca (dodatni život) |
| **Obe ruke iznad glave** | ponovo pokrećeš igru na ekranu kraja |

3 života, kombo do x5, brzina raste sa pređenim putem, zona se menja na svakih 380 m
(Šuma → Kanjon → Ledena zona → Neon grad → Svemir).

Tasteri: `←` `→` kretanje · `Space` skok · `↓` čučanj · `R` ponovna kalibracija ·
`M` zvuk · `B` debug · `Esc` meni. Postoji i režim bez kamere (tastatura).

## 2. Voće Ninja

Obe ruke su sečiva. Zamahni kroz voće — brzina zamaha mora biti dovoljna, pa se
voće ne seče slučajno kad samo držiš ruku u vazduhu.

- **Bomba** — presečena bomba uzima život.
- **Promašeno voće** koje padne ispod ekrana takođe uzima život.
- **Kombo** — tri i više voćki jednim zamahom daje bonus.
- **Zlatna voćka** vredi 50 poena.

Bez kamere: igra se mišem.

## 3. Dron Napad — pucačina

Obe ruke imaju svoj nišan. Dva načina da opališ:

- **Trzaj** — kratko i naglo trzni rukom; puca odmah, ka mestu gde si nišanio.
- **Zaključavanje** — drži nišan na meti dok se krug ne popuni (0.4 s) i puca samo.

Mete: obični dron (1 pogodak), brzi (2x poena), oklopni (3 pogotka, ima prsten zdravlja),
bonus meta (60 poena) i **bele ptice — prijatelji**. Pogođena ptica uzima život, pa
zaključavanje namerno ne radi na njima; možeš ih pogoditi samo trzajem.
Dron koji se probije do tebe takođe uzima život. Svakih 10 obaranja = novi talas.

Bez kamere: nišani mišem, klik je okidač (`Space` takođe).

## 4. Prođi Kroz Zid

Zid sa rupom u obliku ljudske poze dolazi ka tebi. Namesti telo tako da tvoj skelet
stane u rupu. Kroz rupu se **vidiš ti** (kamera), pa odmah vidiš šta ti viri.

- **Zid je providan** — vidiš sebe i kroz njega, a rupa je obeležena svetlim obodom.
- Skelet ti je **zelen** gde si unutar rupe, **crven** gde udaraš u zid.
- U donjem levom uglu stoji mali prikaz tražene poze, da je pročitaš i dok je zid daleko.
- Traka dole pokazuje procenat poklapanja i prag koji treba preći.
- Rupa je namerno šira od tela — meri se koliko je tačaka tvog skeleta unutra,
  a ne piksel-savršeno poklapanje.
- 3 života; svaki promašen zid uzima jedan.

Četiri težine. Vreme po zidu se **skraćuje za 0.3 s sa svakim zidom** dok ne stigne do poda:

| Težina | Rupa | Prag | Prvi zid → najbrži | Poze | Rupa se pomera u stranu |
|---|---|---|---|---|---|
| LAKO | 0.30 | 88% | 4.5 s → 2.2 s | 5 | ne |
| SREDNJE | 0.26 | 90% | 3.8 s → 1.8 s | 12 | ne |
| TEŠKO | 0.23 | 90% | 3.0 s → 1.4 s | 34 | do ±1 dužine trupa |
| LUDO | 0.21 | 90% | 2.6 s → 1.1 s | svih 66 | do ±2.1 dužine trupa |

Na TEŠKO i LUDO rupa **nije više zakovana za tebe** — pojavljuje se levo ili desno
(nikad dvaput zaredom na istu stranu), pa moraš da se pomeriš do nje. Strelica pri dnu
i isprekidana linija pokazuju gde treba da staneš.

Pozicija ima **mrtvu zonu**: dok si u krugu od ~0.55 dužine trupa (oko 25–30 cm) od rupe,
pozicija se uopšte ne računa — bitna je samo poza. Preko toga počinješ da udaraš u zid:
na 0.8 trupa prolaznost pada na 54% (TEŠKO) odnosno 2% (LUDO), a preko 1.1 na nulu.

Brojevi su birani merenjem: sa simuliranim igračem (dužine udova ±14%, uglovi ±18°,
šum kamere) aljkav pokušaj prolazi 100% na LAKO, 98% na SREDNJE, 91% na TEŠKO i 83%
na LUDO, dok **pogrešna** poza prolazi 0% / 11% / 10% / 5%.

Radi i kad ti se ne vide noge — tada se meri samo ono što kamera vidi.

## 5. Plesni Izazov

Preko tebe se pojavi bela „senka" pokreta, a prsten oko tebe se steže u ritmu.
Kad se prsten zatvori, meri se koliko si pogodio pozu: **SAVRŠENO / ODLIČNO / DOBRO /
PROMAŠAJ**. Nema života ni gubljenja — samo skupljaš poene i na kraju dobiješ ocenu
od 1 do 5 zvezdica.

- Rukama ostavljaš svetleće trake u vazduhu, a za dobar pogodak lete zvezdice i srca.
- Niz dobrih pokreta množi poene (do ×4).
- U uglu stoji prikaz sledećeg pokreta, da se spremiš unapred.
- 26 plesnih pokreta (srce, leptir, kruna, disko, balerina, mašna, propeler…).

| Tempo | Pokret na svakih | Otprilike |
|---|---|---|
| LAGANO | 4 otkucaja | 2.3 s |
| SREDNJE | 3 otkucaja | 1.7 s |
| BRZO | 2 otkucaja | 1.1 s |
| BEZ KRAJA | počinje na 4 pa se spušta do 1.5 | ubrzava se |

Pesma je 32 pokreta (osim „bez kraja"). **Muzika se sintetizuje uživo** u pregledaču —
bubanj, bas i arpeđo na 104 BPM preko progresije C–G–Am–F, bez ijednog audio fajla.
Pokreti su zakačeni za otkucaje muzike preko sata `AudioContext`-a, pa ne beže iz ritma
ni kad slika zakoči.

Ocenjivanje je drugačije nego kod zida: tamo se pita „da li si stao u obris", a ovde
„koliko si blizu poze" — poredi se **položaj zglobova** (šake, laktovi, kolena, stopala,
glava), normalizovan na dužinu trupa. Izmereno: tačan pokret dobija SAVRŠENO u 99%
slučajeva, a pogrešan pokret u 1%.

---

## Kako radi

- `js/pose.js` — kamera + [MediaPipe Pose Landmarker](https://ai.google.dev/edge/mediapipe)
  (33 tačke tela). `PoseAnalyzer` (koristi ga trka) iz tih tačaka računa skok
  (podizanje kukova mereno dužinom trupa — pa ne zavisi od udaljenosti od kamere),
  čučanj (spuštanje ramena) i korak u stranu (pomeraj kukova podeljen širinom ramena).
  Ninja i pucačina uzimaju samo pozicije šaka.
- `js/game.js` — trka: pseudo-3D staza (projekcija `1/(1+d*k)`), prepreke, kugle.
  Razmaci između prepreka se računaju u **sekundama** (`brzina * gapSec`), ne u metrima,
  da povećanje brzine ne pojede vreme za reakciju.
- `js/ninja.js` — voće, polovine, sok i tragovi sečiva. Sečenje = presek duži
  (putanja ruke u poslednjih 70 ms) i kruga voćke, uz uslov minimalne brzine zamaha.
- `js/shooter.js` — mete sa dubinom `z` (1 = daleko, 0 = stigle do tebe), nišani,
  zaključavanje i detekcija trzaja.
- `js/poses.js` — poze za zid, zadate uglovima zglobova; `buildPose()` ih pretvara u
  tačke skeleta u normalizovanom prostoru (sredina kukova = 0, jedinica = dužina trupa).
  `holeDepth()` kaže koliko je tačka duboko unutar/van rupe.
- `js/wall.js` — zid se crta na pomoćni canvas, pa se rupa **iseca** preko njega
  (`destination-out`) debelim potezima duž kostiju poze; zato se kroz rupu vidi kamera.
  Poklapanje se meri uzorcima duž kostiju igrača, u istom normalizovanom prostoru —
  pa ne zavisi ni od udaljenosti od kamere ni od pozicije u kadru.
- `js/dance.js` — ples: mali sekvencer koji zakazuje note unapred preko `AudioContext`
  sata, „senka" pokreta preko igrača, prsten ritma, trake za rukama i ocenjivanje po
  udaljenosti zglobova (Gausova kriva, `SIG = 0.5` dužine trupa).
- `js/audio.js` — svi zvuci su sintetizovani (WebAudio), nema audio fajlova.

Debug iz konzole: `KA.game` (trka), `NINJA.game`, `SHOOT.game`, `WALL.game`, `DANCE.game`.
