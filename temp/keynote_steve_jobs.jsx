import { useState, useEffect, useRef, useCallback } from "react";

/*
  STEVE JOBS KEYNOTE — HUSHH
  
  Design philosophy: Jobs never showed a slide with more than 6 words.
  He used the stage as a canvas of negative space.
  Every reveal was a single idea, landing like a drumbeat.
  The audience felt the problem before they saw the solution.
  
  Structure (from studying Macworld '07, WWDC '05, iPad '10):
  1. "Every once in a while..." — establish the moment
  2. The Problem — make it personal, make it painful
  3. The Villain — name it
  4. The Hero — one word, one idea
  5. The Demo — show, don't tell
  6. The Architecture — for the believers
  7. "One More Thing..." — the fund
  8. The Close — the line they'll remember
*/

const SLIDES = [
  // ─── ACT 1: THE SETUP ───
  { type: "black", duration: 2000 },
  { type: "text-hero", text: "Every once in a while,", sub: "" },
  { type: "text-hero", text: "a revolutionary product comes along", sub: "that changes everything." },
  { type: "pause", duration: 1500 },
  { type: "text-small", text: "In 1984, the Macintosh changed computing." },
  { type: "text-small", text: "In 2007, the iPhone changed communication." },
  { type: "text-small", text: "In 2024, AI changed how machines think." },
  { type: "pause", duration: 800 },
  { type: "text-hero", text: "But nobody changed", sub: "who owns the data." },
  
  // ─── ACT 2: THE PROBLEM ───
  { type: "pause", duration: 1200 },
  { type: "section", text: "The Problem" },
  { type: "stat", number: "$7.7", unit: "Trillion", desc: "That's the size of the global data economy by 2030." },
  { type: "text-hero", text: "You generate it.", sub: "" },
  { type: "text-hero", text: "They monetize it.", sub: "" },
  { type: "text-hero", text: "You get nothing.", sub: "" },
  { type: "pause", duration: 600 },
  { type: "text-medium", text: "Every search. Every purchase. Every photo." },
  { type: "text-medium", text: "Every heartbeat your watch records." },
  { type: "text-medium", text: "Every conversation your phone hears." },
  { type: "pause", duration: 800 },
  { type: "stat", number: "$59", unit: "/year", desc: "That's what the average American is worth to advertisers. Fifty-nine dollars. For your entire digital life." },
  { type: "text-hero", text: "That's not a partnership.", sub: "That's a taking." },
  
  // ─── ACT 3: THE VILLAIN ───
  { type: "pause", duration: 1000 },
  { type: "section", text: "The Architecture of Extraction" },
  { type: "text-medium", text: "The data flows one way." },
  { type: "text-medium", text: "From you → to them." },
  { type: "text-medium", text: "They aggregate it. Analyze it. Sell it." },
  { type: "text-medium", text: "Without transparency. Without consent." },
  { type: "text-medium", text: "Without sharing a single cent." },
  { type: "pause", duration: 800 },
  { type: "text-hero", text: "And now they're using it", sub: "to train AI models that replace you." },
  { type: "pause", duration: 1200 },
  { type: "text-small", text: "We thought about this for a long time." },
  { type: "text-small", text: "And we asked ourselves a simple question..." },
  
  // ─── ACT 4: THE HERO ───
  { type: "pause", duration: 1500 },
  { type: "question", text: "What if your data worked for you?" },
  { type: "pause", duration: 2000 },
  { type: "logo-reveal", text: "hushh" },
  { type: "pause", duration: 1500 },
  { type: "tagline", text: "Your Data. Your Business." },
  { type: "pause", duration: 1000 },
  
  // ─── ACT 5: THE PRODUCT ───
  { type: "section", text: "Introducing Hushh" },
  { type: "text-hero", text: "A personal data vault", sub: "that makes your data universally accessible and valuable" },
  { type: "text-hero", text: "to your trusted partners", sub: "while giving you control and choice over your privacy." },
  { type: "pause", duration: 600 },
  { type: "pillars", items: [
    { icon: "🔐", title: "Your Vault", desc: "Every piece of data you generate — unified, portable, yours." },
    { icon: "🤖", title: "Your Agents", desc: "AI that works for you. Not for advertisers. For you." },
    { icon: "🤝", title: "Your Terms", desc: "Brands request access. You set the price. You keep the value." },
  ]},
  { type: "pause", duration: 800 },
  { type: "text-medium", text: "Think of it as..." },
  { type: "text-hero", text: "OAuth for your entire life.", sub: "" },
  { type: "pause", duration: 600 },
  { type: "text-small", text: "Your phone number is your identity." },
  { type: "text-small", text: "Your vault is your database." },
  { type: "text-small", text: "Your agents are your workforce." },
  { type: "text-small", text: "Your consent is your currency." },
  
  // ─── ACT 6: THE ARCHITECTURE ───
  { type: "pause", duration: 800 },
  { type: "section", text: "How It Works" },
  { type: "flow", steps: [
    { num: "01", title: "Connect", desc: "Link your apps, accounts, and devices. Hushh aggregates your data into one sovereign vault." },
    { num: "02", title: "Control", desc: "Set your privacy preferences. Define who sees what. Your AI guardian Nav enforces your rules." },
    { num: "03", title: "Earn", desc: "Brands and partners request access on your terms. You approve. You earn. Every handshake is yours." },
    { num: "04", title: "Compound", desc: "More data in your vault → smarter AI agents → better deals → more value. The flywheel never stops." },
  ]},
  { type: "pause", duration: 800 },
  { type: "text-medium", text: "We didn't build another app." },
  { type: "text-hero", text: "We built the operating system", sub: "for the personal data economy." },
  
  // ─── ACT 7: ONE MORE THING ───
  { type: "pause", duration: 1500 },
  { type: "one-more-thing" },
  { type: "pause", duration: 2000 },
  { type: "text-small", text: "We asked ourselves another question." },
  { type: "text-medium", text: "If we believe in the companies building this future..." },
  { type: "text-hero", text: "Why not own them?", sub: "" },
  { type: "pause", duration: 1000 },
  { type: "fund-reveal" },
  { type: "text-medium", text: "Twenty-seven companies. One metric." },
  { type: "text-medium", text: "Projected 2033 absolute free cash flow." },
  { type: "text-medium", text: "The highest wins. No blending. No bias. Math decides." },
  { type: "pause", duration: 600 },
  { type: "aces", names: ["NVIDIA", "Apple", "Microsoft", "Alphabet", "Berkshire", "Amazon"] },
  { type: "text-small", text: "These six companies will generate over $800 billion in annual free cash flow by 2033." },
  { type: "text-hero", text: "We don't predict the future.", sub: "We own the companies that are building it." },
  
  // ─── ACT 8: THE CLOSE ───
  { type: "pause", duration: 1500 },
  { type: "section", text: "Two Engines. One Mission." },
  { type: "dual-engine" },
  { type: "pause", duration: 800 },
  { type: "text-hero", text: "Data is a personal asset.", sub: "Capital is a compounding engine." },
  { type: "text-hero", text: "Together, they create something", sub: "the world has never seen." },
  { type: "pause", duration: 1200 },
  { type: "final-logo" },
  { type: "close", text: "Your data. Your business.", sub: "Your future. Your terms." },
];

