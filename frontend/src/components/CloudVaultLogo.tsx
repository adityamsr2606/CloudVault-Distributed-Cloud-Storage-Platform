type LogoProps = {
  compact?: boolean;
  className?: string;
};

export default function CloudVaultLogo({ compact = false, className = "" }: LogoProps) {
  return (
    <div className={`cloudvault-logo ${compact ? "compact" : ""} ${className}`.trim()}>
      <svg
        className="cloudvault-logo-mark"
        viewBox="0 0 48 48"
        role="img"
        aria-label="CloudVault"
      >
        <defs>
          <linearGradient id="cv-metal" x1="8" y1="7" x2="39" y2="42" gradientUnits="userSpaceOnUse">
            <stop stopColor="var(--logo-highlight)" />
            <stop offset="1" stopColor="var(--accent)" />
          </linearGradient>
        </defs>
        <path
          className="logo-shell"
          d="M24 3.7 40.5 13v18L24 44.3 7.5 35V13L24 3.7Z"
          fill="none"
          stroke="url(#cv-metal)"
          strokeWidth="2.7"
          strokeLinejoin="round"
        />
        <path
          className="logo-vault-arc"
          d="M15 25.1c0-5.6 4-9.7 9-9.7s9 4.1 9 9.7"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.7"
          strokeLinecap="round"
        />
        <path
          className="logo-vault-line"
          d="M14.8 25.1h18.4"
          stroke="currentColor"
          strokeWidth="2.7"
          strokeLinecap="round"
        />
        <circle cx="24" cy="30.1" r="3.2" fill="url(#cv-metal)" />
        <path
          d="M24 33.4v3.5"
          stroke="url(#cv-metal)"
          strokeWidth="2.4"
          strokeLinecap="round"
        />
      </svg>
      {!compact && (
        <span className="cloudvault-wordmark">
          <strong>CloudVault</strong>
          <small>personal intelligence storage</small>
        </span>
      )}
    </div>
  );
}
