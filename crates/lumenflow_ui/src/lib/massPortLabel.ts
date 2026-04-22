/**
 * If `template` ends with a run of ASCII decimal digits, returns `{ prefix, digitRun }`.
 * Otherwise returns `null` (caller uses the template unchanged for every port).
 */
export function parseTrailingDecimalDigitRun(
  template: string
): { prefix: string; digitRun: string } | null {
  const m = template.match(/^(.*?)(\d+)$/);
  if (!m?.[2]) return null;
  return { prefix: m[1] ?? "", digitRun: m[2] };
}

/**
 * grandMA2 / dot2–style bulk naming: the trailing decimal run is treated as a counter;
 * each bind in application order uses `start + index`. Leading zeros set minimum width
 * until the value needs more digits (e.g. `foo09` → `foo10`, `foo99` → `foo100`).
 */
export function formatMassPortLabel(templateTrimmed: string, index: number): string {
  const parsed = parseTrailingDecimalDigitRun(templateTrimmed);
  if (!parsed) return templateTrimmed;
  const start = parseInt(parsed.digitRun, 10);
  if (!Number.isFinite(start)) return templateTrimmed;
  const next = start + index;
  if (next < 0) return templateTrimmed;
  const width = parsed.digitRun.length;
  let suffix = String(next);
  if (suffix.length < width) {
    suffix = suffix.padStart(width, "0");
  }
  return `${parsed.prefix}${suffix}`;
}
