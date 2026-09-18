import {
  ArrowRight,
  CheckCircle2,
  Layers3,
  Play,
  Sparkles,
  Wand2,
  Zap,
} from 'lucide-react'

const featureCards = [
  {
    icon: Sparkles,
    title: 'AI-assisted motion intent',
    text: 'Translate a rough creative idea into concrete timing and trajectory signals without losing the manual feel.',
  },
  {
    icon: Layers3,
    title: 'Curve-first composition',
    text: 'Build with cinematic easing, control points, and path logic that are interpretable and easy to edit.',
  },
  {
    icon: Wand2,
    title: 'Design for motion teams',
    text: 'Give animators and creative technologists a shared language for expressing movement and timing.',
  },
]

const stats = [
  { label: 'Motion ops', value: '20+' },
  { label: 'Curve models', value: '8' },
  { label: 'Designer flow', value: '1 click' },
]

const showreelPoints = [
  'Custom easing presets tuned for real motion work',
  'Trackable timing data that stays readable and shareable',
  'A clean studio surface built for experiments and clean handoff',
]

function App() {
  return (
    <div className="graphine-landing">
      <header className="landing-header">
        <div className="brand-mark landing-brand">
          <span className="brand-dot">G</span>
          <span>Graphine</span>
        </div>

        <nav className="landing-nav" aria-label="Main navigation">
          <a href="#features">Features</a>
          <a href="#studio">Studio</a>
          <a href="#why">Why Graphine</a>
        </nav>

        <a className="button primary landing-cta" href="#studio">
          Open the studio
          <ArrowRight size={16} />
        </a>
      </header>

      <main>
        <section className="hero-panel">
          <div className="hero-copy">
            <p className="eyebrow-button">MOTION SYSTEM</p>
            <h1>Graphine turns motion ideas into clean, playable timing.</h1>
            <p className="hero-text">
              A creative motion environment for designers who want curve logic, AI guidance, and visual control in one place.
            </p>

            <div className="hero-actions">
              <a className="button primary" href="#studio">
                <Play size={15} />
                Launch Graphine
              </a>
              <a className="button secondary" href="#features">
                View features
              </a>
            </div>

            <ul className="trust-list" aria-label="benefits list">
              {showreelPoints.map((point) => (
                <li key={point}>
                  <CheckCircle2 size={14} />
                  <span>{point}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="hero-visual" id="studio">
            <div className="window-bar">
              <span className="window-dot red" />
              <span className="window-dot amber" />
              <span className="window-dot green" />
              <span className="window-title">motion-studio.graphine</span>
            </div>

            <div className="mini-stage">
              <div className="mini-graph">
                <svg viewBox="0 0 350 180" aria-label="Example motion graph">
                  <path d="M0 140 C 45 142, 72 120, 110 96 S 182 54, 220 84 S 286 132, 350 32" />
                  <path d="M0 144 L350 144" className="baseline" />
                </svg>
              </div>
              <div className="mini-panels">
                <div className="mini-panel">
                  <span>Timing</span>
                  <strong>0.9s</strong>
                </div>
                <div className="mini-panel">
                  <span>Easing</span>
                  <strong>soft-in</strong>
                </div>
                <div className="mini-panel accent">
                  <span>Intent</span>
                  <strong>float + settle</strong>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="stats-row" aria-label="Graphine metrics">
          {stats.map((stat) => (
            <div className="stat-box" key={stat.label}>
              <strong>{stat.value}</strong>
              <span>{stat.label}</span>
            </div>
          ))}
        </section>

        <section className="feature-section" id="features">
          <div className="section-heading">
            <p className="eyebrow-button">WHY PEOPLE USE IT</p>
            <h2>Built for the thinking behind the movement.</h2>
          </div>

          <div className="feature-grid">
            {featureCards.map(({ icon: Icon, title, text }) => (
              <article className="feature-card" key={title}>
                <div className="feature-icon">
                  <Icon size={18} />
                </div>
                <h3>{title}</h3>
                <p>{text}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="flow-section" id="why">
          <div className="section-heading narrow">
            <p className="eyebrow-button">WORKFLOW</p>
            <h2>From rough inspiration to precise motion instructions.</h2>
          </div>

          <div className="flow-grid">
            <div className="flow-box">
              <span>01</span>
              <h3>Capture intent</h3>
              <p>Describe the movement, feel, and pacing you want from a scene or object.</p>
            </div>
            <div className="flow-box">
              <span>02</span>
              <h3>Shape the motion</h3>
              <p>Adjust curves, timing, and key path logic with a direct visual workspace.</p>
            </div>
            <div className="flow-box">
              <span>03</span>
              <h3>Ship clean output</h3>
              <p>Generate implementation-ready motion instructions that feel controlled and usable.</p>
            </div>
          </div>
        </section>

        <section className="cta-panel">
          <div>
            <p className="eyebrow-button">READY TO BEGIN</p>
            <h2>Make motion more thoughtful, more legible, and easier to ship.</h2>
          </div>
          <a className="button primary" href="#studio">
            Explore the studio
            <Zap size={15} />
          </a>
        </section>
      </main>
    </div>
  )
}

export default App
