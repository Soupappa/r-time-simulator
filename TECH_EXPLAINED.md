# R-Time Simulator — Les concepts techniques expliqués

*Document de référence personnel — juin 2026*

---

## Sommaire

1. [La stack technique](#1-la-stack-technique)
2. [Le moteur de temps retardé (V1–V5)](#2-le-moteur-de-temps-retardé-v1v5)
3. [La relativité restreinte (V6)](#3-la-relativité-restreinte-v6)
4. [Le trou noir de Schwarzschild (V8)](#4-le-trou-noir-de-schwarzschild-v8)
5. [La lentille géodésique en GLSL (V9)](#5-la-lentille-géodésique-en-glsl-v9)
6. [Glossaire](#6-glossaire)

---

## 1. La stack technique

### React + TypeScript
Le framework UI. React gère la navigation entre les 9 simulations et les panneaux de contrôle (sliders, boutons). TypeScript ajoute le typage statique — ça évite les bugs silencieux du type "j'ai passé un string là où j'attendais un nombre".

### Three.js
La bibliothèque 3D qui tourne dans le navigateur. Elle parle à WebGL (l'API graphique du navigateur) pour dessiner des objets 3D, gérer les lumières, les caméras, etc. Comparable à Unity mais en JavaScript.

### React Three Fiber (R3F)
Un pont entre React et Three.js. Plutôt que d'écrire `scene.add(new THREE.Mesh(...))`, on écrit du JSX : `<mesh><boxGeometry /><meshStandardMaterial /></mesh>`. C'est juste du sucre syntaxique — en dessous c'est du Three.js pur.

### Vite
L'outil de build. Il compile le TypeScript, regroupe les fichiers, et lance un serveur de développement avec rechargement à chaud. Remplace webpack mais beaucoup plus rapide.

### GLSL
Voir section 5 — c'est le langage des shaders, le cœur de V9.

---

## 2. Le moteur de temps retardé (V1–V5)

### L'idée centrale

Dans la vraie vie, la lumière met du temps à voyager. Quand tu regardes le Soleil, tu le vois tel qu'il était il y a 8 minutes. Quand tu regardes une étoile à 100 ans-lumière, tu la vois telle qu'elle était il y a 100 ans.

R-Time simule ça à l'échelle humaine, dans un monde 3D.

### La formule fondamentale

```
âge_visible = distance × ageScale × (1 / R)
```

- **distance** — combien de mètres/unités sépare l'objet de la caméra
- **ageScale** — un multiplicateur global pour rendre l'effet visible
- **R** — le ratio "vitesse de propagation / vitesse d'évolution"
  - R élevé → le monde semble cohérent, tout paraît "présent"
  - R faible → les objets lointains semblent très anciens

### Que signifie R concrètement ?

Imagine que la lumière voyage à 1 km/h et que les objets vieillissent d'un an par seconde. Alors un objet à 10 km serait vu avec 10 heures de retard. R est ce rapport entre les deux vitesses.

Diminuer R revient à **ralentir la vitesse effective de la lumière** — l'effet de décalage temporel devient visible.

### Les timelines d'objets

Chaque objet a une séquence d'états historiques :

| Objet | États |
|-------|-------|
| Arbre | Graine → Pousse → Arbuste → Adulte → Ancestral |
| Maison | Terrain vide → Fondations → Structure → Complète → Habitée |
| Lune | Nuage de débris → Proto-lune → Lunaire rouge → État actuel |

L'`âge_visible` détermine lequel de ces états est affiché — avec un fondu entre deux états adjacents (interpolation par opacité).

---

## 3. La relativité restreinte (V6)

V6 implémente les vraies équations d'Einstein pour un observateur en mouvement à une fraction de c (vitesse de la lumière).

### Beta (β) et Gamma (γ)

```
β = v / c          (fraction de la vitesse de la lumière, entre 0 et 1)
γ = 1 / √(1 - β²) (facteur de Lorentz)
```

- β = 0 → immobile
- β = 0.9 → 90% de la vitesse de la lumière → γ ≈ 2.3
- β = 0.99 → γ ≈ 7

γ est le facteur qui amplifie tous les effets relativistes. Plus β approche 1, plus γ explose.

### Contraction de Lorentz

Un objet qui se déplace à grande vitesse **semble compressé** dans la direction du mouvement.

```
longueur_apparente = longueur_réelle / γ
```

Un vaisseau de 100m qui fonce à β=0.99 paraît long de ~14m vu de face.

### Aberration relativiste

À haute vitesse, les objets semblent se **concentrer devant toi** — les étoiles qui étaient sur les côtés glissent vers l'avant. C'est l'aberration de Bradley, amplifiée par la relativité.

```
cos(θ_apparent) = (cos(θ_réel) + β) / (1 + β × cos(θ_réel))
```

θ_réel est l'angle réel de l'objet, θ_apparent est l'angle sous lequel tu le vois.

### Effet Doppler relativiste

Les objets qui approchent bleuissent, ceux qui s'éloignent rougissent.

```
k = 1 / (γ × (1 - β × cos(θ)))
```

- k > 1 → blueshift (l'objet approche, tu reçois les photons plus fréquemment)
- k < 1 → redshift (l'objet s'éloigne, les photons s'espacent)

---

## 4. Le trou noir de Schwarzschild (V8)

### Qu'est-ce que la métrique de Schwarzschild ?

C'est la solution exacte des équations d'Einstein pour l'espace-temps autour d'une masse sphérique non-rotative (un trou noir "simple"). Elle décrit comment l'espace et le temps sont courbés autour de cette masse.

### Le rayon de Schwarzschild (Rs)

```
Rs = 2GM / c²
```

C'est le rayon de l'**horizon des événements** — la frontière à partir de laquelle rien, pas même la lumière, ne peut s'échapper. Dans le simulateur, Rs = 30 unités.

- En dessous de Rs : tu es dans le trou noir, plus de retour possible
- À Rs exactement : le temps s'arrête pour un observateur extérieur
- Autour de 1.5 × Rs : la **sphère des photons**, où la lumière peut orbiter en cercle

### Le disque d'accrétion

La matière qui tombe vers un trou noir ne tombe pas directement — elle s'accumule dans un disque en rotation orbitale, comme les anneaux de Saturne mais incandescent.

**Doppler orbital** : le côté du disque qui tourne vers toi (s'approche) bleuît ; le côté qui s'éloigne rougit. C'est pourquoi le disque n'est pas de couleur uniforme.

**Rougissement gravitationnel** : les photons perdent de l'énergie en "remontant" le puits gravitationnel. Plus ils viennent de près du trou noir, plus ils sont décalés vers le rouge.

```
k_grav = √(1 - Rs/r)
```

À r = Rs, k_grav = 0 → la lumière est infiniment décalée vers le rouge (invisible).

### L'anneau d'Einstein

Quand le trou noir est exactement entre toi et une source lumineuse, la gravité courbe la lumière tout autour — tu vois un anneau lumineux parfait autour du trou noir. C'est la lentille gravitationnelle dans son cas le plus symétrique.

---

## 5. La lentille géodésique en GLSL (V9)

C'est la pièce maîtresse technique du projet.

### Qu'est-ce que GLSL ?

**GLSL** = *OpenGL Shading Language*. C'est un langage de programmation qui tourne **directement sur le GPU** (la carte graphique), en parallèle sur des millions de pixels simultanément.

Contrairement à JavaScript qui tourne sur le CPU (un cœur à la fois), GLSL tourne sur des milliers de petits processeurs en parallèle — un par pixel. C'est pourquoi on peut se permettre des calculs très lourds par pixel.

Un **shader** est un programme GLSL. Il y en a deux types :
- **Vertex shader** — positionne les points dans l'espace 3D
- **Fragment shader** (ou pixel shader) — calcule la couleur de chaque pixel

V9 utilise un fragment shader massif qui simule le trajet de la lumière pour chaque pixel de l'écran.

### Qu'est-ce qu'une géodésique ?

En relativité générale, la lumière ne voyage pas en ligne droite — elle suit les **géodésiques**, les "lignes les plus droites possibles" dans un espace-temps courbé. Autour d'un trou noir, ces trajectoires sont courbes.

Une géodésique, c'est l'analogue relativiste de la "ligne droite" dans un espace courbe. Sur Terre, le chemin le plus court entre Paris et Tokyo sur un globe suit une courbe (un grand cercle) — c'est une géodésique de la sphère.

### Le ray marching

**Ray marching** = "marcher le long d'un rayon". Pour chaque pixel de l'écran :

1. On part de la position de la caméra
2. On lance un "rayon" (un photon) dans la direction correspondant à ce pixel
3. On intègre numériquement la trajectoire de ce photon pas à pas, en tenant compte de la courbure de l'espace
4. Quand le rayon touche quelque chose (le disque, une étoile), on retourne sa couleur

```
// À chaque pas de la simulation :
accélération = -(3 × Rs / 2) × (h² / r⁵) × position

// h = moment angulaire (conservé, comme en mécanique classique)
h = position × vitesse   // produit vectoriel

// On intègre :
vitesse += accélération × pas
position += vitesse × pas
```

Le signe négatif est crucial : l'accélération est **vers le centre** (attractive). Une erreur de signe ici et les photons s'enfuient au lieu d'être attirés.

### L'image secondaire

Certains photons contournent le trou noir par l'arrière avant de nous atteindre. Ces photons ont traversé le plan du disque **deux fois** — une fois en passant "en dessous", une fois "au-dessus". Ils nous apportent une image du disque **à l'envers** — c'est l'anneau secondaire visible dans V9, identique à ce qu'on voit dans *Interstellar*.

Dans le code, on compte les traversées du plan y=0 (plan du disque) :
- 1ère traversée → image primaire
- 2ème traversée → image secondaire (retournée)

### Le vaisseau en chute libre

La dynamique de chute vers un trou noir en coordonnées de Schwarzschild :

```
dr/dt = -(1 - Rs/r) × √(Rs/r) × c
```

Cette formule dit que la vitesse de chute ralentit à mesure qu'on approche de l'horizon (r → Rs) — parce qu'on mesure le temps depuis l'**extérieur**. Pour l'observateur extérieur, le vaisseau semble se **figer** juste avant de franchir l'horizon, tout en rougissant infiniment.

**L'effet spaghetti (spaghettification)** : les forces de marée étirent le vaisseau verticalement et le compriment horizontalement.

```
étirement_vertical = 1 + (Rs/r)² × 4
compression_horizontale = 1 / √(étirement_vertical)
```

---

## 6. Glossaire

| Terme | Définition |
|-------|-----------|
| **β (beta)** | Vitesse divisée par c. β=0.5 = moitié de la vitesse de la lumière. |
| **γ (gamma)** | Facteur de Lorentz. Amplifie les effets relativistes. γ=1 au repos, γ→∞ quand v→c. |
| **c** | Vitesse de la lumière : ~300 000 km/s dans le vide. |
| **Redshift** | Décalage de la lumière vers le rouge (fréquence basse). Objet qui s'éloigne ou champ gravitationnel fort. |
| **Blueshift** | Décalage vers le bleu (fréquence haute). Objet qui approche. |
| **Géodésique** | Trajectoire "la plus droite" dans un espace courbé. La lumière suit des géodésiques. |
| **Horizon des événements** | Frontière du trou noir. Rien ne peut en ressortir, même la lumière. |
| **Rs (rayon de Schwarzschild)** | Rayon de l'horizon des événements. Dépend de la masse du trou noir. |
| **Sphère des photons** | Zone à 1.5 Rs où la lumière peut orbiter en cercle. |
| **Disque d'accrétion** | Disque de matière en spirale autour du trou noir, chauffé à l'incandescence par friction. |
| **Lentille gravitationnelle** | Courbure de la trajectoire de la lumière par la gravité. Crée des images multiples, des arcs, des anneaux d'Einstein. |
| **GLSL** | Langage de shader. Tourne sur le GPU, un programme par pixel, en parallèle. |
| **Shader** | Programme GLSL. *Vertex shader* : position des points. *Fragment shader* : couleur des pixels. |
| **Ray marching** | Technique qui simule un rayon lumineux pas à pas dans l'espace, en recalculant la direction à chaque étape. |
| **GPU** | Processeur graphique. Des milliers de petits cœurs parallèles — parfait pour les calculs par pixel. |
| **WebGL** | API graphique du navigateur. Permet au JavaScript d'accéder au GPU. Three.js est une abstraction au-dessus de WebGL. |
| **WebGLRenderTarget** | Un "écran virtuel" dans la mémoire du GPU. On y rend une scène, puis on l'utilise comme texture. En V9, la scène 3D est rendue dans un RenderTarget, puis le shader de lentille la distord pour afficher le résultat final. |
| **R (ratio)** | Dans V1–V5 : rapport entre vitesse de propagation et vitesse d'évolution. Contrôle l'intensité de l'effet de temps retardé. |
| **Aberration** | Changement apparent de direction d'une source lumineuse quand l'observateur est en mouvement. |
| **Effet Doppler** | Changement de fréquence d'une onde selon le mouvement relatif source/observateur. S'applique au son (sirène) et à la lumière (couleur). |
| **Moment angulaire (h)** | Quantité conservée dans un système à symétrie centrale. En physique orbitale : h = r × v. Garantit qu'un photon qui "passe à côté" d'un trou noir ne peut pas tomber en spirale — il doit d'abord perdre ce moment angulaire. |
| **Spaghettification** | Étirement d'un objet par les forces de marée près d'un trou noir. La gravité tire plus fort les pieds que la tête → l'objet s'étire verticalement et se comprime latéralement. |
| **Dilatation temporelle** | Le temps s'écoule plus lentement dans un champ gravitationnel intense. À l'horizon d'un trou noir, le temps s'arrête pour un observateur extérieur. |
| **Intégration numérique** | Méthode pour simuler une équation différentielle pas à pas. Ici : on calcule l'accélération d'un photon, on l'ajoute à sa vitesse, on ajoute la vitesse à sa position — et on répète des centaines de fois par rayon. |
