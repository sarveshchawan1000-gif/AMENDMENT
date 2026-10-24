import React, { useState, useEffect, useRef } from 'react';
import { EVALUATION_TEST_SUITE } from '../data/evalDataset';
import { CompiledRule, GameConfig } from '../types/game';
import { useTheme } from '../theme/ThemeProvider';
import { Scroll } from 'lucide-react';

interface EvaluationModalProps {
  config: GameConfig;
  rules?: CompiledRule[];
  phase?: string;
  turnCount?: number;
  onClose: () => void;
}

/* ─── Inject keyframes once ─── */
const KF_ID = 'eval-kf-v4';
function ensureKF() {
  if (document.getElementById(KF_ID)) return;
  const s = document.createElement('style');
  s.id = KF_ID;
  s.textContent = `
    @keyframes evalFadeIn  { from{opacity:0;transform:scale(.93)} to{opacity:1;transform:scale(1)} }
    @keyframes evalFadeOut { from{opacity:1;transform:scale(1)}   to{opacity:0;transform:scale(.93)} }
    @keyframes bdIn        { from{opacity:0} to{opacity:1} }
    @keyframes bdOut       { from{opacity:1} to{opacity:0} }

    /* Slow, smooth royal scroll unfurl / furl */
    @keyframes scrollUnfurl {
      0%   { max-height: 0; opacity: 0.15; transform: scaleY(0.06); transform-origin: top center; }
      35%  { opacity: 0.9; }
      100% { max-height: 84vh; opacity: 1; transform: scaleY(1); transform-origin: top center; }
    }
    @keyframes scrollFurl {
      0%   { max-height: 84vh; opacity: 1; transform: scaleY(1); transform-origin: top center; }
      65%  { opacity: 0.7; }
      100% { max-height: 0; opacity: 0.1; transform: scaleY(0.06); transform-origin: top center; }
    }

    /* Wax seal pop */
    @keyframes sealPop {
      0%   { transform: scale(0) rotate(-25deg); opacity:0; }
      60%  { transform: scale(1.18) rotate(5deg); opacity:1; }
      100% { transform: scale(1) rotate(0deg); opacity:1; }
    }

    /* Antique scrollbars */
    .parchment-scroll {
      scrollbar-width: thin;
      scrollbar-color: rgba(140,85,30,0.4) transparent;
    }
    .parchment-scroll::-webkit-scrollbar {
      width: 6px;
    }
    .parchment-scroll::-webkit-scrollbar-track {
      background: transparent;
    }
    .parchment-scroll::-webkit-scrollbar-thumb {
      background: rgba(140,85,30,0.38);
      border-radius: 4px;
    }
    .parchment-scroll::-webkit-scrollbar-thumb:hover {
      background: rgba(140,85,30,0.65);
    }

    .ink-scroll {
      scrollbar-width: thin;
      scrollbar-color: rgba(60,40,30,0.35) transparent;
    }
    .ink-scroll::-webkit-scrollbar {
      width: 6px;
    }
    .ink-scroll::-webkit-scrollbar-track {
      background: transparent;
    }
    .ink-scroll::-webkit-scrollbar-thumb {
      background: rgba(60,40,30,0.3);
      border-radius: 4px;
    }
    .ink-scroll::-webkit-scrollbar-thumb:hover {
      background: rgba(60,40,30,0.55);
    }
  `;
  document.head.appendChild(s);
}

/* ═══════════════════════════════════════════════════════
   SVG ASSETS: CLASSICAL INK HANGING SCROLL
═══════════════════════════════════════════════════════ */

/* Dark lacquer wood knob (Jikugi) for Asian scroll ends */
const AsianScrollKnob: React.FC<{ flip?: boolean }> = ({ flip }) => (
  <svg
    viewBox="0 0 34 26"
    width="28"
    height="26"
    style={{
      transform: flip ? 'scaleX(-1)' : 'none',
      flexShrink: 0,
      filter: 'drop-shadow(0 3px 5px rgba(0,0,0,0.65))',
    }}
  >
    <defs>
      <linearGradient id="asianKnobWood" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stopColor="#1a0803" />
        <stop offset="25%" stopColor="#3d180c" />
        <stop offset="50%" stopColor="#6e331b" />
        <stop offset="75%" stopColor="#3d180c" />
        <stop offset="100%" stopColor="#120401" />
      </linearGradient>
    </defs>
    <ellipse cx="9" cy="13" rx="7" ry="10" fill="url(#asianKnobWood)" />
    <rect x="14" y="5" width="3.5" height="16" rx="1" fill="#120401" />
    <rect x="17.5" y="4" width="10" height="18" rx="1.5" fill="url(#asianKnobWood)" />
    <rect x="27.5" y="6" width="6.5" height="14" fill="#0c0200" />
  </svg>
);

