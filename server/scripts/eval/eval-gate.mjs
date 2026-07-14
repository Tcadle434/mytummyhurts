export function parsePassRatio(value = '1/1') {
  const match = /^(\d+)\/(\d+)$/.exec(String(value));
  if (!match) throw new Error('pass ratio must use the form passed/total');

  const numerator = Number(match[1]);
  const denominator = Number(match[2]);
  if (denominator < 1 || numerator > denominator) {
    throw new Error('pass ratio must be between 0/1 and 1/1');
  }

  return { numerator, denominator, value: `${numerator}/${denominator}` };
}

export function evaluateEvalGate(results, minimumPassRatio = '1/1') {
  if (!Array.isArray(results)) throw new Error('eval results must be an array');
  const ratio = parsePassRatio(minimumPassRatio);

  const failed = results.filter((result) => result.validation?.passed !== true).length;
  const passed = results.length - failed;
  const operationalFailures = results.reduce(
    (count, result) => count + (result.runs ?? []).filter((run) => run?.error).length,
    0,
  );

  return {
    total: results.length,
    passed,
    failed,
    minimumPassRatio: ratio.value,
    requiredPasses: Math.ceil((results.length * ratio.numerator) / ratio.denominator),
    operationalFailures,
    accepted:
      operationalFailures === 0 &&
      passed * ratio.denominator >= results.length * ratio.numerator,
  };
}
