import { useState, useEffect, useCallback, useRef } from "react";

// ============================================================================
// KAI COMPLETE EXPERIENCE — THREE INTERCONNECTED FLOWS
// ============================================================================
// FLOW A: RIA Dashboard (post-activation) — import clients, connect CRM, send invites
// FLOW B: Client Invite System — RIA customizes and sends invitations  
// FLOW C: Client Onboarding — client accepts invite, trains Kai on their full financial life
//
// Design Philosophy: Apple HIG + Hushh Data Sovereignty
// Tone: Luxury refined (RIA side) → Warm human (Client side)
// Core Principle: AI works in silence 🤫 — trust is bidirectional
// ============================================================================

const T = {
  bg: "#08080A", bgCard: "#101013", bgEl: "#18181C", bgHover: "#1E1E24",
  gold: "#C9A84C", goldL: "#E8D48B", goldS: "rgba(201,168,76,0.10)",
  goldG: "rgba(201,168,76,0.22)", goldB: "rgba(201,168,76,0.35)",
  txt: "#F5F5F7", txt2: "#8E8E93", txt3: "#636366", txt4: "#48484A",
  brd: "rgba(255,255,255,0.07)", brdA: "rgba(201,168,76,0.35)",
  ok: "#30D158", okS: "rgba(48,209,88,0.10)",
  err: "#FF453A", warn: "#FFD60A",
  w: "#FFFFFF", bl: "#000000",
  // Client-side warm palette
  cBg: "#0C0B0F", cCard: "#141318", cAccent: "#B8A472",
  cWarm: "#E8D5B0", cBlush: "rgba(232,213,176,0.08)",
};

const font = "'SF Pro Text', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const fontD = "'SF Pro Display', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

const ease = "cubic-bezier(0.25, 0.1, 0.25, 1)";

// ============================================================================
// SHARED MICRO-COMPONENTS
// ============================================================================

const Fade = ({ children, delay = 0, show = true }) => {
  const [v, setV] = useState(false);
  useEffect(() => { 
    if (show) { const t = setTimeout(() => setV(true), delay); return () => clearTimeout(t); }
    else setV(false);
  }, [delay, show]);
  return (
    <div style={{ opacity: v ? 1 : 0, transform: v ? "translateY(0)" : "translateY(18px)", transition: `all 0.55s ${ease}` }}>
      {children}
    </div>
  );
};

const Btn = ({ children, onClick, disabled, variant = "primary", small, style: sx }) => {
  const [p, setP] = useState(false);
  const isPri = variant === "primary";
  return (
    <button onClick={onClick} disabled={disabled}
      onMouseDown={() => setP(true)} onMouseUp={() => setP(false)} onMouseLeave={() => setP(false)}
      style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "8px",
        width: small ? "auto" : "100%",
        padding: small ? "10px 20px" : "17px 32px",
        fontSize: small ? "14px" : "17px", fontWeight: 600, fontFamily: font,
        color: disabled ? T.txt3 : isPri ? T.bg : T.gold,
        background: disabled ? T.bgEl : isPri ? `linear-gradient(135deg, ${T.gold}, ${T.goldL})` : "transparent",
        border: isPri ? "none" : `1px solid ${T.brdA}`,
        borderRadius: small ? "10px" : "14px", cursor: disabled ? "default" : "pointer",
        transition: `all 0.3s ${ease}`, transform: p && !disabled ? "scale(0.97)" : "scale(1)",
        minHeight: small ? "40px" : "54px", letterSpacing: "-0.01em",
        boxShadow: disabled || !isPri ? "none" : `0 4px 20px ${T.goldG}`,
        ...sx,
      }}>
      {children}
    </button>
  );
};

const Chip = ({ label, selected, onClick, icon, small }) => (
  <button onClick={onClick} style={{
    display: "inline-flex", alignItems: "center", gap: "6px",
    padding: small ? "8px 14px" : "13px 18px",
    fontSize: small ? "13px" : "15px", fontWeight: 500, fontFamily: font,
    color: selected ? T.bg : T.txt, 
    background: selected ? `linear-gradient(135deg, ${T.gold}, ${T.goldL})` : T.bgEl,
    border: `1px solid ${selected ? "transparent" : T.brd}`, borderRadius: "11px",
    cursor: "pointer", transition: `all 0.3s ${ease}`, minHeight: small ? "36px" : "46px",
    boxShadow: selected ? `0 2px 10px ${T.goldG}` : "none",
  }}>
    {icon && <span style={{ fontSize: small ? "14px" : "16px" }}>{icon}</span>}{label}
  </button>
);

const Toggle = ({ on, onToggle, locked }) => (
  <div onClick={locked ? undefined : onToggle} style={{
    width: "51px", height: "31px", borderRadius: "16px", position: "relative",
    background: on ? T.gold : T.txt3, transition: `background 0.3s ${ease}`,
    cursor: locked ? "default" : "pointer", flexShrink: 0, opacity: locked ? 0.6 : 1,
  }}>
    <div style={{
      width: "27px", height: "27px", borderRadius: "14px", background: T.w,
      position: "absolute", top: "2px", left: on ? "22px" : "2px",
      transition: `left 0.3s ${ease}`, boxShadow: "0 2px 4px rgba(0,0,0,0.3)",
    }} />
  </div>
);

const Input = ({ label, placeholder, value, onChange, icon, type = "text", sub, verified, area }) => {
  const [f, setF] = useState(false);
  const Tag = area ? "textarea" : "input";
  return (
    <div style={{ marginBottom: "18px" }}>
      {label && <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: T.txt2, marginBottom: "7px", letterSpacing: "0.03em", textTransform: "uppercase", fontFamily: font }}>{label}</label>}
      <div style={{ position: "relative" }}>
        {icon && <span style={{ position: "absolute", left: "15px", top: area ? "16px" : "50%", transform: area ? "none" : "translateY(-50%)", fontSize: "16px", opacity: 0.5 }}>{icon}</span>}
        <Tag type={type} placeholder={placeholder} value={value} onChange={e => onChange(e.target.value)}
          onFocus={() => setF(true)} onBlur={() => setF(false)} rows={area ? 4 : undefined}
          style={{
            width: "100%", padding: area ? "14px 18px" : "15px 18px",
            paddingLeft: icon ? "44px" : "18px", paddingRight: verified ? "44px" : "18px",
            fontSize: "16px", fontFamily: font, color: T.txt, background: T.bgEl,
            border: `1px solid ${f ? T.brdA : T.brd}`, borderRadius: "13px", outline: "none",
            transition: `all 0.3s ${ease}`, boxSizing: "border-box", resize: "none",
            boxShadow: f ? `0 0 0 3px ${T.goldS}` : "none", lineHeight: 1.5,
          }} />
        {verified && <span style={{ position: "absolute", right: "15px", top: "50%", transform: "translateY(-50%)", color: T.ok, fontSize: "18px" }}>✓</span>}
      </div>
      {sub && <p style={{ fontSize: "12px", color: T.txt3, marginTop: "5px", fontFamily: font }}>{sub}</p>}
    </div>
  );
};

const StatusBar = () => (
  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 24px 6px", fontSize: "13px", fontWeight: 600, color: T.txt }}>
    <span>9:41</span>
    <div style={{ width: "100px", height: "26px", background: T.bg, borderRadius: "13px" }} />
    <span style={{ fontSize: "11px", display: "flex", alignItems: "center", gap: "3px" }}>5G 🔋</span>
  </div>
);