/* Delicate Plum Blossom (Meihua) Branch for Classical Ink canvas */
const PlumBlossomBranch: React.FC = () => (
  <svg
    viewBox="0 0 240 140"
    width="160"
    height="95"
    style={{
      position: 'absolute',
      top: 4,
      left: 6,
      pointerEvents: 'none',
      opacity: 0.95,
      zIndex: 1,
    }}
  >
    <path
      d="M -5,-5 Q 35,22 70,18 T 130,32 Q 158,44 188,38"
      fill="none" stroke="#251a14" strokeWidth="3.2" strokeLinecap="round"
    />
    <path
      d="M 45,20 Q 65,50 88,60 T 136,74"
      fill="none" stroke="#251a14" strokeWidth="2.4" strokeLinecap="round"
    />
    <path
      d="M 105,27 Q 124,10 156,12 T 202,18"
      fill="none" stroke="#251a14" strokeWidth="1.8" strokeLinecap="round"
    />
    <path
      d="M 74,54 Q 88,78 106,92"
      fill="none" stroke="#251a14" strokeWidth="1.6" strokeLinecap="round"
    />
    <path
      d="M 122,30 Q 136,50 150,58"
      fill="none" stroke="#251a14" strokeWidth="1.4" strokeLinecap="round"
    />
    <path d="M 22,10 Q 32,2 40,4" fill="none" stroke="#251a14" strokeWidth="1.3" />
    <path d="M 85,18 Q 92,6 98,8" fill="none" stroke="#251a14" strokeWidth="1.1" />
    <path d="M 166,40 Q 174,52 178,60" fill="none" stroke="#251a14" strokeWidth="1.2" />

    {[
      { cx: 34,  cy: 14, r: 6 },
      { cx: 56,  cy: 18, r: 7.5 },
      { cx: 76,  cy: 12, r: 5.5 },
      { cx: 96,  cy: 23, r: 7 },
      { cx: 120, cy: 28, r: 8 },
      { cx: 140, cy: 42, r: 6.5 },
      { cx: 162, cy: 38, r: 7 },
      { cx: 186, cy: 41, r: 6 },
      { cx: 66,  cy: 44, r: 6.5 },
      { cx: 88,  cy: 56, r: 7.5 },
      { cx: 112, cy: 68, r: 6.5 },
      { cx: 132, cy: 75, r: 6 },
      { cx: 146, cy: 56, r: 6.5 },
      { cx: 104, cy: 88, r: 6 },
      { cx: 142, cy: 14, r: 6 },
      { cx: 172, cy: 15, r: 6.5 },
      { cx: 198, cy: 20, r: 5.5 },
      { cx: 20,  cy: 6,  r: 3.5 },
      { cx: 42,  cy: 5,  r: 4 },
      { cx: 108, cy: 9,  r: 3.5 },
      { cx: 154, cy: 11, r: 4 },
      { cx: 98,  cy: 78, r: 3.5 },
    ].map((b, i) => (
      <g key={i}>
        <circle cx={b.cx} cy={b.cy} r={b.r} fill="#ba281e" opacity="0.94" />
        <circle cx={b.cx - b.r * 0.25} cy={b.cy - b.r * 0.25} r={b.r * 0.55} fill="#dc4a3c" opacity="0.88" />
        <circle cx={b.cx} cy={b.cy} r={b.r * 0.24} fill="#fed55c" />
      </g>
    ))}
  </svg>
);

/* ═══════════════════════════════════════════════════════
   SVG ASSETS: KINGDOM ORNATE ROYAL SCROLL
═══════════════════════════════════════════════════════ */

/* Turned spearhead wooden/bronze finial for Kingdom scroll */
const WesternScrollFinial: React.FC<{ flip?: boolean }> = ({ flip }) => (
  <svg
    viewBox="0 0 72 44"
    width="58"
    height="40"
    style={{
      transform: flip ? 'scaleX(-1)' : 'none',
      flexShrink: 0,
      filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.75))',
    }}
  >
    <defs>
      <linearGradient id="westFinialWood" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stopColor="#240c03" />
        <stop offset="12%" stopColor="#51220a" />
        <stop offset="28%" stopColor="#96521a" />
        <stop offset="46%" stopColor="#ebb659" />
        <stop offset="54%" stopColor="#ffd982" />
        <stop offset="64%" stopColor="#e3a647" />
        <stop offset="78%" stopColor="#8c4714" />
        <stop offset="90%" stopColor="#3d1604" />
        <stop offset="100%" stopColor="#180501" />
      </linearGradient>
      <linearGradient id="westFinialDark" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stopColor="#120401" />
        <stop offset="50%" stopColor="#361505" />
        <stop offset="100%" stopColor="#0d0200" />
      </linearGradient>
    </defs>
    <path d="M 2,22 C 6,20 12,18 16,16 L 16,28 C 12,26 6,24 2,22 Z" fill="url(#westFinialWood)" />
    <rect x="15.5" y="15" width="2.5" height="14" rx="1" fill="url(#westFinialDark)" />
    <ellipse cx="21" cy="22" rx="3.5" ry="5.5" fill="url(#westFinialWood)" />
    <rect x="24" y="14" width="2.5" height="16" rx="1" fill="url(#westFinialDark)" />
    <ellipse cx="32" cy="22" rx="6" ry="9" fill="url(#westFinialWood)" />
    <rect x="37.5" y="11" width="3" height="22" rx="1" fill="url(#westFinialDark)" />
    <path d="M 40,12 C 43,11 48,9 52,7 L 52,37 C 48,35 43,33 40,32 Z" fill="url(#westFinialWood)" />
    <rect x="51.5" y="5" width="4" height="34" rx="1.5" fill="url(#westFinialDark)" />
    <rect x="55" y="3" width="7" height="38" rx="2" fill="url(#westFinialWood)" />
    <rect x="61.5" y="8" width="10.5" height="28" fill="url(#westFinialDark)" />
  </svg>
);

