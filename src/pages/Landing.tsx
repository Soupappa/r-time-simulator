import { useEffect, useRef, useState } from 'react'

type Page = 'landing' | 'v1' | 'v2' | 'v3' | 'v4' | 'v5' | 'v6' | 'v7' | 'v8' | 'v9' | 'v10'
type Lang = 'en' | 'fr'

// ─── Animated particle background ─────────────────────────────────────────────
function ParticleCanvas() {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current!
    const ctx = canvas.getContext('2d')!
    let raf = 0, t = 0
    const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight }
    resize(); window.addEventListener('resize', resize)
    const stars = Array.from({ length: 180 }, () => ({
      x: Math.random(), y: Math.random(), r: Math.random() * 1.2 + 0.2,
      twinkle: Math.random() * Math.PI * 2, speed: 0.3 + Math.random() * 0.7,
    }))
    const rings = Array.from({ length: 5 }, (_, i) => ({ phase: (i / 5) * Math.PI * 2, speed: 0.18 + i * 0.06 }))
    const draw = () => {
      const W = canvas.width, H = canvas.height
      ctx.clearRect(0, 0, W, H)
      const cx = W * 0.5, cy = H * 0.52
      for (const ring of rings) {
        const r = ((t * ring.speed + ring.phase) % 1) * Math.max(W, H) * 0.7
        const alpha = 1 - r / (Math.max(W, H) * 0.7)
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2)
        ctx.strokeStyle = `rgba(80,120,255,${alpha * 0.08})`; ctx.lineWidth = 1.5; ctx.stroke()
      }
      for (const s of stars) {
        const a = 0.4 + 0.4 * Math.sin(t * s.speed + s.twinkle)
        ctx.beginPath(); ctx.arc(s.x * W, s.y * H, s.r, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(180,200,255,${a})`; ctx.fill()
      }
      t += 0.004; raf = requestAnimationFrame(draw)
    }
    draw()
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize) }
  }, [])
  return <canvas ref={ref} style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none' }} />
}

// ─── Bilingual content ────────────────────────────────────────────────────────
interface CardLang { description: string; features: string[] }
interface CardDef {
  version: string; title: string; subtitle: string
  badge: string; badgeColor: string; nav: Page
  en: CardLang; fr: CardLang
}

const UI = {
  en: {
    engineLabel: '◈ Conceptual Physics Engine',
    tagline: 'The speed of light is finite. Every observation is an observation into the past. At our scale, this is imperceptible — here, we make it visible.',
    insight1: 'When you look at the Moon, you see it as it was ',
    insight1b: '1.3 seconds ago',
    insight2: '. The Andromeda galaxy — ',
    insight2b: '2.5 million years',
    insight3: '. R-Time renders this delay at human scale, where R controls its perceptibility.',
    footer: 'NOT physical relativity · A conceptual / pedagogical model of temporal perception through distance',
    launch: 'Launch', enter: '→ Enter', soon: 'Coming soon',
  },
  fr: {
    engineLabel: '◈ Moteur de physique conceptuelle',
    tagline: "La vitesse de la lumière est finie. Toute observation est une observation dans le passé. À notre échelle, c'est imperceptible — ici, nous le rendons visible.",
    insight1: 'En regardant la Lune, vous la voyez telle qu\'elle était il y a ',
    insight1b: '1,3 seconde',
    insight2: '. La galaxie d\'Andromède — ',
    insight2b: '2,5 millions d\'années',
    insight3: '. R-Time simule ce décalage à échelle humaine, R en contrôle l\'intensité.',
    footer: 'PAS de la relativité physique · Un modèle conceptuel / pédagogique de la perception temporelle par la distance',
    launch: 'Lancer', enter: '→ Entrer', soon: 'Bientôt disponible',
  },
}

const CARDS: CardDef[] = [
  {
    version: 'V10 · 2026', title: 'Aberration Drive', subtitle: 'cos θ_lab = (cos θ_obs − β) / (1 − β cos θ_obs)',
    badge: 'New', badgeColor: '120,180,255', nav: 'v10',
    en: {
      description: 'The photographed view of special relativity. The world is rendered into a cubemap, then a per-pixel shader applies inverse relativistic aberration: the forward view compresses into a wide-angle, objects ahead shrink, blueshift and brighten (headlight effect). The opposite of V7 — what an eye would actually see near light speed.',
      features: ['Real-time relativistic aberration via cubemap sampling', 'Forward view compresses to wide-angle — objects ahead shrink', 'Doppler: blue ahead, red behind', 'Relativistic beaming — forward brightens ∝ D^2.5', 'Speed-driven β — sprint to crank the effect'],
    },
    fr: {
      description: "La vue photographiée de la relativité restreinte. Le monde est rendu dans une cubemap, puis un shader applique l'aberration relativiste inverse par pixel : le champ avant se comprime en grand-angle, les objets rapetissent, bleuissent et s'illuminent (effet phare). L'opposé de V7 — ce qu'un œil verrait vraiment près de la vitesse de la lumière.",
      features: ["Aberration relativiste temps réel par échantillonnage cubemap", "L'avant se comprime en grand-angle — les objets rapetissent", "Doppler : bleu devant, rouge derrière", "Beaming relativiste — l'avant s'illumine ∝ D^2.5", "β piloté par la vitesse — sprinte pour amplifier l'effet"],
    },
  },
  {
    version: 'V9 · 2026', title: 'Geodesic Lensing', subtitle: 'a = −(3Rs/2)(h²/r⁵) · pos',
    badge: 'Photon Ring', badgeColor: '255,200,80', nav: 'v9',
    en: {
      description: 'Schwarzschild geodesic ray marching per pixel. Each ray follows the true curvature of spacetime: the secondary image of the disk (back face wrapping around the black hole) appears as a thin bright ring at the shadow boundary. A falling spaceship freezes, redshifts and stretches.',
      features: ['320 geodesic steps per pixel — analytical accretion disk', 'Direct image + secondary image (ray wrapping 1.5 Rs)', 'Photon ring — rays grazing the photon sphere', 'Stars and jets curved by exact geodesic', 'Infalling spaceship: freeze + redshift + spaghettification'],
    },
    fr: {
      description: "Ray marching géodésique Schwarzschild par pixel. Chaque rayon suit la vraie courbure de l'espace-temps : l'image secondaire du disque (face arrière contournant le trou noir) apparaît comme un fin anneau à la limite de l'ombre. Un vaisseau en chute se fige, rougit et s'étire.",
      features: ["320 pas de géodésique par pixel — disque analytique", "Image directe + image secondaire (rayon contournant 1.5 Rs)", "Photon ring — rayons rasant la sphère de photons", "Étoiles et jets courbés par la géodésique exacte", "Vaisseau en chute : gel + redshift + spaghettification"],
    },
  },
  {
    version: 'V8 · 2026', title: 'Black Hole', subtitle: 'k = √(1−Rs/r) × 1/(γ(1−β cosθ))',
    badge: 'Interstellar', badgeColor: '100,180,255', nav: 'v8',
    en: {
      description: 'Schwarzschild black hole with relativistic accretion disk. Asymmetric orbital Doppler, gravitational redshift, dynamic Einstein ring, gravitational lensing on 2200 stars, polar jets. The physics of Gargantua in real time.',
      features: ['Accretion disk — 408 particles, orbital Doppler + light delay', 'Gravitational redshift k=√(1−Rs/r) — dark red interior', 'Einstein ring — θE=√(2Rs/D), dynamic in flight', 'Gravitational lensing — 2200 stars deformed in real time', 'Relativistic polar jets — additive blue'],
    },
    fr: {
      description: "Trou noir de Schwarzschild avec disque d'accrétion relativiste. Doppler orbital asymétrique, redshift gravitationnel, anneau d'Einstein dynamique, lentille sur 2200 étoiles, jets polaires. La physique de Gargantua en temps réel.",
      features: ["Disque d'accrétion — 408 particules, Doppler orbital + retard lumineux", "Redshift gravitationnel k=√(1−Rs/r) — intérieur rouge sombre", "Anneau d'Einstein — θE=√(2Rs/D), dynamique en vol", "Lentille gravitationnelle — 2200 étoiles déformées en temps réel", "Jets polaires relativistes — bleu additif"],
    },
  },
  {
    version: 'V7 · 2026', title: 'Retarded World', subtitle: "t_emit = t − d/c · r_‖' = r_‖/γ",
    badge: 'New', badgeColor: '255,160,80', nav: 'v7',
    en: {
      description: 'An evolving landscape where two effects combine: light delay shows each object in its past from afar, and Lorentz contraction compresses space while walking. Three biomes: volcanic lava, growing crystals, expanding forest.',
      features: ['Volcano cycle REST→SWELL→ERUPTION — seen in the past from afar', 'Crystals grow before your eyes as you approach', 'Trees: saplings from afar, adult from close up', 'Lorentz contraction along the walk axis', 'Doppler: blue ahead, red behind'],
    },
    fr: {
      description: "Un paysage évolutif où deux effets se combinent : le retard lumineux montre chaque objet dans son passé depuis loin, et la contraction de Lorentz comprime l'espace en marchant. Trois biomes : lave volcanique, cristaux qui poussent, forêt qui grandit.",
      features: ['Volcan en cycle REST→GONFLE→ÉRUPTION — vu dans le passé depuis loin', 'Cristaux grandissent sous vos yeux en approchant', 'Arbres : jeunes pousses de loin, adultes de près', 'Contraction de Lorentz le long de la marche', 'Doppler : bleu devant, rouge derrière'],
    },
  },
  {
    version: 'V6 · 2025', title: 'Relativistic Effects', subtitle: 'β = v/c → γ = 1/√(1−β²)',
    badge: 'Physics', badgeColor: '136,200,255', nav: 'v6',
    en: {
      description: 'Three effects of special relativity rendered in real time on a 3D grid of cubes. Drag β toward 1 and watch space itself warp: depth compresses by γ, colour shifts from red to blue, and objects pile up ahead like a relativistic headlight.',
      features: ['Lorentz contraction — cubes flatten along motion axis', 'Relativistic aberration — objects crowd the forward cone', 'Doppler shift — blue ahead, red behind, white perpendicular', 'Rest-frame ghost overlay (toggle)', 'β slider 0→0.999 · γ / contraction % live'],
    },
    fr: {
      description: "Trois effets de la relativité restreinte en temps réel sur une grille 3D de cubes. Faites glisser β vers 1 et regardez l'espace se déformer : la profondeur se comprime par γ, les couleurs passent du rouge au bleu, et les objets s'accumulent devant comme un phare relativiste.",
      features: ["Contraction de Lorentz — cubes aplatis le long de l'axe de mouvement", 'Aberration relativiste — objets concentrés dans le cône avant', 'Décalage Doppler — bleu devant, rouge derrière, blanc perpendiculaire', 'Superposition du référentiel au repos (toggle)', 'Curseur β 0→0.999 · γ / % de contraction en direct'],
    },
  },
  {
    version: 'V5 · 2025', title: 'Temporal Construction', subtitle: 't_emit = t_now − distance / c',
    badge: 'New', badgeColor: '68,136,255', nav: 'v5',
    en: {
      description: 'First-person exploration of a structure building itself in retarded time. 4 seed points crystallise into a hollow cube frame. Walk toward a cluster: its cubes assemble before you. Walk away: they vanish, unbuilt.',
      features: ['First-person WASD — walk into the past of each cluster', 'Formation speed slider — from slow crystal to fast build', 'Cube color = perceived heat (orange=transit, blue=settled)', 'c_sim slider — dial in the temporal depth', 'Live HUD: cubes perceived, construction phase'],
    },
    fr: {
      description: "Exploration à la première personne d'une structure qui se construit en temps retardé. 4 points germes se cristallisent en cadre de cube creux. Approchez un cluster : ses cubes s'assemblent. Éloignez-vous : ils disparaissent.",
      features: ['FPS WASD — marcher dans le passé de chaque cluster', 'Curseur de vitesse de formation — de lent à rapide', 'Couleur des cubes = chaleur perçue (orange=transit, bleu=stabilisé)', 'Curseur c_sim — régler la profondeur temporelle', 'HUD live : cubes perçus, phase de construction'],
    },
  },
  {
    version: 'V4 · 2025', title: 'Retarded Lava', subtitle: 't_emit = t_now − distance / c',
    badge: 'Hot', badgeColor: '255,100,60', nav: 'v4',
    en: {
      description: 'First-person navigation through retarded time. A lava blob cycles through REST→SWELL→ERUPT→CONTRACT. Walk toward it: you see it approach the present. Walk away: it rewinds into the past. Projectiles appear mid-flight as you close the distance.',
      features: ['First-person WASD + mouse look', 'Blob visual state driven by t_emit (not t_now)', '16 projectiles per eruption — appear as you approach', 'Continuous time-scrubbing by walking', 'Live HUD: distance, t_emit, observed phase'],
    },
    fr: {
      description: "Navigation à la première personne dans le temps retardé. Un blob de lave suit un cycle REST→GONFLE→ÉRUPTION→CONTRACTION. Approchez : il avance vers le présent. Reculez : il remonte dans le passé. Les projectiles apparaissent en vol en s'approchant.",
      features: ['FPS WASD + regard à la souris', 'État visuel piloté par t_emit (pas t_now)', '16 projectiles par éruption — apparaissent en approchant', 'Scrubbing temporel continu en marchant', 'HUD live : distance, t_emit, phase observée'],
    },
  },
  {
    version: 'V3 · 2025', title: 'Cyclic Aggregates', subtitle: 'SCATTER → GATHER → MERGE → EXPLODE',
    badge: 'New', badgeColor: '255,140,107', nav: 'v3',
    en: {
      description: '32 objects follow a scripted cycle. Because light takes time to travel, distant objects appear to be at an earlier phase. Nearby = present. Far away = past. Lower c deepens the lag — at c=2, objects at the edge lag by half a cycle.',
      features: ['Scripted deterministic cycle — same t → same pos', 'Same bisection retarded-position solver as V2', 'Ghost trail: perceived → actual position', 'Phase indicator — SCATTER / GATHER / MERGE / EXPLODE', 'Starfield environment — stars = ancient light'],
    },
    fr: {
      description: '32 objets suivent un cycle scripté. La lumière prenant du temps à voyager, les objets distants semblent dans une phase antérieure. Proche = présent. Loin = passé. Un c plus faible approfondit le décalage.',
      features: ['Cycle déterministe scripté — même t → même pos', 'Solveur de position retardée par bisection (identique à V2)', 'Traînée fantôme : position perçue → réelle', 'Indicateur de phase — SCATTER / GATHER / MERGE / EXPLODE', "Environnement étoilé — les étoiles = lumière ancienne"],
    },
  },
  {
    version: 'V2 · 2025', title: 'Light Cone Engine', subtitle: '‖ pos(t_emit) − obs ‖ = c × (t_now − t_emit)',
    badge: 'Beta', badgeColor: '255,180,107', nav: 'v2',
    en: {
      description: 'A true retarded-position solver. Each object stores a ring buffer of its past positions. The bisection solver finds the exact emission time for each object — the physical reality of light travel delay, rendered in real time.',
      features: ['Retarded position — bisection solver, 24 iterations', 'Ring buffer 1024 samples per object', 'Ghost (actual) vs solid (perceived) positions', 'Retardation gap visualisation', 'c_sim slider — tune the speed of light'],
    },
    fr: {
      description: "Un vrai solveur de position retardée. Chaque objet stocke un buffer circulaire de ses positions passées. Le solveur par bisection trouve le temps d'émission exact — la réalité physique du retard lumineux, rendue en temps réel.",
      features: ['Position retardée — solveur par bisection, 24 itérations', 'Buffer circulaire de 1024 échantillons par objet', 'Positions fantôme (réelle) vs solide (perçue)', 'Visualisation du décalage de retardement', 'Curseur c_sim — ajuster la vitesse de la lumière'],
    },
  },
  {
    version: 'V1 · 2025', title: 'Temporal Valley', subtitle: 'visibleAge = dist × ageScale × (1/R)',
    badge: 'Stable', badgeColor: '107,200,107', nav: 'v1',
    en: {
      description: 'A stylised low-poly valley where every object holds a morphological timeline. Moving closer reveals its present; stepping back reveals its ancient past. R controls how strongly distance distorts perceived age.',
      features: ['Timeline morphing per object (5 states each)', 'Universal temporal environment (trees, rocks, props)', 'FPS + orbit camera modes', 'R slider — live temporal distortion', 'WebM video export'],
    },
    fr: {
      description: "Une vallée low-poly stylisée où chaque objet possède une ligne temporelle morphologique. Se rapprocher révèle son présent ; s'éloigner révèle son passé lointain. R contrôle l'intensité de la distorsion temporelle perçue.",
      features: ['Morphing temporel par objet (5 états)', 'Environnement universel (arbres, rochers, accessoires)', 'Modes caméra FPS + orbite', 'Curseur R — distorsion temporelle en direct', 'Export vidéo WebM'],
    },
  },
]

// ─── Version card ──────────────────────────────────────────────────────────────
function VersionCard({ card, lang, ui, onClick }: {
  card: CardDef; lang: Lang
  ui: typeof UI['en']
  onClick: () => void
}) {
  const [hovered, setHovered] = useState(false)
  const content = card[lang]

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        minWidth: 0,
        background: hovered ? 'rgba(20,25,55,0.95)' : 'rgba(10,12,28,0.85)',
        border: `1px solid ${hovered ? 'rgba(107,140,255,0.6)' : 'rgba(100,120,200,0.2)'}`,
        borderRadius: 12, padding: '28px 28px 24px', cursor: 'pointer',
        backdropFilter: 'blur(16px)', transition: 'all 0.2s ease',
        transform: hovered ? 'translateY(-4px)' : 'none',
        boxShadow: hovered ? '0 12px 40px rgba(107,140,255,0.15)' : 'none',
        position: 'relative', display: 'flex', flexDirection: 'column', gap: 14,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <span style={{ fontFamily: 'monospace', fontSize: 11, letterSpacing: '0.18em', color: '#6b8cff', textTransform: 'uppercase' }}>{card.version}</span>
        <span style={{ fontSize: 10, padding: '3px 9px', borderRadius: 20,
          background: `rgba(${card.badgeColor},0.15)`, border: `1px solid rgba(${card.badgeColor},0.4)`,
          color: `rgb(${card.badgeColor})`, letterSpacing: '0.08em' }}>{card.badge}</span>
      </div>
      <div>
        <div style={{ fontSize: 22, fontWeight: 700, color: '#e8ecff', marginBottom: 4, letterSpacing: '-0.01em' }}>{card.title}</div>
        <div style={{ fontSize: 13, color: '#6b8cff', fontFamily: 'monospace' }}>{card.subtitle}</div>
      </div>
      <div style={{ fontSize: 12, color: '#8a9ab8', lineHeight: 1.7 }}>{content.description}</div>
      <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 5 }}>
        {content.features.map(f => (
          <li key={f} style={{ fontSize: 11, color: '#7080a0', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: '#6b8cff', fontSize: 10 }}>▸</span>{f}
          </li>
        ))}
      </ul>
      <div style={{
        marginTop: 6, padding: '9px 0', textAlign: 'center', borderRadius: 6,
        fontSize: 12, letterSpacing: '0.1em', fontFamily: 'monospace',
        border: `1px solid rgba(107,140,255,${hovered ? 0.8 : 0.35})`,
        color: hovered ? '#fff' : '#6b8cff',
        background: hovered ? 'rgba(107,140,255,0.18)' : 'transparent',
        transition: 'all 0.15s',
      }}>
        {hovered ? ui.enter : ui.launch}
      </div>
    </div>
  )
}

// ─── Language toggle ──────────────────────────────────────────────────────────
function LangToggle({ lang, setLang }: { lang: Lang; setLang: (l: Lang) => void }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 2,
      background: 'rgba(10,12,28,0.8)', border: '1px solid rgba(100,120,200,0.25)',
      borderRadius: 20, padding: '3px 4px', backdropFilter: 'blur(10px)',
    }}>
      {(['en', 'fr'] as Lang[]).map(l => (
        <button key={l} onClick={() => setLang(l)} style={{
          padding: '4px 12px', borderRadius: 16, border: 'none', cursor: 'pointer',
          fontFamily: "'SF Mono','Fira Code',monospace", fontSize: 11, letterSpacing: '0.1em',
          fontWeight: lang === l ? 700 : 400,
          background: lang === l ? 'rgba(107,140,255,0.25)' : 'transparent',
          color: lang === l ? '#aabbff' : '#445566',
          transition: 'all 0.15s',
        }}>
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  )
}

// ─── Formula ──────────────────────────────────────────────────────────────────
function Formula() {
  return (
    <div style={{ fontFamily: 'monospace', fontSize: 13, color: '#5060a0', textAlign: 'center', lineHeight: 2, marginBottom: 8 }}>
      <span style={{ color: '#6b8cff' }}>visibleAge</span>
      {' = '}
      <span style={{ color: '#c8cfe8' }}>distance</span>
      {' × ageScale × '}
      <span style={{ color: '#ff8c6b' }}>(1 / R)</span>
      {'   →   '}
      <span style={{ color: '#6b8cff' }}>R</span>
      {' = '}
      <span style={{ color: '#c8cfe8' }}>c<sub>sim</sub></span>
      {' / v<sub>transform</sub>'}
    </div>
  )
}

// ─── Landing page ─────────────────────────────────────────────────────────────
export function Landing({ onNavigate }: { onNavigate: (page: Page) => void }) {
  const [lang, setLang] = useState<Lang>('fr')
  const ui = UI[lang]

  return (
    <div style={{
      width: '100%', height: '100%',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'flex-start',
      fontFamily: "'SF Mono','Fira Code','Consolas',monospace",
      color: '#c8cfe8', position: 'relative',
      overflowY: 'auto', overflowX: 'hidden',
      background: '#060810',
      padding: '60px 20px 80px',
      boxSizing: 'border-box',
    }}>
      <ParticleCanvas />

      <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 32, maxWidth: 1100, width: '100%' }}>

        {/* Header avec toggle langue */}
        <div style={{ textAlign: 'center', width: '100%', position: 'relative' }}>
          <div style={{ position: 'absolute', top: 0, right: 0 }}>
            <LangToggle lang={lang} setLang={setLang} />
          </div>
          <div style={{ fontSize: 11, letterSpacing: '0.3em', color: '#3a4a80', textTransform: 'uppercase', marginBottom: 14 }}>
            {ui.engineLabel}
          </div>
          <h1 style={{
            margin: 0, fontSize: 52, fontWeight: 800, letterSpacing: '-0.02em',
            background: 'linear-gradient(135deg, #c8d4ff 0%, #6b8cff 50%, #ff8c6b 100%)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            lineHeight: 1.1, marginBottom: 16,
          }}>
            R-Time Simulator
          </h1>
          <p style={{ margin: '0 auto', fontSize: 15, color: '#6070a0', lineHeight: 1.8, maxWidth: 560 }}>
            {ui.tagline}
          </p>
        </div>

        <Formula />

        {/* Insight */}
        <div style={{
          background: 'rgba(107,140,255,0.06)', border: '1px solid rgba(107,140,255,0.15)',
          borderRadius: 8, padding: '12px 20px', fontSize: 11, color: '#5060a0',
          textAlign: 'center', lineHeight: 1.8, maxWidth: 540,
        }}>
          {ui.insight1}<span style={{ color: '#ff8c6b' }}>{ui.insight1b}</span>
          {ui.insight2}<span style={{ color: '#ff8c6b' }}>{ui.insight2b}</span>
          {ui.insight3}
        </div>

        {/* Grille de toutes les cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 20, width: '100%' }}>
          {CARDS.map(card => (
            <VersionCard
              key={card.nav}
              card={card}
              lang={lang}
              ui={ui}
              onClick={() => onNavigate(card.nav)}
            />
          ))}
        </div>

        {/* Footer */}
        <div style={{ fontSize: 10, color: '#2a3050', textAlign: 'center', letterSpacing: '0.08em', marginTop: 8 }}>
          {ui.footer}
        </div>
      </div>
    </div>
  )
}