// ─── SLIDE COMPONENTS ───

function SlideBlack() {
  return <div className="slide slide-black" />;
}

function SlideTextHero({ text, sub }) {
  return (
    <div className="slide slide-text-hero">
      <h1 className="hero-text fade-up">{text}</h1>
      {sub && <p className="hero-sub fade-up d2">{sub}</p>}
    </div>
  );
}

function SlideTextMedium({ text }) {
  return (
    <div className="slide slide-text-medium">
      <p className="medium-text fade-up">{text}</p>
    </div>
  );
}

function SlideTextSmall({ text }) {
  return (
    <div className="slide slide-text-small">
      <p className="small-text fade-up">{text}</p>
    </div>
  );
}

function SlideSection({ text }) {
  return (
    <div className="slide slide-section">
      <div className="section-line fade-width" />
      <h2 className="section-text fade-up d1">{text}</h2>
      <div className="section-line fade-width d2" />
    </div>
  );
}

function SlideStat({ number, unit, desc }) {
  return (
    <div className="slide slide-stat">
      <div className="stat-row fade-up">
        <span className="stat-number">{number}</span>
        <span className="stat-unit">{unit}</span>
      </div>
      <p className="stat-desc fade-up d2">{desc}</p>
    </div>
  );
}

function SlideQuestion({ text }) {
  return (
    <div className="slide slide-question">
      <p className="question-text fade-up">{text}</p>
    </div>
  );
}