const TabBar = ({ tabs, active, onChange }) => (
  <div style={{
    display: "flex", borderTop: `1px solid ${T.brd}`, background: T.bgCard,
    paddingBottom: "env(safe-area-inset-bottom, 20px)",
  }}>
    {tabs.map(t => (
      <button key={t.id} onClick={() => onChange(t.id)} style={{
        flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: "3px",
        padding: "10px 4px 8px", background: "none", border: "none", cursor: "pointer",
        color: active === t.id ? T.gold : T.txt3, transition: `color 0.2s ${ease}`,
      }}>
        <span style={{ fontSize: "22px" }}>{t.icon}</span>
        <span style={{ fontSize: "10px", fontWeight: 600, fontFamily: font, letterSpacing: "0.02em" }}>{t.label}</span>
      </button>
    ))}
  </div>
);

const SectionHead = ({ title, sub, action, onAction }) => (
  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: "16px" }}>
    <div>
      <h3 style={{ fontSize: "22px", fontWeight: 700, color: T.txt, fontFamily: fontD, letterSpacing: "-0.02em", margin: 0 }}>{title}</h3>
      {sub && <p style={{ fontSize: "14px", color: T.txt2, margin: "4px 0 0", fontFamily: font }}>{sub}</p>}
    </div>
    {action && <button onClick={onAction} style={{ fontSize: "15px", fontWeight: 600, color: T.gold, background: "none", border: "none", cursor: "pointer", fontFamily: font }}>{action}</button>}
  </div>
);

const Card = ({ children, style: sx, onClick }) => (
  <div onClick={onClick} style={{
    background: T.bgEl, borderRadius: "16px", border: `1px solid ${T.brd}`,
    padding: "18px", transition: `all 0.3s ${ease}`, cursor: onClick ? "pointer" : "default",
    ...sx,
  }}>{children}</div>
);

// ============================================================================
// FLOW A: RIA DASHBOARD
// ============================================================================

const MOCK_CLIENTS = [
  { id: 1, name: "Sarah Chen", email: "sarah.chen@gmail.com", aum: "$2.4M", status: "invited", accounts: 3 },
  { id: 2, name: "Michael Torres", email: "m.torres@outlook.com", aum: "$1.8M", status: "active", accounts: 5 },
  { id: 3, name: "Jennifer Park", email: "jpark@yahoo.com", aum: "$3.1M", status: "pending", accounts: 2 },
  { id: 4, name: "Robert Kim", email: "rkim@icloud.com", aum: "$890K", status: "active", accounts: 4 },
  { id: 5, name: "Amanda Foster", email: "afoster@gmail.com", aum: "$5.2M", status: "draft", accounts: 6 },
  { id: 6, name: "David Nguyen", email: "dnguyen@proton.me", aum: "$1.1M", status: "draft", accounts: 2 },
];

const STATUS_COLORS = { active: T.ok, invited: T.warn, pending: T.gold, draft: T.txt3 };

