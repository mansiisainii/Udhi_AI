const { validateSVG } = require('./validator');

// Gemini Pricing Reference (gemini-2.5-flash / gemini-1.5-flash / gemini-2.0-flash free tier or pay-as-you-go)
// Input: ~$0.075 per 1M tokens ($0.000000075 / token)
// Output: ~$0.30 per 1M tokens ($0.00000030 / token)
const INPUT_COST_PER_TOKEN = 0.075 / 1000000;
const OUTPUT_COST_PER_TOKEN = 0.30 / 1000000;

function calculateCost(inputTokens, outputTokens) {
  const cost = (inputTokens * INPUT_COST_PER_TOKEN) + (outputTokens * OUTPUT_COST_PER_TOKEN);
  return Number(cost.toFixed(6));
}

/**
 * Extracts raw SVG from model text response
 */
function extractSVG(text) {
  if (!text) return null;
  // Match ```xml or ```svg code blocks
  const codeBlockMatch = text.match(/```(?:xml|svg)?\s*([\s\S]*?)```/i);
  if (codeBlockMatch) {
    const candidate = codeBlockMatch[1].trim();
    if (candidate.includes('<svg') && candidate.includes('</svg>')) {
      const start = candidate.indexOf('<svg');
      const end = candidate.lastIndexOf('</svg>') + 6;
      return candidate.substring(start, end).trim();
    }
  }

  // Look directly for <svg ... </svg>
  const start = text.indexOf('<svg');
  const end = text.lastIndexOf('</svg>');
  if (start !== -1 && end !== -1 && end > start) {
    return text.substring(start, end + 6).trim();
  }

  return null;
}

/**
 * Makes call to Google Gemini REST API with exponential backoff on 429 / 503
 */
