import { useState, useEffect, useRef, useCallback } from "react";

// ─── ECG Signal Engine ────────────────────────────────────────────────────────

function gaussiana(t, A, mu, sigma) {
  return A * Math.exp(-((t - mu) ** 2) / (2 * sigma ** 2));
}

function generarCiclo(t_rel, params) {
  let v = 0;
  const ondas = params.ondas;
  for (const o of ondas) {
    v += gaussiana(t_rel, o.A, o.mu, o.sigma);
  }
  return v;
}

const RITMOS = {
  normal: {
    nombre: "Ritmo Sinusal Normal",
    bpm: 75,
    color: "#00e5ff",
    ondas: [
      { A: 0.15,  mu: 0.16,  sigma: 0.025 },
      { A: -0.10, mu: 0.20,  sigma: 0.008 },
      { A: 1.00,  mu: 0.220, sigma: 0.006 },
      { A: -0.25, mu: 0.245, sigma: 0.008 },
      { A: 0.20,  mu: 0.38,  sigma: 0.030 },
      { A: 0.04,  mu: 0.50,  sigma: 0.018 },
    ],
  },
  taquicardia: {
    nombre: "Taquicardia Sinusal",
    bpm: 130,
    color: "#ff6b35",
    ondas: [
      { A: 0.12,  mu: 0.10,  sigma: 0.020 },
      { A: -0.08, mu: 0.135, sigma: 0.006 },
      { A: 1.00,  mu: 0.150, sigma: 0.005 },
      { A: -0.22, mu: 0.165, sigma: 0.006 },
      { A: 0.18,  mu: 0.27,  sigma: 0.025 },
    ],
  },
  bradicardia: {
    nombre: "Bradicardia Sinusal",
    bpm: 42,
    color: "#a78bfa",
    ondas: [
      { A: 0.18,  mu: 0.20,  sigma: 0.030 },
      { A: -0.10, mu: 0.28,  sigma: 0.008 },
      { A: 1.00,  mu: 0.30,  sigma: 0.007 },
      { A: -0.28, mu: 0.325, sigma: 0.009 },
      { A: 0.22,  mu: 0.56,  sigma: 0.040 },
      { A: 0.05,  mu: 0.72,  sigma: 0.020 },
    ],
  },
  fibrilacion: {
    nombre: "Fibrilación Auricular",
    bpm: 95,
    color: "#f43f5e",
    ondas: [
      { A: -0.10, mu: 0.18,  sigma: 0.008 },
      { A: 0.90,  mu: 0.20,  sigma: 0.006 },
      { A: -0.22, mu: 0.218, sigma: 0.007 },
      { A: 0.14,  mu: 0.38,  sigma: 0.035 },
    ],
    fibWaves: true,
  },
  bloqueoAV: {
    nombre: "Bloqueo AV 1°",
    bpm: 65,
    color: "#fbbf24",
    ondas: [
      { A: 0.15,  mu: 0.08,  sigma: 0.025 },
      { A: -0.10, mu: 0.28,  sigma: 0.008 },
      { A: 1.00,  mu: 0.30,  sigma: 0.006 },
      { A: -0.25, mu: 0.320, sigma: 0.008 },
      { A: 0.20,  mu: 0.50,  sigma: 0.030 },
    ],
  },
  ventriculoPremaduro: {
    nombre: "Latido Ventricular Prematuro",
    bpm: 72,
    color: "#34d399",
    ondas: [
      { A: 0.15,  mu: 0.16,  sigma: 0.025 },
      { A: -0.10, mu: 0.20,  sigma: 0.008 },
      { A: 1.00,  mu: 0.220, sigma: 0.006 },
      { A: -0.25, mu: 0.245, sigma: 0.008 },
      { A: 0.20,  mu: 0.38,  sigma: 0.030 },
    ],
    vpbInterval: 3,
  },
};

function generarSenal(fs, ritmoKey, duracion = 6, noiseLevel = 0.02, baselineDrift = 0.05) {
  const ritmo = RITMOS[ritmoKey];
  const bpm = ritmo.bpm;
  const N = Math.floor(fs * duracion);
  const signal = new Float32Array(N);
  const cicloS = 60 / bpm;

  let vpbCount = 0;

  for (let i = 0; i < N; i++) {
    const t = i / fs;
    const tCiclo = t % cicloS;
    const numCiclo = Math.floor(t / cicloS);

    // Fibrilación auricular: ondas f irregulares
    let baseOndas = ritmo.ondas;
    let cicloActual = cicloS;

    if (ritmo.fibWaves) {
      const fibNoise = 0.06 * Math.sin(2 * Math.PI * 6 * t) +
                       0.04 * Math.sin(2 * Math.PI * 7.3 * t) +
                       0.03 * Math.sin(2 * Math.PI * 8.7 * t);
      signal[i] += fibNoise;
      // Intervalos RR irregulares
      cicloActual = cicloS * (0.8 + 0.4 * Math.abs(Math.sin(numCiclo * 1.618)));
    }

    // Latido ventricular prematuro (cada N ciclos)
    if (ritmo.vpbInterval && numCiclo % ritmo.vpbInterval === ritmo.vpbInterval - 1) {
      // Complejo QRS ancho
      baseOndas = [
        { A: -0.05, mu: 0.18, sigma: 0.015 },
        { A: 0.80,  mu: 0.21, sigma: 0.015 },
        { A: -0.60, mu: 0.26, sigma: 0.015 },
        { A: -0.18, mu: 0.44, sigma: 0.045 },
      ];
    } else if (ritmo.vpbInterval) {
      baseOndas = ritmo.ondas;
    }

    const tRel = tCiclo / cicloActual * cicloS;
    signal[i] += generarCiclo(tRel, { ondas: baseOndas });

    // Ruido blanco
    signal[i] += noiseLevel * (Math.random() * 2 - 1);

    // Deriva de línea base (respiración ~0.25 Hz)
    signal[i] += baselineDrift * Math.sin(2 * Math.PI * 0.25 * t);
  }

  return signal;
}

