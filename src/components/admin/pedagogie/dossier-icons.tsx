"use client";

import React, { useId } from "react";

type Ic = React.SVGProps<SVGSVGElement>;

export function OfferIcon(props: Ic) {
  const id = useId();
  const gid = `offer-${id}`;
  return (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <defs>
        <linearGradient id={gid} x1="4" y1="2" x2="20" y2="22" gradientUnits="userSpaceOnUse">
          <stop stopColor="#E3C286" />
          <stop offset="1" stopColor="#C9A84C" />
        </linearGradient>
      </defs>
      <path d="M12 2L3 7v4c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-9-5z" stroke={`url(#${gid})`} strokeWidth="1.5" strokeLinejoin="round" fill="none" />
      <path d="M12 2L3 7v4c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-9-5z" fill={`url(#${gid})`} opacity="0.12" />
      <path d="M9 12.5l2 2 4-4.5" stroke={`url(#${gid})`} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function UniversityIcon(props: Ic) {
  const id = useId();
  const gid = `univ-${id}`;
  return (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <defs>
        <linearGradient id={gid} x1="4" y1="2" x2="20" y2="22" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFFFFF" />
          <stop offset="1" stopColor="#A0B4C8" />
        </linearGradient>
      </defs>
      <path d="M12 3l9 4.5v2H3v-2L12 3z" fill={`url(#${gid})`} opacity="0.15" stroke={`url(#${gid})`} strokeWidth="1.2" strokeLinejoin="round" />
      <rect x="5" y="10" width="2" height="7" rx="0.5" fill={`url(#${gid})`} opacity="0.6" />
      <rect x="9" y="10" width="2" height="7" rx="0.5" fill={`url(#${gid})`} opacity="0.6" />
      <rect x="13" y="10" width="2" height="7" rx="0.5" fill={`url(#${gid})`} opacity="0.6" />
      <rect x="17" y="10" width="2" height="7" rx="0.5" fill={`url(#${gid})`} opacity="0.6" />
      <rect x="3" y="17" width="18" height="2" rx="0.7" fill={`url(#${gid})`} opacity="0.8" />
      <circle cx="12" cy="6.5" r="1.2" fill={`url(#${gid})`} opacity="0.5" />
    </svg>
  );
}

export function SemesterIcon(props: Ic) {
  const id = useId();
  const gid = `sem-${id}`;
  return (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <defs>
        <linearGradient id={gid} x1="3" y1="3" x2="21" y2="21" gradientUnits="userSpaceOnUse">
          <stop stopColor="#C9A84C" />
          <stop offset="1" stopColor="#A08630" />
        </linearGradient>
      </defs>
      <rect x="3" y="4" width="18" height="17" rx="3" fill={`url(#${gid})`} opacity="0.1" stroke={`url(#${gid})`} strokeWidth="1.3" />
      <path d="M3 9h18" stroke={`url(#${gid})`} strokeWidth="1.3" opacity="0.5" />
      <circle cx="8" cy="6.5" r="0.8" fill={`url(#${gid})`} opacity="0.7" />
      <circle cx="16" cy="6.5" r="0.8" fill={`url(#${gid})`} opacity="0.7" />
      <rect x="7" y="12" width="3" height="2.5" rx="0.6" fill={`url(#${gid})`} opacity="0.45" />
      <rect x="12" y="12" width="3" height="2.5" rx="0.6" fill={`url(#${gid})`} opacity="0.3" />
      <rect x="7" y="16" width="3" height="2.5" rx="0.6" fill={`url(#${gid})`} opacity="0.3" />
      <rect x="12" y="16" width="3" height="2.5" rx="0.6" fill={`url(#${gid})`} opacity="0.2" />
    </svg>
  );
}

export function SubjectIcon(props: Ic) {
  const id = useId();
  const gid = `subj-${id}`;
  return (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <defs>
        <linearGradient id={gid} x1="2" y1="3" x2="22" y2="21" gradientUnits="userSpaceOnUse">
          <stop stopColor="#E3C286" />
          <stop offset="1" stopColor="#C9A84C" />
        </linearGradient>
      </defs>
      <path d="M4 19.5A2.5 2.5 0 016.5 17H20" stroke={`url(#${gid})`} strokeWidth="1.3" />
      <path d="M4 19.5A2.5 2.5 0 016.5 17H20V3H6.5A2.5 2.5 0 004 5.5v14z" fill={`url(#${gid})`} opacity="0.1" stroke={`url(#${gid})`} strokeWidth="1.3" />
      <path d="M8 7h8M8 11h5" stroke={`url(#${gid})`} strokeWidth="1.2" strokeLinecap="round" opacity="0.5" />
      <circle cx="17" cy="19" r="3.5" fill={`url(#${gid})`} opacity="0.15" stroke={`url(#${gid})`} strokeWidth="1.2" />
      <path d="M15.8 19l1 1 2-2.2" stroke={`url(#${gid})`} strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" opacity="0.8" />
    </svg>
  );
}

export function ModuleIcon(props: Ic) {
  const id = useId();
  const gid = `mod-${id}`;
  return (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <defs>
        <linearGradient id={gid} x1="3" y1="3" x2="21" y2="21" gradientUnits="userSpaceOnUse">
          <stop stopColor="#D4B65C" />
          <stop offset="1" stopColor="#A08630" />
        </linearGradient>
      </defs>
      <rect x="3" y="3" width="8" height="8" rx="2" fill={`url(#${gid})`} opacity="0.2" stroke={`url(#${gid})`} strokeWidth="1.2" />
      <rect x="13" y="3" width="8" height="8" rx="2" fill={`url(#${gid})`} opacity="0.15" stroke={`url(#${gid})`} strokeWidth="1.2" />
      <rect x="3" y="13" width="8" height="8" rx="2" fill={`url(#${gid})`} opacity="0.15" stroke={`url(#${gid})`} strokeWidth="1.2" />
      <rect x="13" y="13" width="8" height="8" rx="2" fill={`url(#${gid})`} opacity="0.25" stroke={`url(#${gid})`} strokeWidth="1.2" />
      <circle cx="7" cy="7" r="1.5" fill={`url(#${gid})`} opacity="0.5" />
      <circle cx="17" cy="17" r="1.5" fill={`url(#${gid})`} opacity="0.5" />
    </svg>
  );
}

export function OptionIcon(props: Ic) {
  const id = useId();
  const gid = `opt-${id}`;
  return (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <defs>
        <linearGradient id={gid} x1="4" y1="2" x2="20" y2="22" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FBBF24" />
          <stop offset="1" stopColor="#D4A017" />
        </linearGradient>
      </defs>
      <path d="M12 2l2.4 7.2H22l-6 4.4 2.3 7.1L12 16.4l-6.3 4.3 2.3-7.1-6-4.4h7.6L12 2z" fill={`url(#${gid})`} opacity="0.12" stroke={`url(#${gid})`} strokeWidth="1.2" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="3" fill="none" stroke={`url(#${gid})`} strokeWidth="1.2" opacity="0.6" />
      <circle cx="12" cy="12" r="1.2" fill={`url(#${gid})`} opacity="0.6" />
    </svg>
  );
}

export function PeriodIcon(props: Ic) {
  const id = useId();
  const gid = `per-${id}`;
  return (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <defs>
        <linearGradient id={gid} x1="4" y1="4" x2="20" y2="20" gradientUnits="userSpaceOnUse">
          <stop stopColor="#C9A84C" />
          <stop offset="1" stopColor="#8B7234" />
        </linearGradient>
      </defs>
      <circle cx="12" cy="12" r="9" fill={`url(#${gid})`} opacity="0.1" stroke={`url(#${gid})`} strokeWidth="1.3" />
      <path d="M12 6v6l4 2" stroke={`url(#${gid})`} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="1.2" fill={`url(#${gid})`} opacity="0.5" />
      <circle cx="12" cy="4" r="0.6" fill={`url(#${gid})`} opacity="0.4" />
      <circle cx="20" cy="12" r="0.6" fill={`url(#${gid})`} opacity="0.4" />
      <circle cx="12" cy="20" r="0.6" fill={`url(#${gid})`} opacity="0.4" />
      <circle cx="4" cy="12" r="0.6" fill={`url(#${gid})`} opacity="0.4" />
    </svg>
  );
}

export function GenericIcon(props: Ic) {
  const id = useId();
  const gid = `gen-${id}`;
  return (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <defs>
        <linearGradient id={gid} x1="3" y1="3" x2="21" y2="21" gradientUnits="userSpaceOnUse">
          <stop stopColor="#94A3B8" />
          <stop offset="1" stopColor="#64748B" />
        </linearGradient>
      </defs>
      <path d="M10 4H6a2 2 0 00-2 2v12a2 2 0 002 2h12a2 2 0 002-2v-8" fill={`url(#${gid})`} opacity="0.08" />
      <path d="M10 4H6a2 2 0 00-2 2v12a2 2 0 002 2h12a2 2 0 002-2v-8" stroke={`url(#${gid})`} strokeWidth="1.3" />
      <path d="M10 4l4-0.5L20 10v0" stroke={`url(#${gid})`} strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M14 3.5V9a1 1 0 001 1h5.5" stroke={`url(#${gid})`} strokeWidth="1.2" opacity="0.5" />
      <path d="M8 14h4M8 17h6" stroke={`url(#${gid})`} strokeWidth="1.1" strokeLinecap="round" opacity="0.4" />
    </svg>
  );
}

export function CoursIcon(props: Ic) {
  const id = useId();
  const gold = `crs-g-${id}`;
  const page = `crs-p-${id}`;
  const mask = `crs-m-${id}`;
  return (
    <svg viewBox="0 0 32 42" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <defs>
        <linearGradient id={gold} x1="0" y1="0" x2="32" y2="42" gradientUnits="userSpaceOnUse">
          <stop stopColor="#E3C286" />
          <stop offset="1" stopColor="#C9A84C" />
        </linearGradient>
        <linearGradient id={page} x1="4" y1="2" x2="28" y2="40" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FEFCF8" />
          <stop offset="1" stopColor="#F0EBE0" />
        </linearGradient>
        <clipPath id={mask}><rect x="1.5" y="1.5" width="29" height="39" rx="2" /></clipPath>
      </defs>

      {/* Page shadow */}
      <rect x="2.5" y="2.5" width="29" height="39" rx="2.5" fill="#000" opacity="0.15" />
      {/* Page */}
      <rect x="1.5" y="1.5" width="29" height="39" rx="2.5" fill={`url(#${page})`} />
      {/* Gold border */}
      <rect x="1.5" y="1.5" width="29" height="39" rx="2.5" fill="none" stroke={`url(#${gold})`} strokeWidth="0.7" />

      <g clipPath={`url(#${mask})`}>
        {/* Header bar */}
        <rect x="1.5" y="1.5" width="29" height="6.5" fill="#0B1A2E" />

        {/* DS logo mark in header — simplified S-curve from the real logo */}
        <g transform="translate(3.5, 2.2) scale(0.028)" opacity="0.9">
          <path fill="#C9A84C" d="M158.61,157.69c-1.01-.67-2.21-.9-3.39-.65-1.17.25-2.17.93-2.82,1.94l-1.19,1.85c-.95,1.47-2.4,2.47-4.09,2.82-.55.12-1.12.16-1.71.12-.03,0-.05,0-.08,0-.74-.05-1.47-.25-2.14-.55-.32-.14-.63-.3-.92-.49l-6.63-4.39-.71-.47c-5.11-3.39-11.97-1.95-15.29,3.2-1.6,2.48-2.15,5.45-1.54,8.36.61,2.92,2.31,5.42,4.78,7.06l11.39,7.54,6.6,4.37,4.03,2.67c1.47.97,2.47,2.47,2.82,4.22.34,1.71.01,3.45-.92,4.9-.95,1.47-2.4,2.47-4.09,2.82-1.07.22-2.15.17-3.17-.14-.59-.18-1.15-.44-1.68-.79l-3.67-2.43c-.24-.16-.48-.29-.73-.43-1.07-.6-2.21-1.02-3.4-1.24h-.07c-.05-.01-.1-.02-.15-.03-1.33-.22-2.67-.18-3.98.09-2.88.61-5.36,2.31-6.96,4.8l-2.6,3.63s.03.02.06.04c.05.03.12.02.15-.02l2.6-3.63c.92-1.43,2.37-2.43,4.06-2.78,1.69-.35,3.41-.02,4.85.93l5.17,3.42,2.17,1.44c.49.33,1.02.62,1.57.87.72.32,1.45.55,2.19.72,4.4.97,8.99-.84,11.53-4.78,1.6-2.48,2.15-5.45,1.54-8.36-.61-2.92-2.31-5.42-4.78-7.06l-6.06-4.01-6.79-4.5-9.17-6.07c-1.45-.96-2.45-2.43-2.81-4.15-.36-1.73-.04-3.49.91-4.96.95-1.47,2.4-2.47,4.09-2.82,1.68-.35,3.41-.02,4.85.93l2.93,1.94,7.35,4.87.73.49c.32.21.65.4.98.58,5.06,2.65,11.21,1.03,14.31-3.78l1.19-1.85c.64-1,.86-2.19.62-3.36-.25-1.18-.93-2.19-1.94-2.86Z" />
        </g>

        {/* Thin gold accent line under header */}
        <rect x="1.5" y="8" width="29" height="0.5" fill={`url(#${gold})`} opacity="0.5" />

        {/* Revision dots — subtle, tiny */}
        {[0,1,2,3,4].map(i => (
          <rect key={i} x={18 + i * 2.4} y="3.5" width="1.6" height="2" rx="0.4" fill="none" stroke="#C9A84C" strokeWidth="0.3" opacity="0.5" />
        ))}

        {/* Title area placeholder */}
        <rect x="5" y="11" width="22" height="2.5" rx="0.8" fill="#0B1A2E" opacity="0.08" />
        <rect x="8" y="14.5" width="16" height="1.5" rx="0.5" fill={`url(#${gold})`} opacity="0.12" />

        {/* Separator */}
        <line x1="5" y1="17.5" x2="27" y2="17.5" stroke={`url(#${gold})`} strokeWidth="0.3" opacity="0.3" />

        {/* Two-column content */}
        <rect x="4" y="19" width="11" height="14" rx="0.8" fill="none" stroke="#0B1A2E" strokeWidth="0.25" opacity="0.08" />
        <rect x="17" y="19" width="11" height="14" rx="0.8" fill="none" stroke="#0B1A2E" strokeWidth="0.25" opacity="0.08" />

        {/* Content lines left */}
        <rect x="5.5" y="20.5" width="8" height="0.6" rx="0.2" fill="#0B1A2E" opacity="0.06" />
        <rect x="5.5" y="22.5" width="6.5" height="0.6" rx="0.2" fill="#0B1A2E" opacity="0.05" />
        <rect x="5.5" y="24.5" width="7.5" height="0.6" rx="0.2" fill="#0B1A2E" opacity="0.04" />
        <rect x="5.5" y="26.5" width="5" height="0.6" rx="0.2" fill="#0B1A2E" opacity="0.03" />

        {/* Content lines right */}
        <rect x="18.5" y="20.5" width="8" height="0.6" rx="0.2" fill="#0B1A2E" opacity="0.06" />
        <rect x="18.5" y="22.5" width="6.5" height="0.6" rx="0.2" fill="#0B1A2E" opacity="0.05" />
        <rect x="18.5" y="24.5" width="7.5" height="0.6" rx="0.2" fill="#0B1A2E" opacity="0.04" />
        <rect x="18.5" y="26.5" width="5" height="0.6" rx="0.2" fill="#0B1A2E" opacity="0.03" />

        {/* DS watermark — the real logo S-curve, very faint */}
        <g transform="translate(8, 20) scale(0.065)" opacity="0.035">
          <path fill="#C9A84C" d="M158.61,157.69c-1.01-.67-2.21-.9-3.39-.65-1.17.25-2.17.93-2.82,1.94l-1.19,1.85c-.95,1.47-2.4,2.47-4.09,2.82-.55.12-1.12.16-1.71.12-.03,0-.05,0-.08,0-.74-.05-1.47-.25-2.14-.55-.32-.14-.63-.3-.92-.49l-6.63-4.39-.71-.47c-5.11-3.39-11.97-1.95-15.29,3.2-1.6,2.48-2.15,5.45-1.54,8.36.61,2.92,2.31,5.42,4.78,7.06l11.39,7.54,6.6,4.37,4.03,2.67c1.47.97,2.47,2.47,2.82,4.22.34,1.71.01,3.45-.92,4.9-.95,1.47-2.4,2.47-4.09,2.82-1.07.22-2.15.17-3.17-.14-.59-.18-1.15-.44-1.68-.79l-3.67-2.43c-.24-.16-.48-.29-.73-.43-1.07-.6-2.21-1.02-3.4-1.24h-.07c-.05-.01-.1-.02-.15-.03-1.33-.22-2.67-.18-3.98.09-2.88.61-5.36,2.31-6.96,4.8l-2.6,3.63s.03.02.06.04c.05.03.12.02.15-.02l2.6-3.63c.92-1.43,2.37-2.43,4.06-2.78,1.69-.35,3.41-.02,4.85.93l5.17,3.42,2.17,1.44c.49.33,1.02.62,1.57.87.72.32,1.45.55,2.19.72,4.4.97,8.99-.84,11.53-4.78,1.6-2.48,2.15-5.45,1.54-8.36-.61-2.92-2.31-5.42-4.78-7.06l-6.06-4.01-6.79-4.5-9.17-6.07c-1.45-.96-2.45-2.43-2.81-4.15-.36-1.73-.04-3.49.91-4.96.95-1.47,2.4-2.47,4.09-2.82,1.68-.35,3.41-.02,4.85.93l2.93,1.94,7.35,4.87.73.49c.32.21.65.4.98.58,5.06,2.65,11.21,1.03,14.31-3.78l1.19-1.85c.64-1,.86-2.19.62-3.36-.25-1.18-.93-2.19-1.94-2.86Z" />
        </g>

        {/* Bottom bar */}
        <rect x="1.5" y="35" width="29" height="5.5" fill="#0B1A2E" opacity="0.03" />
        <rect x="5" y="37" width="6" height="0.5" rx="0.2" fill="#0B1A2E" opacity="0.06" />
        <rect x="13" y="37" width="6" height="0.5" rx="0.2" fill="#0B1A2E" opacity="0.04" />
        <rect x="21" y="37" width="6" height="0.5" rx="0.2" fill="#0B1A2E" opacity="0.04" />
      </g>
    </svg>
  );
}

export function SubOfferIcon(props: Ic) {
  const id = useId();
  const gid = `suboff-${id}`;
  return (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <defs>
        <linearGradient id={gid} x1="4" y1="2" x2="20" y2="22" gradientUnits="userSpaceOnUse">
          <stop stopColor="#E3C286" />
          <stop offset="1" stopColor="#C9A84C" />
        </linearGradient>
      </defs>
      <path d="M12 2L3 7v4c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-9-5z" stroke={`url(#${gid})`} strokeWidth="1.3" strokeLinejoin="round" fill={`url(#${gid})`} opacity="0.08" />
      <path d="M8 10h8M8 13h8M8 16h5" stroke={`url(#${gid})`} strokeWidth="1.1" strokeLinecap="round" opacity="0.5" />
    </svg>
  );
}

// ─── Serie type icons ─────────────────────────────────────────────────────

export function AnnalesIcon(props: Ic) {
  const id = useId();
  const g = `ann-${id}`;
  return (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <defs>
        <linearGradient id={g} x1="3" y1="2" x2="21" y2="22" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FCD34D" />
          <stop offset="1" stopColor="#F59E0B" />
        </linearGradient>
      </defs>
      <rect x="4" y="2" width="16" height="20" rx="2.5" fill={`url(#${g})`} opacity="0.18" stroke={`url(#${g})`} strokeWidth="1.5" />
      <path d="M4 7h16" stroke={`url(#${g})`} strokeWidth="1.2" opacity="0.5" />
      <path d="M8 4.5h3" stroke={`url(#${g})`} strokeWidth="1.5" strokeLinecap="round" opacity="0.7" />
      <path d="M8 10.5h8" stroke={`url(#${g})`} strokeWidth="1.3" strokeLinecap="round" opacity="0.6" />
      <path d="M8 13.5h6" stroke={`url(#${g})`} strokeWidth="1.2" strokeLinecap="round" opacity="0.45" />
      <circle cx="17" cy="18" r="3.5" fill={`url(#${g})`} opacity="0.25" stroke={`url(#${g})`} strokeWidth="1.2" />
      <path d="M15.8 18l1 1 2-2.2" stroke={`url(#${g})`} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function QcmIcon(props: Ic) {
  const id = useId();
  const g = `qcm-${id}`;
  return (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <defs>
        <linearGradient id={g} x1="3" y1="3" x2="21" y2="21" gradientUnits="userSpaceOnUse">
          <stop stopColor="#5EEAD4" />
          <stop offset="1" stopColor="#14B8A6" />
        </linearGradient>
      </defs>
      <rect x="3" y="3" width="18" height="18" rx="3" fill={`url(#${g})`} opacity="0.15" stroke={`url(#${g})`} strokeWidth="1.5" />
      <rect x="6" y="6.5" width="3" height="3" rx="0.8" fill={`url(#${g})`} opacity="0.2" stroke={`url(#${g})`} strokeWidth="1.2" />
      <path d="M6.8 8l0.8 0.8 1.6-1.6" stroke={`url(#${g})`} strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M11.5 7.5h6" stroke={`url(#${g})`} strokeWidth="1.2" strokeLinecap="round" opacity="0.65" />
      <rect x="6" y="11" width="3" height="3" rx="0.8" fill="none" stroke={`url(#${g})`} strokeWidth="1.2" opacity="0.6" />
      <path d="M11.5 12h5" stroke={`url(#${g})`} strokeWidth="1.2" strokeLinecap="round" opacity="0.5" />
      <rect x="6" y="15.5" width="3" height="3" rx="0.8" fill="none" stroke={`url(#${g})`} strokeWidth="1.2" opacity="0.45" />
      <path d="M11.5 16.5h4" stroke={`url(#${g})`} strokeWidth="1.2" strokeLinecap="round" opacity="0.4" />
    </svg>
  );
}

export function ConcoursIcon(props: Ic) {
  const id = useId();
  const g = `con-${id}`;
  return (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <defs>
        <linearGradient id={g} x1="4" y1="2" x2="20" y2="22" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FCA5A5" />
          <stop offset="1" stopColor="#EF4444" />
        </linearGradient>
      </defs>
      <path d="M6 4h12a2 2 0 012 2v3a6 6 0 01-6 6 6 6 0 01-6-6V6a2 2 0 012-2z" fill={`url(#${g})`} opacity="0.18" stroke={`url(#${g})`} strokeWidth="1.5" />
      <path d="M12 15v3" stroke={`url(#${g})`} strokeWidth="1.5" strokeLinecap="round" />
      <path d="M8 20h8" stroke={`url(#${g})`} strokeWidth="1.5" strokeLinecap="round" opacity="0.7" />
      <path d="M4 6h2M18 6h2" stroke={`url(#${g})`} strokeWidth="1.3" strokeLinecap="round" opacity="0.55" />
      <circle cx="12" cy="9" r="1.8" fill={`url(#${g})`} opacity="0.65" />
    </svg>
  );
}

export function RevisionIcon(props: Ic) {
  const id = useId();
  const g = `rev-${id}`;
  return (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <defs>
        <linearGradient id={g} x1="3" y1="3" x2="21" y2="21" gradientUnits="userSpaceOnUse">
          <stop stopColor="#C4B5FD" />
          <stop offset="1" stopColor="#8B5CF6" />
        </linearGradient>
      </defs>
      <circle cx="12" cy="12" r="9" fill={`url(#${g})`} opacity="0.15" stroke={`url(#${g})`} strokeWidth="1.5" />
      <path d="M8 12l2.5 2.5L16 9" stroke={`url(#${g})`} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 3.5V5M12 19v1.5M3.5 12H5M19 12h1.5" stroke={`url(#${g})`} strokeWidth="1.2" strokeLinecap="round" opacity="0.45" />
    </svg>
  );
}

export function FlashcardIcon(props: Ic) {
  const id = useId();
  const g = `flash-${id}`;
  return (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <defs>
        <linearGradient id={g} x1="3" y1="3" x2="21" y2="21" gradientUnits="userSpaceOnUse">
          <stop stopColor="#A5B4FC" />
          <stop offset="1" stopColor="#6366F1" />
        </linearGradient>
      </defs>
      <rect x="2" y="5" width="16" height="12" rx="2" fill={`url(#${g})`} opacity="0.12" stroke={`url(#${g})`} strokeWidth="1.3" transform="rotate(-3 10 11)" />
      <rect x="5" y="6" width="16" height="12" rx="2" fill={`url(#${g})`} opacity="0.18" stroke={`url(#${g})`} strokeWidth="1.5" />
      <path d="M9 10h8M9 13h5" stroke={`url(#${g})`} strokeWidth="1.2" strokeLinecap="round" opacity="0.55" />
    </svg>
  );
}

const DOSSIER_ICON_MAP: Record<string, React.FC<Ic>> = {
  offer: OfferIcon,
  sub_offer: SubOfferIcon,
  university: UniversityIcon,
  semester: SemesterIcon,
  subject: SubjectIcon,
  module: ModuleIcon,
  option: OptionIcon,
  period: PeriodIcon,
  generic: GenericIcon,
};

export function DossierTypeIcon({ type, ...props }: { type: string } & Ic) {
  const Icon = DOSSIER_ICON_MAP[type] ?? GenericIcon;
  return <Icon {...props} />;
}
