import { useState, useEffect, useRef, useCallback } from "react";

// ============================================================================
// KAI AGENT ONBOARDING — RIA/CFA PROFESSIONAL FLOW
// Apple HIG Design Principles Applied:
//   1. Progressive Disclosure (Norman/Stern) — one question per screen
//   2. Direct Manipulation (Ive) — tap/swipe the actual thing
//   3. 44pt Touch Targets (Apple HIG)
//   4. Animation as Communication (Dehner/Apple) — motion tells story
//   5. Error Prevention over Error Handling (Nielsen Heuristic #5)
//   6. Human Interface > User Interface (Stern WWDC17)
//   7. Aesthetic Integrity (Apple HIG) — form follows function
//   8. Consistency & Standards (Nielsen Heuristic #4)
// ============================================================================

const STEPS = [
  "welcome",
  "identity",
  "credentials",
  "firm",
  "permissions",
  "configure",
  "activate",
];

// — Color System (Gold-on-Dark, Hushh brand language) —
const theme = {
  bg: "#0A0A0C",
  bgCard: "#111114",
  bgElevated: "#18181C",
  gold: "#C9A84C",
  goldLight: "#E8D48B",
  goldSubtle: "rgba(201,168,76,0.12)",
  goldGlow: "rgba(201,168,76,0.25)",
  text: "#F5F5F7",
  textSecondary: "#8E8E93",
  textTertiary: "#636366",
  border: "rgba(255,255,255,0.08)",
  borderActive: "rgba(201,168,76,0.4)",
  success: "#30D158",
  error: "#FF453A",
  white: "#FFFFFF",
};

// — Shared Styles —
const baseInput = {
  width: "100%",
  padding: "16px 20px",
  fontSize: "17px",
  fontFamily: "'SF Pro Text', -apple-system, BlinkMacSystemFont, sans-serif",
  color: theme.text,
  background: theme.bgElevated,
  border: `1px solid ${theme.border}`,
  borderRadius: "14px",
  outline: "none",
  transition: "all 0.3s cubic-bezier(0.25, 0.1, 0.25, 1)",
  boxSizing: "border-box",
  letterSpacing: "-0.01em",
};

const labelStyle = {
  display: "block",
  fontSize: "13px",
  fontWeight: 600,
  color: theme.textSecondary,
  marginBottom: "8px",
  letterSpacing: "0.02em",
  textTransform: "uppercase",
  fontFamily: "'SF Pro Text', -apple-system, sans-serif",
};

// ============================================================================
// MICRO-COMPONENTS
// ============================================================================

function ProgressDots({ current, total }) {
  return (
    <div style={{ display: "flex", gap: "8px", justifyContent: "center", padding: "20px 0" }}>
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          style={{
            width: i === current ? "24px" : "8px",
            height: "8px",
            borderRadius: "4px",
            background: i === current ? theme.gold : i < current ? theme.goldSubtle : theme.border,
            transition: "all 0.5s cubic-bezier(0.25, 0.1, 0.25, 1)",
          }}
        />
      ))}
    </div>
  );
}

function PrimaryButton({ children, onClick, disabled, style: extraStyle }) {
  const [pressed, setPressed] = useState(false);
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
      onMouseLeave={() => setPressed(false)}
      style={{
        width: "100%",
        padding: "18px 32px",
        fontSize: "17px",
        fontWeight: 600,
        fontFamily: "'SF Pro Text', -apple-system, sans-serif",
        color: disabled ? theme.textTertiary : theme.bg,
        background: disabled
          ? theme.bgElevated
          : `linear-gradient(135deg, ${theme.gold}, ${theme.goldLight})`,
        border: "none",
        borderRadius: "14px",
        cursor: disabled ? "default" : "pointer",
        transition: "all 0.3s cubic-bezier(0.25, 0.1, 0.25, 1)",
        transform: pressed && !disabled ? "scale(0.97)" : "scale(1)",
        letterSpacing: "-0.01em",
        minHeight: "56px", // Apple 44pt minimum exceeded
        boxShadow: disabled ? "none" : `0 4px 24px ${theme.goldGlow}`,
        ...extraStyle,
      }}
    >
      {children}
    </button>
  );
}

function SecondaryButton({ children, onClick, style: extraStyle }) {
  return (
    <button
      onClick={onClick}
      style={{
        width: "100%",
        padding: "18px 32px",
        fontSize: "17px",
        fontWeight: 500,
        fontFamily: "'SF Pro Text', -apple-system, sans-serif",
        color: theme.gold,
        background: "transparent",
        border: `1px solid ${theme.borderActive}`,
        borderRadius: "14px",
        cursor: "pointer",
        transition: "all 0.3s cubic-bezier(0.25, 0.1, 0.25, 1)",
        minHeight: "56px",
        letterSpacing: "-0.01em",
        ...extraStyle,
      }}
    >
      {children}
    </button>
  );
}