// ─── Filtros digitales (Butterworth simplificado IIR) ─────────────────────────

function butterLowpass(signal, cutoff, fs, order = 2) {
  const wc = 2 * Math.PI * cutoff / fs;
  const k = wc / Math.tan(wc / 2);
  const k2 = k * k;
  const sqrt2k = Math.SQRT2 * k;
  const b0 = 1 / (k2 + sqrt2k + 1);
  const b1 = 2 * b0;
  const b2 = b0;
  const a1 = 2 * b0 * (1 - k2);
  const a2 = b0 * (k2 - sqrt2k + 1);

  const out = new Float32Array(signal.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < signal.length; i++) {
    const x0 = signal[i];
    const y0 = b0 * x0 + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    out[i] = y0;
    x2 = x1; x1 = x0;
    y2 = y1; y1 = y0;
  }
  return out;
}

function butterHighpass(signal, cutoff, fs) {
  const wc = 2 * Math.PI * cutoff / fs;
  const k = Math.tan(wc / 2);
  const k2 = k * k;
  const sqrt2k = Math.SQRT2 * k;
  const norm = 1 / (1 + sqrt2k + k2);
  const b0 = norm;
  const b1 = -2 * norm;
  const b2 = norm;
  const a1 = 2 * norm * (k2 - 1);
  const a2 = norm * (1 - sqrt2k + k2);

  const out = new Float32Array(signal.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < signal.length; i++) {
    const x0 = signal[i];
    const y0 = b0 * x0 + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    out[i] = y0;
    x2 = x1; x1 = x0;
    y2 = y1; y1 = y0;
  }
  return out;
}

function notchFilter(signal, f0, fs, Q = 30) {
  const w0 = 2 * Math.PI * f0 / fs;
  const bw = w0 / Q;
  const gb = Math.cos(w0);
  const k = Math.tan(bw / 2);
  const norm = 1 / (1 + k);
  const b0 = norm;
  const b1 = -2 * gb * norm;
  const b2 = norm;
  const a1 = -2 * gb * norm;
  const a2 = (1 - k) * norm;

  const out = new Float32Array(signal.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < signal.length; i++) {
    const x0 = signal[i];
    const y0 = b0 * x0 + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    out[i] = y0;
    x2 = x1; x1 = x0;
    y2 = y1; y1 = y0;
  }
  return out;
}

function filtrarSenal(signal, fs, hp = 0.5, lp = 40) {
  let s = butterHighpass(signal, hp, fs);
  s = butterLowpass(s, lp, fs);
  s = notchFilter(s, 60, fs);
  return s;
}

// ─── Detección de picos R ─────────────────────────────────────────────────────

function detectarPicosR(signal, fs) {
  const minDist = Math.round(0.25 * fs);
  let maxVal = -Infinity;
  for (let i = 0; i < signal.length; i++) if (signal[i] > maxVal) maxVal = signal[i];
  const threshold = 0.55 * maxVal;

  const picos = [];
  for (let i = 1; i < signal.length - 1; i++) {
    if (signal[i] > threshold &&
        signal[i] >= signal[i - 1] &&
        signal[i] >= signal[i + 1]) {
      if (picos.length === 0 || i - picos[picos.length - 1] > minDist) {
        picos.push(i);
      }
    }
  }
  return picos;
}

// ─── Análisis ─────────────────────────────────────────────────────────────────