/* ═══════════════════════════════════════════════════════
   KINGDOM PARCHMENT STYLES
═══════════════════════════════════════════════════════ */
const KINGDOM_PARCHMENT_BG = `
  radial-gradient(ellipse 96% 14% at 50%   0%, rgba(30,10,2,0.92) 0%, rgba(65,24,6,0.55) 45%, transparent 100%),
  radial-gradient(ellipse 96% 14% at 50% 100%, rgba(30,10,2,0.92) 0%, rgba(65,24,6,0.55) 45%, transparent 100%),
  radial-gradient(ellipse 16% 90% at   0% 50%, rgba(45,16,4,0.90) 0%, rgba(95,40,12,0.65) 28%, rgba(145,75,22,0.25) 55%, transparent 100%),
  radial-gradient(ellipse 16% 90% at 100% 50%, rgba(45,16,4,0.90) 0%, rgba(95,40,12,0.65) 28%, rgba(145,75,22,0.25) 55%, transparent 100%),
  radial-gradient(ellipse 26% 28% at 4%   6%, rgba(130,55,14,0.70) 0%, transparent 65%),
  radial-gradient(ellipse 26% 28% at 96%  6%, rgba(130,55,14,0.70) 0%, transparent 65%),
  radial-gradient(ellipse 28% 30% at 4%  94%, rgba(125,50,12,0.70) 0%, transparent 65%),
  radial-gradient(ellipse 28% 30% at 96% 94%, rgba(125,50,12,0.70) 0%, transparent 65%),
  radial-gradient(ellipse at 50% 50%, #fff9e8 0%, #f7e8c2 30%, #ebd096 65%, #d6b05e 92%, #a8762c 100%)
`;

const KINGDOM_ROLLER_VIGNETTE = `linear-gradient(to right, rgba(30,10,2,0.92) 0%, rgba(70,28,6,0.6) 5%, transparent 16%, transparent 84%, rgba(70,28,6,0.6) 95%, rgba(30,10,2,0.92) 100%)`;
const KINGDOM_TOP_ROLLER_BG = `linear-gradient(to bottom, #2b1104 0%, #683010 10%, #ba722c 26%, #f5c46e 44%, #ffea9e 52%, #e5a746 62%, #9e5018 78%, #522006 90%, #1c0601 100%)`;
const KINGDOM_BOT_ROLLER_BG = `linear-gradient(to bottom, #1a0601 0%, #481d08 12%, #9e5820 28%, #e8a648 46%, #ffe694 54%, #cf8832 66%, #8a4012 80%, #461604 92%, #140401 100%)`;

const TORN_EDGE_CLIP = `polygon(
  0% 0%, 100% 0%,
  99.3% 3%, 98.6% 7%, 99.8% 12%, 98.0% 17%, 99.2% 22%, 97.6% 28%,
  99.0% 34%, 97.4% 40%, 99.5% 46%, 98.2% 52%, 99.4% 58%, 97.2% 64%,
  98.9% 70%, 97.8% 76%, 99.6% 82%, 98.4% 88%, 99.2% 94%, 100% 100%,
  0% 100%,
  0.8% 95%, 2.0% 89%, 0.5% 83%, 2.4% 77%, 1.0% 71%, 2.8% 65%,
  0.7% 59%, 1.8% 53%, 0.4% 47%, 2.6% 41%, 0.9% 35%, 2.4% 29%,
  0.5% 23%, 2.0% 17%, 0.7% 11%, 1.6% 5%, 0% 0%
)`;

