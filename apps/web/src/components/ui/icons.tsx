type IconProps = { className?: string };

function Svg({
  children,
  size = 16,
  className,
}: IconProps & { children: React.ReactNode; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {children}
    </svg>
  );
}

export function ChevronLeftIcon({ className }: IconProps) {
  return (
    <Svg size={16} className={className}>
      <path d="M15 18l-6-6 6-6" />
    </Svg>
  );
}

export function PencilIcon({ className }: IconProps) {
  return (
    <Svg size={15} className={className}>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </Svg>
  );
}

export function TrashIcon({ className }: IconProps) {
  return (
    <Svg size={15} className={className}>
      <path d="M3 6h18" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </Svg>
  );
}

export function GearIcon({ className = 'text-ink-muted' }: IconProps) {
  return (
    <Svg size={15} className={className}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </Svg>
  );
}

export function MenuIcon({ className }: IconProps) {
  return (
    <Svg size={18} className={className}>
      <path d="M3 6h18" />
      <path d="M3 12h18" />
      <path d="M3 18h18" />
    </Svg>
  );
}

export function TargetIcon({ className }: IconProps) {
  return (
    <Svg size={18} className={className}>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1" />
    </Svg>
  );
}

export function TagIcon({ className }: IconProps) {
  return (
    <Svg size={18} className={className}>
      <path d="M12.6 2H4a2 2 0 0 0-2 2v8.6a2 2 0 0 0 .59 1.41l9 9a2 2 0 0 0 2.82 0l7.6-7.6a2 2 0 0 0 0-2.82l-9-9A2 2 0 0 0 12.6 2Z" />
      <circle cx="7.5" cy="7.5" r="1.25" />
    </Svg>
  );
}

export function UsersIcon({ className }: IconProps) {
  return (
    <Svg size={18} className={className}>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </Svg>
  );
}

export function HomeIcon({ className }: IconProps) {
  return (
    <Svg size={18} className={className}>
      <path d="M3 11.5 12 4l9 7.5" />
      <path d="M5 10v10h14V10" />
    </Svg>
  );
}

export function TimelineIcon({ className }: IconProps) {
  return (
    <Svg size={18} className={className}>
      <path d="M3 17l5-6 4 3 5-8 4 5" />
    </Svg>
  );
}

export function TrendingUpIcon({ className }: IconProps) {
  return (
    <Svg size={18} className={className}>
      <path d="M3 17l6-6 4 4 8-8" />
      <path d="M15 7h6v6" />
    </Svg>
  );
}

export function TrendingDownIcon({ className }: IconProps) {
  return (
    <Svg size={18} className={className}>
      <path d="M3 7l6 6 4-4 8 8" />
      <path d="M15 17h6v-6" />
    </Svg>
  );
}

export function WalletIcon({ className }: IconProps) {
  return (
    <Svg size={18} className={className}>
      <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" />
      <path d="M3 5v14a2 2 0 0 0 2 2h16v-5" />
      <path d="M18 12a2 2 0 0 0 0 4h4v-4Z" />
    </Svg>
  );
}

export function LayersIcon({ className }: IconProps) {
  return (
    <Svg size={18} className={className}>
      <path d="M12 3 2 8.5 12 14l10-5.5Z" />
      <path d="M2 15.5 12 21l10-5.5" />
      <path d="M2 12l10 5.5L22 12" />
    </Svg>
  );
}
