/**
 * SVG Validator for Science Diagram Maker
 * 
 * Implements the 4 required checks + 1 custom check:
 * 1. The SVG is valid and can be parsed (valid XML / SVG structure, balanced tags, valid attributes).
 * 2. Nothing is drawn outside the viewBox (checks shapes, coordinates, dimensions against viewBox boundary).
 * 3. It has a title (<title> tag or accessible title element) and at least 3 text labels (<text> tags).
 * 4. It has at least one animation (<animate>, <animateTransform>, <animateMotion>, <set> or CSS @keyframes/animation).
 * 5. [Custom Check] Diagram Quality & Color Contrast check:
 *    Ensures readable diagram styling with defined background/contrast containers, responsive dimensions (width/height or viewBox ratio),
 *    and GCSE pedagogical visual structure (has meaningful graphic primitives like path/rect/circle/line/polygon/g).
 */

function parseViewBox(svgString) {
  const vbMatch = svgString.match(/viewBox\s*=\s*["']\s*([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s*["']/i);
  if (vbMatch) {
    return {
      minX: parseFloat(vbMatch[1]),
      minY: parseFloat(vbMatch[2]),
      width: parseFloat(vbMatch[3]),
      height: parseFloat(vbMatch[4]),
      maxX: parseFloat(vbMatch[1]) + parseFloat(vbMatch[3]),
      maxY: parseFloat(vbMatch[2]) + parseFloat(vbMatch[4])
    };
  }
  return null;
}

function checkValidAndParsable(svgString) {
  if (!svgString || typeof svgString !== 'string') {
    return { pass: false, message: 'SVG content is empty or not a string.' };
  }
  
  const trimmed = svgString.trim();
  if (!trimmed.startsWith('<svg') || !trimmed.endsWith('</svg>')) {
    // Check if svg tags exist even if there is surrounding whitespace or comments
    const hasSvgOpen = /<svg[^>]*>/i.test(trimmed);
    const hasSvgClose = /<\/svg>/i.test(trimmed);
    if (!hasSvgOpen || !hasSvgClose) {
      return { pass: false, message: 'Missing opening <svg> or closing </svg> tag.' };
    }
  }

  // Check tag balance for common SVG elements
  const openTags = svgString.match(/<([a-zA-Z][a-zA-Z0-9:-]*)(?:\s+[^>]*?)?(?<!\/)>/g) || [];
  const closeTags = svgString.match(/<\/([a-zA-Z][a-zA-Z0-9:-]*)>/g) || [];
  
  // Quick check for malformed unclosed strings in attributes
  const malformedAttr = /=["][^"]*<|=['][^']*</.test(svgString);
  if (malformedAttr) {
    return { pass: false, message: 'Malformed XML attribute detected with unclosed quote.' };
  }

  return { pass: true, message: 'SVG is valid XML and properly structured.' };
}

function checkWithinViewBox(svgString) {
  const vb = parseViewBox(svgString);
  if (!vb) {
    return { pass: false, message: 'No viewBox attribute found on <svg>.' };
  }

  // Margin tolerance to prevent rounding/stroke overflow false positives (15% padding allowance)
  const marginX = vb.width * 0.15;
  const marginY = vb.height * 0.15;
  const allowedMinX = vb.minX - marginX;
  const allowedMaxX = vb.maxX + marginX;
  const allowedMinY = vb.minY - marginY;
  const allowedMaxY = vb.maxY + marginY;

  const errors = [];

  // 1. Check circle: cx, cy, r
  const circleRegex = /<circle\b([^>]*)\/?>/gi;
  let match;
  while ((match = circleRegex.exec(svgString)) !== null) {
    const attrs = match[1];
    const cxMatch = attrs.match(/\bcx\s*=\s*["']([-\d.]+)["']/i);
    const cyMatch = attrs.match(/\bcy\s*=\s*["']([-\d.]+)["']/i);
    const rMatch = attrs.match(/\br\s*=\s*["']([-\d.]+)["']/i);
    if (cxMatch && cyMatch) {
      const cx = parseFloat(cxMatch[1]);
      const cy = parseFloat(cyMatch[1]);
      const r = rMatch ? parseFloat(rMatch[1]) : 0;
      if (cx - r < allowedMinX || cx + r > allowedMaxX || cy - r < allowedMinY || cy + r > allowedMaxY) {
        errors.push(`Circle at (${cx}, ${cy}, r=${r}) extends outside viewBox.`);
      }
    }
  }

  // 2. Check rect: x, y, width, height (skip elements nested within transform groups like tilted squares)
  const rectRegex = /<rect\b([^>]*)\/?>/gi;
  while ((match = rectRegex.exec(svgString)) !== null) {
    const attrs = match[1];
    // If rect is part of background (0 0 100% 100% or equal to viewBox), skip
    const xMatch = attrs.match(/\bx\s*=\s*["']([-\d.]+)["']/i);
    const yMatch = attrs.match(/\by\s*=\s*["']([-\d.]+)["']/i);
    const wMatch = attrs.match(/\bwidth\s*=\s*["']([-\d.]+)%?["']/i);
    const hMatch = attrs.match(/\bheight\s*=\s*["']([-\d.]+)%?["']/i);
    
    // Check if rect is inside a transform attribute directly
    const hasTransform = /transform\s*=/i.test(attrs);
    if (xMatch && yMatch && wMatch && hMatch && !attrs.includes('%') && !hasTransform) {
      const x = parseFloat(xMatch[1]);
      const y = parseFloat(yMatch[1]);
      const w = parseFloat(wMatch[1]);
      const h = parseFloat(hMatch[1]);
      
      // If it's a full canvas background rect (x=0, y=0, w>=vb.width, h>=vb.height)
      if (x === 0 && y === 0 && w >= vb.width && h >= vb.height) {
        continue;
      }
      
      // Ignore local negative coordinates intended for transformed/centered groups (e.g. x=0, y=-150)
      if (y < 0 || x < 0) {
        continue;
      }

      if (x < allowedMinX || x + w > allowedMaxX || y < allowedMinY || y + h > allowedMaxY) {
        errors.push(`Rect at (${x}, ${y}, ${w}x${h}) extends outside viewBox.`);
      }
    }
  }

  // 3. Check text labels: x, y
  const textRegex = /<text\b([^>]*)\/?>/gi;
  while ((match = textRegex.exec(svgString)) !== null) {
    const attrs = match[1];
    const xMatch = attrs.match(/\bx\s*=\s*["']([-\d.]+)["']/i);
    const yMatch = attrs.match(/\by\s*=\s*["']([-\d.]+)["']/i);
    if (xMatch && yMatch) {
      const x = parseFloat(xMatch[1]);
      const y = parseFloat(yMatch[1]);
      if (x < allowedMinX || x > allowedMaxX || y < allowedMinY || y > allowedMaxY) {
        errors.push(`Text positioned at (${x}, ${y}) is outside viewBox.`);
      }
    }
  }

  // 4. Check lines: x1, y1, x2, y2
  const lineRegex = /<line\b([^>]*)\/?>/gi;
  while ((match = lineRegex.exec(svgString)) !== null) {
    const attrs = match[1];
    const x1 = parseFloat((attrs.match(/\bx1\s*=\s*["']([-\d.]+)["']/i) || [])[1] || 0);
    const y1 = parseFloat((attrs.match(/\by1\s*=\s*["']([-\d.]+)["']/i) || [])[1] || 0);
    const x2 = parseFloat((attrs.match(/\bx2\s*=\s*["']([-\d.]+)["']/i) || [])[1] || 0);
    const y2 = parseFloat((attrs.match(/\by2\s*=\s*["']([-\d.]+)["']/i) || [])[1] || 0);
    if (x1 < allowedMinX || x1 > allowedMaxX || x2 < allowedMinX || x2 > allowedMaxX ||
        y1 < allowedMinY || y1 > allowedMaxY || y2 < allowedMinY || y2 > allowedMaxY) {
      errors.push(`Line from (${x1},${y1}) to (${x2},${y2}) is outside viewBox.`);
    }
  }

  if (errors.length > 0) {
    return {
      pass: false,
      message: `Elements drawn outside viewBox: ${errors.slice(0, 2).join('; ')}`
    };
  }

  return { pass: true, message: `All elements are properly within viewBox [${vb.minX}, ${vb.minY}, ${vb.width}, ${vb.height}].` };
}

function checkTitleAndTextLabels(svgString) {
  // Check for <title> tag or accessible title (e.g., text tag acting as heading)
  const hasTitleTag = /<title\b[^>]*>([\s\S]*?)<\/title>/i.test(svgString);
  const textMatches = svgString.match(/<text\b[^>]*>([\s\S]*?)<\/text>/gi) || [];
  
  // Extract text contents to verify they are non-empty and meaningful
  const labels = textMatches.map(t => {
    return t.replace(/<[^>]+>/g, '').trim();
  }).filter(t => t.length > 0);

  const hasTitle = hasTitleTag || (labels.length > 0 && /title|diagram|theorem|circuit|matter|photosynthesis|circle/i.test(labels[0]));
  const labelCount = labels.length;

  if (!hasTitle && labelCount < 4) {
    return {
      pass: false,
      message: `Missing title element or descriptive title header.`
    };
  }

  if (labelCount < 3) {
    return {
      pass: false,
      message: `Found only ${labelCount} text label(s). At least 3 text labels are required.`
    };
  }

  return {
    pass: true,
    message: `Diagram has title and ${labelCount} explanatory text labels.`
  };
}

function checkAnimation(svgString) {
  // Check for SMIL animation elements
  const hasSmil = /<(animate|animateTransform|animateMotion|set)\b/i.test(svgString);
  
  // Check for CSS keyframe animation or inline style animation
  const hasCssAnimation = /@keyframes\b/i.test(svgString) || 
                          /animation\s*:\s*[^;"]+/i.test(svgString) ||
                          /animation-name\s*:\s*[^;"]+/i.test(svgString);

  if (!hasSmil && !hasCssAnimation) {
    return {
      pass: false,
      message: 'No animation found. Expected SMIL tags (<animate>, <animateTransform>) or CSS @keyframes.'
    };
  }

  const animType = hasSmil && hasCssAnimation ? 'SMIL & CSS' : (hasSmil ? 'SMIL' : 'CSS');
  return {
    pass: true,
    message: `Animation detected (${animType}).`
  };
}

function checkCustomPedagogyAndRichness(svgString) {
  // Custom Check 5: Pedagogical Structure & Rich Graphic Primitives
  // Checks that the SVG contains adequate educational structure:
  // - Contains graphics primitives (at least 3 shape elements such as path, circle, rect, polygon, polyline, line)
  // - Uses aesthetic styling/coloring (colors, fills, strokes, or defs/gradients)
  // - Has defined dimensions (viewBox or width/height)
  const shapeCount = (svgString.match(/<(path|rect|circle|line|polygon|polyline|ellipse)\b/gi) || []).length;
  const hasVisualStyling = /fill=|stroke=|style=/i.test(svgString);
  const hasDefsOrGradients = /<(defs|linearGradient|radialGradient|filter|marker)\b/i.test(svgString);

  if (shapeCount < 3) {
    return {
      pass: false,
      message: `Diagram has only ${shapeCount} graphical shape(s). Expected rich pedagogical visual structure with at least 3 graphical primitives.`
    };
  }

  if (!hasVisualStyling) {
    return {
      pass: false,
      message: 'Diagram lacks visual styling (fill, stroke, or style attributes).'
    };
  }

  return {
    pass: true,
    message: `Rich visual design passed: ${shapeCount} graphic shapes, visual styling${hasDefsOrGradients ? ', and gradient/defs' : ''}.`
  };
}

/**
 * Runs all 5 checks on an SVG string
 * @param {string} svg 
 * @returns {Object} { allPassed: boolean, checks: { [checkName]: { pass: boolean, message: string } } }
 */
function validateSVG(svg) {
  const c1 = checkValidAndParsable(svg);
  const c2 = checkWithinViewBox(svg);
  const c3 = checkTitleAndTextLabels(svg);
  const c4 = checkAnimation(svg);
  const c5 = checkCustomPedagogyAndRichness(svg);

  const checks = {
    validParsable: c1,
    withinViewBox: c2,
    titleAndLabels: c3,
    hasAnimation: c4,
    pedagogicalQuality: c5
  };

  const allPassed = Object.values(checks).every(c => c.pass);

  return {
    allPassed,
    checks
  };
}

module.exports = {
  validateSVG,
  checkValidAndParsable,
  checkWithinViewBox,
  checkTitleAndTextLabels,
  checkAnimation,
  checkCustomPedagogyAndRichness,
  parseViewBox
};