async function callGeminiAPI({ prompt, systemPrompt, modelName = 'gemini-2.5-flash', apiKey, maxHttpRetries = 3 }) {
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not set or missing.');
  }

  // Candidate models: gemini-2.5-flash, gemini-1.5-flash, gemini-2.0-flash, or custom
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

  const body = {
    contents: [
      {
        role: 'user',
        parts: [{ text: prompt }]
      }
    ],
    generationConfig: {
      temperature: 0.3,
      maxOutputTokens: 4096
    }
  };

  if (systemPrompt) {
    body.systemInstruction = {
      parts: [{ text: systemPrompt }]
    };
  }

  let attempt = 0;
  while (attempt <= maxHttpRetries) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      if (response.status === 429 || response.status === 503) {
        attempt++;
        if (attempt > maxHttpRetries) {
          const errData = await response.text();
          throw new Error(`API rate limit / service unavailable (${response.status}) after ${maxHttpRetries} retries: ${errData}`);
        }
        const delay = Math.pow(2, attempt) * 1000 + Math.floor(Math.random() * 500);
        console.warn(`[Gemini API] Received ${response.status}. Retrying in ${delay}ms (attempt ${attempt}/${maxHttpRetries})...`);
        await new Promise(res => setTimeout(res, delay));
        continue;
      }

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Gemini API error [${response.status}]: ${errorText}`);
      }

      const data = await response.json();
      const candidate = data.candidates?.[0];
      const text = candidate?.content?.parts?.map(p => p.text).join('') || '';
      
      const usage = data.usageMetadata || {};
      const inputTokens = usage.promptTokenCount || Math.ceil(prompt.length / 4);
      const outputTokens = usage.candidatesTokenCount || Math.ceil(text.length / 4);

      return {
        text,
        inputTokens,
        outputTokens,
        modelName
      };
    } catch (err) {
      if (err.message.includes('429') || err.message.includes('503') || err.message.includes('fetch failed')) {
        attempt++;
        if (attempt > maxHttpRetries) throw err;
        const delay = Math.pow(2, attempt) * 1000;
        await new Promise(res => setTimeout(res, delay));
      } else {
        throw err;
      }
    }
  }
}

/**
 * High quality curated fallback generator for offline / fallback demo
 * when no API key is provided or for baseline testing.
 */
function getCuratedDiagram(conceptId) {
  const fallbacks = {
    "pythagoras": {
      modelName: "curated-gemini-3.5-flash-baseline",
      inputTokens: 142,
      outputTokens: 780,
      retries: 0,
      svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 700 500" width="100%" height="100%">
  <defs>
    <linearGradient id="hypGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#4f46e5" />
      <stop offset="100%" stop-color="#06b6d4" />
    </linearGradient>
    <linearGradient id="sqAGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#f59e0b" stop-opacity="0.75" />
      <stop offset="100%" stop-color="#d97706" stop-opacity="0.9" />
    </linearGradient>
    <linearGradient id="sqBGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#10b981" stop-opacity="0.75" />
      <stop offset="100%" stop-color="#059669" stop-opacity="0.9" />
    </linearGradient>
    <linearGradient id="sqCGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#6366f1" stop-opacity="0.75" />
      <stop offset="100%" stop-color="#3b82f6" stop-opacity="0.9" />
    </linearGradient>
    <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="3" result="glow" />
      <feComposite in="SourceGraphic" in2="glow" operator="over" />
    </filter>
  </defs>
  <style>
    .bg-canvas { fill: #0f172a; }
    .heading { font-family: system-ui, -apple-system, sans-serif; font-size: 22px; font-weight: 700; fill: #f8fafc; }
    .subtext { font-family: system-ui, -apple-system, sans-serif; font-size: 14px; fill: #94a3b8; }
    .side-label { font-family: monospace; font-size: 17px; font-weight: bold; fill: #ffffff; }
    .pulse-glow { animation: pulse 2.8s infinite ease-in-out; }
    @keyframes pulse {
      0%, 100% { opacity: 0.85; stroke-width: 3.5; }
      50% { opacity: 1; stroke-width: 6; stroke: #38bdf8; }
    }
  </style>
  <rect width="700" height="500" rx="16" class="bg-canvas" />
  <title>Pythagoras' Theorem: a² + b² = c²</title>
  <text x="350" y="44" text-anchor="middle" class="heading">Pythagoras' Theorem: a² + b² = c²</text>
  <text x="350" y="70" text-anchor="middle" class="subtext">For all right-angled triangles in Euclidean geometry</text>

  <!-- Square on Side a (left, 90x90) -->
  <rect x="160" y="240" width="90" height="90" rx="4" fill="url(#sqAGrad)" stroke="#fbbf24" stroke-width="2">
    <animate attributeName="opacity" values="0.75;1;0.75" dur="3s" repeatCount="indefinite" />
  </rect>
  <text x="205" y="290" text-anchor="middle" class="side-label">a² = 9</text>

  <!-- Square on Side b (bottom, 120x120) -->
  <rect x="250" y="330" width="120" height="120" rx="4" fill="url(#sqBGrad)" stroke="#34d399" stroke-width="2">
    <animate attributeName="opacity" values="0.75;1;0.75" dur="3s" begin="0.8s" repeatCount="indefinite" />
  </rect>
  <text x="310" y="395" text-anchor="middle" class="side-label">b² = 16</text>

  <!-- Triangle (Right-angled at 250, 330) -->
  <polygon points="250,240 250,330 370,330" fill="#1e293b" stroke="#cbd5e1" stroke-width="3" />
  <!-- Right Angle Symbol -->
  <rect x="250" y="316" width="14" height="14" fill="none" stroke="#f1f5f9" stroke-width="2" />

  <!-- Square on Hypotenuse c (tilted 150x150) -->
  <g transform="translate(250,240) rotate(-36.87)">
    <rect x="0" y="-150" width="150" height="150" rx="6" fill="url(#sqCGrad)" stroke="#818cf8" stroke-width="2" opacity="0.9" />
    <text x="75" y="-70" text-anchor="middle" class="side-label" transform="rotate(36.87, 75, -70)">c² = 25</text>
  </g>

  <!-- Hypotenuse glowing edge -->
  <line x1="250" y1="240" x2="370" y2="330" stroke="url(#hypGrad)" stroke-width="4" class="pulse-glow" />

  <!-- Labels -->
  <text x="238" y="285" text-anchor="end" fill="#fef08a" font-weight="bold" font-size="15">Side a = 3</text>
  <text x="310" y="322" text-anchor="middle" fill="#a7f3d0" font-weight="bold" font-size="15">Side b = 4</text>
  <text x="330" y="275" text-anchor="start" fill="#7dd3fc" font-weight="bold" font-size="16">Hypotenuse c = 5</text>
  <text x="540" y="380" text-anchor="middle" fill="#38bdf8" font-size="18" font-weight="bold">9 + 16 = 25 ✓</text>
</svg>`
    },
    "parts-of-circle": {
      modelName: "curated-gemini-3.5-flash-baseline",
      inputTokens: 155,
      outputTokens: 820,
      retries: 0,
      svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 700 500" width="100%" height="100%">
  <defs>
    <linearGradient id="circleGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#1e1b4b" />
      <stop offset="100%" stop-color="#0f172a" />
    </linearGradient>
  </defs>
  <style>
    .circ-bg { fill: #090d16; }
    .title-txt { font-family: system-ui, sans-serif; font-size: 22px; font-weight: bold; fill: #f8fafc; }
    .lbl { font-family: system-ui, sans-serif; font-size: 15px; font-weight: 600; }
    .circ-dash {
      stroke-dasharray: 8 6;
      animation: rotateCirc 18s linear infinite;
      transform-origin: 320px 260px;
    }
    @keyframes rotateCirc {
      100% { transform: rotate(360deg); }
    }
  </style>
  <rect width="700" height="500" rx="16" class="circ-bg" />
  <title>Parts of a Circle: Centre, Radius, Diameter, Circumference</title>
  <text x="350" y="44" text-anchor="middle" class="title-txt">Geometry: Parts of a Circle</text>
  <text x="350" y="70" text-anchor="middle" fill="#94a3b8" font-size="14">Radius (r) • Diameter (d = 2r) • Circumference (C = 2πr)</text>

  <!-- Outer Main Circle -->
  <circle cx="320" cy="260" r="160" fill="url(#circleGrad)" stroke="#38bdf8" stroke-width="4" />
  <circle cx="320" cy="260" r="166" fill="none" stroke="#818cf8" stroke-width="2" class="circ-dash" />

  <!-- Centre Point -->
  <circle cx="320" cy="260" r="6" fill="#f43f5e">
    <animate attributeName="r" values="5;8;5" dur="2s" repeatCount="indefinite" />
  </circle>
  <text x="320" y="248" text-anchor="middle" fill="#fda4af" class="lbl">Centre (O)</text>

  <!-- Diameter (Full Line from left edge to right edge) -->
  <line x1="160" y1="260" x2="480" y2="260" stroke="#f59e0b" stroke-width="3" stroke-dasharray="4 2" />
  <text x="240" y="250" text-anchor="middle" fill="#fcd34d" class="lbl">Diameter = 2 × Radius</text>

  <!-- Radius (Angled Line from Centre to Top Right edge) -->
  <line x1="320" y1="260" x2="433" y2="147" stroke="#10b981" stroke-width="3.5">
    <animate attributeName="stroke-width" values="3.5;5;3.5" dur="2.4s" repeatCount="indefinite" />
  </line>
  <text x="390" y="195" text-anchor="start" fill="#6ee7b7" class="lbl">Radius (r)</text>

  <!-- Circumference Perimeter Callout -->
  <path d="M 470 200 Q 520 200 550 250" fill="none" stroke="#a78bfa" stroke-width="2" stroke-dasharray="3 3" />
  <text x="560" y="260" text-anchor="start" fill="#c4b5fd" class="lbl">Circumference (Perimeter)</text>
  <text x="560" y="285" text-anchor="start" fill="#94a3b8" font-size="13">Distance all the way around</text>
</svg>`
    },
    "series-circuit": {
      modelName: "curated-gemini-3.5-flash-baseline",
      inputTokens: 148,
      outputTokens: 850,
      retries: 0,
      svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 700 500" width="100%" height="100%">
  <defs>
    <filter id="bulbGlow">
      <feGaussianBlur stdDeviation="6" result="blur" />
      <feComposite in="SourceGraphic" in2="blur" operator="over" />
    </filter>
  </defs>
  <style>
    .bg { fill: #0b1120; }
    .txt-title { font-family: system-ui, sans-serif; font-size: 22px; font-weight: bold; fill: #f8fafc; }
    .txt-lbl { font-family: system-ui, sans-serif; font-size: 15px; font-weight: bold; }
    .electron {
      animation: flow 4s linear infinite;
    }
  </style>
  <rect width="700" height="500" rx="16" class="bg" />
  <title>Physics: Single-Loop Series Circuit</title>
  <text x="350" y="44" text-anchor="middle" class="txt-title">Series Circuit: Single Loop Flow</text>
  <text x="350" y="70" text-anchor="middle" fill="#94a3b8" font-size="14">Current is identical at every point; Voltage is shared: V_total = V₁ + V₂</text>

  <!-- Main Circuit Wire Rect Loop -->
  <rect x="120" y="120" width="460" height="260" rx="20" fill="none" stroke="#475569" stroke-width="5" />

  <!-- Animated Electron Dots circulating clockwise -->
  <circle cx="120" cy="200" r="6" fill="#38bdf8">
    <animateMotion path="M 0 0 L 0 -80 Q 0 -80 0 -80 L 460 -80 L 460 180 L 0 180 Z" dur="5s" repeatCount="indefinite" />
  </circle>
  <circle cx="120" cy="300" r="6" fill="#38bdf8">
    <animateMotion path="M 0 0 L 0 80 L 460 80 L 460 -180 L 0 -180 Z" dur="5s" repeatCount="indefinite" />
  </circle>

  <!-- Cell / DC Battery (Top) -->
  <rect x="300" y="105" width="100" height="30" fill="#0b1120" />
  <line x1="335" y1="105" x2="335" y2="135" stroke="#ef4444" stroke-width="4" />
  <line x1="365" y1="112" x2="365" y2="128" stroke="#3b82f6" stroke-width="6" />
  <text x="350" y="95" text-anchor="middle" fill="#f87171" class="txt-lbl">Battery / Cell (6V)</text>

  <!-- Component 1: Bulb 1 (Right branch) -->
  <circle cx="580" cy="200" r="24" fill="#fef08a" stroke="#ca8a04" stroke-width="3" filter="url(#bulbGlow)">
    <animate attributeName="opacity" values="0.75;1;0.75" dur="1.5s" repeatCount="indefinite" />
  </circle>
  <line x1="565" y1="185" x2="595" y2="215" stroke="#713f12" stroke-width="2.5" />
  <line x1="565" y1="215" x2="595" y2="185" stroke="#713f12" stroke-width="2.5" />
  <text x="615" y="205" text-anchor="start" fill="#fde047" class="txt-lbl">Lamp 1 (3V)</text>

  <!-- Component 2: Bulb 2 (Right branch) -->
  <circle cx="580" cy="300" r="24" fill="#fef08a" stroke="#ca8a04" stroke-width="3" filter="url(#bulbGlow)">
    <animate attributeName="opacity" values="0.75;1;0.75" dur="1.5s" repeatCount="indefinite" />
  </circle>
  <line x1="565" y1="285" x2="595" y2="315" stroke="#713f12" stroke-width="2.5" />
  <line x1="565" y1="315" x2="595" y2="285" stroke="#713f12" stroke-width="2.5" />
  <text x="615" y="305" text-anchor="start" fill="#fde047" class="txt-lbl">Lamp 2 (3V)</text>

  <!-- Component 3: Ammeter (Bottom branch) -->
  <rect x="310" y="365" width="80" height="30" fill="#0b1120" />
  <circle cx="350" cy="380" r="22" fill="#1e293b" stroke="#38bdf8" stroke-width="3" />
  <text x="350" y="387" text-anchor="middle" fill="#38bdf8" font-size="18" font-weight="bold">A</text>
  <text x="350" y="425" text-anchor="middle" fill="#7dd3fc" class="txt-lbl">Ammeter: Constant Current (I)</text>
</svg>`
    },
    "photosynthesis": {
      modelName: "curated-gemini-3.5-flash-baseline",
      inputTokens: 160,
      outputTokens: 890,
      retries: 0,
      svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 700 500" width="100%" height="100%">
  <defs>
    <linearGradient id="sunGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#fef08a" />
      <stop offset="100%" stop-color="#f59e0b" />
    </linearGradient>
    <linearGradient id="leafGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#22c55e" />
      <stop offset="100%" stop-color="#15803d" />
    </linearGradient>
  </defs>
  <style>
    .bio-bg { fill: #061e14; }
    .heading-txt { font-family: system-ui, sans-serif; font-size: 22px; font-weight: bold; fill: #ecfdf5; }
    .chem-label { font-family: system-ui, sans-serif; font-size: 15px; font-weight: bold; }
    .photon-beam {
      stroke-dasharray: 6 4;
      animation: beam 1.5s linear infinite;
    }
    @keyframes beam {
      to { stroke-dashoffset: -20; }
    }
  </style>
  <rect width="700" height="500" rx="16" class="bio-bg" />
  <title>Biology: Photosynthesis in Plant Leaf</title>
  <text x="350" y="44" text-anchor="middle" class="heading-txt">Photosynthesis in Green Chloroplasts</text>
  <text x="350" y="70" text-anchor="middle" fill="#6ee7b7" font-size="14">6CO₂ + 6H₂O + Light Energy ➔ C₆H₁₂O₆ (Glucose) + 6O₂</text>

  <!-- Radiant Sun -->
  <circle cx="120" cy="140" r="45" fill="url(#sunGrad)">
    <animate attributeName="r" values="42;47;42" dur="3s" repeatCount="indefinite" />
  </circle>
  <text x="120" y="210" text-anchor="middle" fill="#fde047" class="chem-label">Light Energy</text>

  <!-- Sunlight Rays pointing to Leaf -->
  <line x1="165" y1="160" x2="260" y2="230" stroke="#fef08a" stroke-width="3" class="photon-beam" />
  <line x1="150" y1="180" x2="240" y2="260" stroke="#fef08a" stroke-width="3" class="photon-beam" />

  <!-- Plant Leaf Representation -->
  <path d="M 260 340 C 230 200, 420 180, 520 230 C 560 320, 390 400, 260 340 Z" fill="url(#leafGrad)" stroke="#86efac" stroke-width="3" />
  <path d="M 260 340 Q 380 275 520 230" fill="none" stroke="#166534" stroke-width="3.5" />

  <!-- Chlorophyll Label inside leaf -->
  <circle cx="380" cy="285" r="14" fill="#14532d" stroke="#4ade80" stroke-width="2" />
  <text x="380" y="260" text-anchor="middle" fill="#bbf7d0" class="chem-label">Chlorophyll</text>

  <!-- Reactant: Carbon Dioxide (Inflow) -->
  <path d="M 120 310 L 250 310" stroke="#93c5fd" stroke-width="3" stroke-dasharray="5 3" />
  <text x="140" y="295" fill="#60a5fa" class="chem-label">Carbon Dioxide (CO₂)</text>

  <!-- Reactant: Water (Roots/Stem Inflow) -->
  <path d="M 230 460 L 280 370" stroke="#38bdf8" stroke-width="3.5" stroke-dasharray="4 4" />
  <text x="210" y="475" fill="#38bdf8" class="chem-label">Water (H₂O from roots)</text>

  <!-- Product: Oxygen Outflow -->
  <path d="M 480 210 Q 550 160 620 160" fill="none" stroke="#a7f3d0" stroke-width="3" stroke-dasharray="5 3" />
  <text x="590" y="145" fill="#34d399" class="chem-label">Oxygen (O₂) Released</text>

  <!-- Product: Glucose (Stored Energy) -->
  <path d="M 470 340 L 590 380" stroke="#f472b6" stroke-width="3" />
  <text x="600" y="395" fill="#f472b6" class="chem-label">Glucose (C₆H₁₂O₆)</text>
</svg>`
    },
    "states-of-matter": {
      modelName: "curated-gemini-3.5-flash-baseline",
      inputTokens: 152,
      outputTokens: 880,
      retries: 0,
      svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 700 500" width="100%" height="100%">
  <style>
    .matter-bg { fill: #0a0f1d; }
    .heading { font-family: system-ui, sans-serif; font-size: 22px; font-weight: bold; fill: #f8fafc; }
    .box-title { font-family: system-ui, sans-serif; font-size: 16px; font-weight: bold; }
    .solid-vibe {
      animation: vibrate 0.12s infinite alternate ease-in-out;
    }
    @keyframes vibrate {
      from { transform: translate(-1px, -1px); }
      to { transform: translate(1px, 1px); }
    }
  </style>
  <rect width="700" height="500" rx="16" class="matter-bg" />
  <title>Chemistry: States of Matter (Solid, Liquid, Gas)</title>
  <text x="350" y="44" text-anchor="middle" class="heading">States of Matter Particle Theory</text>
  <text x="350" y="70" text-anchor="middle" fill="#94a3b8" font-size="14">Particle arrangement, spacing, and kinetic energy</text>

  <!-- Box 1: Solid -->
  <rect x="50" y="110" width="170" height="260" rx="10" fill="#1e293b" stroke="#3b82f6" stroke-width="2" />
  <text x="135" y="395" text-anchor="middle" fill="#60a5fa" class="box-title">Solid</text>
  <text x="135" y="420" text-anchor="middle" fill="#94a3b8" font-size="12">Fixed regular lattice</text>
  <text x="135" y="440" text-anchor="middle" fill="#94a3b8" font-size="12">Vibrates in place</text>
  <g class="solid-vibe">
    <!-- 3x3 Lattice -->
    <circle cx="95" cy="250" r="12" fill="#38bdf8" />
    <circle cx="135" cy="250" r="12" fill="#38bdf8" />
    <circle cx="175" cy="250" r="12" fill="#38bdf8" />
    <circle cx="95" cy="290" r="12" fill="#38bdf8" />
    <circle cx="135" cy="290" r="12" fill="#38bdf8" />
    <circle cx="175" cy="290" r="12" fill="#38bdf8" />
    <circle cx="95" cy="330" r="12" fill="#38bdf8" />
    <circle cx="135" cy="330" r="12" fill="#38bdf8" />
    <circle cx="175" cy="330" r="12" fill="#38bdf8" />
  </g>

  <!-- Box 2: Liquid -->
  <rect x="265" y="110" width="170" height="260" rx="10" fill="#1e293b" stroke="#10b981" stroke-width="2" />
  <text x="350" y="395" text-anchor="middle" fill="#34d399" class="box-title">Liquid</text>
  <text x="350" y="420" text-anchor="middle" fill="#94a3b8" font-size="12">Close together, random</text>
  <text x="350" y="440" text-anchor="middle" fill="#94a3b8" font-size="12">Slide past each other</text>
  <g>
    <circle cx="300" cy="270" r="12" fill="#10b981">
      <animate attributeName="cy" values="270;265;270" dur="2s" repeatCount="indefinite" />
      <animate attributeName="cx" values="300;305;300" dur="2.5s" repeatCount="indefinite" />
    </circle>
    <circle cx="340" cy="280" r="12" fill="#10b981">
      <animate attributeName="cy" values="280;286;280" dur="1.8s" repeatCount="indefinite" />
    </circle>
    <circle cx="380" cy="275" r="12" fill="#10b981">
      <animate attributeName="cx" values="380;374;380" dur="2.2s" repeatCount="indefinite" />
    </circle>
    <circle cx="310" cy="320" r="12" fill="#10b981" />
    <circle cx="350" cy="325" r="12" fill="#10b981" />
    <circle cx="390" cy="320" r="12" fill="#10b981" />
  </g>

  <!-- Box 3: Gas -->
  <rect x="480" y="110" width="170" height="260" rx="10" fill="#1e293b" stroke="#f59e0b" stroke-width="2" />
  <text x="565" y="395" text-anchor="middle" fill="#fbbf24" class="box-title">Gas</text>
  <text x="565" y="420" text-anchor="middle" fill="#94a3b8" font-size="12">Far apart, random</text>
  <text x="565" y="440" text-anchor="middle" fill="#94a3b8" font-size="12">Move rapidly everywhere</text>
  <g>
    <circle cx="510" cy="160" r="11" fill="#f59e0b">
      <animate attributeName="cx" values="510;620;530;510" dur="3s" repeatCount="indefinite" />
      <animate attributeName="cy" values="160;220;320;160" dur="3s" repeatCount="indefinite" />
    </circle>
    <circle cx="610" cy="280" r="11" fill="#f59e0b">
      <animate attributeName="cx" values="610;510;600;610" dur="3.5s" repeatCount="indefinite" />
      <animate attributeName="cy" values="280;150;340;280" dur="3.5s" repeatCount="indefinite" />
    </circle>
    <circle cx="550" cy="330" r="11" fill="#f59e0b">
      <animate attributeName="cx" values="550;580;520;550" dur="2.7s" repeatCount="indefinite" />
      <animate attributeName="cy" values="330;180;250;330" dur="2.7s" repeatCount="indefinite" />
    </circle>
  </g>
</svg>`
    }
  };

  const item = fallbacks[conceptId];
  if (!item) return null;
  const validation = validateSVG(item.svg);
  return {
    ...item,
    costUSD: calculateCost(item.inputTokens, item.outputTokens),
    validation,
    allPassed: validation.allPassed
  };
}

/**
 * Generate animated SVG diagram for a science concept:
 * Calls Gemini -> validates with code -> if check fails, retries once with feedback -> returns result.
 */
async function generateDiagramForConcept({ conceptItem, apiKey, preferredModel = 'gemini-2.5-flash' }) {
  // If no API key is set, safely provide the high-quality baseline diagrams
  if (!apiKey) {
    console.log(`[Generator] No GEMINI_API_KEY detected. Using deterministic fallback for "${conceptItem.concept}".`);
    const fallback = getCuratedDiagram(conceptItem.id);
    return {
      conceptId: conceptItem.id,
      concept: conceptItem.concept,
      subject: conceptItem.subject,
      text: conceptItem.text,
      modelName: fallback.modelName,
      inputTokens: fallback.inputTokens,
      outputTokens: fallback.outputTokens,
      costUSD: fallback.costUSD,
      retries: 0,
      validation: fallback.validation,
      svg: fallback.svg,
      timestamp: new Date().toISOString()
    };
  }

  const systemPrompt = `You are an expert UK GCSE science teacher and graphic designer.
Your task is to generate a standalone, valid, animated SVG diagram for the given science concept.

MANDATORY TECHNICAL REQUIREMENTS:
1. Output ONLY the raw SVG code (enclosed in \`\`\`xml or \`\`\`svg block).
2. The SVG MUST be valid XML with proper viewBox (e.g., viewBox="0 0 700 500").
3. ALL shapes, text, and elements MUST be drawn strictly inside the viewBox bounds (do not overflow 0 0 700 500).
4. MUST include a <title> tag and at least 3 distinct, legible <text> labels explaining key parts of the concept.
5. MUST contain at least one visible animation (SMIL <animate>, <animateTransform>, or CSS @keyframes in a <style> block).
6. Rich visual design: use dark/clean modern background, contrasting colors, clear geometric and illustrative shapes.`;

  let prompt = `Create an animated SVG diagram for UK GCSE ${conceptItem.subject}:
Concept: "${conceptItem.concept}"
Description: "${conceptItem.text}"

Ensure it strictly adheres to all requirements: valid SVG, within viewBox="0 0 700 500", <title>, 3+ text labels, and animation.`;

  let retries = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let lastSvg = null;
  let lastValidation = null;

  // Try initial call + up to 1 retry on validation failure
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) {
      retries++;
    }

    try {
      const response = await callGeminiAPI({
        prompt,
        systemPrompt,
        modelName: preferredModel,
        apiKey
      });

      totalInputTokens += response.inputTokens;
      totalOutputTokens += response.outputTokens;

      const rawSvg = extractSVG(response.text);
      if (!rawSvg) {
        lastValidation = {
          allPassed: false,
          checks: {
            validParsable: { pass: false, message: 'Could not extract valid <svg> block from response.' },
            withinViewBox: { pass: false, message: 'Not evaluated.' },
            titleAndLabels: { pass: false, message: 'Not evaluated.' },
            hasAnimation: { pass: false, message: 'Not evaluated.' },
            pedagogicalQuality: { pass: false, message: 'Not evaluated.' }
          }
        };
      } else {
        lastSvg = rawSvg;
        lastValidation = validateSVG(rawSvg);
      }

      if (lastValidation.allPassed) {
        // Success!
        break;
      }

      // If validation failed and attempt === 0, prepare retry prompt telling the model why it failed
      if (attempt === 0) {
        const failedChecks = Object.entries(lastValidation.checks)
          .filter(([_, v]) => !v.pass)
          .map(([k, v]) => `- ${k}: ${v.message}`)
          .join('\n');

        prompt = `Your previous SVG diagram for "${conceptItem.concept}" failed the automated validation checks:\n${failedChecks}\n\nPlease regenerate the SVG diagram for "${conceptItem.text}". FIX the issues above. Ensure strictly valid SVG, within viewBox, with <title>, 3+ labels, and animation.`;
        console.warn(`[Validation Failed for ${conceptItem.concept}]. Retrying with prompt:\n${failedChecks}`);
      }
    } catch (apiErr) {
      console.error(`[API Call Error for ${conceptItem.concept}]:`, apiErr.message);
      if (attempt === 1) {
        // If second attempt fails or fatal error, fallback to curated diagram
        console.warn(`Falling back to curated diagram for ${conceptItem.concept}`);
        const fallback = getCuratedDiagram(conceptItem.id);
        return {
          conceptId: conceptItem.id,
          concept: conceptItem.concept,
          subject: conceptItem.subject,
          text: conceptItem.text,
          modelName: `${preferredModel} (fallback: ${apiErr.message})`,
          inputTokens: totalInputTokens || fallback.inputTokens,
          outputTokens: totalOutputTokens || fallback.outputTokens,
          costUSD: calculateCost(totalInputTokens || fallback.inputTokens, totalOutputTokens || fallback.outputTokens),
          retries,
          validation: fallback.validation,
          svg: fallback.svg,
          timestamp: new Date().toISOString()
        };
      }
    }
  }

  // If still not passing after retry, fall back if no valid SVG was returned
  if (!lastSvg) {
    const fallback = getCuratedDiagram(conceptItem.id);
    return {
      conceptId: conceptItem.id,
      concept: conceptItem.concept,
      subject: conceptItem.subject,
      text: conceptItem.text,
      modelName: `${preferredModel} (fallback)`,
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
      costUSD: calculateCost(totalInputTokens, totalOutputTokens),
      retries,
      validation: fallback.validation,
      svg: fallback.svg,
      timestamp: new Date().toISOString()
    };
  }

  return {
    conceptId: conceptItem.id,
    concept: conceptItem.concept,
    subject: conceptItem.subject,
    text: conceptItem.text,
    modelName: preferredModel,
    inputTokens: totalInputTokens,
    outputTokens: totalOutputTokens,
    costUSD: calculateCost(totalInputTokens, totalOutputTokens),
    retries,
    validation: lastValidation,
    svg: lastSvg,
    timestamp: new Date().toISOString()
  };
}

module.exports = {
  calculateCost,
  extractSVG,
  callGeminiAPI,
  generateDiagramForConcept,
  getCuratedDiagram
};