export const EvaluationModal: React.FC<EvaluationModalProps> = ({ onClose }) => {
  ensureKF();
  const { theme } = useTheme();
  const isKingdom   = theme.id === 'kingdom';
  const isBrushwork = theme.id === 'brushwork';

  /* Filter: ONLY ALL, ACCEPTED, REJECTED as requested */
  const [statusFilter, setStatusFilter] = useState<'all' | 'accepted' | 'rejected'>('all');
  const [closing, setClosing] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const CLOSE_MS = 750;
  const handleClose = () => {
    setClosing(true);
    timer.current = setTimeout(onClose, CLOSE_MS);
  };
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const totalCount    = EVALUATION_TEST_SUITE.length;
  const acceptedCount = EVALUATION_TEST_SUITE.filter(tc => tc.expectedStatus === 'accepted').length;
  const rejectedCount = EVALUATION_TEST_SUITE.filter(tc => tc.expectedStatus === 'rejected').length;

  const FILTER_TABS: { id: 'all' | 'accepted' | 'rejected'; label: string; count: number }[] = [
    { id: 'all',      label: `ALL (${totalCount})`,         count: totalCount },
    { id: 'accepted', label: `ACCEPTED (${acceptedCount})`, count: acceptedCount },
    { id: 'rejected', label: `REJECTED (${rejectedCount})`, count: rejectedCount },
  ];

  const filtered = EVALUATION_TEST_SUITE.filter(tc => {
    if (statusFilter === 'all') return true;
    return tc.expectedStatus === statusFilter;
  });

  const scrollBodyAnim = closing
    ? `scrollFurl ${CLOSE_MS}ms cubic-bezier(0.4, 0, 0.2, 1) forwards`
    : `scrollUnfurl 850ms cubic-bezier(0.16, 1, 0.3, 1) forwards`;

  const bdAnim = closing
    ? `bdOut ${CLOSE_MS}ms ease forwards`
    : `bdIn 450ms ease forwards`;

  /* ─────────────────────────────────────────────────
     1. CLASSICAL INK: TRADITIONAL ASIAN HANGING SCROLL
  ───────────────────────────────────────────────── */
  if (isBrushwork) {
    return (
      <div
        style={{
          position: 'fixed', inset: 0, zIndex: 130,
          background: 'rgba(18,14,12,0.85)',
          backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '16px 24px',
          animation: bdAnim,
        }}
        onClick={e => { if (e.target === e.currentTarget) handleClose(); }}
      >
        <div style={{
          position: 'relative', width: '100%', maxWidth: 840,
          filter: 'drop-shadow(0 24px 44px rgba(0,0,0,0.88)) drop-shadow(0 4px 14px rgba(40,25,18,0.65))',
        }}>

          {/* ══ TOP ROLLER (Dowel rod with turned lacquer knobs) ══ */}
          <div style={{
            display: 'flex', alignItems: 'center',
            position: 'relative', zIndex: 10, margin: '0 -24px',
          }}>
            <AsianScrollKnob />
            <div style={{
              flex: 1, height: 32,
              background: `
                linear-gradient(to right, rgba(30,12,6,.8) 0%, rgba(60,25,12,.3) 4%, transparent 12%, transparent 88%, rgba(60,25,12,.3) 96%, rgba(30,12,6,.8) 100%),
                linear-gradient(to bottom, #6b442d 0%, #a47656 22%, #d2ab8f 46%, #e8cbaf 54%, #ba8b6b 72%, #7a4f35 90%, #442817 100%)
              `,
              borderRadius: '5px 5px 2px 2px',
              boxShadow: '0 12px 24px rgba(0,0,0,0.7), inset 0 2px 5px rgba(255,230,205,0.4), inset 0 -4px 8px rgba(0,0,0,0.6)',
            }} />
            <AsianScrollKnob flip />
          </div>

          {/* ══ ANIMATED BODY (Slow smooth roll down / up) ══ */}
          <div style={{
            overflow: 'hidden',
            animation: scrollBodyAnim,
            marginTop: -8,
            position: 'relative', zIndex: 4,
          }}>

            {/* ══ SILK BROCADE MOUNTING FRAME (Hyōgu) ══ */}
            <div style={{
              background: '#cbb094',
              backgroundImage: `
                linear-gradient(to right, rgba(0,0,0,0.18) 0%, transparent 4%, transparent 96%, rgba(0,0,0,0.18) 100%),
                repeating-linear-gradient(45deg, transparent, transparent 3px, rgba(0,0,0,0.015) 3px, rgba(0,0,0,0.015) 6px)
              `,
              padding: '20px 26px 20px',
              boxShadow: '0 20px 45px rgba(0,0,0,0.7), inset 0 2px 6px rgba(255,255,255,0.25)',
            }}>

              {/* ══ XUAN RICE PAPER CANVAS (Honshi) ══ */}
              <div className="ink-scroll" style={{
                background: 'radial-gradient(ellipse at 50% 35%, #ffffff 0%, #fcfbf7 60%, #f6f1e6 100%)',
                border: '1.5px solid #28211b',
                boxShadow: 'inset 0 0 24px rgba(120,90,60,0.15), 0 2px 8px rgba(0,0,0,0.25)',
                position: 'relative',
                padding: '24px 34px 20px',
                maxHeight: '66vh',
                overflowY: 'auto',
                display: 'flex', flexDirection: 'column',
              }}>

                {/* Hand-painted Plum Blossom Branch in Upper-Left */}
                <PlumBlossomBranch />

                {/* ── HEADER ── */}
                <div style={{
                  display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
                  borderBottom: '1px solid rgba(40,32,25,0.35)',
                  paddingBottom: 16, marginBottom: 16, paddingLeft: 56, position: 'relative', zIndex: 2,
                }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                    {/* Vermilion Artist Chop Stamp (印章) */}
                    <div style={{
                      width: 48, height: 48, flexShrink: 0,
                      background: '#bd3124',
                      borderRadius: 3,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      boxShadow: '0 3px 10px rgba(160,30,20,0.45)',
                      border: '1px solid rgba(80,15,10,0.6)',
                      animation: 'sealPop .55s cubic-bezier(.22,1,.36,1) .15s both',
                    }}>
                      <span style={{
                        fontFamily: 'var(--font-display)', fontSize: '1.5rem',
                        fontWeight: 900, color: '#fef7e6', lineHeight: 1,
                      }}>法</span>
                    </div>
                    <div>
                      <div style={{
                        fontFamily: 'var(--font-display)', fontSize: '.62rem', fontWeight: 800,
                        color: '#bd3124', letterSpacing: '.25em', textTransform: 'uppercase', marginBottom: 3,
                      }}>Imperial Scribes · PRD §18</div>
                      <h3 style={{
                        fontFamily: 'var(--font-display)', fontSize: '1.45rem', fontWeight: 800,
                        color: '#1e1814', lineHeight: 1.15, marginBottom: 3,
                      }}>Scroll of Ordinances</h3>
                      <p style={{ fontFamily: 'var(--font-body)', fontSize: '.82rem', color: '#5a4c40', fontStyle: 'italic' }}>
                        Twenty-and-five canonical amendments inscribed in the Imperial Record of Constitutional Rulings.
                      </p>
                    </div>
                  </div>
                  <button type="button" onClick={handleClose} title="Roll Up Scroll" style={{
                    background: 'rgba(40,30,20,0.06)', border: '1px solid rgba(40,30,20,0.3)',
                    borderRadius: '50%', width: 28, height: 28,
                    color: '#4a3b30', cursor: 'pointer', fontSize: '.95rem',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0, transition: 'all .15s ease',
                  }}>✕</button>
                </div>

                {/* ── FILTER TABS (Only ALL, ACCEPTED, REJECTED) ── */}
                <div style={{ display: 'flex', gap: 8, marginBottom: 14, position: 'relative', zIndex: 2 }}>
                  {FILTER_TABS.map(tab => {
                    const isActive = statusFilter === tab.id;
                    return (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setStatusFilter(tab.id)}
                        style={{
                          padding: '6px 16px',
                          borderRadius: 2,
                          border: isActive ? '1px solid #bd3124' : '1px solid rgba(40,30,20,0.28)',
                          background: isActive ? 'linear-gradient(to bottom, #bd3124, #9a2015)' : 'rgba(40,30,20,0.05)',
                          color: isActive ? '#fffbf5' : '#3d3026',
                          fontSize: '.74rem',
                          fontWeight: 800,
                          fontFamily: 'var(--font-display)',
                          cursor: 'pointer',
                          letterSpacing: '.06em',
                          boxShadow: isActive ? '0 2px 8px rgba(189,49,36,0.35)' : 'none',
                          transition: 'all .15s ease',
                        }}
                      >
                        {tab.label}
                      </button>
                    );
                  })}
                </div>

                {/* ── SUMI-E INK TABLE ── */}
                <div className="ink-scroll" style={{
                  borderTop: '1px solid rgba(40,30,20,0.3)',
                  borderBottom: '1px solid rgba(40,30,20,0.3)',
                  overflowY: 'auto', flex: 1, padding: '0 4px',
                  position: 'relative', zIndex: 2,
                }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.76rem' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid rgba(40,30,20,0.25)', textAlign: 'left' }}>
                        {['Ordinance #', 'Prompt Text', 'Status', 'Judicial Grounds'].map(h => (
                          <th key={h} style={{
                            padding: '8px 10px', fontFamily: 'var(--font-display)',
                            color: '#28211b', fontWeight: 800, fontSize: '.69rem',
                            letterSpacing: '.06em', textTransform: 'uppercase',
                          }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map(tc => {
                        const isAcc = tc.expectedStatus === 'accepted';
                        return (
                          <tr key={tc.id} style={{ borderBottom: '1px dashed rgba(40,30,20,0.18)' }}>
                            <td style={{ padding: '8px 10px', fontFamily: 'monospace', fontWeight: 800, color: '#1a1410' }}>{tc.id}</td>
                            <td style={{ padding: '8px 10px', fontStyle: 'italic', color: '#2b211a', fontFamily: 'var(--font-body)', fontSize: '.84rem' }}>&ldquo;{tc.input}&rdquo;</td>
                            <td style={{ padding: '8px 10px' }}>
                              <span style={{
                                padding: '3px 8px', borderRadius: 2, fontWeight: 800,
                                fontSize: '.65rem', fontFamily: 'var(--font-display)',
                                color: isAcc ? '#2e624d' : '#bd3124',
                                border: `1px solid ${isAcc ? '#2e624d' : '#bd3124'}`,
                                background: isAcc ? 'rgba(46,98,77,0.1)' : 'rgba(189,49,36,0.1)',
                              }}>
                                {isAcc ? 'ACCEPTED' : 'REJECTED'}
                              </span>
                            </td>
                            <td style={{ padding: '8px 10px', color: '#524338', fontFamily: 'var(--font-body)', fontSize: '.78rem' }}>
                              {tc.notes}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* ── FOOTER ── */}
                <div style={{ textAlign: 'right', marginTop: 14, position: 'relative', zIndex: 2 }}>
                  <button type="button" onClick={handleClose} style={{
                    padding: '8px 22px', background: 'transparent',
                    border: '1px solid rgba(40,30,20,0.4)', borderRadius: 2,
                    color: '#4a3b30', fontFamily: 'var(--font-display)',
                    fontWeight: 800, fontSize: '.76rem', cursor: 'pointer', letterSpacing: '.08em',
                    transition: 'all .15s ease',
                  }}>
                    Roll Up Scroll
                  </button>
                </div>

              </div>{/* /Xuan rice paper canvas */}
            </div>{/* /Silk brocade frame */}

            {/* ══ BOTTOM ROLLER (Dowel rod with turned lacquer knobs) ══ */}
            <div style={{
              display: 'flex', alignItems: 'center',
              position: 'relative', zIndex: 10, margin: '-6px -24px 0 -24px',
            }}>
              <AsianScrollKnob />
              <div style={{
                flex: 1, height: 32,
                background: `
                  linear-gradient(to right, rgba(30,12,6,.8) 0%, rgba(60,25,12,.3) 4%, transparent 12%, transparent 88%, rgba(60,25,12,.3) 96%, rgba(30,12,6,.8) 100%),
                  linear-gradient(to bottom, #442817 0%, #7a4f35 15%, #ba8b6b 35%, #e8cbaf 52%, #d2ab8f 65%, #a47656 84%, #52301c 100%)
                `,
                borderRadius: '2px 2px 5px 5px',
                boxShadow: '0 16px 32px rgba(0,0,0,0.85), 0 -4px 12px rgba(0,0,0,0.4), inset 0 4px 8px rgba(0,0,0,0.6), inset 0 -2px 5px rgba(255,230,205,0.35)',
              }} />
              <AsianScrollKnob flip />
            </div>

          </div>{/* /Animated body */}
        </div>
      </div>
    );
  }

  /* ─────────────────────────────────────────────────
     2. KINGDOM: AUTHENTIC WESTERN ROYAL SCROLL
  ───────────────────────────────────────────────── */
  if (isKingdom) {
    return (
      <div
        style={{
          position:'fixed', inset:0, zIndex:130,
          background:'rgba(10,5,2,0.86)',
          backdropFilter: 'blur(4px)',
          display:'flex', alignItems:'center', justifyContent:'center',
          padding:'16px 24px',
          animation: bdAnim,
        }}
        onClick={e => { if (e.target === e.currentTarget) handleClose(); }}
      >
        <div style={{
          position:'relative', width:'100%', maxWidth:860,
          filter: 'drop-shadow(0 24px 44px rgba(0,0,0,0.88)) drop-shadow(0 4px 14px rgba(45,18,4,0.65))',
        }}>

          {/* ══ TOP SCROLL ROLL (With ornate carved spearhead handles) ══ */}
          <div style={{
            display: 'flex', alignItems: 'center',
            position: 'relative', zIndex: 10, margin: '0 -46px',
          }}>
            <WesternScrollFinial />
            <div style={{
              flex: 1, height: 42,
              background: `${KINGDOM_ROLLER_VIGNETTE}, ${KINGDOM_TOP_ROLLER_BG}`,
              borderRadius: '8px 8px 4px 4px',
              boxShadow: '0 16px 30px -4px rgba(18,6,1,0.95), 0 4px 10px rgba(0,0,0,0.7), inset 0 3px 8px rgba(255,235,160,0.5), inset 0 -8px 16px rgba(0,0,0,0.85)',
            }} />
            <WesternScrollFinial flip />
          </div>

          {/* ══ BODY + BOTTOM ROLL (Slow smooth unfurl / furl) ══ */}
          <div style={{
            overflow: 'hidden',
            animation: scrollBodyAnim,
            marginTop: -14,
            position: 'relative', zIndex: 4,
          }}>

            {/* ══ PARCHMENT SHEET ══ */}
            <div className="parchment-scroll" style={{
              background: KINGDOM_PARCHMENT_BG,
              clipPath: TORN_EDGE_CLIP,
              padding: '28px 42px 24px',
              display: 'flex', flexDirection: 'column',
              maxHeight: '68vh', overflowY: 'auto',
              boxShadow: 'inset 0 24px 34px rgba(25,10,2,.55)',
            }}>

              {/* ── MANUSCRIPT HEADER ── */}
              <div style={{
                display:'flex', alignItems:'flex-start', justifyContent:'space-between',
                borderBottom:'2px double rgba(135,80,24,.45)',
                paddingBottom:16, marginBottom:16, gap:14,
              }}>
                <div style={{ display:'flex', alignItems:'flex-start', gap:14 }}>
                  <div style={{
                    width:52, height:52, flexShrink:0,
                    background:'radial-gradient(circle at 35% 30%, #be2f25 0%, #871922 60%, #460c11 100%)',
                    borderRadius:'50%',
                    display:'flex', alignItems:'center', justifyContent:'center',
                    boxShadow:'0 4px 14px rgba(60,8,12,.7), inset 0 2px 4px rgba(255,200,160,.3)',
                    animation:'sealPop .55s cubic-bezier(.22,1,.36,1) .18s both',
                    border: '1px solid rgba(255,180,120,.25)',
                  }}>
                    <Scroll size={26} style={{ color:'#fde8d0', opacity:.95 }} />
                  </div>
                  <div>
                    <div style={{
                      fontFamily:'var(--font-display)', fontSize:'.62rem', fontWeight:800,
                      color:'#871922', letterSpacing:'.22em', textTransform:'uppercase', marginBottom:3,
                    }}>Royal Judicial Chamber · PRD §18</div>
                    <h3 style={{
                      fontFamily:'var(--font-display)', fontSize:'1.45rem', fontWeight:800,
                      color:'#241206', lineHeight:1.15, marginBottom:4,
                      textShadow: '0 1px 1px rgba(255,230,170,.4)',
                    }}>The Grand Evaluation Scroll</h3>
                    <p style={{ fontFamily:'var(--font-body)', fontSize:'.82rem', color:'#6c4a28', fontStyle:'italic' }}>
                      Twenty-and-five canonical amendments reviewed before the High Court of Constitutional Scrutiny.
                    </p>
                  </div>
                </div>
                <button type="button" onClick={handleClose} title="Roll Up Scroll" style={{
                  background:'rgba(120,60,15,.1)', border:'1px solid rgba(140,80,24,.35)',
                  borderRadius: '50%', width: 28, height: 28,
                  color:'#6c4a28', cursor:'pointer', fontSize:'.95rem',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink:0, transition: 'all .15s ease',
                }}>✕</button>
              </div>

              {/* ── FILTER TABS (Only ALL, ACCEPTED, REJECTED) ── */}
              <div style={{ display:'flex', gap:8, marginBottom:14 }}>
                {FILTER_TABS.map(tab => {
                  const isActive = statusFilter === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setStatusFilter(tab.id)}
                      style={{
                        padding: '6px 16px',
                        borderRadius: 3,
                        border: isActive ? '1px solid #741720' : '1px solid rgba(135,80,24,.4)',
                        background: isActive ? 'linear-gradient(to bottom, #871922, #6b141b)' : 'rgba(80,38,10,.05)',
                        color: isActive ? '#fef0d8' : '#5c3e1e',
                        fontSize: '.74rem',
                        fontWeight: 800,
                        fontFamily: 'var(--font-display)',
                        cursor: 'pointer',
                        letterSpacing: '.06em',
                        boxShadow: isActive ? '0 2px 8px rgba(70,12,18,.35)' : 'none',
                        transition: 'all .15s ease',
                      }}
                    >
                      {tab.label}
                    </button>
                  );
                })}
              </div>

              {/* ── MANUSCRIPT TABLE ── */}
              <div className="parchment-scroll" style={{
                borderTop:'1px solid rgba(135,80,24,.4)',
                borderBottom:'1px solid rgba(135,80,24,.4)',
                overflowY:'auto', flex:1, padding: '0 4px',
              }}>
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'.76rem' }}>
                  <thead>
                    <tr style={{ borderBottom:'1px solid rgba(135,80,24,.35)', textAlign:'left' }}>
                      {['Scroll #', 'Petition Text', 'Status', 'Court Grounds'].map(h => (
                        <th key={h} style={{
                          padding:'8px 10px', fontFamily:'var(--font-display)',
                          color:'#381c08', fontWeight:800, fontSize:'.69rem',
                          letterSpacing:'.06em', textTransform:'uppercase',
                        }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(tc => {
                      const isAcc = tc.expectedStatus === 'accepted';
                      return (
                        <tr key={tc.id} style={{ borderBottom:'1px dashed rgba(140,85,30,.25)' }}>
                          <td style={{ padding:'8px 10px', fontFamily:'monospace', fontWeight:800, color:'#241206' }}>{tc.id}</td>
                          <td style={{ padding:'8px 10px', fontStyle:'italic', color:'#2e1808', fontFamily:'var(--font-body)', fontSize:'.84rem' }}>&ldquo;{tc.input}&rdquo;</td>
                          <td style={{ padding:'8px 10px' }}>
                            <span style={{
                              padding:'3px 8px', borderRadius:2, fontWeight:800,
                              fontSize:'.65rem', fontFamily:'var(--font-display)',
                              color: isAcc ? '#1e5f30' : '#871922',
                              border:`1px solid ${isAcc ? '#1e5f30' : '#871922'}`,
                              background: isAcc ? 'rgba(30,95,48,.1)' : 'rgba(135,25,34,.1)',
                            }}>
                              {isAcc ? 'ACCEPTED' : 'REJECTED'}
                            </span>
                          </td>
                          <td style={{ padding:'8px 10px', color:'#5f4124', fontFamily:'var(--font-body)', fontSize:'.78rem' }}>
                            {tc.notes}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* ── FOOTER ── */}
              <div style={{ textAlign:'right', marginTop:14 }}>
                <button type="button" onClick={handleClose} style={{
                  padding:'8px 22px', background:'rgba(100,50,15,.08)',
                  border:'1px solid rgba(135,80,24,.45)', borderRadius:4,
                  color:'#5a3a1c', fontFamily:'var(--font-display)',
                  fontWeight:800, fontSize:'.76rem', cursor:'pointer', letterSpacing:'.08em',
                  transition:'all .15s ease',
                }}>
                  Roll Up Scroll
                </button>
              </div>

            </div>{/* /parchment sheet */}

            {/* ══ BOTTOM SCROLL ROLL (With ornate carved spearhead handles) ══ */}
            <div style={{
              display: 'flex', alignItems: 'center',
              position: 'relative', zIndex: 10, margin: '-14px -46px 0 -46px',
            }}>
              <WesternScrollFinial />
              <div style={{
                flex: 1, height: 42,
                background: `${KINGDOM_ROLLER_VIGNETTE}, ${KINGDOM_BOT_ROLLER_BG}`,
                borderRadius: '4px 4px 8px 8px',
                boxShadow: '0 22px 45px rgba(0,0,0,0.9), 0 -10px 22px rgba(18,6,1,0.8), inset 0 8px 16px rgba(0,0,0,0.85), inset 0 -3px 8px rgba(255,235,160,0.4)',
              }} />
              <WesternScrollFinial flip />
            </div>

          </div>{/* /Animated body */}
        </div>
      </div>
    );
  }

  /* ─────────────────────────────────────────────────
     3. MODERN DEFAULT THEME (Clean panel)
  ───────────────────────────────────────────────── */
  const defAnim = closing
    ? `evalFadeOut ${CLOSE_MS}ms ease forwards`
    : `evalFadeIn  420ms cubic-bezier(.22,1,.36,1) forwards`;

  return (
    <div
      style={{
        position:'fixed', inset:0, background:'rgba(0,0,0,.72)',
        display:'flex', alignItems:'center', justifyContent:'center',
        padding:'20px', zIndex:130, animation: bdAnim,
      }}
      onClick={e => { if (e.target === e.currentTarget) handleClose(); }}
    >
      <div className="panel" style={{
        maxWidth:840, width:'100%', maxHeight:'90vh',
        display:'flex', flexDirection:'column', padding:24,
        animation: defAnim,
      }}>
        {/* Header */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', borderBottom:'1px solid var(--line)', paddingBottom:14, marginBottom:16 }}>
          <div>
            <h3 style={{ fontFamily:'var(--font-display)', fontSize:'1.2rem', fontWeight:800, color:'var(--text)' }}>Constitutional Rules & Ordinances</h3>
            <p style={{ fontSize:'.75rem', color:'var(--text-muted)' }}>Frozen dataset · 25 amendments reviewed under PRD §18.</p>
          </div>
          <button type="button" onClick={handleClose} style={{ background:'none', border:'none', color:'var(--text-muted)', cursor:'pointer', fontSize: '1.2rem' }}>
            ✕
          </button>
        </div>

        {/* Filters: ONLY ALL, ACCEPTED, REJECTED */}
        <div style={{ display:'flex', gap:8, marginBottom:14 }}>
          {FILTER_TABS.map(tab => {
            const isActive = statusFilter === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setStatusFilter(tab.id)}
                style={{
                  padding:'6px 18px',
                  borderRadius:'var(--radius-sm)',
                  border: isActive ? '1px solid var(--accent)' : '1px solid var(--line)',
                  background: isActive ? 'var(--accent)' : 'var(--surface-2)',
                  color: isActive ? '#fff' : 'var(--text-muted)',
                  fontSize:'.75rem',
                  fontWeight: 700,
                  fontFamily:'var(--font-display)',
                  cursor:'pointer',
                  letterSpacing:'.04em',
                  transition: 'all .15s ease',
                }}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Table */}
        <div style={{ flex:1, overflowY:'auto', border:'1px solid var(--line)', borderRadius:'var(--radius-sm)' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'.78rem' }}>
            <thead>
              <tr style={{ background:'var(--surface-2)', borderBottom:'1px solid var(--line)', textAlign:'left' }}>
                {['ID', 'Proposal Prompt', 'Status', 'Engine Grounds'].map(h => (
                  <th key={h} style={{ padding:'10px 12px', color:'var(--text)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(tc => {
                const isAcc = tc.expectedStatus === 'accepted';
                return (
                  <tr key={tc.id} style={{ borderBottom:'1px solid var(--line)' }}>
                    <td style={{ padding:'10px 12px', fontFamily:'monospace', fontWeight:700, color:'var(--text)' }}>{tc.id}</td>
                    <td style={{ padding:'10px 12px', fontStyle:'italic', color:'var(--text)' }}>&ldquo;{tc.input}&rdquo;</td>
                    <td style={{ padding:'10px 12px' }}>
                      <span style={{
                        padding:'3px 8px', borderRadius:'var(--radius-sm)', fontWeight:700, fontSize:'.68rem',
                        background:'var(--surface-2)',
                        color: isAcc ? 'var(--ok)' : 'var(--danger)',
                        border:`1px solid ${isAcc ? 'var(--ok)' : 'var(--danger)'}`,
                      }}>
                        {isAcc ? 'ACCEPTED' : 'REJECTED'}
                      </span>
                    </td>
                    <td style={{ padding:'10px 12px', color:'var(--text-muted)' }}>
                      {tc.notes}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div style={{ textAlign:'right', marginTop:16 }}>
          <button type="button" onClick={handleClose} className="btn btn-secondary" style={{ padding:'8px 18px', fontSize:'.8rem' }}>
            Close Rules
          </button>
        </div>
      </div>
    </div>
  );
};
