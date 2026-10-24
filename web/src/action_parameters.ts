/** Preserve the meaning of the user's JSON before review and serialization.
 * JSON.parse alone silently overwrites duplicate keys and rounds numeric tokens.
 * The server's bounded_json contract accepts safe integers, not fractions, and
 * counts action.parameters at depth 2 within the request body (maximum depth 8).
 */
export function parseActionParameters(text: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Parameters must be a valid JSON object.');
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Parameters must be a JSON object.');
  }

  // Grammar is already validated. Inspect original tokens without rebuilding
  // objects, so escaped keys are compared correctly and JSON properties stay inert.
  const tokens = text.match(/"(?:[^"\\]|\\.)*"|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null|[{}[\]:,]/g) ?? [];
  let cursor = 0;
  function takeToken(): string {
    const token = tokens[cursor++];
    if (token === undefined) throw new Error('Parameters must be a valid JSON object.');
    return token;
  }
  function visit(path: string, depth: number): void {
    if (depth > 8) {
      throw new Error('Parameters at ' + location(path) + ' are nested too deeply. Reduce the nesting before reviewing.');
    }
    const token = takeToken();
    if (token === '{') {
      const keys = new Set<string>();
      while (tokens[cursor] !== '}') {
        const key = JSON.parse(takeToken()) as string;
        const child = /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key)
          ? path + '.' + key : path + '[' + JSON.stringify(key) + ']';
        if (keys.has(key)) {
          throw new Error('Duplicate parameter key at ' + location(child) + '. Keep one value for each key.');
        }
        keys.add(key);
        cursor++; // Colon, already checked by JSON.parse.
        visit(child, depth + 1);
        if (tokens[cursor] !== ',') break;
        cursor++;
      }
      cursor++; // Closing brace.
    } else if (token === '[') {
      let index = 0;
      while (tokens[cursor] !== ']') {
        visit(path + '[' + index++ + ']', depth + 1);
        if (tokens[cursor] !== ',') break;
        cursor++;
      }
      cursor++; // Closing bracket.
    } else if (/^-?\d/.test(token)) {
      const value = Number(token);
      if (!Number.isFinite(value)) {
        throw new Error('Parameter at ' + location(path) + ' must be a finite whole number. Use quoted text for an identifier outside the supported range.');
      }
      if (!Number.isSafeInteger(value)) {
        throw new Error('Parameter at ' + location(path) + ' must be a whole number between -9007199254740991 and 9007199254740991. Use quoted text for an identifier.');
      }
      if (normalizeDecimal(token) !== normalizeDecimal(JSON.stringify(value))) {
        throw new Error('Parameter at ' + location(path) + ' cannot be represented exactly. Use a supported whole number or quoted text for an identifier.');
      }
    }
  }
  visit('$', 2);
  if (cursor !== tokens.length) {
    throw new Error('Parameters must be a valid JSON object.');
  }
  return parsed as Record<string, unknown>;
}

function location(path: string): string {
  return path.length <= 120 ? path : path.slice(0, 117) + '...';
}

/** Compare decimal values exactly without constructing enormous powers of ten.
 * Equivalent integer notation (1e3, 1000.0) is allowed; rounding and underflow are
 * not. Zero is canonical regardless of sign or exponent.
 */
function normalizeDecimal(token: string): string {
  const negative = token.startsWith('-');
  const [mantissa = '', exponent = '0'] = (negative ? token.slice(1) : token).toLowerCase().split('e');
  const [whole = '', fraction = ''] = mantissa.split('.');
  let digits = (whole + fraction).replace(/^0+/, '');
  if (!digits) return '0';
  const trailing = digits.match(/0+$/)?.[0].length ?? 0;
  if (trailing) digits = digits.slice(0, -trailing);
  const power = BigInt(exponent) - BigInt(fraction.length) + BigInt(trailing);
  return (negative ? '-' : '') + digits + 'e' + power.toString();
}