function InputField({ label, placeholder, value, onChange, type = "text", icon, verified, helpText }) {
  const [focused, setFocused] = useState(false);
  return (
    <div style={{ marginBottom: "20px" }}>
      {label && <label style={labelStyle}>{label}</label>}
      <div style={{ position: "relative" }}>
        {icon && (
          <span style={{
            position: "absolute", left: "16px", top: "50%", transform: "translateY(-50%)",
            fontSize: "18px", opacity: 0.5,
          }}>{icon}</span>
        )}
        <input
          type={type}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={{
            ...baseInput,
            paddingLeft: icon ? "48px" : "20px",
            paddingRight: verified ? "48px" : "20px",
            borderColor: focused ? theme.borderActive : theme.border,
            boxShadow: focused ? `0 0 0 4px ${theme.goldSubtle}` : "none",
          }}
        />
        {verified && (
          <span style={{
            position: "absolute", right: "16px", top: "50%", transform: "translateY(-50%)",
            color: theme.success, fontSize: "20px",
            animation: "fadeIn 0.4s ease",
          }}>✓</span>
        )}
      </div>
      {helpText && (
        <p style={{
          fontSize: "13px", color: theme.textTertiary, marginTop: "6px",
          fontFamily: "'SF Pro Text', -apple-system, sans-serif",
        }}>{helpText}</p>
      )}
    </div>
  );
}

function SelectChip({ label, selected, onClick, icon }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "8px",
        padding: "14px 20px",
        fontSize: "15px",
        fontWeight: 500,
        fontFamily: "'SF Pro Text', -apple-system, sans-serif",
        color: selected ? theme.bg : theme.text,
        background: selected
          ? `linear-gradient(135deg, ${theme.gold}, ${theme.goldLight})`
          : theme.bgElevated,
        border: `1px solid ${selected ? "transparent" : theme.border}`,
        borderRadius: "12px",
        cursor: "pointer",
        transition: "all 0.3s cubic-bezier(0.25, 0.1, 0.25, 1)",
        minHeight: "48px",
        boxShadow: selected ? `0 2px 12px ${theme.goldGlow}` : "none",
      }}
    >
      {icon && <span>{icon}</span>}
      {label}
    </button>
  );
}

function PermissionToggle({ title, description, enabled, onToggle, required }) {
  return (
    <div
      onClick={required ? undefined : onToggle}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "18px 20px",
        background: enabled ? theme.goldSubtle : theme.bgElevated,
        borderRadius: "14px",
        border: `1px solid ${enabled ? theme.borderActive : theme.border}`,
        cursor: required ? "default" : "pointer",
        transition: "all 0.3s ease",
        marginBottom: "12px",
      }}
    >
      <div style={{ flex: 1, paddingRight: "16px" }}>
        <div style={{
          fontSize: "16px", fontWeight: 600, color: theme.text,
          fontFamily: "'SF Pro Text', -apple-system, sans-serif",
          marginBottom: "4px",
        }}>
          {title} {required && <span style={{ fontSize: "11px", color: theme.gold, fontWeight: 700 }}>REQUIRED</span>}
        </div>
        <div style={{
          fontSize: "14px", color: theme.textSecondary, lineHeight: 1.4,
          fontFamily: "'SF Pro Text', -apple-system, sans-serif",
        }}>{description}</div>
      </div>
      <div style={{
        width: "51px", height: "31px", borderRadius: "16px",
        background: enabled ? theme.gold : theme.textTertiary,
        position: "relative", transition: "background 0.3s ease",
        flexShrink: 0,
      }}>
        <div style={{
          width: "27px", height: "27px", borderRadius: "14px",
          background: theme.white,
          position: "absolute", top: "2px",
          left: enabled ? "22px" : "2px",
          transition: "left 0.3s cubic-bezier(0.25, 0.1, 0.25, 1)",
          boxShadow: "0 2px 4px rgba(0,0,0,0.3)",
        }} />
      </div>
    </div>
  );
}

function AnimatedEntry({ children, delay = 0, direction = "up" }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), delay);
    return () => clearTimeout(t);
  }, [delay]);

  const transform = direction === "up"
    ? (visible ? "translateY(0)" : "translateY(24px)")
    : (visible ? "translateX(0)" : "translateX(24px)");

  return (
    <div style={{
      opacity: visible ? 1 : 0,
      transform,
      transition: `all 0.6s cubic-bezier(0.25, 0.1, 0.25, 1) ${delay}ms`,
    }}>
      {children}
    </div>
  );
}

// ============================================================================
// STEP SCREENS
// ============================================================================