function RIADashboard({ onSwitchToClient }) {
  const [tab, setTab] = useState("home");
  const [clients, setClients] = useState(MOCK_CLIENTS);
  const [showImport, setShowImport] = useState(false);
  const [showInvite, setShowInvite] = useState(null);
  const [importMethod, setImportMethod] = useState(null);
  const [inviteSent, setInviteSent] = useState(false);
  const [selectedClients, setSelectedClients] = useState([]);

  const activeClients = clients.filter(c => c.status === "active").length;
  const totalAUM = "$14.5M";

  // HOME TAB
  const HomeTab = () => (
    <div style={{ padding: "0 22px 24px" }}>
      <Fade delay={100}>
        <div style={{ marginBottom: "24px" }}>
          <p style={{ fontSize: "14px", color: T.txt2, fontFamily: font, margin: "0 0 4px" }}>Good morning</p>
          <h2 style={{ fontSize: "28px", fontWeight: 700, color: T.txt, fontFamily: fontD, letterSpacing: "-0.02em", margin: 0 }}>
            Manish 🤫
          </h2>
        </div>
      </Fade>

      <Fade delay={200}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "24px" }}>
          {[
            { label: "Total AUM", value: totalAUM, icon: "📊" },
            { label: "Active Clients", value: `${activeClients}/${clients.length}`, icon: "👥" },
            { label: "Kai Insights", value: "12 new", icon: "🧠" },
            { label: "Invites Pending", value: clients.filter(c => c.status === "invited" || c.status === "pending").length.toString(), icon: "✉️" },
          ].map((m, i) => (
            <Card key={i} style={{ padding: "16px" }}>
              <div style={{ fontSize: "20px", marginBottom: "8px" }}>{m.icon}</div>
              <div style={{ fontSize: "22px", fontWeight: 700, color: T.txt, fontFamily: fontD, letterSpacing: "-0.02em" }}>{m.value}</div>
              <div style={{ fontSize: "12px", color: T.txt2, fontFamily: font, marginTop: "2px" }}>{m.label}</div>
            </Card>
          ))}
        </div>
      </Fade>

      <Fade delay={350}>
        <SectionHead title="Kai Activity" sub="Latest intelligence" />
        <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "24px" }}>
          {[
            { icon: "🛡️", text: "Tax-loss harvesting opportunity detected for Sarah Chen — estimated $14,200 savings", time: "2m ago", color: T.ok },
            { icon: "📈", text: "Michael Torres' portfolio crossed $1.8M — rebalance threshold triggered", time: "1h ago", color: T.gold },
            { icon: "🤝", text: "Robert Kim accepted Kai invite — 4 accounts connected", time: "3h ago", color: T.ok },
            { icon: "⚡", text: "Covered call opportunity: AAPL $195 strike, 32 DTE, 1.8% premium for Jennifer Park", time: "5h ago", color: T.gold },
          ].map((a, i) => (
            <Card key={i} style={{ padding: "14px 16px", display: "flex", gap: "12px", alignItems: "flex-start" }}>
              <span style={{ fontSize: "20px", flexShrink: 0 }}>{a.icon}</span>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: "14px", color: T.txt, fontFamily: font, margin: 0, lineHeight: 1.45 }}>{a.text}</p>
                <span style={{ fontSize: "12px", color: T.txt3, fontFamily: font }}>{a.time}</span>
              </div>
              <div style={{ width: "6px", height: "6px", borderRadius: "3px", background: a.color, flexShrink: 0, marginTop: "6px" }} />
            </Card>
          ))}
        </div>
      </Fade>

      <Fade delay={500}>
        <Btn onClick={() => setTab("clients")}>Manage Clients</Btn>
      </Fade>
    </div>
  );

  // CLIENTS TAB
  const ClientsTab = () => (
    <div style={{ padding: "0 22px 24px" }}>
      <Fade delay={100}>
        <SectionHead title="Clients" sub={`${clients.length} total`} action="+ Import" onAction={() => setShowImport(true)} />
      </Fade>

      {!showImport && !showInvite && (
        <>
          <Fade delay={200}>
            <div style={{ display: "flex", gap: "8px", marginBottom: "18px", flexWrap: "wrap" }}>
              {["All", "Active", "Invited", "Draft"].map(f => (
                <Chip key={f} label={f} small selected={false} onClick={() => {}} />
              ))}
            </div>
          </Fade>

          {clients.map((c, i) => (
            <Fade key={c.id} delay={250 + i * 60}>
              <Card style={{ padding: "14px 16px", marginBottom: "10px", display: "flex", alignItems: "center", gap: "14px" }}
                onClick={() => c.status === "draft" ? setShowInvite(c) : null}>
                <div style={{
                  width: "44px", height: "44px", borderRadius: "22px",
                  background: `linear-gradient(135deg, ${T.goldS}, ${T.bgEl})`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: "18px", fontWeight: 700, color: T.gold, fontFamily: fontD,
                  border: `1px solid ${T.brd}`,
                }}>{c.name.split(" ").map(n => n[0]).join("")}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: "16px", fontWeight: 600, color: T.txt, fontFamily: font }}>{c.name}</div>
                  <div style={{ fontSize: "13px", color: T.txt2, fontFamily: font }}>{c.aum} · {c.accounts} accounts</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <span style={{
                    fontSize: "11px", fontWeight: 700, textTransform: "uppercase",
                    color: STATUS_COLORS[c.status], fontFamily: font, letterSpacing: "0.04em",
                  }}>{c.status}</span>
                  {c.status === "draft" && <span style={{ fontSize: "16px", color: T.txt3 }}>›</span>}
                </div>
              </Card>
            </Fade>
          ))}

          <Fade delay={600}>
            <div style={{ marginTop: "16px", display: "flex", gap: "10px" }}>
              <Btn small variant="secondary" onClick={() => {
                setSelectedClients(clients.filter(c => c.status === "draft").map(c => c.id));
                setShowInvite({ bulk: true });
              }}>Invite All Drafts</Btn>
              <Btn small onClick={() => setShowImport(true)}>+ Add Clients</Btn>
            </div>
          </Fade>
        </>
      )}

      {/* IMPORT FLOW */}
      {showImport && !importMethod && (
        <Fade delay={100}>
          <div style={{ marginBottom: "16px" }}>
            <button onClick={() => setShowImport(false)} style={{ fontSize: "15px", fontWeight: 500, color: T.gold, background: "none", border: "none", cursor: "pointer", fontFamily: font, padding: "8px 0", marginBottom: "12px" }}>‹ Back</button>
            <h3 style={{ fontSize: "22px", fontWeight: 700, color: T.txt, fontFamily: fontD, letterSpacing: "-0.02em", margin: "0 0 8px" }}>Import clients</h3>
            <p style={{ fontSize: "15px", color: T.txt2, fontFamily: font, margin: "0 0 24px" }}>Connect your CRM or upload a client list.</p>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {[
              { id: "salesforce", icon: "☁️", name: "Salesforce", desc: "Financial Services Cloud" },
              { id: "wealthbox", icon: "💼", name: "Wealthbox", desc: "CRM for advisors" },
              { id: "redtail", icon: "🔴", name: "Redtail", desc: "CRM integration" },
              { id: "hubspot", icon: "🟠", name: "HubSpot", desc: "CRM contacts" },
              { id: "csv", icon: "📄", name: "Upload CSV/Excel", desc: "Spreadsheet import" },
              { id: "manual", icon: "✏️", name: "Add Manually", desc: "One at a time" },
            ].map(m => (
              <Card key={m.id} onClick={() => setImportMethod(m.id)} style={{ 
                display: "flex", alignItems: "center", gap: "16px", padding: "16px 18px",
                cursor: "pointer",
              }}>
                <span style={{ fontSize: "28px" }}>{m.icon}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: "16px", fontWeight: 600, color: T.txt, fontFamily: font }}>{m.name}</div>
                  <div style={{ fontSize: "13px", color: T.txt2, fontFamily: font }}>{m.desc}</div>
                </div>
                <span style={{ color: T.txt3, fontSize: "18px" }}>›</span>
              </Card>
            ))}
          </div>
        </Fade>
      )}

      {/* CRM CONNECTION FLOW */}
      {showImport && importMethod && importMethod !== "csv" && importMethod !== "manual" && (
        <CRMConnectFlow method={importMethod} onBack={() => setImportMethod(null)} onComplete={(newClients) => {
          setClients([...clients, ...newClients]);
          setShowImport(false);
          setImportMethod(null);
        }} />
      )}

      {/* CSV UPLOAD FLOW */}
      {showImport && importMethod === "csv" && (
        <CSVUploadFlow onBack={() => setImportMethod(null)} onComplete={(newClients) => {
          setClients([...clients, ...newClients]);
          setShowImport(false);
          setImportMethod(null);
        }} />
      )}

      {/* INVITE FLOW */}
      {showInvite && (
        <InviteFlow 
          client={showInvite} 
          onBack={() => { setShowInvite(null); setInviteSent(false); }}
          onSend={() => {
            setInviteSent(true);
            setTimeout(() => {
              setClients(prev => prev.map(c => 
                (showInvite.bulk ? selectedClients.includes(c.id) : c.id === showInvite.id) && c.status === "draft"
                  ? { ...c, status: "invited" } : c
              ));
            }, 1500);
          }}
          sent={inviteSent}
          onPreview={onSwitchToClient}
        />
      )}
    </div>
  );

  // INSIGHTS TAB
  const InsightsTab = () => (
    <div style={{ padding: "0 22px 24px" }}>
      <Fade delay={100}>
        <SectionHead title="Kai Insights" sub="AI-generated intelligence" />
      </Fade>
      {[
        { cat: "Tax Optimization", icon: "🏛️", insights: [
          { title: "Tax-Loss Harvest: INTC", detail: "Sarah Chen holds 200 shares with $4,800 unrealized loss. 31-day wash sale window clear. Estimated tax savings: $1,440 at 30% bracket.", action: "Review" },
          { title: "Roth Conversion Window", detail: "Amanda Foster's income projection shows unusually low AGI this year. Ideal window for partial Roth conversion up to $180K.", action: "Analyze" },
        ]},
        { cat: "Options Overlay", icon: "📊", insights: [
          { title: "Covered Call: AAPL $195", detail: "Jennifer Park: 500 shares AAPL. 32 DTE $195 call @ $3.40 premium = $1,700. Delta 0.22, probability OTM 78%.", action: "Propose" },
          { title: "CSP Opportunity: MSFT", detail: "Michael Torres: Cash-secured put MSFT $380 @ $5.20. 45 DTE. Would acquire at cost basis below current 200-day MA.", action: "Propose" },
        ]},
        { cat: "Rebalancing", icon: "⚖️", insights: [
          { title: "Drift Alert: Robert Kim", detail: "Tech allocation drifted to 38% (target 30%). Recommend trimming NVDA (+$12K above target) and adding to international equity sleeve.", action: "Rebalance" },
        ]},
      ].map((section, si) => (
        <Fade key={si} delay={200 + si * 150}>
          <div style={{ marginBottom: "24px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
              <span style={{ fontSize: "18px" }}>{section.icon}</span>
              <span style={{ fontSize: "13px", fontWeight: 700, color: T.gold, textTransform: "uppercase", letterSpacing: "0.04em", fontFamily: font }}>{section.cat}</span>
            </div>
            {section.insights.map((ins, ii) => (
              <Card key={ii} style={{ marginBottom: "10px", padding: "16px" }}>
                <div style={{ fontSize: "16px", fontWeight: 600, color: T.txt, fontFamily: font, marginBottom: "6px" }}>{ins.title}</div>
                <p style={{ fontSize: "14px", color: T.txt2, fontFamily: font, lineHeight: 1.5, margin: "0 0 12px" }}>{ins.detail}</p>
                <Btn small variant="secondary" onClick={() => {}}>{ins.action}</Btn>
              </Card>
            ))}
          </div>
        </Fade>
      ))}
    </div>
  );

  const tabs = [
    { id: "home", icon: "🏠", label: "Home" },
    { id: "clients", icon: "👥", label: "Clients" },
    { id: "insights", icon: "🧠", label: "Insights" },
    { id: "settings", icon: "⚙️", label: "Settings" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <StatusBar />
      <div style={{ flex: 1, overflowY: "auto", paddingTop: "8px" }}>
        {tab === "home" && <HomeTab />}
        {tab === "clients" && <ClientsTab />}
        {tab === "insights" && <InsightsTab />}
        {tab === "settings" && (
          <div style={{ padding: "0 22px" }}>
            <SectionHead title="Settings" />
            <Card style={{ padding: "16px", marginBottom: "10px" }}>
              <p style={{ color: T.txt2, fontFamily: font, fontSize: "14px", margin: 0 }}>Kai preferences, data permissions, firm details, and compliance settings would live here.</p>
            </Card>
          </div>
        )}
      </div>
      <TabBar tabs={tabs} active={tab} onChange={setTab} />
    </div>
  );
}

// ============================================================================
// CRM CONNECTION SUB-FLOW
// ============================================================================

function CRMConnectFlow({ method, onBack, onComplete }) {
  const [stage, setStage] = useState("auth"); // auth → syncing → done
  const names = { salesforce: "Salesforce", wealthbox: "Wealthbox", redtail: "Redtail", hubspot: "HubSpot" };

  useEffect(() => {
    if (stage === "syncing") {
      const t = setTimeout(() => setStage("done"), 2500);
      return () => clearTimeout(t);
    }
  }, [stage]);

  const newClients = [
    { id: 100, name: "Lisa Martinez", email: "lisa.m@gmail.com", aum: "$670K", status: "draft", accounts: 2 },
    { id: 101, name: "James Wright", email: "j.wright@outlook.com", aum: "$1.4M", status: "draft", accounts: 3 },
  ];

  return (
    <Fade delay={100}>
      <button onClick={onBack} style={{ fontSize: "15px", fontWeight: 500, color: T.gold, background: "none", border: "none", cursor: "pointer", fontFamily: font, padding: "8px 0", marginBottom: "12px" }}>‹ Back</button>
      
      {stage === "auth" && (
        <div>
          <h3 style={{ fontSize: "22px", fontWeight: 700, color: T.txt, fontFamily: fontD, margin: "0 0 8px" }}>Connect {names[method]}</h3>
          <p style={{ fontSize: "15px", color: T.txt2, fontFamily: font, margin: "0 0 24px" }}>Kai will sync your client list securely. No data leaves your control.</p>
          <Card style={{ textAlign: "center", padding: "40px 20px", marginBottom: "20px" }}>
            <div style={{ fontSize: "48px", marginBottom: "16px" }}>
              {method === "salesforce" ? "☁️" : method === "wealthbox" ? "💼" : method === "redtail" ? "🔴" : "🟠"}
            </div>
            <p style={{ fontSize: "15px", color: T.txt2, fontFamily: font, margin: "0 0 20px" }}>
              You'll be redirected to {names[method]} to authorize read-only access to your client contacts.
            </p>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", justifyContent: "center", marginBottom: "6px" }}>
              <span style={{ color: T.ok }}>🔒</span>
              <span style={{ fontSize: "13px", color: T.txt3, fontFamily: font }}>Read-only. Kai never modifies your CRM data.</span>
            </div>
          </Card>
          <Btn onClick={() => setStage("syncing")}>Authorize {names[method]}</Btn>
        </div>
      )}

      {stage === "syncing" && (
        <div style={{ textAlign: "center", padding: "60px 20px" }}>
          <div style={{
            width: "64px", height: "64px", borderRadius: "32px",
            border: `3px solid ${T.brd}`, borderTopColor: T.gold,
            margin: "0 auto 24px", animation: "spin 1s linear infinite",
          }} />
          <h3 style={{ fontSize: "20px", fontWeight: 600, color: T.txt, fontFamily: fontD, margin: "0 0 8px" }}>Syncing contacts...</h3>
          <p style={{ fontSize: "15px", color: T.txt2, fontFamily: font, margin: 0 }}>Importing from {names[method]}</p>
        </div>
      )}

      {stage === "done" && (
        <div>
          <div style={{ textAlign: "center", padding: "20px 0 24px" }}>
            <div style={{ fontSize: "48px", marginBottom: "12px" }}>✅</div>
            <h3 style={{ fontSize: "22px", fontWeight: 700, color: T.txt, fontFamily: fontD, margin: "0 0 6px" }}>2 new clients imported</h3>
            <p style={{ fontSize: "15px", color: T.txt2, fontFamily: font, margin: 0 }}>Ready to send Kai invitations</p>
          </div>
          {newClients.map(c => (
            <Card key={c.id} style={{ padding: "14px 16px", marginBottom: "10px", display: "flex", alignItems: "center", gap: "14px" }}>
              <div style={{
                width: "40px", height: "40px", borderRadius: "20px", background: T.goldS,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: "15px", fontWeight: 700, color: T.gold, fontFamily: fontD, border: `1px solid ${T.brd}`,
              }}>{c.name.split(" ").map(n => n[0]).join("")}</div>
              <div>
                <div style={{ fontSize: "15px", fontWeight: 600, color: T.txt, fontFamily: font }}>{c.name}</div>
                <div style={{ fontSize: "13px", color: T.txt2, fontFamily: font }}>{c.email}</div>
              </div>
            </Card>
          ))}
          <div style={{ marginTop: "16px" }}>
            <Btn onClick={() => onComplete(newClients)}>Done</Btn>
          </div>
        </div>
      )}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </Fade>
  );
}

// ============================================================================
// CSV UPLOAD SUB-FLOW
// ============================================================================

function CSVUploadFlow({ onBack, onComplete }) {
  const [uploaded, setUploaded] = useState(false);
  const [mapped, setMapped] = useState(false);

  const newClients = [
    { id: 200, name: "Patricia Wong", email: "pwong@gmail.com", aum: "$920K", status: "draft", accounts: 2 },
    { id: 201, name: "Thomas Baker", email: "tbaker@email.com", aum: "$2.1M", status: "draft", accounts: 4 },
    { id: 202, name: "Grace Lee", email: "grace.lee@yahoo.com", aum: "$1.6M", status: "draft", accounts: 3 },
  ];

  return (
    <Fade delay={100}>
      <button onClick={onBack} style={{ fontSize: "15px", fontWeight: 500, color: T.gold, background: "none", border: "none", cursor: "pointer", fontFamily: font, padding: "8px 0", marginBottom: "12px" }}>‹ Back</button>

      {!uploaded && (
        <div>
          <h3 style={{ fontSize: "22px", fontWeight: 700, color: T.txt, fontFamily: fontD, margin: "0 0 8px" }}>Upload client list</h3>
          <p style={{ fontSize: "15px", color: T.txt2, fontFamily: font, margin: "0 0 24px" }}>CSV or Excel with name, email, and optional AUM.</p>
          
          <div onClick={() => setUploaded(true)} style={{
            border: `2px dashed ${T.brdA}`, borderRadius: "16px",
            padding: "48px 24px", textAlign: "center", cursor: "pointer",
            background: T.goldS, transition: `all 0.3s ${ease}`,
            marginBottom: "20px",
          }}>
            <div style={{ fontSize: "40px", marginBottom: "12px" }}>📄</div>
            <p style={{ fontSize: "16px", fontWeight: 600, color: T.gold, fontFamily: font, margin: "0 0 4px" }}>Tap to choose file</p>
            <p style={{ fontSize: "13px", color: T.txt3, fontFamily: font, margin: 0 }}>CSV, XLSX, or XLS up to 10MB</p>
          </div>

          <Card style={{ padding: "14px 16px" }}>
            <div style={{ fontSize: "13px", color: T.txt3, fontFamily: font, lineHeight: 1.5 }}>
              <strong style={{ color: T.txt2 }}>Minimum columns:</strong> First Name, Last Name, Email<br />
              <strong style={{ color: T.txt2 }}>Optional:</strong> Phone, AUM, Account Numbers, Notes
            </div>
          </Card>
        </div>
      )}

      {uploaded && !mapped && (
        <div>
          <h3 style={{ fontSize: "22px", fontWeight: 700, color: T.txt, fontFamily: fontD, margin: "0 0 6px" }}>clients_export.csv</h3>
          <p style={{ fontSize: "15px", color: T.txt2, fontFamily: font, margin: "0 0 20px" }}>3 clients found. Kai auto-mapped your columns.</p>

          {["First Name → first_name ✓", "Last Name → last_name ✓", "Email → email ✓", "Assets → aum ✓"].map((m, i) => (
            <div key={i} style={{
              padding: "12px 16px", background: T.okS, borderRadius: "10px",
              marginBottom: "8px", fontSize: "14px", color: T.ok, fontFamily: font,
              border: `1px solid rgba(48,209,88,0.15)`,
            }}>{m}</div>
          ))}

          <div style={{ marginTop: "20px" }}>
            <Btn onClick={() => setMapped(true)}>Import 3 Clients</Btn>
          </div>
        </div>
      )}

      {mapped && (
        <div style={{ textAlign: "center", padding: "20px 0" }}>
          <div style={{ fontSize: "48px", marginBottom: "12px" }}>✅</div>
          <h3 style={{ fontSize: "22px", fontWeight: 700, color: T.txt, fontFamily: fontD, margin: "0 0 6px" }}>3 clients imported</h3>
          <p style={{ fontSize: "15px", color: T.txt2, fontFamily: font, margin: "0 0 20px" }}>Ready to invite</p>
          <Btn onClick={() => onComplete(newClients)}>Done</Btn>
        </div>
      )}
    </Fade>
  );
}

// ============================================================================
// INVITE FLOW
// ============================================================================

function InviteFlow({ client, onBack, onSend, sent, onPreview }) {
  const isBulk = client.bulk;
  const [msg, setMsg] = useState(
    `I've partnered with Kai, an AI-powered financial intelligence agent, to give you a better advisory experience. Kai helps me serve you with real-time insights — and puts you in full control of your financial data.\n\nIt takes about 3 minutes to set up, and everything stays private and encrypted.`
  );

  if (sent) {
    return (
      <Fade delay={100}>
        <div style={{ textAlign: "center", padding: "40px 0" }}>
          <div style={{ fontSize: "56px", marginBottom: "16px" }}>✉️</div>
          <h3 style={{ fontSize: "24px", fontWeight: 700, color: T.txt, fontFamily: fontD, margin: "0 0 8px" }}>
            {isBulk ? "Invitations sent" : "Invite sent"}
          </h3>
          <p style={{ fontSize: "16px", color: T.txt2, fontFamily: font, margin: "0 0 32px" }}>
            {isBulk ? "Your clients will receive a personalized email." : `${client.name} will receive a personalized email.`}
          </p>
          <Btn onClick={onBack} style={{ marginBottom: "12px" }}>Back to Clients</Btn>
          <Btn variant="secondary" onClick={onPreview}>Preview Client Experience</Btn>
        </div>
      </Fade>
    );
  }

  return (
    <Fade delay={100}>
      <button onClick={onBack} style={{ fontSize: "15px", fontWeight: 500, color: T.gold, background: "none", border: "none", cursor: "pointer", fontFamily: font, padding: "8px 0", marginBottom: "12px" }}>‹ Back</button>
      
      <h3 style={{ fontSize: "22px", fontWeight: 700, color: T.txt, fontFamily: fontD, margin: "0 0 6px" }}>
        {isBulk ? "Invite all draft clients" : `Invite ${client.name}`}
      </h3>
      <p style={{ fontSize: "15px", color: T.txt2, fontFamily: font, margin: "0 0 24px" }}>
        Personalize the invitation your {isBulk ? "clients" : "client"} will receive.
      </p>

      <Card style={{ padding: "16px", marginBottom: "20px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "14px" }}>
          <div style={{ width: "36px", height: "36px", borderRadius: "18px", background: T.goldS, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "14px", fontWeight: 700, color: T.gold, fontFamily: fontD, border: `1px solid ${T.brd}` }}>
            {isBulk ? "2" : client.name?.split(" ").map(n => n[0]).join("")}
          </div>
          <div>
            <div style={{ fontSize: "15px", fontWeight: 600, color: T.txt, fontFamily: font }}>{isBulk ? "2 draft clients" : client.name}</div>
            <div style={{ fontSize: "13px", color: T.txt2, fontFamily: font }}>{isBulk ? "Batch invitation" : client.email}</div>
          </div>
        </div>
        <div style={{ height: "1px", background: T.brd, margin: "0 0 14px" }} />
        <div style={{ fontSize: "13px", color: T.txt3, fontFamily: font }}>
          From: <span style={{ color: T.txt2 }}>Manish Sainani, Hushh Technologies</span>
        </div>
      </Card>

      <Input label="Personal Message" value={msg} onChange={setMsg} area />

      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "24px" }}>
        {["📧 Email", "💬 SMS", "Both"].map(m => (
          <Chip key={m} label={m} small selected={m === "Both"} onClick={() => {}} />
        ))}
      </div>

      <Btn onClick={onSend}>Send Invitation</Btn>
    </Fade>
  );
}

// ============================================================================
// FLOW C: CLIENT-FACING ONBOARDING
// ============================================================================
// This is the human-first experience. Kai recedes. The warmth comes forward.
// The AI is 🤫 — working in silence, building trust through absence.
// ============================================================================

function ClientOnboarding() {
  const [step, setStep] = useState(0);
  const [data, setData] = useState({});
  const ref = useRef(null);

  const next = useCallback(() => {
    setStep(s => s + 1);
    ref.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const steps = [
    "welcome",
    "connect_advisor",
    "about_you",
    "accounts",
    "goals",
    "permissions",
    "ready",
  ];

  // STEP 0 — CLIENT WELCOME
  const Welcome = () => (
    <div style={{ textAlign: "center", padding: "20px 0" }}>
      <Fade delay={100}>
        <div style={{
          width: "80px", height: "80px", borderRadius: "40px",
          background: `linear-gradient(135deg, ${T.cAccent}, ${T.cWarm})`,
          display: "flex", alignItems: "center", justifyContent: "center",
          margin: "0 auto 28px", fontSize: "38px",
          boxShadow: `0 8px 32px rgba(184,164,114,0.2)`,
        }}>🤫</div>
      </Fade>

      <Fade delay={250}>
        <p style={{ fontSize: "14px", color: T.cAccent, fontWeight: 600, fontFamily: font, margin: "0 0 8px", letterSpacing: "0.03em", textTransform: "uppercase" }}>
          Invited by Manish Sainani
        </p>
      </Fade>

      <Fade delay={350}>
        <h1 style={{ fontSize: "30px", fontWeight: 700, color: T.txt, fontFamily: fontD, letterSpacing: "-0.025em", lineHeight: 1.15, margin: "0 0 12px" }}>
          Your finances,{"\n"}quietly understood
        </h1>
      </Fade>

      <Fade delay={450}>
        <p style={{ fontSize: "16px", color: T.txt2, fontFamily: font, lineHeight: 1.55, margin: "0 auto 32px", maxWidth: "300px" }}>
          Kai works in the background — connecting you with your advisor while keeping your full financial picture private and organized.
        </p>
      </Fade>

      <Fade delay={600}>
        <Card style={{ padding: "20px", marginBottom: "28px", textAlign: "left" }}>
          {[
            { icon: "🔒", text: "Your data is encrypted and never sold" },
            { icon: "🤝", text: "You control exactly what your advisor sees" },
            { icon: "🌙", text: "Kai works quietly — no noise, just clarity" },
          ].map((f, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: "14px", padding: "8px 0", borderBottom: i < 2 ? `1px solid ${T.brd}` : "none" }}>
              <span style={{ fontSize: "22px" }}>{f.icon}</span>
              <span style={{ fontSize: "15px", color: T.txt, fontFamily: font }}>{f.text}</span>
            </div>
          ))}
        </Card>
      </Fade>

      <Fade delay={750}>
        <Btn onClick={next}>Get Started</Btn>
        <p style={{ fontSize: "12px", color: T.txt3, fontFamily: font, marginTop: "14px" }}>Takes about 3 minutes · No credit card needed</p>
      </Fade>
    </div>
  );

  // STEP 1 — CONFIRM ADVISOR CONNECTION
  const ConnectAdvisor = () => (
    <div>
      <Fade delay={100}>
        <h2 style={{ fontSize: "26px", fontWeight: 700, color: T.txt, fontFamily: fontD, letterSpacing: "-0.02em", margin: "0 0 8px" }}>Confirm your advisor</h2>
        <p style={{ fontSize: "16px", color: T.txt2, fontFamily: font, margin: "0 0 28px" }}>This creates a private, encrypted channel between you.</p>
      </Fade>

      <Fade delay={250}>
        <Card style={{ padding: "24px", textAlign: "center", marginBottom: "24px", border: `1px solid ${T.brdA}` }}>
          <div style={{
            width: "64px", height: "64px", borderRadius: "32px",
            background: `linear-gradient(135deg, ${T.goldS}, ${T.bgEl})`,
            display: "flex", alignItems: "center", justifyContent: "center",
            margin: "0 auto 16px", fontSize: "24px", fontWeight: 700, color: T.gold,
            fontFamily: fontD, border: `2px solid ${T.brdA}`,
          }}>MS</div>
          <div style={{ fontSize: "20px", fontWeight: 700, color: T.txt, fontFamily: fontD }}>Manish Sainani</div>
          <div style={{ fontSize: "14px", color: T.txt2, fontFamily: font, marginTop: "4px" }}>Hushh Technologies Middle East LLC</div>
          <div style={{ fontSize: "12px", color: T.ok, fontFamily: font, marginTop: "8px", fontWeight: 600 }}>✓ SEC-Registered Investment Adviser</div>
        </Card>
      </Fade>

      <Fade delay={400}>
        <Card style={{ padding: "16px", marginBottom: "24px", background: T.cBlush }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: "12px" }}>
            <span style={{ fontSize: "20px" }}>🤫</span>
            <p style={{ fontSize: "14px", color: T.txt2, fontFamily: font, margin: 0, lineHeight: 1.5 }}>
              <strong style={{ color: T.txt }}>The Hushh promise:</strong> Your advisor only sees data you explicitly approve. Kai processes everything else in complete privacy.
            </p>
          </div>
        </Card>
      </Fade>

      <Fade delay={500}>
        <Btn onClick={next}>Connect with Manish</Btn>
        <button onClick={() => {}} style={{ display: "block", margin: "16px auto 0", fontSize: "14px", color: T.txt3, background: "none", border: "none", cursor: "pointer", fontFamily: font }}>This isn't my advisor</button>
      </Fade>
    </div>
  );

  // STEP 2 — ABOUT YOU (Human-First)
  const AboutYou = () => (
    <div>
      <Fade delay={100}>
        <h2 style={{ fontSize: "26px", fontWeight: 700, color: T.txt, fontFamily: fontD, letterSpacing: "-0.02em", margin: "0 0 8px" }}>A little about you</h2>
        <p style={{ fontSize: "16px", color: T.txt2, fontFamily: font, margin: "0 0 28px" }}>So Kai can speak your language, not Wall Street's.</p>
      </Fade>

      <Fade delay={200}>
        <Input label="Your Name" placeholder="How should Kai address you?" value={data.clientName || ""} onChange={v => setData({ ...data, clientName: v })} icon="👋" />
      </Fade>

      <Fade delay={300}>
        <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: T.txt2, marginBottom: "8px", letterSpacing: "0.03em", textTransform: "uppercase", fontFamily: font }}>Life Stage</label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginBottom: "24px" }}>
          {[
            { id: "early", label: "Building career", icon: "🚀" },
            { id: "growing", label: "Growing family", icon: "🏡" },
            { id: "peak", label: "Peak earning", icon: "📈" },
            { id: "preretire", label: "Pre-retirement", icon: "🌅" },
            { id: "retired", label: "Retired", icon: "🏖️" },
          ].map(s => (
            <Chip key={s.id} label={s.label} icon={s.icon} small selected={data.lifeStage === s.id}
              onClick={() => setData({ ...data, lifeStage: s.id })} />
          ))}
        </div>
      </Fade>

      <Fade delay={400}>
        <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: T.txt2, marginBottom: "8px", letterSpacing: "0.03em", textTransform: "uppercase", fontFamily: font }}>How do finances make you feel?</label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginBottom: "28px" }}>
          {[
            { id: "confident", label: "Confident", icon: "💪" },
            { id: "anxious", label: "A bit anxious", icon: "😰" },
            { id: "curious", label: "Curious", icon: "🧐" },
            { id: "overwhelmed", label: "Overwhelmed", icon: "😵‍💫" },
            { id: "hands-off", label: "Prefer hands-off", icon: "🧘" },
          ].map(s => (
            <Chip key={s.id} label={s.label} icon={s.icon} small selected={data.finFeel === s.id}
              onClick={() => setData({ ...data, finFeel: s.id })} />
          ))}
        </div>
      </Fade>

      <Fade delay={500}>
        <Btn onClick={next} disabled={!data.clientName}>Continue</Btn>
      </Fade>
    </div>
  );

  // STEP 3 — CONNECT ACCOUNTS (The Full Balance Sheet)
  const Accounts = () => {
    const [connected, setConnected] = useState(data.connectedAccounts || []);
    const cats = [
      { id: "managed", icon: "🏛️", title: "Advisor-Managed Accounts", desc: "Accounts Manish manages for you", items: [
        { id: "schwab", name: "Schwab Brokerage", type: "Investment" },
        { id: "schwab_ira", name: "Schwab IRA", type: "Retirement" },
      ]},
      { id: "other_invest", icon: "📊", title: "Other Investments", desc: "Accounts managed elsewhere", items: [
        { id: "401k", name: "401(k) / Employer Plan", type: "Retirement" },
        { id: "vanguard", name: "Vanguard / Fidelity", type: "Investment" },
        { id: "crypto", name: "Crypto (Coinbase, etc.)", type: "Digital Assets" },
        { id: "options", name: "Options / Futures", type: "Trading" },
      ]},
      { id: "banking", icon: "🏦", title: "Banking & Cash", desc: "Checking, savings, CDs", items: [
        { id: "checking", name: "Checking Account", type: "Banking" },
        { id: "savings", name: "Savings / HYSA", type: "Banking" },
      ]},
      { id: "property", icon: "🏠", title: "Real Estate & Hard Assets", desc: "Property, collectibles, valuables", items: [
        { id: "home", name: "Primary Residence", type: "Real Estate" },
        { id: "rental", name: "Rental Property", type: "Real Estate" },
        { id: "other_asset", name: "Other (Art, Auto, etc.)", type: "Tangible" },
      ]},
      { id: "liabilities", icon: "📋", title: "Liabilities", desc: "Complete picture for planning", items: [
        { id: "mortgage", name: "Mortgage", type: "Debt" },
        { id: "student", name: "Student Loans", type: "Debt" },
        { id: "other_debt", name: "Other Debt", type: "Debt" },
      ]},
    ];

    const toggle = (itemId) => {
      const next = connected.includes(itemId) ? connected.filter(c => c !== itemId) : [...connected, itemId];
      setConnected(next);
      setData({ ...data, connectedAccounts: next });
    };

    return (
      <div>
        <Fade delay={100}>
          <h2 style={{ fontSize: "26px", fontWeight: 700, color: T.txt, fontFamily: fontD, letterSpacing: "-0.02em", margin: "0 0 8px" }}>Your full financial picture</h2>
          <p style={{ fontSize: "16px", color: T.txt2, fontFamily: font, margin: "0 0 6px" }}>The more Kai sees, the smarter your advice gets.</p>
          <p style={{ fontSize: "13px", color: T.txt3, fontFamily: font, margin: "0 0 24px" }}>
            🔒 Powered by Plaid. Bank-level encryption. Your advisor only sees what you allow.
          </p>
        </Fade>

        {cats.map((cat, ci) => (
          <Fade key={cat.id} delay={200 + ci * 80}>
            <div style={{ marginBottom: "20px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px" }}>
                <span style={{ fontSize: "18px" }}>{cat.icon}</span>
                <div>
                  <span style={{ fontSize: "15px", fontWeight: 700, color: T.txt, fontFamily: font }}>{cat.title}</span>
                  <span style={{ fontSize: "12px", color: T.txt3, fontFamily: font, marginLeft: "8px" }}>{cat.desc}</span>
                </div>
              </div>
              {cat.items.map(item => (
                <div key={item.id} onClick={() => toggle(item.id)} style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "14px 16px", marginBottom: "6px", borderRadius: "12px",
                  background: connected.includes(item.id) ? T.goldS : T.bgEl,
                  border: `1px solid ${connected.includes(item.id) ? T.brdA : T.brd}`,
                  cursor: "pointer", transition: `all 0.25s ${ease}`,
                }}>
                  <div>
                    <div style={{ fontSize: "15px", fontWeight: 500, color: T.txt, fontFamily: font }}>{item.name}</div>
                    <div style={{ fontSize: "12px", color: T.txt3, fontFamily: font }}>{item.type}</div>
                  </div>
                  <div style={{
                    width: "24px", height: "24px", borderRadius: "12px",
                    border: `2px solid ${connected.includes(item.id) ? T.gold : T.txt3}`,
                    background: connected.includes(item.id) ? T.gold : "transparent",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    transition: `all 0.25s ${ease}`,
                  }}>
                    {connected.includes(item.id) && <span style={{ color: T.bg, fontSize: "14px", fontWeight: 700 }}>✓</span>}
                  </div>
                </div>
              ))}
            </div>
          </Fade>
        ))}

        <Fade delay={700}>
          <p style={{ fontSize: "13px", color: T.txt3, fontFamily: font, textAlign: "center", margin: "0 0 16px" }}>
            {connected.length} of {cats.reduce((a, c) => a + c.items.length, 0)} selected · Add more anytime
          </p>
          <Btn onClick={next} disabled={connected.length === 0}>
            {connected.length === 0 ? "Select at least one" : `Connect ${connected.length} Account${connected.length > 1 ? "s" : ""}`}
          </Btn>
          <button onClick={next} style={{ display: "block", margin: "14px auto 0", fontSize: "14px", color: T.txt3, background: "none", border: "none", cursor: "pointer", fontFamily: font }}>Skip for now</button>
        </Fade>
      </div>
    );
  };

  // STEP 4 — GOALS (The Human Conversation)
  const Goals = () => (
    <div>
      <Fade delay={100}>
        <h2 style={{ fontSize: "26px", fontWeight: 700, color: T.txt, fontFamily: fontD, letterSpacing: "-0.02em", margin: "0 0 8px" }}>What matters to you?</h2>
        <p style={{ fontSize: "16px", color: T.txt2, fontFamily: font, margin: "0 0 28px" }}>Tell Kai what keeps you up at night — and what gets you excited about the future.</p>
      </Fade>

      <Fade delay={200}>
        <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: T.txt2, marginBottom: "10px", letterSpacing: "0.03em", textTransform: "uppercase", fontFamily: font }}>Top financial priorities</label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginBottom: "28px" }}>
          {[
            { id: "retire", label: "Retire comfortably", icon: "🌴" },
            { id: "kids", label: "Kids' education", icon: "🎓" },
            { id: "home", label: "Buy a home", icon: "🏡" },
            { id: "income", label: "Generate income", icon: "💰" },
            { id: "grow", label: "Grow wealth", icon: "📈" },
            { id: "protect", label: "Protect what I have", icon: "🛡️" },
            { id: "travel", label: "Travel & experiences", icon: "✈️" },
            { id: "give", label: "Give back", icon: "🤝" },
            { id: "business", label: "Start a business", icon: "🚀" },
            { id: "estate", label: "Estate planning", icon: "📜" },
          ].map(g => (
            <Chip key={g.id} label={g.label} icon={g.icon} small
              selected={(data.goals || []).includes(g.id)}
              onClick={() => {
                const curr = data.goals || [];
                setData({ ...data, goals: curr.includes(g.id) ? curr.filter(x => x !== g.id) : [...curr, g.id] });
              }} />
          ))}
        </div>
      </Fade>

      <Fade delay={400}>
        <Input
          label="Anything else on your mind?"
          placeholder="E.g., 'We're thinking about private school for our kids' or 'I want to start angel investing'..."
          value={data.freeform || ""}
          onChange={v => setData({ ...data, freeform: v })}
          area
          sub="Optional. This helps Kai give more relevant insights."
        />
      </Fade>

      <Fade delay={500}>
        <Btn onClick={next} disabled={(data.goals || []).length === 0}>Continue</Btn>
      </Fade>
    </div>
  );

  // STEP 5 — ADVISOR PERMISSIONS
  const Permissions = () => {
    const [perms, setPerms] = useState({
      holdings: true, performance: true, goals: true,
      taxLots: false, allAccounts: false, liabilities: false,
    });

    return (
      <div>
        <Fade delay={100}>
          <h2 style={{ fontSize: "26px", fontWeight: 700, color: T.txt, fontFamily: fontD, letterSpacing: "-0.02em", margin: "0 0 8px" }}>Your advisor's view</h2>
          <p style={{ fontSize: "16px", color: T.txt2, fontFamily: font, margin: "0 0 8px" }}>Choose what Manish can see. Kai sees everything you connected — your advisor only sees what you allow here.</p>
          <p style={{ fontSize: "13px", color: T.cAccent, fontFamily: font, margin: "0 0 24px", fontWeight: 600 }}>🤫 This is the Hushh difference.</p>
        </Fade>

        {[
          { key: "holdings", title: "Managed Account Holdings", desc: "Positions and allocations in accounts Manish manages", req: true },
          { key: "performance", title: "Performance Reports", desc: "Returns, benchmarks, and growth tracking", req: true },
          { key: "goals", title: "Your Financial Goals", desc: "The priorities and dreams you just shared", req: false },
          { key: "taxLots", title: "Tax Lot Details", desc: "Cost basis and tax optimization data", req: false },
          { key: "allAccounts", title: "Outside Account Summaries", desc: "Balances from accounts managed elsewhere (no details)", req: false },
          { key: "liabilities", title: "Debt & Liabilities", desc: "Mortgage, loans, and obligations for holistic planning", req: false },
        ].map((p, i) => (
          <Fade key={p.key} delay={200 + i * 70}>
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "16px 18px", marginBottom: "10px", borderRadius: "14px",
              background: perms[p.key] ? T.goldS : T.bgEl,
              border: `1px solid ${perms[p.key] ? T.brdA : T.brd}`,
              transition: `all 0.3s ${ease}`,
            }}>
              <div style={{ flex: 1, paddingRight: "14px" }}>
                <div style={{ fontSize: "15px", fontWeight: 600, color: T.txt, fontFamily: font, marginBottom: "3px" }}>
                  {p.title} {p.req && <span style={{ fontSize: "10px", color: T.gold, fontWeight: 700 }}>REQUIRED</span>}
                </div>
                <div style={{ fontSize: "13px", color: T.txt2, fontFamily: font, lineHeight: 1.4 }}>{p.desc}</div>
              </div>
              <Toggle on={perms[p.key]} onToggle={() => !p.req && setPerms({ ...perms, [p.key]: !perms[p.key] })} locked={p.req} />
            </div>
          </Fade>
        ))}

        <Fade delay={650}>
          <div style={{ marginTop: "16px" }}>
            <Btn onClick={() => { setData({ ...data, clientPerms: perms }); next(); }}>Confirm & Finish</Btn>
          </div>
        </Fade>
      </div>
    );
  };

  // STEP 6 — READY (The Quiet Activation)
  const Ready = () => {
    const [phase, setPhase] = useState(0);
    useEffect(() => {
      const t1 = setTimeout(() => setPhase(1), 500);
      const t2 = setTimeout(() => setPhase(2), 1200);
      const t3 = setTimeout(() => setPhase(3), 2000);
      return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
    }, []);

    return (
      <div style={{ textAlign: "center", padding: "30px 0" }}>
        <div style={{
          width: "100px", height: "100px", borderRadius: "50px",
          background: phase >= 2 ? `linear-gradient(135deg, ${T.cAccent}, ${T.cWarm})` : T.bgEl,
          display: "flex", alignItems: "center", justifyContent: "center",
          margin: "0 auto 28px", fontSize: "46px",
          transition: `all 0.8s ${ease}`,
          boxShadow: phase >= 2 ? `0 12px 40px rgba(184,164,114,0.25)` : "none",
          transform: phase >= 1 ? "scale(1)" : "scale(0.85)",
          opacity: phase >= 1 ? 1 : 0.4,
        }}>
          {phase >= 2 ? "🤫" : "⏳"}
        </div>

        <div style={{
          opacity: phase >= 2 ? 1 : 0,
          transform: phase >= 2 ? "translateY(0)" : "translateY(14px)",
          transition: `all 0.6s ${ease}`,
        }}>
          <h2 style={{ fontSize: "28px", fontWeight: 700, color: T.txt, fontFamily: fontD, letterSpacing: "-0.025em", margin: "0 0 10px" }}>
            Kai is quietly listening
          </h2>
          <p style={{ fontSize: "16px", color: T.txt2, fontFamily: font, lineHeight: 1.55, margin: "0 auto 8px", maxWidth: "300px" }}>
            Working in the background to understand your full financial picture. No noise. Just clarity when you need it.
          </p>
          <p style={{ fontSize: "14px", color: T.cAccent, fontFamily: font, fontWeight: 600, margin: "0 0 32px" }}>
            Your data. Your business. 🤫
          </p>
        </div>

        {phase >= 3 && (
          <Fade delay={0}>
            <Card style={{ textAlign: "left", padding: "20px", marginBottom: "24px" }}>
              <div style={{ fontSize: "12px", fontWeight: 700, color: T.cAccent, letterSpacing: "0.04em", textTransform: "uppercase", fontFamily: font, marginBottom: "14px" }}>WHAT HAPPENS NEXT</div>
              {[
                { icon: "🧠", text: "Kai analyzes your accounts overnight" },
                { icon: "📬", text: "Your first insight arrives by morning" },
                { icon: "🤝", text: "Manish gets a summary of what you've shared" },
                { icon: "🔐", text: "Change permissions anytime in Settings" },
              ].map((item, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "8px 0", borderBottom: i < 3 ? `1px solid ${T.brd}` : "none" }}>
                  <span style={{ fontSize: "20px" }}>{item.icon}</span>
                  <span style={{ fontSize: "14px", color: T.txt, fontFamily: font }}>{item.text}</span>
                </div>
              ))}
            </Card>

            <Btn onClick={() => alert("🤫 Opening Kai client dashboard — where insights appear quietly, on your terms.")}>
              Open Kai
            </Btn>
          </Fade>
        )}
      </div>
    );
  };

  const progress = step > 0 && step < steps.length - 1 ? (
    <div style={{ display: "flex", gap: "6px", justifyContent: "center", padding: "16px 0" }}>
      {steps.map((_, i) => (
        <div key={i} style={{
          width: i === step ? "20px" : "6px", height: "6px", borderRadius: "3px",
          background: i === step ? T.cAccent : i < step ? "rgba(184,164,114,0.3)" : T.brd,
          transition: `all 0.4s ${ease}`,
        }} />
      ))}
    </div>
  ) : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <StatusBar />
      {step > 0 && step < steps.length - 1 && (
        <div style={{ padding: "6px 20px" }}>
          <button onClick={() => setStep(s => Math.max(0, s - 1))} style={{ fontSize: "15px", fontWeight: 500, color: T.cAccent, background: "none", border: "none", cursor: "pointer", fontFamily: font, padding: "8px 0", minHeight: "44px", minWidth: "44px" }}>‹ Back</button>
        </div>
      )}
      {progress}
      <div ref={ref} style={{ flex: 1, overflowY: "auto", padding: "4px 24px 32px" }}>
        {step === 0 && <Welcome />}
        {step === 1 && <ConnectAdvisor />}
        {step === 2 && <AboutYou />}
        {step === 3 && <Accounts />}
        {step === 4 && <Goals />}
        {step === 5 && <Permissions />}
        {step === 6 && <Ready />}
      </div>
    </div>
  );
}

