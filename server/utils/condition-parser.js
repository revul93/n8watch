'use strict';

/**
 * A minimal, safe condition evaluator for alert rules.
 *
 * Supported grammar (no eval, no third-party parser):
 *   expr     := term (('&&' | '||') term)*
 *   term     := operand op operand
 *   operand  := number | identifier
 *   op       := '==' | '!=' | '>=' | '<=' | '>' | '<'
 *
 * Identifiers must be keys present in the metrics object.
 * Any parse or evaluation error returns false safely.
 */

const ALLOWED_VARS = new Set([
  'is_alive', 'packet_loss', 'avg_latency', 'min_latency',
  'max_latency', 'jitter', 'packets_sent', 'packets_received',
]);

const TOKEN_RE = /\s*(\d+(?:\.\d+)?|[a-z_][a-z0-9_]*|==|!=|>=|<=|>|<|&&|\|\|)\s*/gy;

function tokenize(condition) {
  const tokens = [];
  TOKEN_RE.lastIndex = 0;
  let m;
  while ((m = TOKEN_RE.exec(condition)) !== null) {
    tokens.push(m[1]);
  }
  // Verify we consumed the entire string
  const consumed = tokens.join('').replace(/\s/g, '');
  const expected = condition.replace(/\s/g, '');
  if (consumed !== expected) return null;
  return tokens;
}

function parseOperand(token, metrics) {
  if (token === undefined) return null;
  const num = Number(token);
  if (!isNaN(num)) return num;
  if (!ALLOWED_VARS.has(token)) return null;
  const val = metrics[token];
  return val !== undefined && val !== null ? Number(val) : null;
}

const COMPARISON_OPS = new Set(['==', '!=', '>=', '<=', '>', '<']);

function evalComparison(left, op, right) {
  switch (op) {
    case '==': return left === right;
    case '!=': return left !== right;
    case '>=': return left >= right;
    case '<=': return left <= right;
    case '>':  return left > right;
    case '<':  return left < right;
    default:   return false;
  }
}

/**
 * evaluateCondition - safely evaluates a condition string against a metrics object.
 * Never uses eval() or Function().
 *
 * Supported grammar:
 *   expr     := term (('&&' | '||') term)*
 *   term     := operand op operand
 *   operand  := number | identifier
 *   op       := '==' | '!=' | '>=' | '<=' | '>' | '<'
 *
 * ⚠️  Operator precedence: logical operators are evaluated strictly left-to-right.
 *     '&&' does NOT bind tighter than '||'. For example, 'A || B && C' evaluates
 *     as '(A || B) && C', NOT 'A || (B && C)'. Keep alert rule conditions simple
 *     (single comparisons or flat chains of the same logical operator) to avoid
 *     unexpected results.
 *
 * @param {string} condition  e.g. "packet_loss == 100" or "avg_latency > 200"
 * @param {object} metrics    e.g. { packet_loss: 100, avg_latency: 250, ... }
 * @returns {boolean}
 */
function evaluateCondition(condition, metrics) {
  try {
    const tokens = tokenize(condition);
    if (!tokens || tokens.length === 0) return false;

    // Split on logical operators while preserving token groups
    // Collect terms separated by && / ||
    const terms  = [];
    const logics = [];
    let   i      = 0;

    while (i < tokens.length) {
      // Expect: operand op operand
      const left  = parseOperand(tokens[i],     metrics);
      const op    = tokens[i + 1];
      const right = parseOperand(tokens[i + 2], metrics);

      if (left === null || !COMPARISON_OPS.has(op) || right === null) return false;

      terms.push(evalComparison(left, op, right));
      i += 3;

      // Next token should be a logical operator or end
      if (i < tokens.length) {
        const logic = tokens[i];
        if (logic !== '&&' && logic !== '||') return false;
        logics.push(logic);
        i++;
      }
    }

    if (terms.length === 0) return false;

    // Evaluate left-to-right (no operator precedence; simple rules only)
    let result = terms[0];
    for (let j = 0; j < logics.length; j++) {
      if (logics[j] === '&&') result = result && terms[j + 1];
      else                     result = result || terms[j + 1];
    }
    return Boolean(result);
  } catch (err) {
    console.error(`[ConditionParser] Failed to evaluate "${condition}":`, err.message);
    return false;
  }
}

module.exports = { evaluateCondition };