// STEP 0 — WELCOME (The 7-Second Hook)
// Guru Applied: Mike Stern — "serve the human being"
// Principle: Immediate value, zero cognitive load
function WelcomeStep({ onNext }) {
  return (
    <div style={{ textAlign: "center", padding: "20px 0" }}>
      <AnimatedEntry delay={100}>
        <div style={{
          width: "88px", height: "88px", borderRadius: "22px",
          background: `linear-gradient(135deg, ${theme.gold}, ${theme.goldLight})`,
          display: "flex", alignItems: "center", justifyContent: "center",
          margin: "0 auto 32px", fontSize: "42px",
          boxShadow: `0 8px 32px ${theme.goldGlow}`,
        }}>
          🤫
        </div>
      </AnimatedEntry>

      <AnimatedEntry delay={300}>
        <h1 style={{
          fontSize: "32px", fontWeight: 700, color: theme.text,
          fontFamily: "'SF Pro Display', -apple-system, sans-serif",
          letterSpacing: "-0.025em", lineHeight: 1.15,
          margin: "0 0 12px",
        }}>
          Meet Kai
        </h1>
      </AnimatedEntry>

      <AnimatedEntry delay={450}>
        <p style={{
          fontSize: "17px", color: theme.textSecondary, lineHeight: 1.5,
          fontFamily: "'SF Pro Text', -apple-system, sans-serif",
          margin: "0 0 8px", maxWidth: "320px", marginLeft: "auto", marginRight: "auto",
        }}>
          Your AI-powered investment intelligence agent, built for fiduciaries.
        </p>
      </AnimatedEntry>

      <AnimatedEntry delay={550}>
        <p style={{
          fontSize: "15px", color: theme.textTertiary, lineHeight: 1.5,
          fontFamily: "'SF Pro Text', -apple-system, sans-serif",
          margin: "0 0 40px", maxWidth: "300px", marginLeft: "auto", marginRight: "auto",
        }}>
          SEC-compliant. Client-permissioned. Your data stays yours.
        </p>
      </AnimatedEntry>

      <AnimatedEntry delay={700}>
        <div style={{
          background: theme.bgElevated, borderRadius: "16px",
          padding: "24px", marginBottom: "32px",
          border: `1px solid ${theme.border}`,
        }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            {[
              { icon: "🛡️", text: "Fiduciary-grade data sovereignty" },
              { icon: "📊", text: "Client portfolio intelligence in real-time" },
              { icon: "🤝", text: "Consent-first data sharing with clients" },
            ].map((item, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: "14px" }}>
                <span style={{ fontSize: "24px" }}>{item.icon}</span>
                <span style={{
                  fontSize: "15px", color: theme.text,
                  fontFamily: "'SF Pro Text', -apple-system, sans-serif",
                  textAlign: "left",
                }}>{item.text}</span>
              </div>
            ))}
          </div>
        </div>
      </AnimatedEntry>

      <AnimatedEntry delay={900}>
        <PrimaryButton onClick={onNext}>Get Started</PrimaryButton>
        <p style={{
          fontSize: "13px", color: theme.textTertiary, marginTop: "16px",
          fontFamily: "'SF Pro Text', -apple-system, sans-serif",
        }}>
          Setup takes about 3 minutes
        </p>
      </AnimatedEntry>
    </div>
  );
}

// STEP 1 — IDENTITY (Who Are You?)
// Guru Applied: Don Norman — affordance, Jakob Nielsen — recognition over recall
// Principle: Pre-fill what we can, ask only what we must
function IdentityStep({ data, setData, onNext }) {
  const canProceed = data.firstName && data.lastName && data.email;
  return (
    <div>
      <AnimatedEntry delay={100}>
        <h2 style={{
          fontSize: "28px", fontWeight: 700, color: theme.text,
          fontFamily: "'SF Pro Display', -apple-system, sans-serif",
          letterSpacing: "-0.02em", margin: "0 0 8px",
        }}>
          Let's start with you
        </h2>
        <p style={{
          fontSize: "17px", color: theme.textSecondary, margin: "0 0 32px",
          fontFamily: "'SF Pro Text', -apple-system, sans-serif",
        }}>
          We'll verify your credentials in the next step.
        </p>
      </AnimatedEntry>

      <AnimatedEntry delay={250}>
        <div style={{ display: "flex", gap: "12px" }}>
          <div style={{ flex: 1 }}>
            <InputField
              label="First Name"
              placeholder="First"
              value={data.firstName || ""}
              onChange={(v) => setData({ ...data, firstName: v })}
            />
          </div>
          <div style={{ flex: 1 }}>
            <InputField
              label="Last Name"
              placeholder="Last"
              value={data.lastName || ""}
              onChange={(v) => setData({ ...data, lastName: v })}
            />
          </div>
        </div>
      </AnimatedEntry>

      <AnimatedEntry delay={350}>
        <InputField
          label="Work Email"
          placeholder="you@advisory.com"
          value={data.email || ""}
          onChange={(v) => setData({ ...data, email: v })}
          type="email"
          icon="✉️"
          verified={data.email && data.email.includes("@") && data.email.includes(".")}
        />
      </AnimatedEntry>

      <AnimatedEntry delay={450}>
        <InputField
          label="Phone"
          placeholder="+1 (555) 000-0000"
          value={data.phone || ""}
          onChange={(v) => setData({ ...data, phone: v })}
          type="tel"
          icon="📱"
          helpText="For secure verification only. Never shared."
        />
      </AnimatedEntry>

      <AnimatedEntry delay={550}>
        <div style={{ marginTop: "12px" }}>
          <PrimaryButton onClick={onNext} disabled={!canProceed}>Continue</PrimaryButton>
        </div>
      </AnimatedEntry>
    </div>
  );
}

