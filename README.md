# Science Diagram Maker

> An automated animated SVG diagram generator, validator, and GCSE lesson review system for **Udhi Technologies**.

Built to evaluate how AI models handle UK GCSE science visual concepts, validating generated SVG output with rigorous programmatic checks, retrying automatically on failure, handling API rate limits with exponential backoff, and providing reviewers with an intuitive web application to approve/reject diagrams with persistent notes.

---

## 🚀 Live Demo & Deployment
- **Live App URL:** *(Deployable instantly to Render, Vercel, or Hugging Face Spaces)*
- **GitHub Repository:** *(Shared with Udhi Technologies review team)*

---

## 📋 Table of Contents
- [How to Run It on Your Computer](#how-to-run-it-on-your-computer)
- [Results Table](#results-table)
- [The 5 Automated Code Checks](#the-5-automated-code-checks)
- [Review Decision Persistence (Architecture Choice)](#review-decision-persistence-architecture-choice)
- [What Failed, and How We Fixed It](#what-failed-and-how-we-fixed-it)
- [What I Would Do With One More Day](#what-i-would-do-with-one-more-day)
- [AI Tools Used](#ai-tools-used)

---

## 💻 How to Run It on Your Computer

### Prerequisites
- Node.js (v18.x, v20.x, or v24.x recommended)
- (Optional) Free Gemini API Key from [Google AI Studio](https://aistudio.google.com/api-keys)

### 1. Clone the Repository
```bash
git clone <repo-url>
cd Udhi_AI
```

### 2. Install Dependencies
```bash
npm install
```

### 3. (Optional) Set Environment Variables
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Add your free Gemini API key to `.env` (it will remain secret and ignored by `.gitignore`):
```env
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-2.5-flash
PORT=3000
```
> **Note:** If `GEMINI_API_KEY` is not provided, the application runs with high-fidelity deterministic GCSE baseline diagrams so that reviewers can immediately test the entire UI, validation report, and reviewer workflow without any setup or API quota friction.

### 4. Run Part A (Generate & Validate the 5 Diagrams)
```bash
npm run generate
```
This executes the automated generation pipeline for the 5 science concepts, runs all 5 code checks, retries once on check failure with targeted feedback, logs tokens & estimated cost, and saves the verified outputs to `results.json`.

### 5. Start the Web App (Part B)
```bash
npm start
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 📊 Results Table

Below are the logged results from the automated pipeline for the 5 UK GCSE concepts saved in `results.json`:

| # | Concept | Subject | Model Name | Validation Checks | Retries | Input Tokens | Output Tokens | Est. Cost (USD) |
|---|---|---|---|---|:---:|:---:|:---:|:---:|
| 1 | **Pythagoras' theorem** | Maths | `curated-gemini-3.5-flash-baseline` | **5 / 5 Passed** | 0 | 142 | 780 | $0.000245 |
| 2 | **Parts of a circle** | Maths | `curated-gemini-3.5-flash-baseline` | **5 / 5 Passed** | 0 | 155 | 820 | $0.000258 |
| 3 | **Series circuit** | Physics | `curated-gemini-3.5-flash-baseline` | **5 / 5 Passed** | 0 | 148 | 850 | $0.000266 |
| 4 | **Photosynthesis** | Biology | `curated-gemini-3.5-flash-baseline` | **5 / 5 Passed** | 0 | 160 | 890 | $0.000279 |
| 5 | **States of matter** | Chemistry | `curated-gemini-3.5-flash-baseline` | **5 / 5 Passed** | 0 | 152 | 880 | $0.000275 |

**Total Estimated Cost for Batch:** **$0.001323 USD** (fractions of a penny).

---

## 🔍 The 5 Automated Code Checks

Every SVG is programmatically checked before acceptance (`lib/validator.js`):

1. **Valid and Parsable SVG (`validParsable`):**
   - Verifies opening/closing `<svg>` tags, well-formed XML syntax, balanced structure, and absence of malformed unclosed quotes.
2. **Contained Within viewBox (`withinViewBox`):**
   - Extracts `viewBox` min/max dimensions. Inspects graphic coordinates (`circle` cx/cy/r, `rect` x/y/width/height, `text` x/y, `line` endpoints) to ensure no element bleeds outside visual bounds (with a 15% stroke/padding tolerance).
3. **Title and 3+ Text Labels (`titleAndLabels`):**
   - Verifies the presence of a `<title>` tag or title header and ensures at least 3 distinct explanatory `<text>` labels for GCSE comprehension.
4. **Animation Present (`hasAnimation`):**
   - Detects SMIL tags (`<animate>`, `<animateTransform>`, `<animateMotion>`, `<set>`) or CSS `@keyframes` / `animation:` declarations.
5. **[Custom Check] Pedagogical Quality & Graphic Richness (`pedagogicalQuality`):**
   - Ensures the SVG is not an empty or low-effort placeholder: requires at least 3 distinct graphic primitives (`path`, `rect`, `circle`, `line`, `polygon`), visual color styling (`fill`, `stroke`), and structure suitable for UK GCSE lesson delivery.

### Automated Retry Logic
- If any check fails on the initial call, the system constructs a precise diagnostic feedback message detailing which checks failed and re-prompts the model once to rectify the specific issues.
- If HTTP 429 (rate limit) or 503 (service unavailable) occurs, the system executes exponential backoff with jitter up to 3 times before failing gracefully.

---

## 💾 Review Decision Persistence (Architecture Choice)

### Choice: **Dual-Layer Persistence (Server File `reviews.json` + Browser `localStorage`)**

### Why this approach?
1. **Server-Side File Persistence (`reviews.json`):**
   - Ensures decisions survive complete browser restarts, incognito mode testing, and device switching.
   - Requires zero external database dependencies (like PostgreSQL/MongoDB), making the repo 100% self-contained and zero-cost to host on platforms like Render or Vercel.
2. **Client-Side `localStorage` Fallback:**
   - Provides instant optimistic UI updates with zero latency.
   - Guarantees reviewer selections and in-progress notes are preserved even during temporary server disconnections or offline grading.

---

## 🛠️ What Failed, and How We Fixed It

1. **Issue: Transformed SVG elements falsely flagged in viewBox check**
   - *Problem:* In the Pythagoras theorem diagram, the square on hypotenuse $c$ was rendered inside a `<g transform="translate(...) rotate(...)">` with local coordinates `y="-150"`. The naive coordinate checker flagged negative coordinates as exceeding the viewBox.
   - *Fix:* Enhanced `checkWithinViewBox()` in `lib/validator.js` to recognize coordinate systems within transformed groups and filter out negative coordinates associated with rotation wrappers.
2. **Issue: Sandbox network restriction during `npm install`**
   - *Problem:* Sandboxed commands failed to resolve DNS for `registry.npmjs.org`.
   - *Fix:* Executed package installation using unsandboxed execution mode as permitted for package installation, while keeping the application execution clean, secure, and self-contained.
3. **Issue: API Rate Limits (HTTP 429) on Gemini Free Tier**
   - *Problem:* Google AI Studio free tier enforces low requests-per-minute (RPM) limits.
   - *Fix:* Implemented exponential backoff with random jitter (`Math.pow(2, attempt) * 1000 + jitter`) handling up to 3 retries, coupled with high-fidelity fallback baselines in `lib/generator.js` so that the app never renders a blank screen.

---

## 🔮 What I Would Do With One More Day

1. **Side-by-side Visual Diff / Version History:**
   - Allow reviewers to inspect the SVG before and after the automated retry to visually verify what the model corrected.
2. **Export to Lottie / Video Asset:**
   - Integrate an automated SVG-to-video / WebM rendering worker to directly preview how the diagram fits into Udhi Technologies' GCSE video generation pipeline.
3. **Interactive Teacher Canvas:**
   - Add step-by-step scrubber controls for animations (pause, replay, slow-motion) so educators can evaluate animation pacing for 14–16 year old GCSE students.
4. **SQLite / Supabase Integration:**
   - For a production multi-reviewer team, replace the single file store with an SQLite/PostgreSQL database supporting reviewer roles and audit logs.

---

## 🤖 Which AI Tools Were Used, and for What

- **Google Antigravity & Gemini:** Used for scaffolding the Node.js project architecture, structuring the 5-point SVG regex/AST validator, crafting the GCSE science prompt engineering templates, and writing unit verification scripts.
- **Gemini 2.5 / 3.5 Flash Model APIs:** Used as the target visual diagram generation engine evaluated in Part A and Part B live generator.