function SlideLogoReveal({ text }) {
  return (
    <div className="slide slide-logo-reveal">
      <div className="logo-glow" />
      <h1 className="logo-text scale-in">{text}</h1>
    </div>
  );
}

function SlideTagline({ text }) {
  return (
    <div className="slide slide-tagline">
      <p className="tagline-text fade-up">{text}</p>
    </div>
  );
}

function SlidePillars({ items }) {
  return (
    <div className="slide slide-pillars">
      <div className="pillars-grid">
        {items.map((item, i) => (
          <div key={i} className={`pillar fade-up d${i + 1}`}>
            <div className="pillar-icon">{item.icon}</div>
            <h3 className="pillar-title">{item.title}</h3>
            <p className="pillar-desc">{item.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function SlideFlow({ steps }) {
  return (
    <div className="slide slide-flow">
      <div className="flow-grid">
        {steps.map((s, i) => (
          <div key={i} className={`flow-step fade-up d${i + 1}`}>
            <span className="flow-num">{s.num}</span>
            <h3 className="flow-title">{s.title}</h3>
            <p className="flow-desc">{s.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function SlideOneMoreThing() {
  return (
    <div className="slide slide-omt">
      <p className="omt-text fade-up">One more thing...</p>
    </div>
  );
}

function SlideFundReveal() {
  return (
    <div className="slide slide-fund-reveal">
      <p className="fund-pre fade-up">Hushh Evergreen Alpha Aloha Fund A</p>
      <div className="fund-line fade-width d1" />
      <p className="fund-tagline fade-up d2">Alpha selects. Aloha compounds. Capital efficiency amplifies.</p>
    </div>
  );
}

function SlideAces({ names }) {
  return (
    <div className="slide slide-aces">
      <p className="aces-label fade-up">The Six Aces</p>
      <div className="aces-grid">
        {names.map((n, i) => (
          <div key={i} className={`ace fade-up d${i + 1}`}>
            <span className="ace-rank">#{i + 1}</span>
            <span className="ace-name">{n}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function SlideDualEngine() {
  return (
    <div className="slide slide-dual">
      <div className="dual-grid">
        <div className="dual-card fade-up d1">
          <div className="dual-icon">🤫</div>
          <h3 className="dual-title">Hushh.ai</h3>
          <p className="dual-desc">Your data becomes your asset.<br/>Your agents work for you.<br/>Your privacy is your power.</p>
        </div>
        <div className="dual-connector fade-up d2">
          <span>×</span>
        </div>
        <div className="dual-card fade-up d3">
          <div className="dual-icon">♠</div>
          <h3 className="dual-title">Alpha Aloha Fund</h3>
          <p className="dual-desc">27 companies. One metric.<br/>Systematic income. Intelligent leverage.<br/>Compounding forever.</p>
        </div>
      </div>
    </div>
  );
}

function SlideFinalLogo() {
  return (
    <div className="slide slide-final-logo">
      <div className="final-glow" />
      <h1 className="final-logo-text scale-in">hushh</h1>
      <p className="final-by fade-up d2">Hushh Technologies Middle East LLC</p>
    </div>
  );
}

function SlideClose({ text, sub }) {
  return (
    <div className="slide slide-close">
      <h1 className="close-text fade-up">{text}</h1>
      <p className="close-sub fade-up d2">{sub}</p>
    </div>
  );
}

function SlidePause() {
  return <div className="slide slide-black" />;
}

// ─── RENDERER ───
function renderSlide(slide, idx) {
  switch (slide.type) {
    case "black": return <SlideBlack key={idx} />;
    case "text-hero": return <SlideTextHero key={idx} text={slide.text} sub={slide.sub} />;
    case "text-medium": return <SlideTextMedium key={idx} text={slide.text} />;
    case "text-small": return <SlideTextSmall key={idx} text={slide.text} />;
    case "section": return <SlideSection key={idx} text={slide.text} />;
    case "stat": return <SlideStat key={idx} number={slide.number} unit={slide.unit} desc={slide.desc} />;
    case "question": return <SlideQuestion key={idx} text={slide.text} />;
    case "logo-reveal": return <SlideLogoReveal key={idx} text={slide.text} />;
    case "tagline": return <SlideTagline key={idx} text={slide.text} />;
    case "pillars": return <SlidePillars key={idx} items={slide.items} />;
    case "flow": return <SlideFlow key={idx} steps={slide.steps} />;
    case "one-more-thing": return <SlideOneMoreThing key={idx} />;
    case "fund-reveal": return <SlideFundReveal key={idx} />;
    case "aces": return <SlideAces key={idx} names={slide.names} />;
    case "dual-engine": return <SlideDualEngine key={idx} />;
    case "final-logo": return <SlideFinalLogo key={idx} />;
    case "close": return <SlideClose key={idx} text={slide.text} sub={slide.sub} />;
    case "pause": return <SlidePause key={idx} />;
    default: return <SlideBlack key={idx} />;
  }
}

// ─── MAIN COMPONENT ───
export default function SteveJobsKeynote() {
  const [current, setCurrent] = useState(0);
  const [started, setStarted] = useState(false);
  const containerRef = useRef(null);
  const lastNav = useRef(0);

  const total = SLIDES.length;
  const slide = SLIDES[current];

  const next = useCallback(() => {
    const now = Date.now();
    if (now - lastNav.current < 300) return;
    lastNav.current = now;
    setCurrent(c => Math.min(c + 1, total - 1));
  }, [total]);

  const prev = useCallback(() => {
    const now = Date.now();
    if (now - lastNav.current < 300) return;
    lastNav.current = now;
    setCurrent(c => Math.max(c - 1, 0));
  }, []);

  useEffect(() => {
    const handleKey = (e) => {
      if (!started) { setStarted(true); return; }
      if (e.key === "ArrowRight" || e.key === " " || e.key === "Enter") { e.preventDefault(); next(); }
      if (e.key === "ArrowLeft" || e.key === "Backspace") { e.preventDefault(); prev(); }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [started, next, prev]);

  const handleClick = (e) => {
    if (!started) { setStarted(true); return; }
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    if (x > rect.width * 0.3) next(); else prev();
  };

  // Auto-advance pause slides
  useEffect(() => {
    if (started && slide?.type === "pause") {
      const t = setTimeout(next, slide.duration || 1000);
      return () => clearTimeout(t);
    }
  }, [current, started, slide, next]);

  if (!started) {
    return (
      <>
        <style>{getStyles()}</style>
        <div className="keynote-start" onClick={() => setStarted(true)}>
          <div className="start-glow" />
          <h1 className="start-logo pulse">hushh</h1>
          <p className="start-hint">Click anywhere or press any key to begin</p>
          <p className="start-sub">A product introduction</p>
        </div>
      </>
    );
  }

  return (
    <>
      <style>{getStyles()}</style>
      <div className="keynote" ref={containerRef} onClick={handleClick}>
        <div className="slide-container" key={current}>
          {renderSlide(slide, current)}
        </div>
        <div className="progress">
          <div className="progress-bar" style={{ width: `${((current + 1) / total) * 100}%` }} />
        </div>
        <div className="nav-hint">
          {current > 0 && <span className="nav-left">← back</span>}
          <span className="nav-right">{current < total - 1 ? "tap to continue →" : "fin"}</span>
        </div>
      </div>
    </>
  );
}

function getStyles() {
  return `
    @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,700;1,400&family=Outfit:wght@300;400;500;600;700&display=swap');

    * { margin: 0; padding: 0; box-sizing: border-box; }

    :root {
      --black: #000000;
      --white: #FFFFFF;
      --gold: #C9A84C;
      --gold-dim: rgba(201,168,76,0.3);
      --gray: #888888;
      --dim: rgba(255,255,255,0.4);
      --font-display: 'Playfair Display', Georgia, serif;
      --font-body: 'Outfit', -apple-system, sans-serif;
    }

    .keynote-start, .keynote {
      width: 100%; height: 100vh; min-height: 500px;
      background: var(--black); color: var(--white);
      display: flex; align-items: center; justify-content: center;
      position: relative; overflow: hidden; cursor: pointer;
      user-select: none; -webkit-user-select: none;
    }

    /* ─── START SCREEN ─── */
    .start-glow {
      position: absolute; width: 400px; height: 400px; border-radius: 50%;
      background: radial-gradient(circle, rgba(201,168,76,0.15) 0%, transparent 70%);
      animation: breathe 4s ease-in-out infinite;
    }
    .start-logo {
      font-family: var(--font-display); font-size: 72px; font-weight: 700;
      color: var(--white); letter-spacing: 8px; position: relative; z-index: 1;
    }
    .start-hint {
      position: absolute; bottom: 80px; font-family: var(--font-body);
      font-size: 14px; color: var(--dim); letter-spacing: 1px;
    }
    .start-sub {
      position: absolute; bottom: 55px; font-family: var(--font-body);
      font-size: 11px; color: var(--gold-dim); letter-spacing: 2px; text-transform: uppercase;
    }

    /* ─── SLIDE CONTAINER ─── */
    .slide-container {
      width: 100%; height: 100%;
      animation: fadeSlide 0.5s ease forwards;
    }
    .slide {
      width: 100%; height: 100vh; min-height: 500px;
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      padding: 40px 60px; text-align: center;
    }
    .slide-black { background: var(--black); }

    /* ─── HERO TEXT ─── */
    .hero-text {
      font-family: var(--font-display); font-size: clamp(32px, 5vw, 56px);
      font-weight: 700; line-height: 1.2; color: var(--white);
      max-width: 900px; letter-spacing: -0.5px;
    }
    .hero-sub {
      font-family: var(--font-body); font-size: clamp(18px, 2.5vw, 28px);
      font-weight: 300; color: var(--dim); margin-top: 16px;
      max-width: 700px; line-height: 1.4;
    }

    /* ─── MEDIUM TEXT ─── */
    .medium-text {
      font-family: var(--font-body); font-size: clamp(22px, 3vw, 36px);
      font-weight: 400; color: rgba(255,255,255,0.85); max-width: 800px;
      line-height: 1.4; letter-spacing: -0.2px;
    }

    /* ─── SMALL TEXT ─── */
    .small-text {
      font-family: var(--font-body); font-size: clamp(16px, 2vw, 22px);
      font-weight: 300; color: var(--dim); max-width: 700px;
      line-height: 1.5;
    }

    /* ─── SECTION ─── */
    .section-text {
      font-family: var(--font-display); font-size: clamp(14px, 1.5vw, 18px);
      font-weight: 400; color: var(--gold); letter-spacing: 6px;
      text-transform: uppercase; margin: 16px 0;
    }
    .section-line {
      width: 80px; height: 1px; background: var(--gold);
    }

    /* ─── STAT ─── */
    .stat-row { display: flex; align-items: baseline; gap: 8px; }
    .stat-number {
      font-family: var(--font-display); font-size: clamp(60px, 10vw, 120px);
      font-weight: 700; color: var(--gold);
    }
    .stat-unit {
      font-family: var(--font-body); font-size: clamp(24px, 3vw, 40px);
      font-weight: 300; color: var(--gold-dim);
    }
    .stat-desc {
      font-family: var(--font-body); font-size: clamp(14px, 1.5vw, 20px);
      font-weight: 300; color: var(--dim); max-width: 600px;
      margin-top: 20px; line-height: 1.5;
    }

    /* ─── QUESTION ─── */
    .question-text {
      font-family: var(--font-display); font-size: clamp(28px, 4vw, 52px);
      font-weight: 400; font-style: italic; color: var(--white);
      max-width: 800px; line-height: 1.3;
    }

    /* ─── LOGO REVEAL ─── */
    .slide-logo-reveal { position: relative; }
    .logo-glow {
      position: absolute; width: 500px; height: 500px; border-radius: 50%;
      background: radial-gradient(circle, rgba(201,168,76,0.2) 0%, transparent 60%);
      animation: breathe 3s ease-in-out infinite;
    }
    .logo-text {
      font-family: var(--font-display); font-size: clamp(64px, 12vw, 140px);
      font-weight: 700; color: var(--white); letter-spacing: 6px;
      position: relative; z-index: 1;
      text-shadow: 0 0 80px rgba(201,168,76,0.3);
    }

    /* ─── TAGLINE ─── */
    .tagline-text {
      font-family: var(--font-body); font-size: clamp(20px, 3vw, 32px);
      font-weight: 500; color: var(--gold); letter-spacing: 4px;
    }

    /* ─── PILLARS ─── */
    .pillars-grid {
      display: flex; gap: 40px; max-width: 900px;
      flex-wrap: wrap; justify-content: center;
    }
    .pillar {
      flex: 1; min-width: 220px; max-width: 280px; text-align: center;
      padding: 30px 20px;
      border: 1px solid rgba(201,168,76,0.15); border-radius: 8px;
      background: rgba(255,255,255,0.02);
    }
    .pillar-icon { font-size: 36px; margin-bottom: 12px; }
    .pillar-title {
      font-family: var(--font-display); font-size: 20px; font-weight: 700;
      color: var(--white); margin-bottom: 8px;
    }
    .pillar-desc {
      font-family: var(--font-body); font-size: 14px; font-weight: 300;
      color: var(--dim); line-height: 1.5;
    }

    /* ─── FLOW ─── */
    .flow-grid {
      display: flex; gap: 24px; max-width: 960px;
      flex-wrap: wrap; justify-content: center;
    }
    .flow-step {
      flex: 1; min-width: 200px; max-width: 220px;
      text-align: left; padding: 20px;
      border-left: 2px solid var(--gold-dim);
    }
    .flow-num {
      font-family: var(--font-display); font-size: 28px; font-weight: 700;
      color: var(--gold); display: block; margin-bottom: 4px;
    }
    .flow-title {
      font-family: var(--font-body); font-size: 18px; font-weight: 600;
      color: var(--white); margin-bottom: 6px;
    }
    .flow-desc {
      font-family: var(--font-body); font-size: 13px; font-weight: 300;
      color: var(--dim); line-height: 1.5;
    }

    /* ─── ONE MORE THING ─── */
    .omt-text {
      font-family: var(--font-display); font-size: clamp(32px, 5vw, 56px);
      font-weight: 400; font-style: italic; color: var(--white);
    }

    /* ─── FUND REVEAL ─── */
    .fund-pre {
      font-family: var(--font-display); font-size: clamp(22px, 3.5vw, 40px);
      font-weight: 700; color: var(--white); letter-spacing: 1px;
    }
    .fund-line { width: 120px; height: 2px; background: var(--gold); margin: 20px auto; }
    .fund-tagline {
      font-family: var(--font-body); font-size: clamp(14px, 2vw, 20px);
      font-weight: 300; color: var(--gold); letter-spacing: 2px;
      font-style: italic;
    }

    /* ─── ACES ─── */
    .aces-label {
      font-family: var(--font-body); font-size: 14px; font-weight: 500;
      color: var(--gold); letter-spacing: 3px; text-transform: uppercase;
      margin-bottom: 24px;
    }
    .aces-grid {
      display: flex; gap: 16px; flex-wrap: wrap; justify-content: center;
      max-width: 800px;
    }
    .ace {
      padding: 16px 24px; border: 1px solid rgba(201,168,76,0.2);
      border-radius: 6px; background: rgba(201,168,76,0.04);
      display: flex; flex-direction: column; align-items: center; min-width: 110px;
    }
    .ace-rank { font-family: var(--font-body); font-size: 11px; color: var(--gold-dim); }
    .ace-name { font-family: var(--font-display); font-size: 18px; font-weight: 700; color: var(--white); }

    /* ─── DUAL ENGINE ─── */
    .dual-grid { display: flex; align-items: center; gap: 32px; flex-wrap: wrap; justify-content: center; }
    .dual-card {
      padding: 32px 28px; border: 1px solid rgba(255,255,255,0.08);
      border-radius: 12px; background: rgba(255,255,255,0.02);
      max-width: 280px; text-align: center;
    }
    .dual-icon { font-size: 32px; margin-bottom: 12px; }
    .dual-title {
      font-family: var(--font-display); font-size: 24px; font-weight: 700;
      color: var(--white); margin-bottom: 10px;
    }
    .dual-desc {
      font-family: var(--font-body); font-size: 14px; font-weight: 300;
      color: var(--dim); line-height: 1.6;
    }
    .dual-connector {
      font-family: var(--font-display); font-size: 36px; color: var(--gold);
    }

    /* ─── FINAL LOGO ─── */
    .slide-final-logo { position: relative; }
    .final-glow {
      position: absolute; width: 600px; height: 600px; border-radius: 50%;
      background: radial-gradient(circle, rgba(201,168,76,0.15) 0%, transparent 65%);
      animation: breathe 4s ease-in-out infinite;
    }
    .final-logo-text {
      font-family: var(--font-display); font-size: clamp(72px, 14vw, 160px);
      font-weight: 700; color: var(--white); letter-spacing: 8px;
      position: relative; z-index: 1;
      text-shadow: 0 0 100px rgba(201,168,76,0.25);
    }
    .final-by {
      font-family: var(--font-body); font-size: 14px; font-weight: 300;
      color: var(--dim); letter-spacing: 2px; margin-top: 16px;
      position: relative; z-index: 1;
    }

    /* ─── CLOSE ─── */
    .close-text {
      font-family: var(--font-display); font-size: clamp(28px, 4vw, 48px);
      font-weight: 700; color: var(--white); line-height: 1.3;
    }
    .close-sub {
      font-family: var(--font-body); font-size: clamp(16px, 2vw, 24px);
      font-weight: 300; color: var(--gold); margin-top: 16px;
      letter-spacing: 2px;
    }

    /* ─── PROGRESS ─── */
    .progress {
      position: fixed; bottom: 0; left: 0; right: 0; height: 2px;
      background: rgba(255,255,255,0.05); z-index: 100;
    }
    .progress-bar {
      height: 100%; background: var(--gold);
      transition: width 0.4s ease;
    }

    /* ─── NAV HINTS ─── */
    .nav-hint {
      position: fixed; bottom: 14px; left: 0; right: 0;
      display: flex; justify-content: space-between; padding: 0 24px;
      font-family: var(--font-body); font-size: 11px; color: rgba(255,255,255,0.15);
      z-index: 100; pointer-events: none;
    }

    /* ─── ANIMATIONS ─── */
    .fade-up {
      opacity: 0; transform: translateY(20px);
      animation: fadeUp 0.7s ease forwards;
    }
    .scale-in {
      opacity: 0; transform: scale(0.8);
      animation: scaleIn 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards;
    }
    .fade-width {
      width: 0;
      animation: fadeWidth 0.6s ease forwards;
    }
    .pulse { animation: pulse 2s ease-in-out infinite; }

    .d1 { animation-delay: 0.15s; }
    .d2 { animation-delay: 0.3s; }
    .d3 { animation-delay: 0.45s; }
    .d4 { animation-delay: 0.6s; }
    .d5 { animation-delay: 0.75s; }
    .d6 { animation-delay: 0.9s; }

    @keyframes fadeUp {
      to { opacity: 1; transform: translateY(0); }
    }
    @keyframes scaleIn {
      to { opacity: 1; transform: scale(1); }
    }
    @keyframes fadeSlide {
      from { opacity: 0; }
      to { opacity: 1; }
    }
    @keyframes fadeWidth {
      to { width: 80px; }
    }
    @keyframes breathe {
      0%, 100% { opacity: 0.4; transform: scale(1); }
      50% { opacity: 0.8; transform: scale(1.1); }
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.7; }
    }

    @media (max-width: 640px) {
      .slide { padding: 24px 28px; }
      .pillars-grid, .flow-grid, .aces-grid, .dual-grid { gap: 16px; }
      .pillar, .flow-step { min-width: 160px; }
    }
  `;
}