// STEP 2 — CREDENTIALS (Professional Verification)
// Guru Applied: Luke Wroblewski — mobile-first form design
// Principle: Error prevention — CRD/IARD lookup validates in real-time
function CredentialsStep({ data, setData, onNext }) {
  const [credType, setCredType] = useState(data.credType || "ria");
  const [verifying, setVerifying] = useState(false);
  const [verified, setVerified] = useState(data.crdVerified || false);

  const handleVerify = () => {
    if (!data.crdNumber) return;
    setVerifying(true);
    setTimeout(() => {
      setVerifying(false);
      setVerified(true);
      setData({ ...data, crdVerified: true, credType });
    }, 2000);
  };

  return (
    <div>
      <AnimatedEntry delay={100}>
        <h2 style={{
          fontSize: "28px", fontWeight: 700, color: theme.text,
          fontFamily: "'SF Pro Display', -apple-system, sans-serif",
          letterSpacing: "-0.02em", margin: "0 0 8px",
        }}>
          Professional credentials
        </h2>
        <p style={{
          fontSize: "17px", color: theme.textSecondary, margin: "0 0 28px",
          fontFamily: "'SF Pro Text', -apple-system, sans-serif",
        }}>
          We verify against SEC/FINRA public records.
        </p>
      </AnimatedEntry>

      <AnimatedEntry delay={200}>
        <label style={labelStyle}>Your Designation</label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", marginBottom: "24px" }}>
          {[
            { id: "ria", label: "RIA", icon: "🏛️" },
            { id: "iar", label: "IAR", icon: "📋" },
            { id: "cfa", label: "CFA®", icon: "🎓" },
            { id: "cfp", label: "CFP®", icon: "📐" },
          ].map((c) => (
            <SelectChip
              key={c.id}
              label={c.label}
              icon={c.icon}
              selected={credType === c.id}
              onClick={() => { setCredType(c.id); setData({ ...data, credType: c.id }); }}
            />
          ))}
        </div>
      </AnimatedEntry>

      <AnimatedEntry delay={350}>
        <InputField
          label={credType === "ria" ? "CRD Number" : credType === "iar" ? "Individual CRD" : "Charter/Certificate Number"}
          placeholder={credType === "ria" || credType === "iar" ? "e.g. 123456" : "e.g. 789012"}
          value={data.crdNumber || ""}
          onChange={(v) => { setVerified(false); setData({ ...data, crdNumber: v, crdVerified: false }); }}
          icon="🔑"
          verified={verified}
          helpText={
            credType === "ria"
              ? "Found on your Form ADV or IARD profile"
              : credType === "iar"
              ? "Your individual CRD from FINRA BrokerCheck"
              : "From your CFA Institute or CFP Board profile"
          }
        />
      </AnimatedEntry>

      {data.crdNumber && !verified && (
        <AnimatedEntry delay={100}>
          <SecondaryButton onClick={handleVerify}>
            {verifying ? (
              <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "10px" }}>
                <span style={{
                  display: "inline-block", width: "18px", height: "18px",
                  border: `2px solid ${theme.gold}`, borderTopColor: "transparent",
                  borderRadius: "50%", animation: "spin 0.8s linear infinite",
                }} />
                Verifying with {credType === "cfa" || credType === "cfp" ? "registry" : "SEC/FINRA"}...
              </span>
            ) : (
              `Verify ${credType.toUpperCase()} Credentials`
            )}
          </SecondaryButton>
        </AnimatedEntry>
      )}

      {verified && (
        <AnimatedEntry delay={100}>
          <div style={{
            background: "rgba(48,209,88,0.08)", border: "1px solid rgba(48,209,88,0.2)",
            borderRadius: "14px", padding: "18px 20px", marginBottom: "24px",
            display: "flex", alignItems: "center", gap: "12px",
          }}>
            <span style={{ fontSize: "28px" }}>✅</span>
            <div>
              <div style={{
                fontSize: "16px", fontWeight: 600, color: theme.success,
                fontFamily: "'SF Pro Text', -apple-system, sans-serif",
              }}>Credentials Verified</div>
              <div style={{
                fontSize: "14px", color: theme.textSecondary,
                fontFamily: "'SF Pro Text', -apple-system, sans-serif",
              }}>
                {credType === "ria" ? "SEC-registered Investment Adviser" :
                 credType === "iar" ? "Investment Adviser Representative" :
                 credType === "cfa" ? "CFA® Charterholder" : "CFP® Professional"} confirmed
              </div>
            </div>
          </div>
          <PrimaryButton onClick={onNext}>Continue</PrimaryButton>
        </AnimatedEntry>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// STEP 3 — FIRM DETAILS
// Guru Applied: Steve Krug — "Don't Make Me Think"
// Principle: Auto-populate from CRD lookup, minimize typing
function FirmStep({ data, setData, onNext }) {
  const canProceed = data.firmName && data.firmAum;

  return (
    <div>
      <AnimatedEntry delay={100}>
        <h2 style={{
          fontSize: "28px", fontWeight: 700, color: theme.text,
          fontFamily: "'SF Pro Display', -apple-system, sans-serif",
          letterSpacing: "-0.02em", margin: "0 0 8px",
        }}>
          Your firm
        </h2>
        <p style={{
          fontSize: "17px", color: theme.textSecondary, margin: "0 0 28px",
          fontFamily: "'SF Pro Text', -apple-system, sans-serif",
        }}>
          {data.crdVerified
            ? "We pulled some details from your filing. Confirm or update."
            : "Tell us about your practice."}
        </p>
      </AnimatedEntry>

      <AnimatedEntry delay={200}>
        <InputField
          label="Firm Name"
          placeholder="Acme Wealth Advisors"
          value={data.firmName || (data.crdVerified ? "Verified Wealth Management LLC" : "")}
          onChange={(v) => setData({ ...data, firmName: v })}
          icon="🏢"
          verified={data.crdVerified}
        />
      </AnimatedEntry>

      <AnimatedEntry delay={300}>
        <label style={labelStyle}>Assets Under Management</label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", marginBottom: "24px" }}>
          {[
            { id: "sub25", label: "< $25M" },
            { id: "25to100", label: "$25M–$100M" },
            { id: "100to500", label: "$100M–$500M" },
            { id: "500plus", label: "$500M+" },
          ].map((a) => (
            <SelectChip
              key={a.id}
              label={a.label}
              selected={data.firmAum === a.id}
              onClick={() => setData({ ...data, firmAum: a.id })}
            />
          ))}
        </div>
      </AnimatedEntry>

      <AnimatedEntry delay={400}>
        <label style={labelStyle}>Client Accounts</label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", marginBottom: "24px" }}>
          {[
            { id: "sub50", label: "< 50" },
            { id: "50to200", label: "50–200" },
            { id: "200to500", label: "200–500" },
            { id: "500plus", label: "500+" },
          ].map((a) => (
            <SelectChip
              key={a.id}
              label={a.label}
              selected={data.clientCount === a.id}
              onClick={() => setData({ ...data, clientCount: a.id })}
            />
          ))}
        </div>
      </AnimatedEntry>

      <AnimatedEntry delay={500}>
        <label style={labelStyle}>Custodian(s)</label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", marginBottom: "32px" }}>
          {[
            { id: "schwab", label: "Schwab" },
            { id: "fidelity", label: "Fidelity" },
            { id: "pershing", label: "Pershing" },
            { id: "ibkr", label: "IBKR" },
            { id: "other", label: "Other" },
          ].map((c) => (
            <SelectChip
              key={c.id}
              label={c.label}
              selected={(data.custodians || []).includes(c.id)}
              onClick={() => {
                const curr = data.custodians || [];
                setData({
                  ...data,
                  custodians: curr.includes(c.id)
                    ? curr.filter((x) => x !== c.id)
                    : [...curr, c.id],
                });
              }}
            />
          ))}
        </div>
      </AnimatedEntry>

      <AnimatedEntry delay={600}>
        <PrimaryButton onClick={onNext} disabled={!canProceed}>Continue</PrimaryButton>
      </AnimatedEntry>
    </div>
  );
}

// STEP 4 — DATA PERMISSIONS (The Hushh Handshake)
// Guru Applied: Jony Ive — remove everything unnecessary
// Craig Dehner — motion tells the permission story
// Principle: Direct manipulation toggles, not legalese
function PermissionsStep({ data, setData, onNext }) {
  const [permissions, setPermissions] = useState(data.permissions || {
    portfolio: true,
    performance: true,
    clientData: false,
    taxLots: false,
    optionsOverlay: false,
  });

  const updatePerm = (key) => {
    if (key === "portfolio" || key === "performance") return; // required
    const next = { ...permissions, [key]: !permissions[key] };
    setPermissions(next);
    setData({ ...data, permissions: next });
  };

  return (
    <div>
      <AnimatedEntry delay={100}>
        <h2 style={{
          fontSize: "28px", fontWeight: 700, color: theme.text,
          fontFamily: "'SF Pro Display', -apple-system, sans-serif",
          letterSpacing: "-0.02em", margin: "0 0 8px",
        }}>
          Data permissions
        </h2>
        <p style={{
          fontSize: "17px", color: theme.textSecondary, margin: "0 0 8px",
          fontFamily: "'SF Pro Text', -apple-system, sans-serif",
        }}>
          Kai only accesses what you allow. Change anytime.
        </p>
        <p style={{
          fontSize: "14px", color: theme.textTertiary, margin: "0 0 28px",
          fontFamily: "'SF Pro Text', -apple-system, sans-serif",
        }}>
          All data encrypted end-to-end. SOC 2 Type II compliant.
        </p>
      </AnimatedEntry>

      <AnimatedEntry delay={200}>
        <PermissionToggle
          title="Portfolio Holdings"
          description="View current positions, allocations, and sector exposure across client accounts."
          enabled={permissions.portfolio}
          onToggle={() => updatePerm("portfolio")}
          required
        />
      </AnimatedEntry>

      <AnimatedEntry delay={300}>
        <PermissionToggle
          title="Performance Analytics"
          description="Calculate time-weighted returns, benchmark comparisons, and attribution analysis."
          enabled={permissions.performance}
          onToggle={() => updatePerm("performance")}
          required
        />
      </AnimatedEntry>

      <AnimatedEntry delay={400}>
        <PermissionToggle
          title="Client Data Profiles"
          description="Access client risk profiles, IPS documents, and suitability parameters."
          enabled={permissions.clientData}
          onToggle={() => updatePerm("clientData")}
        />
      </AnimatedEntry>

      <AnimatedEntry delay={500}>
        <PermissionToggle
          title="Tax Lot Intelligence"
          description="Analyze cost basis, wash sale windows, and tax-loss harvesting opportunities."
          enabled={permissions.taxLots}
          onToggle={() => updatePerm("taxLots")}
        />
      </AnimatedEntry>

      <AnimatedEntry delay={600}>
        <PermissionToggle
          title="Options Overlay Engine"
          description="Enable Kai to suggest covered call and cash-secured put strategies for income generation."
          enabled={permissions.optionsOverlay}
          onToggle={() => updatePerm("optionsOverlay")}
        />
      </AnimatedEntry>

      <AnimatedEntry delay={700}>
        <div style={{ marginTop: "12px" }}>
          <PrimaryButton onClick={() => { setData({ ...data, permissions }); onNext(); }}>
            Confirm Permissions
          </PrimaryButton>
        </div>
      </AnimatedEntry>
    </div>
  );
}

// STEP 5 — CONFIGURE KAI (Personalization)
// Guru Applied: Dieter Rams — "as little design as possible"
// Principle: Smart defaults, minimal choices
function ConfigureStep({ data, setData, onNext }) {
  const [style, setStyle] = useState(data.kaiStyle || "balanced");
  const [frequency, setFrequency] = useState(data.alertFreq || "daily");

  return (
    <div>
      <AnimatedEntry delay={100}>
        <h2 style={{
          fontSize: "28px", fontWeight: 700, color: theme.text,
          fontFamily: "'SF Pro Display', -apple-system, sans-serif",
          letterSpacing: "-0.02em", margin: "0 0 8px",
        }}>
          Make Kai yours
        </h2>
        <p style={{
          fontSize: "17px", color: theme.textSecondary, margin: "0 0 28px",
          fontFamily: "'SF Pro Text', -apple-system, sans-serif",
        }}>
          Set your communication preferences. Adjust anytime.
        </p>
      </AnimatedEntry>

      <AnimatedEntry delay={200}>
        <label style={labelStyle}>Intelligence Style</label>
        <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "28px" }}>
          {[
            { id: "concise", label: "Concise", desc: "Key metrics and alerts only" },
            { id: "balanced", label: "Balanced", desc: "Metrics with context and rationale" },
            { id: "detailed", label: "Detailed", desc: "Full analysis with research notes" },
          ].map((s) => (
            <div
              key={s.id}
              onClick={() => { setStyle(s.id); setData({ ...data, kaiStyle: s.id }); }}
              style={{
                padding: "16px 20px",
                background: style === s.id ? theme.goldSubtle : theme.bgElevated,
                border: `1px solid ${style === s.id ? theme.borderActive : theme.border}`,
                borderRadius: "14px",
                cursor: "pointer",
                transition: "all 0.3s ease",
              }}
            >
              <div style={{
                fontSize: "16px", fontWeight: 600, color: theme.text,
                fontFamily: "'SF Pro Text', -apple-system, sans-serif",
                marginBottom: "2px",
              }}>
                {style === s.id && <span style={{ color: theme.gold, marginRight: "8px" }}>●</span>}
                {s.label}
              </div>
              <div style={{
                fontSize: "14px", color: theme.textSecondary,
                fontFamily: "'SF Pro Text', -apple-system, sans-serif",
              }}>{s.desc}</div>
            </div>
          ))}
        </div>
      </AnimatedEntry>

      <AnimatedEntry delay={350}>
        <label style={labelStyle}>Alert Frequency</label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", marginBottom: "32px" }}>
          {[
            { id: "realtime", label: "Real-time", icon: "⚡" },
            { id: "daily", label: "Daily Digest", icon: "☀️" },
            { id: "weekly", label: "Weekly", icon: "📅" },
          ].map((f) => (
            <SelectChip
              key={f.id}
              label={f.label}
              icon={f.icon}
              selected={frequency === f.id}
              onClick={() => { setFrequency(f.id); setData({ ...data, alertFreq: f.id }); }}
            />
          ))}
        </div>
      </AnimatedEntry>

      <AnimatedEntry delay={450}>
        <PrimaryButton onClick={onNext}>Activate Kai</PrimaryButton>
      </AnimatedEntry>
    </div>
  );
}

