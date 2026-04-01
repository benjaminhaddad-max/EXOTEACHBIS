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
  const gid = `cours-${id}`;
  return (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <defs>
        <linearGradient id={gid} x1="3" y1="2" x2="21" y2="22" gradientUnits="userSpaceOnUse">
          <stop stopColor="#4fabdb" />
          <stop offset="1" stopColor="#2980B9" />
        </linearGradient>
      </defs>
      <rect x="4" y="2" width="16" height="20" rx="2.5" fill={`url(#${gid})`} opacity="0.08" stroke={`url(#${gid})`} strokeWidth="1.3" />
      <path d="M4 7h16" stroke={`url(#${gid})`} strokeWidth="1" opacity="0.3" />
      <circle cx="7.5" cy="4.5" r="0.7" fill={`url(#${gid})`} opacity="0.6" />
      <circle cx="10" cy="4.5" r="0.7" fill={`url(#${gid})`} opacity="0.4" />
      <circle cx="12.5" cy="4.5" r="0.7" fill={`url(#${gid})`} opacity="0.25" />
      <path d="M8 11h8M8 14h6M8 17h4" stroke={`url(#${gid})`} strokeWidth="1.2" strokeLinecap="round" opacity="0.45" />
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
