/**
 * CLI script to generate the 5 diagrams and save results to results.json
 * Runs Part A of the assignment.
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { CONCEPTS } = require('../lib/concepts');
const { generateDiagramForConcept } = require('../lib/generator');

async function runPartA() {
  console.log('====================================================');
  console.log(' Udhi Technologies: Science Diagram Maker (Part A)  ');
  console.log('====================================================');
  
  const apiKey = process.env.GEMINI_API_KEY;
  // Free tier models recommended in instructions: gemini-2.5-flash / gemini-1.5-flash / gemini-2.0-flash
  const modelName = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

  if (!apiKey) {
    console.warn('⚠️ GEMINI_API_KEY not found in environment. Using high-fidelity curated baseline diagrams.');
  } else {
    console.log(`✓ Using model: ${modelName}`);
  }

  const results = [];

  for (let i = 0; i < CONCEPTS.length; i++) {
    const concept = CONCEPTS[i];
    console.log(`\n[${i + 1}/${CONCEPTS.length}] Processing concept: "${concept.concept}" (${concept.subject})...`);
    
    try {
      const result = await generateDiagramForConcept({
        conceptItem: concept,
        apiKey,
        preferredModel: modelName
      });

      console.log(`  ✓ Finished: ${result.concept}`);
      console.log(`  - Model: ${result.modelName}`);
      console.log(`  - Retries: ${result.retries}`);
      console.log(`  - Tokens: In=${result.inputTokens}, Out=${result.outputTokens}`);
      console.log(`  - Estimated Cost: $${result.costUSD}`);
      console.log(`  - Checks: ${result.validation?.allPassed ? 'ALL PASSED' : 'SOME FAILED'}`);
      
      if (result.validation?.checks) {
        Object.entries(result.validation.checks).forEach(([name, check]) => {
          console.log(`     * ${name}: ${check.pass ? '✓ PASS' : '✗ FAIL'} (${check.message})`);
        });
      }

      results.push(result);
    } catch (err) {
      console.error(`  ✗ Error generating ${concept.concept}:`, err.message);
    }
  }

  const outputPath = path.join(__dirname, '..', 'results.json');
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2), 'utf-8');
  console.log(`\n🎉 Saved 5 final results to ${outputPath}`);
}

runPartA().catch(err => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});
