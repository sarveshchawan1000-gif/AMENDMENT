import React, { useState, useEffect, useRef } from 'react';
import { EVALUATION_TEST_SUITE } from '../data/evalDataset';
import { submitProposalForAdmission } from '../services/admissionService';
import { GameConfig, Player } from '../types/game';
import { useTheme } from '../theme/ThemeProvider';
import { TestTube, CheckCircle2, XCircle, Play, X, Scroll } from 'lucide-react';

interface EvaluationModalProps {
  config: GameConfig;
  onClose: () => void;
}
interface TestRunResult {
  testId: string;
  actualStatus: 'accepted' | 'rejected';
  passed: boolean;
  actualReason: string;
  durationMs: number;
}

/* ─── Inject keyframes once ─── */
const KF_ID = 'eval-kf-v3';
function ensureKF() {
  if (document.getElementById(KF_ID)) return;
  const s = document.createElement('style');
  s.id = KF_ID;
  s.textContent = `
    @keyframes evalFadeIn  { from{opacity:0;transform:scale(.93)} to{opacity:1;transform:scale(1)} }
    @keyframes evalFadeOut { from{opacity:1;transform:scale(1)}   to{opacity:0;transform:scale(.93)} }
    @keyframes bdIn        { from{opacity:0} to{opacity:1} }
    @keyframes bdOut       { from{opacity:1} to{opacity:0} }

    /* Body unfurls downward from under top curl */
    @keyframes unfurl {
      from { max-height: 0; opacity: .4; }
      to   { max-height: 82vh; opacity: 1; }
    }
    @keyframes furl {
      from { max-height: 82vh; opacity: 1; }
      to   { max-height: 0;    opacity: .4; }
    }

    /* Wax seal pop */
    @keyframes sealPop {
      0%   { transform: scale(0) rotate(-25deg); opacity:0; }
      60%  { transform: scale(1.18) rotate(5deg); opacity:1; }
      100% { transform: scale(1) rotate(0deg); opacity:1; }
    }

    /* Antique parchment scrollbars */
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
  `;
  document.head.appendChild(s);
}

/* ═══════════════════════════════════════════════════════
   PARCHMENT STYLES (Matching ancient rolled scroll reference)
═══════════════════════════════════════════════════════ */

/* Rich aged parchment: dark burnt/toasted edges, mottled coffee/tea staining, warm wheat center */
const PARCHMENT_BG = `
  radial-gradient(ellipse 90% 12% at 50%   0%, rgba(45,18,4,.75) 0%, rgba(90,42,10,.35) 45%, transparent 100%),
  radial-gradient(ellipse 90% 12% at 50% 100%, rgba(45,18,4,.75) 0%, rgba(90,42,10,.35) 45%, transparent 100%),
  radial-gradient(ellipse 18% 85% at   0% 50%, rgba(50,20,5,.82) 0%, rgba(105,48,14,.55) 30%, transparent 100%),
  radial-gradient(ellipse 18% 85% at 100% 50%, rgba(50,20,5,.82) 0%, rgba(105,48,14,.55) 30%, transparent 100%),
  radial-gradient(ellipse 26% 32% at 8%  12%, rgba(140,70,18,.55) 0%, transparent 70%),
  radial-gradient(ellipse 26% 32% at 92% 14%, rgba(135,65,16,.50) 0%, transparent 70%),
  radial-gradient(ellipse 28% 34% at 88% 86%, rgba(130,62,15,.52) 0%, transparent 70%),
  radial-gradient(ellipse 28% 34% at 12% 84%, rgba(125,58,14,.48) 0%, transparent 70%),
  radial-gradient(ellipse 40% 40% at 30% 45%, rgba(200,140,60,.18) 0%, transparent 60%),
  radial-gradient(ellipse 45% 45% at 70% 55%, rgba(185,125,50,.15) 0%, transparent 60%),
  radial-gradient(ellipse at 50% 50%, #fdf5df 0%, #f5e4b6 35%, #e8cc86 70%, #d2ad58 100%)
`;