function analizar(signal, fs, picosR) {
  if (picosR.length < 2) return null;

  const rrMs = [];
  for (let i = 1; i < picosR.length; i++) {
    rrMs.push(((picosR[i] - picosR[i - 1]) / fs) * 1000);
  }

  const fcInst = rrMs.map(rr => 60000 / rr);
  const fcMedia = fcInst.reduce((a, b) => a + b, 0) / fcInst.length;
  const rrMedio = rrMs.reduce((a, b) => a + b, 0) / rrMs.length;

  const sdnn = Math.sqrt(rrMs.reduce((acc, rr) => acc + (rr - rrMedio) ** 2, 0) / rrMs.length);
  const diffs = rrMs.slice(1).map((rr, i) => rr - rrMs[i]);
  const rmssd = Math.sqrt(diffs.reduce((acc, d) => acc + d * d, 0) / diffs.length);
  const pnn50 = (diffs.filter(d => Math.abs(d) > 50).length / diffs.length) * 100;

  // Duración QRS estimada
  const winMs = 80;
  const winN = Math.round((winMs / 1000) * fs);
  const qrsDurs = [];
  for (const pR of picosR) {
    const start = Math.max(0, pR - winN);
    const end = Math.min(signal.length - 1, pR + winN);
    let maxDeriv = 0;
    for (let j = start; j < end - 1; j++) {
      const d = Math.abs(signal[j + 1] - signal[j]);
      if (d > maxDeriv) maxDeriv = d;
    }
    const thr = 0.15 * maxDeriv;
    let count = 0;
    for (let j = start; j < end - 1; j++) {
      if (Math.abs(signal[j + 1] - signal[j]) > thr) count++;
    }
    qrsDurs.push((count / fs) * 1000);
  }
  const qrsMs = qrsDurs.reduce((a, b) => a + b, 0) / qrsDurs.length;

  const qtMs = 400 * Math.sqrt(rrMedio / 1000);
  const qtcMs = qtMs / Math.sqrt(rrMedio / 1000);

  let ritmo = "Ritmo Sinusal Normal";
  if (fcMedia > 100) ritmo = "Taquicardia Sinusal";
  else if (fcMedia < 60) ritmo = "Bradicardia Sinusal";

  const sdnnRatio = rrMs.reduce((acc, rr, i, arr) => {
    if (i === 0) return acc;
    return acc + Math.abs(rr - arr[i - 1]);
  }, 0) / (rrMs.length - 1);

  if (sdnnRatio > 80) ritmo = "Posible Fibrilación Auricular";

  return {
    fcMedia: fcMedia.toFixed(1),
    rrMedio: rrMedio.toFixed(1),
    qrsMs: qrsMs.toFixed(1),
    qtMs: qtMs.toFixed(1),
    qtcMs: qtcMs.toFixed(1),
    sdnn: sdnn.toFixed(2),
    rmssd: rmssd.toFixed(2),
    pnn50: pnn50.toFixed(1),
    fcInst,
    rrMs,
    ritmo,
    picosR,
  };
}

// ─── PSD (Welch simplificado) ─────────────────────────────────────────────────

function calcularPSD(signal, fs) {
  const N = 512;
  const step = Math.floor(signal.length / (N * 2));
  const freqs = [];
  const power = [];

  for (let k = 0; k < N / 2; k++) {
    const f = (k * fs) / N;
    let re = 0, im = 0;
    for (let n = 0; n < N; n++) {
      const idx = Math.min(n * step, signal.length - 1);
      const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * n) / N);
      re += signal[idx] * w * Math.cos((2 * Math.PI * k * n) / N);
      im -= signal[idx] * w * Math.sin((2 * Math.PI * k * n) / N);
    }
    freqs.push(f);
    power.push(10 * Math.log10((re * re + im * im) / N + 1e-10));
  }

  return { freqs, power };
}

// ─── Canvas Renderer ──────────────────────────────────────────────────────────