// ============================================================================
// MAIN APP — EXPERIENCE SWITCHER
// ============================================================================

export default function KaiCompleteExperience() {
  const [view, setView] = useState("ria"); // ria | client

  return (
    <div style={{
      minHeight: "100vh", background: T.bg,
      display: "flex", flexDirection: "column", alignItems: "center",
      padding: "20px", fontFamily: font,
    }}>
      {/* Experience Switcher */}
      <div style={{
        display: "flex", gap: "4px", marginBottom: "20px",
        background: T.bgCard, borderRadius: "12px", padding: "4px",
        border: `1px solid ${T.brd}`,
      }}>
        {[
          { id: "ria", label: "🏛️ RIA Dashboard" },
          { id: "client", label: "👤 Client Onboarding" },
        ].map(v => (
          <button key={v.id} onClick={() => setView(v.id)} style={{
            padding: "10px 20px", fontSize: "14px", fontWeight: 600, fontFamily: font,
            color: view === v.id ? T.bg : T.txt2,
            background: view === v.id ? `linear-gradient(135deg, ${T.gold}, ${T.goldL})` : "transparent",
            border: "none", borderRadius: "9px", cursor: "pointer",
            transition: `all 0.3s ${ease}`, letterSpacing: "-0.01em",
          }}>{v.label}</button>
        ))}
      </div>

      {/* Phone Frame */}
      <div style={{
        width: "100%", maxWidth: "420px", height: "780px",
        background: T.bgCard, borderRadius: "32px",
        border: `1px solid ${T.brd}`, overflow: "hidden",
        boxShadow: "0 24px 80px rgba(0,0,0,0.6)",
        display: "flex", flexDirection: "column",
      }}>
        {view === "ria" && <RIADashboard onSwitchToClient={() => setView("client")} />}
        {view === "client" && <ClientOnboarding />}
      </div>

      <p style={{ fontSize: "12px", color: T.txt3, fontFamily: font, marginTop: "16px", textAlign: "center" }}>
        Interactive Prototype · Hushh Technologies · Kai Agent Experience
      </p>
    </div>
  );
}