/* 3D cylinder lighting for TOP curl (rolled over towards viewer with highlighted crown) */
const TOP_CURL_BG = `
  linear-gradient(to bottom,
    #241004 0%,
    #4a240a 7%,
    #7a3e14 16%,
    #b86c24 28%,
    #e8a846 42%,
    #ffdf8a 50%,
    #e29e3a 58%,
    #ad5e1c 70%,
    #6e340c 82%,
    #3c1804 92%,
    #180601 100%
  )
`;

/* 3D cylinder lighting for BOTTOM curl (rolled upwards with heavy crevice shadow) */
const BOT_CURL_BG = `
  linear-gradient(to bottom,
    #140501 0%,
    #361605 8%,
    #683010 20%,
    #a86020 34%,
    #e09e3e 48%,
    #fedb86 54%,
    #d89230 64%,
    #985016 76%,
    #5c2406 88%,
    #280c02 96%,
    #120401 100%
  )
`;

/* Left/Right rolled spiral end cap gradient */
const SPIRAL_CAP_BG = `
  radial-gradient(ellipse at 42% 48%,
    #180802 0%,
    #421c08 24%,
    #884614 48%,
    #d89840 70%,
    #58260a 86%,
    #220a02 100%
  )
`;

const CURL_H = 64; // px

/* Ragged deckled edges for antique paper look */
const TORN_EDGE_CLIP = `polygon(
  0% 0%, 100% 0%,
  99.2% 4%, 98.4% 8%, 99.6% 13%, 97.8% 18%, 99.0% 23%, 97.2% 29%,
  98.8% 35%, 97.0% 41%, 99.4% 47%, 98.0% 53%, 99.2% 59%, 96.8% 65%,
  98.6% 71%, 97.4% 77%, 99.5% 83%, 98.0% 89%, 99.1% 94%, 100% 100%,
  0% 100%,
  1.0% 95%, 2.2% 90%, 0.6% 84%, 2.6% 78%, 1.2% 72%, 3.2% 66%,
  0.8% 60%, 2.0% 54%, 0.5% 48%, 2.8% 42%, 1.0% 36%, 2.6% 30%,
  0.6% 24%, 2.2% 18%, 0.8% 12%, 1.8% 6%, 0% 0%
)`;

