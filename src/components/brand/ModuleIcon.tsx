import szwLogo from "@/assets/szw-logo.png";

type Kind = "saahas" | "powerbi" | "zoho";

export function ModuleIcon({ kind, active = false, size = 18 }: { kind: Kind; active?: boolean; size?: number }) {
  if (kind === "saahas") {
    return (
      <img
        src={szwLogo}
        alt=""
        width={size}
        height={size}
        className="rounded-sm object-contain"
        style={{ width: size, height: size }}
      />
    );
  }

  if (kind === "powerbi") {
    // Stylized Power BI bar mark
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
        <rect x="3" y="9" width="4" height="12" rx="1" fill={active ? "#fff" : "#F2C811"} />
        <rect x="10" y="5" width="4" height="16" rx="1" fill={active ? "#fff" : "#E8A33D"} />
        <rect x="17" y="2" width="4" height="19" rx="1" fill={active ? "#fff" : "#C75B12"} />
      </svg>
    );
  }

  // zoho
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 6h13l-9 11h9"
        stroke={active ? "#fff" : "#E42527"}
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="18.5" cy="6.2" r="1.6" fill={active ? "#fff" : "#0091D5"} />
    </svg>
  );
}
