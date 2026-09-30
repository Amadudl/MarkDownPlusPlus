import { useId, type JSX } from 'react';

/** The MarkDown++ logo mark (an "M" with a down arrow and a plus), drawn with theme colours. */
export function LogoMark({ size = 32 }: { readonly size?: number }): JSX.Element {
  const gradient = useId();
  return (
    <svg
      className="logo-mark"
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      aria-label="MarkDown++ logo"
    >
      <defs>
        <linearGradient id={gradient} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" className="logo-mark-stop-a" />
          <stop offset="1" className="logo-mark-stop-b" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="60" height="60" rx="16" fill={`url(#${gradient})`} />
      <path
        className="logo-mark-glyph"
        d="M14 44V20l9 11 9-11v24M42 20v18m-6-6 6 7 6-7"
        fill="none"
        strokeWidth="4.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        className="logo-mark-glyph"
        d="M47 13v8m-4-4h8"
        fill="none"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}
