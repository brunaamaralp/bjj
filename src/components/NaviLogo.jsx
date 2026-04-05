/**
 * Logo Navi — planeta, órbita, satélite coral.
 * @param {number} [size=26]
 * @param {'default' | 'white'} [variant='default']
 */
export default function NaviLogo({ size = 26, variant = 'default' }) {
  const planet = variant === 'white' ? 'rgba(255,255,255,0.9)' : '#5B3FBF';
  const ring = variant === 'white' ? 'rgba(255,255,255,0.6)' : '#7B63D4';
  const ringBg = variant === 'white' ? 'rgba(255,255,255,0.35)' : '#9B85E0';
  const sat = '#F04040';

  return (
    <svg
      width={size}
      height={size * 0.81}
      viewBox="0 0 100 80"
      fill="none"
      aria-hidden
      className="navi-logo-svg"
    >
      <path
        d="M 14 62 Q 2 42 20 26 Q 32 14 52 14"
        stroke={ringBg}
        strokeWidth="4"
        strokeLinecap="round"
        fill="none"
        opacity="0.5"
      />
      <circle cx="44" cy="42" r="28" fill={planet} />
      <path
        d="M 52 14 Q 72 10 82 26 Q 92 42 74 58 Q 62 68 44 70"
        stroke={ring}
        strokeWidth="4"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M 44 70 Q 28 72 14 62"
        stroke={ringBg}
        strokeWidth="4"
        strokeLinecap="round"
        fill="none"
        opacity="0.5"
      />
      <circle cx="76" cy="18" r="11" fill={sat} />
    </svg>
  );
}