// STEP 6 — ACTIVATION (The Moment of Delight)
// Guru Applied: All of them. This is the payoff.
// Principle: Celebration, spatial animation, immediate value
function ActivateStep({ data }) {
  const [stage, setStage] = useState(0);

  useEffect(() => {
    const t1 = setTimeout(() => setStage(1), 600);
    const t2 = setTimeout(() => setStage(2), 1400);
    const t3 = setTimeout(() => setStage(3), 2200);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, []);

  return (
    <div style={{ textAlign: "center", padding: "20px 0" }}>
      {/* Animated Kai activation */}
      <div style={{
        width: "120px", height: "120px", borderRadius: "30px",
        background: stage >= 1
          ? `linear-gradient(135deg, ${theme.gold}, ${theme.goldLight})`
          : theme.bgElevated,
        display: "flex", alignItems: "center", justifyContent: "center",
        margin: "0 auto 32px", fontSize: "56px",
        transition: "all 0.8s cubic-bezier(0.25, 0.1, 0.25, 1)",
        transform: stage >= 1 ? "scale(1)" : "scale(0.8)",
        boxShadow: stage >= 2 ? `0 12px 48px ${theme.goldGlow}` : "none",
        opacity: stage >= 1 ? 1 : 0.5,
      }}>
        {stage >= 2 ? "🤫" : "⏳"}
      </div>

      <div style={{
        opacity: stage >= 2 ? 1 : 0,
        transform: stage >= 2 ? "translateY(0)" : "translateY(16px)",
        transition: "all 0.6s ease 0.2s",
      }}>
        <h2 style={{
          fontSize: "32px", fontWeight: 700, color: theme.text,
          fontFamily: "'SF Pro Display', -apple-system, sans-serif",
          letterSpacing: "-0.025em", margin: "0 0 12px",
        }}>
          Kai is ready
        </h2>
        <p style={{
          fontSize: "17px", color: theme.textSecondary, margin: "0 0 32px",
          fontFamily: "'SF Pro Text', -apple-system, sans-serif",
          maxWidth: "300px", marginLeft: "auto", marginRight: "auto",
        }}>
          Your fiduciary AI agent is configured and standing by.
        </p>
      </div>

      {stage >= 3 && (
        <AnimatedEntry delay={0}>
          <div style={{
            background: theme.bgElevated, borderRadius: "16px",
            padding: "24px", marginBottom: "28px",
            border: `1px solid ${theme.border}`,
            textAlign: "left",
          }}>
            <div style={{
              fontSize: "13px", fontWeight: 600, color: theme.gold,
              letterSpacing: "0.04em", textTransform: "uppercase",
              marginBottom: "16px",
              fontFamily: "'SF Pro Text', -apple-system, sans-serif",
            }}>
              YOUR SETUP SUMMARY
            </div>
            {[
              { label: "Advisor", value: `${data.firstName || "—"} ${data.lastName || ""}` },
              { label: "Credentials", value: data.crdVerified ? `${(data.credType || "RIA").toUpperCase()} Verified ✓` : "Pending" },
              { label: "Firm", value: data.firmName || "—" },
              { label: "Permissions", value: `${Object.values(data.permissions || {}).filter(Boolean).length} of 5 enabled` },
              { label: "Style", value: (data.kaiStyle || "balanced").charAt(0).toUpperCase() + (data.kaiStyle || "balanced").slice(1) },
            ].map((row, i) => (
              <div key={i} style={{
                display: "flex", justifyContent: "space-between",
                padding: "10px 0",
                borderBottom: i < 4 ? `1px solid ${theme.border}` : "none",
              }}>
                <span style={{
                  fontSize: "15px", color: theme.textSecondary,
                  fontFamily: "'SF Pro Text', -apple-system, sans-serif",
                }}>{row.label}</span>
                <span style={{
                  fontSize: "15px", fontWeight: 600, color: theme.text,
                  fontFamily: "'SF Pro Text', -apple-system, sans-serif",
                }}>{row.value}</span>
              </div>
            ))}
          </div>

          <PrimaryButton onClick={() => alert("🤫 Kai is now active! This is where the Hushh dashboard loads.")}>
            Open Kai Dashboard
          </PrimaryButton>

          <p style={{
            fontSize: "13px", color: theme.textTertiary, marginTop: "16px",
            fontFamily: "'SF Pro Text', -apple-system, sans-serif",
          }}>
            SEC Rule 206(4)-7 compliant. All advisor actions logged.
          </p>
        </AnimatedEntry>
      )}
    </div>
  );
}

// ============================================================================
// MAIN ONBOARDING CONTAINER — THE "iPhone Frame"
// ============================================================================

export default function KaiRIAOnboarding() {
  const [step, setStep] = useState(0);
  const [data, setData] = useState({});
  const containerRef = useRef(null);

  const next = useCallback(() => {
    if (step < STEPS.length - 1) {
      setStep((s) => s + 1);
      if (containerRef.current) {
        containerRef.current.scrollTo({ top: 0, behavior: "smooth" });
      }
    }
  }, [step]);

  const back = () => {
    if (step > 0) setStep((s) => s - 1);
  };

  const renderStep = () => {
    switch (STEPS[step]) {
      case "welcome": return <WelcomeStep onNext={next} />;
      case "identity": return <IdentityStep data={data} setData={setData} onNext={next} />;
      case "credentials": return <CredentialsStep data={data} setData={setData} onNext={next} />;
      case "firm": return <FirmStep data={data} setData={setData} onNext={next} />;
      case "permissions": return <PermissionsStep data={data} setData={setData} onNext={next} />;
      case "configure": return <ConfigureStep data={data} setData={setData} onNext={next} />;
      case "activate": return <ActivateStep data={data} />;
      default: return null;
    }
  };

  return (
    <div style={{
      minHeight: "100vh",
      background: theme.bg,
      display: "flex",
      alignItems: "flex-start",
      justifyContent: "center",
      padding: "20px",
      fontFamily: "'SF Pro Text', -apple-system, BlinkMacSystemFont, sans-serif",
    }}>
      {/* Phone Frame */}
      <div style={{
        width: "100%",
        maxWidth: "420px",
        background: theme.bgCard,
        borderRadius: "32px",
        border: `1px solid ${theme.border}`,
        overflow: "hidden",
        boxShadow: "0 24px 80px rgba(0,0,0,0.6)",
        position: "relative",
      }}>
        {/* Status Bar */}
        <div style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "14px 28px 8px",
          fontSize: "14px",
          fontWeight: 600,
          color: theme.text,
        }}>
          <span>9:41</span>
          <div style={{
            width: "120px", height: "28px", background: theme.bg,
            borderRadius: "14px",
          }} />
          <span style={{ display: "flex", gap: "4px", alignItems: "center" }}>
            <span style={{ fontSize: "12px" }}>5G</span>
            <span>🔋</span>
          </span>
        </div>

        {/* Navigation Bar */}
        {step > 0 && step < STEPS.length - 1 && (
          <div style={{
            display: "flex",
            alignItems: "center",
            padding: "8px 20px",
          }}>
            <button
              onClick={back}
              style={{
                background: "none", border: "none", cursor: "pointer",
                color: theme.gold, fontSize: "17px",
                fontFamily: "'SF Pro Text', -apple-system, sans-serif",
                fontWeight: 500, padding: "8px 4px",
                display: "flex", alignItems: "center", gap: "4px",
                minHeight: "44px", minWidth: "44px",
              }}
            >
              ‹ Back
            </button>
          </div>
        )}

        {/* Progress */}
        {step > 0 && (
          <ProgressDots current={step} total={STEPS.length} />
        )}

        {/* Content */}
        <div
          ref={containerRef}
          style={{
            padding: "8px 28px 40px",
            maxHeight: "calc(100vh - 200px)",
            overflowY: "auto",
          }}
        >
          {renderStep()}
        </div>
      </div>

      {/* Design annotation panel — Desktop only */}
      <div style={{
        width: "320px",
        marginLeft: "40px",
        padding: "32px 0",
        display: "none", // Hidden by default, shown on wide screens via media query workaround
      }} className="annotations">
        {/* Annotations would go here for desktop presentation mode */}
      </div>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: scale(0.8); }
          to { opacity: 1; transform: scale(1); }
        }
        * { -webkit-tap-highlight-color: transparent; }
        input::placeholder { color: ${theme.textTertiary}; }
        ::-webkit-scrollbar { width: 0; }
      `}</style>
    </div>
  );
}