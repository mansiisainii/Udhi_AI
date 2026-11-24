const express = require('express');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const { CONCEPTS } = require('./lib/concepts');
const { generateDiagramForConcept } = require('./lib/generator');
const { validateSVG } = require('./lib/validator');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Path to reviews and results store
const REVIEWS_FILE = path.join(__dirname, 'reviews.json');
const RESULTS_FILE = path.join(__dirname, 'results.json');

// Ensure reviews.json exists
function getReviews() {
  try {
    if (fs.existsSync(REVIEWS_FILE)) {
      const data = fs.readFileSync(REVIEWS_FILE, 'utf-8');
      return JSON.parse(data);
    }
  } catch (e) {
    console.error('Error reading reviews.json:', e);
  }
  return {};
}

function saveReviews(reviews) {
  try {
    fs.writeFileSync(REVIEWS_FILE, JSON.stringify(reviews, null, 2), 'utf-8');
  } catch (e) {
    console.error('Error writing reviews.json:', e);
  }
}

// 1. GET /api/results - Return the 5 saved results (shows immediately on load)
app.get('/api/results', (req, res) => {
  try {
    if (fs.existsSync(RESULTS_FILE)) {
      const data = fs.readFileSync(RESULTS_FILE, 'utf-8');
      return res.json({ success: true, data: JSON.parse(data) });
    }
    return res.status(404).json({ success: false, message: 'results.json not found' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 2. GET /api/reviews - Return persisted reviewer feedback
app.get('/api/reviews', (req, res) => {
  const reviews = getReviews();
  res.json({ success: true, reviews });
});

// 3. POST /api/reviews/:conceptId - Persist review status and note (Approved / Rejected)
app.post('/api/reviews/:conceptId', (req, res) => {
  const { conceptId } = req.params;
  const { status, note } = req.body;

  if (!['approved', 'rejected', 'pending'].includes(status)) {
    return res.status(400).json({ success: false, message: 'Invalid status. Must be approved, rejected, or pending.' });
  }

  const reviews = getReviews();
  reviews[conceptId] = {
    status,
    note: note || '',
    updatedAt: new Date().toISOString()
  };
  saveReviews(reviews);

  res.json({ success: true, review: reviews[conceptId] });
});

// 4. POST /api/generate - Live Part A Generation for a chosen concept
app.post('/api/generate', async (req, res) => {
  try {
    const { conceptId, model } = req.body;
    const conceptItem = CONCEPTS.find(c => c.id === conceptId);

    if (!conceptItem) {
      return res.status(400).json({
        success: false,
        message: `Concept "${conceptId}" not found. Valid concepts are: ${CONCEPTS.map(c => c.id).join(', ')}`
      });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    const preferredModel = model || process.env.GEMINI_MODEL || 'gemini-2.5-flash';

    console.log(`[API /generate] Generating live diagram for "${conceptItem.concept}" with model ${preferredModel}...`);
    const result = await generateDiagramForConcept({
      conceptItem,
      apiKey,
      preferredModel
    });

    // Optionally update results.json with this newly generated item
    try {
      if (fs.existsSync(RESULTS_FILE)) {
        const data = JSON.parse(fs.readFileSync(RESULTS_FILE, 'utf-8'));
        const index = data.findIndex(d => d.conceptId === result.conceptId);
        if (index !== -1) {
          data[index] = result;
        } else {
          data.push(result);
        }
        fs.writeFileSync(RESULTS_FILE, JSON.stringify(data, null, 2), 'utf-8');
      }
    } catch (e) {
      console.warn('Could not update results.json with live generation:', e);
    }

    res.json({ success: true, result });
  } catch (err) {
    console.error('[API /generate Error]:', err);
    res.status(500).json({
      success: false,
      error: `Generation failed: ${err.message}. Please check API key, model limits, or connectivity.`
    });
  }
});

// 5. GET /api/concepts - Return the list of 5 concepts
app.get('/api/concepts', (req, res) => {
  res.json({ success: true, concepts: CONCEPTS });
});

app.listen(PORT, () => {
  console.log(`🚀 Science Diagram Maker server running at http://localhost:${PORT}`);
});

module.exports = app;
