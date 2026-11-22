function numberParts(text, type) {
  const value = text.trim().replace(/[௦-௯]/g, digit => String(digit.charCodeAt(0) - 0xbe6));
  if (type === 'fraction') {
    const match = /^([+-]?\d+)\s*\/\s*([+-]?\d+)$/.exec(value);
    if (!match || BigInt(match[2]) === 0n) return null;
    return [BigInt(match[1]),BigInt(match[2])];
  }
  const grouped = /^[+-]?\d{1,3}(,\d{3})+(\.\d+)?$/;
  const normalized = grouped.test(value) ? value.replace(/,/g,'') : value;
  if (type === 'integer' && !/^[+-]?\d+$/.test(normalized)) return null;
  const match = /^([+-]?)(\d+)(?:\.(\d+))?$/.exec(normalized);
  if (!match) return null;
  const [,sign,whole,fraction=''] = match;
  return [BigInt(sign + whole + fraction),10n ** BigInt(fraction.length)];
}

function mark(response, rule) {
  if (response == null || !response.trim()) return 'skipped';
  if (response.length > 128) return 'incorrect';
  if (rule.type === 'choice') return response.trim() === rule.answer ? 'correct' : 'incorrect';
  if (!['integer','decimal','fraction'].includes(rule.type)) throw new Error('Unsupported answer rule');
  const actual = numberParts(response,rule.type);
  const expected = numberParts(rule.answer,rule.type);
  if (!expected) throw new Error('Invalid answer key');
  if (!actual) return 'incorrect';
  if (rule.maxDecimalPlaces != null && actual[1] > 10n ** BigInt(rule.maxDecimalPlaces)) return 'incorrect';
  return actual[0] * expected[1] === expected[0] * actual[1] ? 'correct' : 'incorrect';
}
module.exports = { mark };