function drawECG(canvas, signal, picosR, color, label, fs, showGrid = true) {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const W = canvas.width;
  const H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  // Background
  ctx.fillStyle = "#0a0f1e";
  ctx.fillRect(0, 0, W, H);

  // Grid
  if (showGrid) {
    ctx.strokeStyle = "rgba(0,229,255,0.06)";
    ctx.lineWidth = 0.5;
    const cols = 20, rows = 8;
    for (let i = 0; i <= cols; i++) {
      ctx.beginPath();
      ctx.moveTo((i / cols) * W, 0);
      ctx.lineTo((i / cols) * W, H);
      ctx.stroke();
    }
    for (let j = 0; j <= rows; j++) {
      ctx.beginPath();
      ctx.moveTo(0, (j / rows) * H);
      ctx.lineTo(W, (j / rows) * H);
      ctx.stroke();
    }
    // Major grid
    ctx.strokeStyle = "rgba(0,229,255,0.12)";
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      ctx.beginPath();
      ctx.moveTo((i / 4) * W, 0);
      ctx.lineTo((i / 4) * W, H);
      ctx.stroke();
    }
    for (let j = 0; j <= 4; j++) {
      ctx.beginPath();
      ctx.moveTo(0, (j / 4) * H);
      ctx.lineTo(W, (j / 4) * H);
      ctx.stroke();
    }
  }

  if (!signal || signal.length === 0) return;

  let mn = Infinity, mx = -Infinity;
  for (let i = 0; i < signal.length; i++) {
    if (signal[i] < mn) mn = signal[i];
    if (signal[i] > mx) mx = signal[i];
  }
  const pad = (mx - mn) * 0.15 || 0.1;
  const vmin = mn - pad, vmax = mx + pad;

  const toX = (i) => (i / (signal.length - 1)) * W;
  const toY = (v) => H - ((v - vmin) / (vmax - vmin)) * H;

  // Glow effect
  ctx.shadowBlur = 12;
  ctx.shadowColor = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.8;
  ctx.lineJoin = "round";
  ctx.beginPath();
  for (let i = 0; i < signal.length; i++) {
    const x = toX(i), y = toY(signal[i]);
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Picos R
  if (picosR) {
    ctx.fillStyle = "#ff4444";
    ctx.shadowBlur = 8;
    ctx.shadowColor = "#ff4444";
    for (const p of picosR) {
      const x = toX(p), y = toY(signal[p]);
      ctx.beginPath();
      ctx.arc(x, y - 6, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.shadowBlur = 0;
  }

  // Label
  ctx.fillStyle = "rgba(255,255,255,0.5)";
  ctx.font = "11px 'Courier New'";
  ctx.fillText(label, 10, 16);
}

function drawBarChart(canvas, labels, values, color, yLabel) {
  if (!canvas || !values.length) return;
  const ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = "#0a0f1e";
  ctx.fillRect(0, 0, W, H);

  const pad = { left: 45, right: 10, top: 15, bottom: 30 };
  const cW = W - pad.left - pad.right;
  const cH = H - pad.top - pad.bottom;

  const mn = Math.min(...values) * 0.95;
  const mx = Math.max(...values) * 1.05;
  const toY = (v) => pad.top + cH - ((v - mn) / (mx - mn)) * cH;

  // Axes
  ctx.strokeStyle = "rgba(255,255,255,0.2)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(pad.left, pad.top);
  ctx.lineTo(pad.left, pad.top + cH);
  ctx.lineTo(pad.left + cW, pad.top + cH);
  ctx.stroke();

  // Bars
  const barW = Math.min(cW / values.length * 0.6, 30);
  for (let i = 0; i < values.length; i++) {
    const x = pad.left + (i + 0.5) * (cW / values.length) - barW / 2;
    const y = toY(values[i]);
    const bH = pad.top + cH - y;

    ctx.fillStyle = color + "33";
    ctx.fillRect(x, y, barW, bH);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x, y, barW, bH);

    // Value label
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    ctx.font = "9px Courier New";
    ctx.textAlign = "center";
    ctx.fillText(values[i].toFixed(0), x + barW / 2, y - 3);
  }

  // Y axis label
  ctx.fillStyle = "rgba(255,255,255,0.4)";
  ctx.font = "10px Courier New";
  ctx.textAlign = "left";
  ctx.save();
  ctx.translate(10, H / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText(yLabel, -30, 0);
  ctx.restore();
}

function drawPSD(canvas, freqs, power) {
  if (!canvas || !freqs.length) return;
  const ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = "#0a0f1e";
  ctx.fillRect(0, 0, W, H);

  const fmax = 80;
  const subset = freqs.map((f, i) => ({ f, p: power[i] })).filter(d => d.f <= fmax);
  if (!subset.length) return;

  const mn = Math.min(...subset.map(d => d.p));
  const mx = Math.max(...subset.map(d => d.p));
  const toX = (f) => (f / fmax) * W;
  const toY = (p) => H - ((p - mn) / (mx - mn)) * (H * 0.85) - H * 0.05;

  // Fill under curve
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, "rgba(0,229,255,0.3)");
  grad.addColorStop(1, "rgba(0,229,255,0)");
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(toX(subset[0].f), H);
  for (const d of subset) ctx.lineTo(toX(d.f), toY(d.p));
  ctx.lineTo(toX(subset[subset.length - 1].f), H);
  ctx.closePath();
  ctx.fill();

  // Line
  ctx.strokeStyle = "#00e5ff";
  ctx.lineWidth = 1.5;
  ctx.shadowBlur = 6;
  ctx.shadowColor = "#00e5ff";
  ctx.beginPath();
  for (let i = 0; i < subset.length; i++) {
    const x = toX(subset[i].f), y = toY(subset[i].p);
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Freq markers
  [0.5, 40, 60].forEach((f, i) => {
    const colors = ["#fbbf24", "#f43f5e", "#a78bfa"];
    if (f <= fmax) {
      ctx.strokeStyle = colors[i];
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(toX(f), 0);
      ctx.lineTo(toX(f), H);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = colors[i];
      ctx.font = "10px Courier New";
      ctx.fillText(`${f}Hz`, toX(f) + 2, 12);
    }
  });

  // Axis label
  ctx.fillStyle = "rgba(255,255,255,0.4)";
  ctx.font = "10px Courier New";
  ctx.fillText("PSD (dB/Hz)", 4, H - 4);
}

// ─── Components ───────────────────────────────────────────────────────────────

function MetricCard({ label, value, unit, normal, status }) {
  const statusColor = status === "ok" ? "#34d399" : status === "warn" ? "#fbbf24" : "#f43f5e";
  return (
    <div style={{
      background: "rgba(255,255,255,0.04)",
      border: `1px solid ${statusColor}33`,
      borderRadius: 8,
      padding: "10px 14px",
      minWidth: 120,
    }}>
      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", letterSpacing: 1, textTransform: "uppercase", fontFamily: "Courier New" }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, color: statusColor, fontFamily: "Courier New", lineHeight: 1.2, marginTop: 2 }}>
        {value}<span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginLeft: 3 }}>{unit}</span>
      </div>
      {normal && <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", marginTop: 2, fontFamily: "Courier New" }}>Normal: {normal}</div>}
    </div>
  );
}

function CanvasPanel({ title, canvasRef, height = 120 }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", fontFamily: "Courier New", letterSpacing: 1, marginBottom: 4, textTransform: "uppercase" }}>
        {title}
      </div>
      <canvas
        ref={canvasRef}
        width={800}
        height={height}
        style={{ width: "100%", height, borderRadius: 6, display: "block", border: "1px solid rgba(0,229,255,0.1)" }}
      />
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────

export default function ECGSimulator() {
  const FS = 500;

  const [ritmoKey, setRitmoKey] = useState("normal");
  const [noiseLevel, setNoiseLevel] = useState(0.02);
  const [baselineDrift, setBaselineDrift] = useState(0.05);
  const [filtrado, setFiltrado] = useState(true);
  const [resultado, setResultado] = useState(null);
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [activeTab, setActiveTab] = useState("senal");

  const canvasRaw   = useRef(null);
  const canvasFilt  = useRef(null);
  const canvasRR    = useRef(null);
  const canvasPSD   = useRef(null);

  const runSimulation = useCallback(() => {
    setIsRunning(true);
    setProgress(0);

    setTimeout(() => { setProgress(20); }, 50);

    setTimeout(() => {
      const raw = generarSenal(FS, ritmoKey, 6, noiseLevel, baselineDrift);
      setProgress(45);

      setTimeout(() => {
        const filt = filtrado ? filtrarSenal(raw, FS) : raw;
        setProgress(65);

        setTimeout(() => {
          const picosR = detectarPicosR(filt, FS);
          setProgress(80);

          setTimeout(() => {
            const res = analizar(filt, FS, picosR);
            const psd = calcularPSD(filt, FS);
            setProgress(100);

            setTimeout(() => {
              setResultado({ raw, filt, picosR, ...res, psd });
              setIsRunning(false);
              setProgress(0);
            }, 200);
          }, 100);
        }, 100);
      }, 100);
    }, 100);
  }, [ritmoKey, noiseLevel, baselineDrift, filtrado, FS]);

  // Draw on canvas whenever resultado changes
  useEffect(() => {
    if (!resultado) return;
    const color = RITMOS[ritmoKey].color;

    drawECG(canvasRaw.current,  resultado.raw,  null,            "#4a5568", "ECG Crudo (con ruido y deriva)", FS, true);
    drawECG(canvasFilt.current, resultado.filt, resultado.picosR, color,    "ECG Filtrado + Picos R",         FS, true);

    if (resultado.rrMs && resultado.rrMs.length > 0) {
      drawBarChart(canvasRR.current,
        resultado.rrMs.map((_, i) => `${i + 1}`),
        resultado.rrMs,
        color,
        "RR (ms)"
      );
    }

    if (resultado.psd) {
      drawPSD(canvasPSD.current, resultado.psd.freqs, resultado.psd.power);
    }
  }, [resultado, ritmoKey]);

  // Auto-run on mount
  useEffect(() => { runSimulation(); }, []);

  const ritmo = RITMOS[ritmoKey];
  const fcNum = resultado ? parseFloat(resultado.fcMedia) : 0;
  const fcStatus = fcNum >= 60 && fcNum <= 100 ? "ok" : "warn";
  const qrsNum = resultado ? parseFloat(resultado.qrsMs) : 0;
  const qrsStatus = qrsNum < 120 ? "ok" : "error";
  const qtcNum = resultado ? parseFloat(resultado.qtcMs) : 0;
  const qtcStatus = qtcNum < 440 ? "ok" : "error";

  return (
    <div style={{
      minHeight: "100vh",
      background: "#060b18",
      color: "white",
      fontFamily: "system-ui, sans-serif",
      padding: "0",
    }}>
      {/* Header */}
      <div style={{
        background: "linear-gradient(90deg, #0a0f1e 0%, #0d1933 50%, #0a0f1e 100%)",
        borderBottom: "1px solid rgba(0,229,255,0.15)",
        padding: "14px 24px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 8,
            background: "rgba(0,229,255,0.1)",
            border: "1px solid rgba(0,229,255,0.3)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 18
          }}>♥</div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: 0.5, color: "#00e5ff" }}>
              SIMULADOR ECG
            </div>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", letterSpacing: 1, fontFamily: "Courier New" }}>
              LAB. ELECTROMEDICINA · ING. REMOLINA
            </div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{
            padding: "4px 10px",
            borderRadius: 20,
            fontSize: 11,
            fontFamily: "Courier New",
            background: `${ritmo.color}22`,
            border: `1px solid ${ritmo.color}55`,
            color: ritmo.color,
          }}>{ritmo.nombre}</div>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", fontFamily: "Courier New" }}>
            Fs={FS} Hz
          </div>
        </div>
      </div>

      <div style={{ display: "flex", height: "calc(100vh - 65px)", overflow: "hidden" }}>

        {/* Left sidebar – Controls */}
        <div style={{
          width: 240,
          minWidth: 240,
          background: "#0a0f1e",
          borderRight: "1px solid rgba(0,229,255,0.08)",
          padding: "16px 14px",
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: 20,
        }}>

          {/* Ritmo selector */}
          <div>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", letterSpacing: 1, fontFamily: "Courier New", marginBottom: 8, textTransform: "uppercase" }}>
              Tipo de Ritmo
            </div>
            {Object.entries(RITMOS).map(([key, r]) => (
              <button key={key}
                onClick={() => setRitmoKey(key)}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  padding: "7px 10px",
                  borderRadius: 6,
                  border: ritmoKey === key ? `1px solid ${r.color}88` : "1px solid transparent",
                  background: ritmoKey === key ? `${r.color}18` : "transparent",
                  color: ritmoKey === key ? r.color : "rgba(255,255,255,0.5)",
                  fontSize: 11,
                  fontFamily: "Courier New",
                  cursor: "pointer",
                  marginBottom: 3,
                  transition: "all 0.15s",
                }}
              >
                <span style={{ marginRight: 6, fontSize: 8 }}>●</span>
                {r.nombre}
                <span style={{ float: "right", opacity: 0.6 }}>{r.bpm}</span>
              </button>
            ))}
          </div>

          {/* Sliders */}
          <div>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", letterSpacing: 1, fontFamily: "Courier New", marginBottom: 8, textTransform: "uppercase" }}>
              Parámetros
            </div>

            <label style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", fontFamily: "Courier New", display: "block", marginBottom: 4 }}>
              Ruido (SNR): {(20 * Math.log10(1 / (noiseLevel + 0.001))).toFixed(0)} dB
            </label>
            <input type="range" min="0" max="0.15" step="0.005" value={noiseLevel}
              onChange={e => setNoiseLevel(parseFloat(e.target.value))}
              style={{ width: "100%", accentColor: "#00e5ff", marginBottom: 10 }} />

            <label style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", fontFamily: "Courier New", display: "block", marginBottom: 4 }}>
              Deriva base: {baselineDrift.toFixed(3)} mV
            </label>
            <input type="range" min="0" max="0.2" step="0.005" value={baselineDrift}
              onChange={e => setBaselineDrift(parseFloat(e.target.value))}
              style={{ width: "100%", accentColor: "#00e5ff", marginBottom: 10 }} />

            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", marginTop: 4 }}>
              <input type="checkbox" checked={filtrado} onChange={e => setFiltrado(e.target.checked)}
                style={{ accentColor: "#00e5ff", width: 14, height: 14 }} />
              <span style={{ fontSize: 11, fontFamily: "Courier New", color: "rgba(255,255,255,0.6)" }}>
                Filtro activo (0.5-40 Hz)
              </span>
            </label>
          </div>

          {/* Run button */}
          <button
            onClick={runSimulation}
            disabled={isRunning}
            style={{
              width: "100%",
              padding: "11px",
              borderRadius: 8,
              border: "none",
              background: isRunning
                ? "rgba(0,229,255,0.1)"
                : "linear-gradient(135deg, #00e5ff22, #00b4d8aa)",
              color: "#00e5ff",
              fontFamily: "Courier New",
              fontSize: 13,
              fontWeight: 700,
              letterSpacing: 1,
              cursor: isRunning ? "not-allowed" : "pointer",
              boxShadow: isRunning ? "none" : "0 0 20px rgba(0,229,255,0.2)",
              transition: "all 0.2s",
            }}
          >
            {isRunning ? `PROCESANDO ${progress}%` : "▶  SIMULAR"}
          </button>

          {/* Progress bar */}
          {isRunning && (
            <div style={{ height: 3, background: "rgba(255,255,255,0.1)", borderRadius: 2 }}>
              <div style={{ height: "100%", width: `${progress}%`, background: "#00e5ff", borderRadius: 2, transition: "width 0.2s" }} />
            </div>
          )}

          {/* Info box */}
          <div style={{
            background: "rgba(0,229,255,0.04)",
            border: "1px solid rgba(0,229,255,0.12)",
            borderRadius: 8,
            padding: "10px 12px",
            fontSize: 10,
            fontFamily: "Courier New",
            color: "rgba(255,255,255,0.4)",
            lineHeight: 1.8,
          }}>
            <div>Fs = {FS} Hz</div>
            <div>Duración = 6 s</div>
            <div>Filtro: Butterworth BP</div>
            <div>Notch: 60 Hz</div>
            <div>Detección R: Pan-Tompkins</div>
            <div>HRV: SDNN, RMSSD, pNN50</div>
          </div>
        </div>

        {/* Main content */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px" }}>

          {/* Tabs */}
          <div style={{ display: "flex", gap: 4, marginBottom: 16 }}>
            {[
              { key: "senal",    label: "Señal ECG" },
              { key: "analisis", label: "Análisis" },
              { key: "hrv",      label: "HRV" },
              { key: "espectro", label: "Espectro" },
            ].map(tab => (
              <button key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                style={{
                  padding: "6px 16px",
                  borderRadius: 6,
                  border: activeTab === tab.key ? "1px solid rgba(0,229,255,0.4)" : "1px solid rgba(255,255,255,0.08)",
                  background: activeTab === tab.key ? "rgba(0,229,255,0.12)" : "transparent",
                  color: activeTab === tab.key ? "#00e5ff" : "rgba(255,255,255,0.4)",
                  fontSize: 12,
                  fontFamily: "Courier New",
                  cursor: "pointer",
                  letterSpacing: 0.5,
                }}
              >{tab.label}</button>
            ))}
          </div>

          {/* ── TAB: SEÑAL ── */}
          {activeTab === "senal" && (
            <>
              <CanvasPanel title="ECG Crudo — con ruido y deriva de línea base" canvasRef={canvasRaw} height={130} />
              <CanvasPanel title="ECG Filtrado (Butterworth 0.5–40 Hz + Notch 60 Hz) — Picos R detectados" canvasRef={canvasFilt} height={160} />

              {resultado && (
                <div style={{
                  background: "rgba(255,255,255,0.02)",
                  border: "1px solid rgba(0,229,255,0.1)",
                  borderRadius: 8,
                  padding: "12px 16px",
                  marginTop: 8,
                }}>
                  <div style={{ fontSize: 11, fontFamily: "Courier New", color: "rgba(255,255,255,0.4)", marginBottom: 8, textTransform: "uppercase", letterSpacing: 1 }}>
                    Diagnóstico automático
                  </div>
                  <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                    <div style={{
                      padding: "6px 14px",
                      borderRadius: 20,
                      background: `${ritmo.color}22`,
                      border: `1px solid ${ritmo.color}55`,
                      color: ritmo.color,
                      fontSize: 12,
                      fontFamily: "Courier New",
                      fontWeight: 700,
                    }}>♥ {resultado.ritmo}</div>
                    <div style={{
                      padding: "6px 14px",
                      borderRadius: 20,
                      background: qrsStatus === "ok" ? "#34d39922" : "#f43f5e22",
                      border: `1px solid ${qrsStatus === "ok" ? "#34d399" : "#f43f5e"}55`,
                      color: qrsStatus === "ok" ? "#34d399" : "#f43f5e",
                      fontSize: 12,
                      fontFamily: "Courier New",
                    }}>QRS {resultado.qrsMs} ms — {qrsStatus === "ok" ? "Normal" : "Ancho (bloqueo de rama)"}</div>
                    <div style={{
                      padding: "6px 14px",
                      borderRadius: 20,
                      background: qtcStatus === "ok" ? "#34d39922" : "#f43f5e22",
                      border: `1px solid ${qtcStatus === "ok" ? "#34d399" : "#f43f5e"}55`,
                      color: qtcStatus === "ok" ? "#34d399" : "#f43f5e",
                      fontSize: 12,
                      fontFamily: "Courier New",
                    }}>QTc {resultado.qtcMs} ms — {qtcStatus === "ok" ? "Normal" : "Prolongado (riesgo arritmia)"}</div>
                    <div style={{
                      padding: "6px 14px",
                      borderRadius: 20,
                      background: "#a78bfa22",
                      border: "1px solid #a78bfa55",
                      color: "#a78bfa",
                      fontSize: 12,
                      fontFamily: "Courier New",
                    }}>Picos R: {resultado.picosR.length}</div>
                  </div>
                </div>
              )}
            </>
          )}

          {/* ── TAB: ANÁLISIS ── */}
          {activeTab === "analisis" && resultado && (
            <>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 16 }}>
                <MetricCard label="FC Media" value={resultado.fcMedia} unit="lpm"   normal="60–100"     status={fcStatus} />
                <MetricCard label="RR Medio" value={resultado.rrMedio} unit="ms"    normal="600–1000"   status="ok" />
                <MetricCard label="Dur. QRS"  value={resultado.qrsMs}  unit="ms"    normal="< 120"      status={qrsStatus} />
                <MetricCard label="Int. PR"   value="160"              unit="ms"    normal="120–200"    status="ok" />
                <MetricCard label="Int. QT"   value={resultado.qtMs}   unit="ms"    normal="350–440"    status="ok" />
                <MetricCard label="QTc Bazett" value={resultado.qtcMs}  unit="ms"   normal="< 440"      status={qtcStatus} />
              </div>

              <CanvasPanel title="Intervalos RR (ms) — Variación latido a latido" canvasRef={canvasRR} height={140} />

              <div style={{
                background: "rgba(255,255,255,0.02)",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: 8,
                padding: 14,
                marginTop: 4,
              }}>
                <div style={{ fontSize: 11, fontFamily: "Courier New", color: "rgba(255,255,255,0.4)", marginBottom: 10, textTransform: "uppercase", letterSpacing: 1 }}>
                  Tabla Intervalos Clínicos
                </div>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, fontFamily: "Courier New" }}>
                  <thead>
                    <tr>
                      {["Parámetro", "Valor", "Unidad", "Normal", "Estado"].map(h => (
                        <th key={h} style={{ textAlign: "left", padding: "6px 12px", borderBottom: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.4)", fontWeight: 400, fontSize: 10, letterSpacing: 0.5 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      ["Frecuencia Cardiaca", resultado.fcMedia, "lpm", "60–100", fcStatus],
                      ["Intervalo RR medio", resultado.rrMedio, "ms", "600–1000", "ok"],
                      ["Duración QRS", resultado.qrsMs, "ms", "< 120", qrsStatus],
                      ["Intervalo PR", "160", "ms", "120–200", "ok"],
                      ["Intervalo QT", resultado.qtMs, "ms", "350–440", "ok"],
                      ["QTc (Bazett)", resultado.qtcMs, "ms", "< 440 hombres", qtcStatus],
                    ].map(([label, val, unit, norm, st]) => (
                      <tr key={label} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                        <td style={{ padding: "7px 12px", color: "rgba(255,255,255,0.7)" }}>{label}</td>
                        <td style={{ padding: "7px 12px", fontWeight: 700, color: st === "ok" ? "#34d399" : st === "warn" ? "#fbbf24" : "#f43f5e" }}>{val}</td>
                        <td style={{ padding: "7px 12px", color: "rgba(255,255,255,0.4)" }}>{unit}</td>
                        <td style={{ padding: "7px 12px", color: "rgba(255,255,255,0.35)" }}>{norm}</td>
                        <td style={{ padding: "7px 12px" }}>
                          <span style={{
                            fontSize: 10,
                            padding: "2px 8px",
                            borderRadius: 10,
                            background: st === "ok" ? "#34d39922" : st === "warn" ? "#fbbf2422" : "#f43f5e22",
                            color: st === "ok" ? "#34d399" : st === "warn" ? "#fbbf24" : "#f43f5e",
                            border: `1px solid ${st === "ok" ? "#34d39955" : st === "warn" ? "#fbbf2455" : "#f43f5e55"}`,
                          }}>{st === "ok" ? "Normal" : st === "warn" ? "Atención" : "Anormal"}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* ── TAB: HRV ── */}
          {activeTab === "hrv" && resultado && (
            <>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 16 }}>
                <MetricCard label="SDNN"  value={resultado.sdnn}  unit="ms"  normal="> 50"  status={parseFloat(resultado.sdnn) > 50 ? "ok" : "warn"} />
                <MetricCard label="RMSSD" value={resultado.rmssd} unit="ms"  normal="> 20"  status={parseFloat(resultado.rmssd) > 20 ? "ok" : "warn"} />
                <MetricCard label="pNN50" value={resultado.pnn50} unit="%"   normal="> 3%"  status={parseFloat(resultado.pnn50) > 3 ? "ok" : "warn"} />
              </div>

              <div style={{
                background: "rgba(255,255,255,0.02)",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: 8,
                padding: "14px 16px",
                marginBottom: 14,
                fontSize: 12,
                fontFamily: "Courier New",
                lineHeight: 2,
                color: "rgba(255,255,255,0.6)",
              }}>
                <div style={{ color: "#00e5ff", fontWeight: 700, marginBottom: 8, fontSize: 13 }}>Índices HRV — Dominio Temporal</div>
                <div><span style={{ color: "rgba(255,255,255,0.35)" }}>SDNN  :</span> Desviación estándar de intervalos NN. Refleja la variabilidad global. {parseFloat(resultado.sdnn) > 50 ? "✓ Saludable" : "⚠ Reducida"}</div>
                <div><span style={{ color: "rgba(255,255,255,0.35)" }}>RMSSD :</span> Raíz cuadrática de diferencias sucesivas. Refleja tono vagal. {parseFloat(resultado.rmssd) > 20 ? "✓ Normal" : "⚠ Bajo"}</div>
                <div><span style={{ color: "rgba(255,255,255,0.35)" }}>pNN50 :</span> % de diferencias {'>'} 50 ms. Marcador de actividad parasimpática. {parseFloat(resultado.pnn50) > 3 ? "✓ Normal" : "⚠ Bajo"}</div>
              </div>

              {resultado.rrMs && resultado.rrMs.length > 2 && (
                <div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", fontFamily: "Courier New", letterSpacing: 1, marginBottom: 6, textTransform: "uppercase" }}>
                    Tacograma (FC instantánea en lpm)
                  </div>
                  <div style={{
                    height: 130,
                    background: "#0a0f1e",
                    borderRadius: 6,
                    border: "1px solid rgba(0,229,255,0.1)",
                    padding: "10px 12px",
                    display: "flex",
                    alignItems: "flex-end",
                    gap: 3,
                  }}>
                    {resultado.fcInst.map((fc, i) => {
                      const mn = Math.min(...resultado.fcInst);
                      const mx = Math.max(...resultado.fcInst);
                      const h = mx === mn ? 50 : ((fc - mn) / (mx - mn)) * 80 + 10;
                      return (
                        <div key={i} title={`FC: ${fc.toFixed(1)} lpm`}
                          style={{
                            flex: 1,
                            height: `${h}%`,
                            background: `${ritmo.color}88`,
                            border: `1px solid ${ritmo.color}`,
                            borderRadius: "3px 3px 0 0",
                            minWidth: 8,
                            transition: "height 0.3s",
                            cursor: "default",
                          }}
                        />
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}

          {/* ── TAB: ESPECTRO ── */}
          {activeTab === "espectro" && resultado && (
            <>
              <CanvasPanel title="Densidad Espectral de Potencia — Welch PSD (dB/Hz)" canvasRef={canvasPSD} height={200} />
              <div style={{
                background: "rgba(255,255,255,0.02)",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: 8,
                padding: "14px 16px",
                marginTop: 8,
                fontSize: 12,
                fontFamily: "Courier New",
                lineHeight: 2,
                color: "rgba(255,255,255,0.6)",
              }}>
                <div style={{ color: "#00e5ff", fontWeight: 700, marginBottom: 6, fontSize: 13 }}>Componentes espectrales del ECG</div>
                <div>
                  <span style={{ color: "#fbbf24" }}>━━</span>
                  <span style={{ marginLeft: 8 }}>0.5 Hz — Corte inferior del filtro pasa-banda (elimina deriva respiratoria)</span>
                </div>
                <div>
                  <span style={{ color: "#f43f5e" }}>━━</span>
                  <span style={{ marginLeft: 8 }}>40 Hz — Corte superior del filtro pasa-banda (elimina ruido mioeléctrico)</span>
                </div>
                <div>
                  <span style={{ color: "#a78bfa" }}>━━</span>
                  <span style={{ marginLeft: 8 }}>60 Hz — Filtro notch (elimina interferencia de red eléctrica)</span>
                </div>
                <div style={{ marginTop: 8, color: "rgba(255,255,255,0.4)", fontSize: 10 }}>
                  La energía principal del ECG se concentra entre 0.5 Hz y 40 Hz. El complejo QRS aporta componentes entre 5–40 Hz; la onda P y T, entre 0.5–10 Hz.
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