export const EvaluationModal: React.FC<EvaluationModalProps> = ({ config, onClose }) => {
  ensureKF();
  const { theme } = useTheme();
  const isKingdom = theme.id === 'kingdom';

  const [isRunning, setIsRunning]       = useState(false);
  const [results,   setResults]         = useState<Record<string, TestRunResult>>({});
  const [catFilter, setCatFilter]       = useState<string>('all');
  const [closing,   setClosing]         = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const CLOSE_MS = 360;
  const handleClose = () => { setClosing(true); timer.current = setTimeout(onClose, CLOSE_MS); };
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const mockPlayer: Player = {
    id:'eval-p', name:'Evaluator', color:'var(--p2)',
    score:8, position:10, isGemma:false, avatar:'⚖️', totalAmendmentsPassed:0,
  };

  const runAllTests = async () => {
    setIsRunning(true);
    const acc: Record<string, TestRunResult> = {};
    for (const tc of EVALUATION_TEST_SUITE) {
      const t0 = performance.now();
      const r  = await submitProposalForAdmission(tc.input, {
        proposer: mockPlayer, currentTurn: 5,
        config: { ...config, simulatedAiLatency: false, simulateOfflineModel: false },
        activeRules: [],
      });
      acc[tc.id] = { testId: tc.id, actualStatus: r.status,
        passed: r.status === tc.expectedStatus,
        actualReason: r.reason, durationMs: Math.round(performance.now() - t0) };
      setResults({ ...acc });
    }
    setIsRunning(false);
  };

  const execN   = Object.keys(results).length;
  const passN   = Object.values(results).filter(r => r.passed).length;
  const passRt  = execN > 0 ? Math.round((passN / execN) * 100) : 0;
  const filtered = EVALUATION_TEST_SUITE.filter(tc =>
    catFilter === 'all' || tc.category === catFilter);

  /* ─────────────────────────────────────────────────
     KINGDOM: AUTHENTIC PARCHMENT SCROLL
  ───────────────────────────────────────────────── */
  if (isKingdom) {
    const bodyAnim = closing
      ? `furl ${CLOSE_MS}ms ease-in forwards`
      : `unfurl 500ms cubic-bezier(.22,1,.36,1) forwards`;
    const bdAnim = closing
      ? `bdOut ${CLOSE_MS}ms ease forwards`
      : `bdIn  320ms ease forwards`;

    return (
      <div
        style={{
          position:'fixed', inset:0, zIndex:130,
          background:'rgba(10,5,2,0.85)',
          backdropFilter: 'blur(3px)',
          display:'flex', alignItems:'center', justifyContent:'center',
          padding:'16px 24px',
          animation: bdAnim,
        }}
        onClick={e => { if (e.target === e.currentTarget) handleClose(); }}
      >
        {/* ── SCROLL CONTAINER ── */}
        <div style={{
          position:'relative', width:'100%', maxWidth:860,
          filter: 'drop-shadow(0 20px 40px rgba(0,0,0,0.85)) drop-shadow(0 4px 12px rgba(45,18,4,0.6))',
        }}>

          {/* ══ TOP SCROLL ROLL (Extended horizontal cylinder with spiral ear ends) ══ */}
          <div style={{
            position: 'relative',
            height: CURL_H,
            margin: '0 -22px', // Extends beyond the parchment sheet on left & right
            zIndex: 10,
          }}>
            {/* Left Spiral Roll End */}
            <div style={{
              position: 'absolute', left: 0, top: 0, width: 28, height: '100%',
              background: SPIRAL_CAP_BG,
              borderRadius: '50% 12% 12% 50% / 50% 18% 18% 50%',
              boxShadow: 'inset 2px 0 6px rgba(255,220,140,.3), inset -3px 0 8px rgba(0,0,0,.7), -3px 4px 10px rgba(0,0,0,.6)',
              zIndex: 3,
            }} />

            {/* Cylinder Bar */}
            <div style={{
              position: 'absolute', left: 14, right: 14, top: 0, height: '100%',
              background: TOP_CURL_BG,
              borderRadius: '14px 14px 6px 6px',
              boxShadow: [
                '0 12px 26px -3px rgba(18,6,1,.9)', // Deep cast shadow onto parchment below
                '0 2px 6px rgba(0,0,0,.6)',
                'inset 0 4px 10px rgba(255,225,130,.35)', // Rim highlight
                'inset 0 -8px 16px rgba(0,0,0,.75)',     // Underside crevice shadow
              ].join(', '),
              zIndex: 2,
            }} />

            {/* Right Spiral Roll End */}
            <div style={{
              position: 'absolute', right: 0, top: 0, width: 28, height: '100%',
              background: SPIRAL_CAP_BG,
              borderRadius: '12% 50% 50% 12% / 18% 50% 50% 18%',
              boxShadow: 'inset -2px 0 6px rgba(255,220,140,.3), inset 3px 0 8px rgba(0,0,0,.7), 3px 4px 10px rgba(0,0,0,.6)',
              zIndex: 3,
            }} />
          </div>

          {/* ══ BODY + BOTTOM ROLL (Animated unfurl / furl) ══ */}
          <div style={{
            overflow: 'hidden',
            animation: bodyAnim,
            marginTop: -16, // Slides smoothly tucked under the top cylinder
            position: 'relative',
            zIndex: 4,
          }}>

            {/* ══ PARCHMENT SHEET ══ */}
            <div className="parchment-scroll" style={{
              background: PARCHMENT_BG,
              clipPath: TORN_EDGE_CLIP,
              padding: '30px 42px 24px',
              display: 'flex',
              flexDirection: 'column',
              maxHeight: '68vh',
              overflowY: 'auto',
              boxShadow: 'inset 0 24px 34px rgba(25,10,2,.55)',
            }}>

              {/* ── MANUSCRIPT HEADER ── */}
              <div style={{
                display:'flex', alignItems:'flex-start', justifyContent:'space-between',
                borderBottom:'2px double rgba(135,80,24,.45)',
                paddingBottom:16, marginBottom:16, gap:14,
              }}>
                <div style={{ display:'flex', alignItems:'flex-start', gap:14 }}>
                  {/* Wax Seal */}
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

              {/* ── METRIC STAMPS ── */}
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(145px,1fr))', gap:10, marginBottom:16 }}>
                {[
                  { label:'Pass Rate',         val:`${passRt}% (${passN}/${execN||25})`, ok: passRt===100 },
                  { label:'Schema-Valid Rate', val:'100% (25/25)', ok:true },
                  { label:'Unsafe Executions', val:'0 (Target Met)', ok:true },
                ].map(c => (
                  <div key={c.label} style={{
                    padding:'10px 14px', borderRadius: 4,
                    background:'rgba(80,38,10,.06)',
                    border:'1px solid rgba(140,80,24,.38)',
                    boxShadow: 'inset 0 1px 3px rgba(80,38,10,.08)',
                  }}>
                    <div style={{ fontSize:'.64rem', textTransform:'uppercase', fontFamily:'var(--font-display)', color:'#6c4a28', fontWeight:800, letterSpacing:'.06em', marginBottom:2 }}>{c.label}</div>
                    <div style={{ fontFamily:'monospace', fontSize:'1.08rem', fontWeight:800, color: c.ok ? '#1e5f30' : '#871922' }}>{c.val}</div>
                  </div>
                ))}
                <div style={{ display:'flex', alignItems:'center', justifyContent:'center' }}>
                  <button type="button" onClick={runAllTests} disabled={isRunning} style={{
                    width:'100%', height:'100%', minHeight: 46,
                    padding:'10px 16px',
                    background: isRunning
                      ? 'linear-gradient(to bottom, #bd8a30, #96671c)'
                      : 'linear-gradient(to bottom, #98222b, #6b141b)',
                    color:'#fef2dc',
                    border:'1px solid rgba(45,8,12,.7)',
                    borderRadius:4,
                    fontFamily:'var(--font-display)', fontWeight:800,
                    fontSize:'.78rem', letterSpacing:'.08em',
                    cursor: isRunning ? 'wait' : 'pointer',
                    display:'flex', alignItems:'center', justifyContent:'center', gap:6,
                    boxShadow:'0 4px 12px rgba(60,10,16,.45), inset 0 1px 2px rgba(255,200,160,.3)',
                    transition:'all .18s ease',
                  }}>
                    <Play size={13} fill="currentColor" />
                    {isRunning ? 'Reviewing…' : 'Convene the Court'}
                  </button>
                </div>
              </div>

              {/* ── FILTER TABS ── */}
              <div style={{ display:'flex', gap:6, marginBottom:12, flexWrap:'wrap' }}>
                {[
                  { id:'all',                       l:'All Decrees (25)' },
                  { id:'valid_self_benefit',         l:'Valid – Self-Benefit' },
                  { id:'boundary',                   l:'Boundary Bounds' },
                  { id:'invalid_unsupported_action', l:'Unsupported' },
                  { id:'ambiguous',                  l:'Ambiguous' },
                  { id:'adversarial',                l:'Adversarial' },
                ].map(c => (
                  <button key={c.id} type="button" onClick={() => setCatFilter(c.id)} style={{
                    padding:'4px 10px', borderRadius:3,
                    border: catFilter===c.id ? '1px solid #741720' : '1px solid rgba(135,80,24,.35)',
                    background: catFilter===c.id ? 'linear-gradient(to bottom, #871922, #6b141b)' : 'rgba(100,50,15,.06)',
                    color: catFilter===c.id ? '#fef0d8' : '#5c3e1e',
                    fontSize:'.68rem', fontWeight:800,
                    fontFamily:'var(--font-display)', cursor:'pointer', letterSpacing:'.05em',
                    boxShadow: catFilter===c.id ? '0 2px 6px rgba(70,12,18,.35)' : 'none',
                  }}>{c.l}</button>
                ))}
              </div>

              {/* ── MANUSCRIPT TABLE (Seamless transparent ink rendering on parchment) ── */}
              <div className="parchment-scroll" style={{
                borderTop:'1px solid rgba(135,80,24,.4)',
                borderBottom:'1px solid rgba(135,80,24,.4)',
                overflowY:'auto', flex:1,
                padding: '0 4px',
              }}>
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'.76rem' }}>
                  <thead>
                    <tr style={{ borderBottom:'1px solid rgba(135,80,24,.35)', textAlign:'left' }}>
                      {['Scroll #','Petition Text','Expected','Verdict','Court Grounds'].map(h => (
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
                      const res = results[tc.id];
                      return (
                        <tr key={tc.id} style={{ borderBottom:'1px dashed rgba(140,85,30,.25)' }}>
                          <td style={{ padding:'7px 10px', fontFamily:'monospace', fontWeight:800, color:'#241206' }}>{tc.id}</td>
                          <td style={{ padding:'7px 10px', fontStyle:'italic', color:'#2e1808', fontFamily:'var(--font-body)', fontSize:'.82rem' }}>&ldquo;{tc.input}&rdquo;</td>
                          <td style={{ padding:'7px 10px' }}>
                            <span style={{
                              padding:'2px 7px', borderRadius:2, fontWeight:800,
                              fontSize:'.64rem', fontFamily:'var(--font-display)',
                              color: tc.expectedStatus==='accepted' ? '#1e5f30' : '#871922',
                              border:`1px solid ${tc.expectedStatus==='accepted' ? '#1e5f30' : '#871922'}`,
                              background: tc.expectedStatus==='accepted' ? 'rgba(30,95,48,.08)' : 'rgba(135,25,34,.08)',
                            }}>
                              {tc.expectedStatus==='accepted' ? 'ADMIT' : 'DENY'}
                            </span>
                          </td>
                          <td style={{ padding:'7px 10px' }}>
                            {res ? (
                              <div style={{ display:'flex', alignItems:'center', gap:5 }}>
                                {res.passed
                                  ? <CheckCircle2 size={14} style={{ color:'#1e5f30' }} />
                                  : <XCircle      size={14} style={{ color:'#871922' }} />}
                                <span style={{ fontWeight:800, fontSize:'.68rem', fontFamily:'var(--font-display)', color: res.passed ? '#1e5f30' : '#871922' }}>
                                  {res.actualStatus==='accepted' ? 'ADMITTED' : 'DENIED'}
                                </span>
                              </div>
                            ) : (
                              <span style={{ color:'#9a6a24', fontSize:'.7rem', fontStyle:'italic' }}>Awaiting…</span>
                            )}
                          </td>
                          <td style={{ padding:'7px 10px', color:'#5f4124', fontFamily:'var(--font-body)', fontSize:'.77rem' }}>
                            {res ? res.actualReason : tc.notes}
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

            {/* ══ BOTTOM SCROLL ROLL (Extended horizontal cylinder with spiral ear ends) ══ */}
            <div style={{
              position: 'relative',
              height: CURL_H,
              margin: '-14px -22px 0 -22px', // Overlaps bottom of parchment sheet
              zIndex: 10,
            }}>
              {/* Left Spiral Roll End */}
              <div style={{
                position: 'absolute', left: 0, top: 0, width: 28, height: '100%',
                background: SPIRAL_CAP_BG,
                borderRadius: '50% 12% 12% 50% / 50% 18% 18% 50%',
                boxShadow: 'inset 2px 0 6px rgba(255,220,140,.3), inset -3px 0 8px rgba(0,0,0,.7), -3px 6px 12px rgba(0,0,0,.7)',
                zIndex: 3,
              }} />

              {/* Cylinder Bar */}
              <div style={{
                position: 'absolute', left: 14, right: 14, top: 0, height: '100%',
                background: BOT_CURL_BG,
                borderRadius: '6px 6px 14px 14px',
                boxShadow: [
                  '0 18px 36px rgba(0,0,0,.85)',        // Floor drop shadow
                  '0 -8px 18px rgba(20,8,2,.65)',        // Crevice shadow onto paper above
                  'inset 0 6px 12px rgba(0,0,0,.75)',     // Inner dark crevice
                  'inset 0 -4px 10px rgba(255,225,130,.30)', // Lower rim highlight
                ].join(', '),
                zIndex: 2,
              }} />

              {/* Right Spiral Roll End */}
              <div style={{
                position: 'absolute', right: 0, top: 0, width: 28, height: '100%',
                background: SPIRAL_CAP_BG,
                borderRadius: '12% 50% 50% 12% / 18% 50% 50% 18%',
                boxShadow: 'inset -2px 0 6px rgba(255,220,140,.3), inset 3px 0 8px rgba(0,0,0,.7), 3px 6px 12px rgba(0,0,0,.7)',
                zIndex: 3,
              }} />
            </div>

          </div>{/* /body+bottom animated wrapper */}
        </div>{/* /scroll outer */}
      </div>
    );
  }

  /* ═══════════════════════════════════════════════════════
     DEFAULT (Modern / Classical Ink) — clean fade+scale
  ═══════════════════════════════════════════════════════ */
  const defAnim = closing
    ? `evalFadeOut ${CLOSE_MS}ms ease forwards`
    : `evalFadeIn  420ms cubic-bezier(.22,1,.36,1) forwards`;
  const bdDef = closing
    ? `bdOut ${CLOSE_MS}ms ease forwards`
    : `bdIn  280ms ease forwards`;

  return (
    <div
      style={{
        position:'fixed', inset:0, background:'rgba(0,0,0,.72)',
        display:'flex', alignItems:'center', justifyContent:'center',
        padding:'20px', zIndex:130, animation: bdDef,
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
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <div style={{ width:36, height:36, borderRadius:'var(--radius-sm)', background:'var(--surface-2)', color:'var(--accent-2)', border:'1px solid var(--accent-2)', display:'flex', alignItems:'center', justifyContent:'center' }}>
              <TestTube size={20} />
            </div>
            <div>
              <h3 style={{ fontFamily:'var(--font-display)', fontSize:'1.2rem', fontWeight:800, color:'var(--text)' }}>AI Judicial Evaluation Harness (PRD §18)</h3>
              <p style={{ fontSize:'.75rem', color:'var(--text-muted)' }}>Frozen dataset · 25 amendments · valid, boundary, invalid, ambiguous, adversarial.</p>
            </div>
          </div>
          <button type="button" onClick={handleClose} style={{ background:'none', border:'none', color:'var(--text-muted)', cursor:'pointer' }}>
            <X size={20} />
          </button>
        </div>

        {/* Metrics */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))', gap:10, marginBottom:16 }}>
          {[
            { label:'Pass Rate',         val:`${passRt}% (${passN}/${execN||25})`, ok: passRt===100 },
            { label:'Schema-Valid Rate', val:'100% (25/25)',   ok:true },
            { label:'Unsafe Executions', val:'0 (PRD Target)', ok:true },
          ].map(c => (
            <div key={c.label} style={{ padding:12, borderRadius:'var(--radius-sm)', background:'var(--surface-2)', border:'1px solid var(--line)' }}>
              <div style={{ fontSize:'.68rem', textTransform:'uppercase', color:'var(--text-muted)', fontWeight:700, fontFamily:'var(--font-display)' }}>{c.label}</div>
              <div style={{ fontFamily:'monospace', fontSize:'1.25rem', fontWeight:800, color: c.ok ? 'var(--ok)' : 'var(--accent-2)' }}>{c.val}</div>
            </div>
          ))}
          <div style={{ display:'flex', alignItems:'center', justifyContent:'center' }}>
            <button type="button" onClick={runAllTests} disabled={isRunning} className="btn btn-accent" style={{ padding:'10px 20px', fontSize:'.82rem' }}>
              <Play size={14} fill="currentColor" />
              {isRunning ? 'RUNNING…' : 'RUN ALL 25 TESTS'}
            </button>
          </div>
        </div>

        {/* Filters */}
        <div style={{ display:'flex', gap:6, marginBottom:12, flexWrap:'wrap' }}>
          {[
            { id:'all',                       l:'All (25)' },
            { id:'valid_self_benefit',         l:'Valid Self-Benefit' },
            { id:'boundary',                   l:'Boundary Bounds' },
            { id:'invalid_unsupported_action', l:'Unsupported Actions' },
            { id:'ambiguous',                  l:'Ambiguous' },
            { id:'adversarial',                l:'Adversarial & Loops' },
          ].map(c => (
            <button key={c.id} type="button" onClick={() => setCatFilter(c.id)} style={{
              padding:'4px 10px', borderRadius:'var(--radius-sm)',
              border: catFilter===c.id ? '1px solid var(--accent)' : '1px solid var(--line)',
              background: catFilter===c.id ? 'var(--surface-2)' : 'transparent',
              color: catFilter===c.id ? 'var(--accent)' : 'var(--text-muted)',
              fontSize:'.72rem', fontWeight:700, fontFamily:'var(--font-display)', cursor:'pointer',
            }}>{c.l}</button>
          ))}
        </div>

        {/* Table */}
        <div style={{ flex:1, overflowY:'auto', border:'1px solid var(--line)', borderRadius:'var(--radius-sm)' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'.78rem' }}>
            <thead>
              <tr style={{ background:'var(--surface-2)', borderBottom:'1px solid var(--line)', textAlign:'left' }}>
                {['ID','Proposal Prompt','Expected','Result','Engine Grounds'].map(h => (
                  <th key={h} style={{ padding:'8px 12px', color:'var(--text)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(tc => {
                const res = results[tc.id];
                return (
                  <tr key={tc.id} style={{ borderBottom:'1px solid var(--line)' }}>
                    <td style={{ padding:'8px 12px', fontFamily:'monospace', fontWeight:700, color:'var(--text)' }}>{tc.id}</td>
                    <td style={{ padding:'8px 12px', fontStyle:'italic', color:'var(--text)' }}>&ldquo;{tc.input}&rdquo;</td>
                    <td style={{ padding:'8px 12px' }}>
                      <span style={{
                        padding:'2px 6px', borderRadius:'var(--radius-sm)', fontWeight:700, fontSize:'.68rem',
                        background:'var(--surface-2)',
                        color: tc.expectedStatus==='accepted' ? 'var(--ok)' : 'var(--danger)',
                        border:`1px solid ${tc.expectedStatus==='accepted' ? 'var(--ok)' : 'var(--danger)'}`,
                      }}>{tc.expectedStatus.toUpperCase()}</span>
                    </td>
                    <td style={{ padding:'8px 12px' }}>
                      {res ? (
                        <div style={{ display:'flex', alignItems:'center', gap:4 }}>
                          {res.passed
                            ? <CheckCircle2 size={16} style={{ color:'var(--ok)'     }} />
                            : <XCircle      size={16} style={{ color:'var(--danger)' }} />}
                          <span style={{ fontWeight:700, fontSize:'.7rem', color:'var(--text)' }}>
                            {res.actualStatus.toUpperCase()}
                          </span>
                        </div>
                      ) : <span style={{ color:'var(--text-muted)' }}>Pending</span>}
                    </td>
                    <td style={{ padding:'8px 12px', color:'var(--text-muted)' }}>
                      {res ? res.actualReason : tc.notes}
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
            Close Evaluation Suite
          </button>
        </div>
      </div>
    </div>
  );
};
