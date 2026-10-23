/**
 * SVG <pattern> of 45° stripes for empty or future data inside SVG charts. Put
 * it in the chart's <defs> and fill with `url(#id)`. (HTML elements can use
 * the `.visual-hatch` class instead.)
 */
export function HatchPattern({
  id,
  className = "stroke-hatch",
}: {
  id: string;
  className?: string;
}) {
  return (
    <pattern
      id={id}
      width="6"
      height="6"
      patternUnits="userSpaceOnUse"
      patternTransform="rotate(45)"
    >
      <line x1="0" y1="0" x2="0" y2="6" strokeWidth="1.5" className={className} />
    </pattern>
  );
}
