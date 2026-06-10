# R-Time Simulator

Un simulateur de physique relativiste interactif en 3D — 9 expériences, du temps retardé aux trous noirs avec lentille gravitationnelle.

**Live** → [r-time-simulator.netlify.app](https://r-time-simulator.netlify.app) *(à mettre à jour avec ton URL Netlify)*

---

## Les 9 simulations

### V1 — Temps retardé conceptuel
Le monde vu depuis l'observateur n'est pas le monde "maintenant" — chaque objet est visible dans l'état qu'il avait quand la lumière a quitté sa position. Plus un objet est loin, plus on le voit dans son passé. Le curseur **R** règle le rapport vitesse de propagation / vitesse d'évolution.

### V2 — Position retardée (cône de lumière)
Les objets en mouvement sont vus à leur position passée — là où ils étaient quand la lumière est partie. Un objet qui fonce vers toi semble plus proche qu'il n'est ; en s'éloignant, il semble plus loin. Premier aperçu de l'aberration de la lumière.

### V3 — Scène retardée complète
Même moteur que V2, mais dans un environnement 3D riche (montagne, arbres, maisons, personnage, lune). Chaque objet a sa propre timeline d'états historiques ; distance × R détermine quel état est visible.

### V4 — Cinématique relativiste
Ajout des effets cinématiques : l'observateur se déplace à une fraction de c. Les objets proches semblent presque présents ; les objets lointains se figent dans leur passé.

### V5 — Aberration + Doppler
À haute vitesse, les étoiles/objets se concentrent devant l'observateur (aberration de Bradley). Les objets approchants bleuissent (blueshift Doppler) ; ceux qui s'éloignent rougissent. Pilotable en vol libre.

### V6 — Contraction de Lorentz + Doppler complet
Implémentation complète de la relativité restreinte : contraction de Lorentz (les objets s'écrasent dans la direction du mouvement), aberration relativiste exacte, décalage Doppler de fréquence. Curseur vitesse de 0 à 0.99c.

### V7 — Monde retardé immersif
Environnement procédural avec sol de lave, cristaux lumineux et forêt. Les effets retardés sont appliqués à un monde vivant et animé — les cristaux pulsent dans leur passé, la lave coule à différentes époques selon la distance.

### V8 — Trou noir de Schwarzschild
Premier trou noir : disque d'accrétion avec effet Doppler orbital (côté qui s'approche bleuté, côté qui s'éloigne rouge), rougissement gravitationnel (redshift), anneau d'Einstein. Caméra libre autour du trou noir.

### V9 — Lentille gravitationnelle géodésique *(flagship)*
Ray marching per-pixel en GLSL sur les géodésiques de Schwarzschild. Chaque pixel trace la trajectoire d'un photon dans la métrique courbe. Résultats :
- **Image secondaire** du disque (les photons qui contournent le trou noir côté opposé)
- **Anneau de photons** (photons en orbite à r = 1.5 Rs)
- **Vaisseau en chute libre** : se fige et se dilate en rougissant (dilatation temporelle + effet spaghetti) à mesure qu'il approche de l'horizon

---

## Installation

```bash
npm install
npm run dev
```

Ouvre [http://localhost:5173](http://localhost:5173).

---

## Stack technique

| Technologie | Usage |
|-------------|-------|
| React + TypeScript | UI, navigation, état |
| Three.js + React Three Fiber | Rendu 3D |
| GLSL (ShaderMaterial) | Lentille gravitationnelle, Doppler, lava |
| Vite | Build & dev server |

---

## Architecture V9 (géodésiques)

```
bgScene (Three.js) ──► WebGLRenderTarget
                              │
                    fullscreen quad (ShaderMaterial)
                              │
                    GLSL : ray marching Schwarzschild
                    pour chaque pixel :
                      - intègre la géodésique du photon
                      - compte les traversées du plan du disque
                      - 1ère traversée = image primaire
                      - 2ème traversée = image secondaire
                              │
                           écran
```

Formule d'accélération géodésique :
```
a = -(3·Rs/2) · (h²/r⁵) · pos
h = pos × vel  (moment angulaire conservé)
```

---

## Contrôles (V6–V9)

- **ZQSD / WASD** — déplacement
- **Souris** — orientation (clic pour capturer)
- **Curseur c** — vitesse (fraction de c)
- **← Retour** — revenir au hub

---

## Structure du projet

```
src/
  pages/Landing.tsx     — hub de navigation bilingue (FR/EN)
  v1/ … v9/             — une scène par version
  components/           — contrôles FPS, overlay UI, labels
  temporal/             — moteur de temps retardé (V1–V4)
  objects/              — objets 3D avec timelines historiques
```
