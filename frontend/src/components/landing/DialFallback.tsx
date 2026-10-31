/** Static dial for reduced motion, no WebGL, and the first paint before WebGL loads. */
export default function DialFallback() {
  return (
    <svg viewBox="0 0 560 560" className="h-auto w-full" aria-hidden="true">
      {[250, 190, 130, 72].map((r) => (
        <circle key={r} cx="280" cy="280" r={r} fill="none" stroke="#4A2F52" strokeWidth="1.5" />
      ))}
      <g fill="#C9B6CF">
        {[
          [430, 130, 5], [110, 420, 5], [500, 340, 4], [60, 230, 4], [300, 31, 4], [200, 514, 5],
          [410, 390, 4], [140, 160, 5], [460, 250, 4], [250, 472, 4], [96, 300, 4], [340, 160, 4],
          [190, 340, 4], [380, 330, 3], [230, 190, 3], [330, 236, 3], [250, 340, 3],
        ].map(([cx, cy, r]) => (
          <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={r} />
        ))}
      </g>
      <path d="M280 280 L280 30 A250 250 0 0 1 456 103 Z" fill="#F2AE2E" opacity="0.1" />
      <line x1="280" y1="280" x2="456" y2="103" stroke="#F2AE2E" strokeWidth="3" strokeLinecap="round" />
      <circle cx="430" cy="130" r="11" fill="none" stroke="#F2AE2E" strokeWidth="2" />
      <circle cx="430" cy="130" r="5" fill="#F2AE2E" />
      <circle cx="280" cy="280" r="8" fill="#F2AE2E" />
    </svg>
  );
}
