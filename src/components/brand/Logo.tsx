import logoUrl from "@/assets/szw-logo.png";
import { cn } from "@/lib/utils";

type LogoProps = {
  className?: string;
  size?: number;
  withWordmark?: boolean;
  tagline?: string;
  wordmarkClassName?: string;
};

/**
 * Saahas Zero Waste brand logo. The mark already includes the wordmark,
 * so when `withWordmark` is false we render only the circular mark.
 */
export function Logo({
  className,
  size = 40,
  withWordmark = false,
  tagline,
  wordmarkClassName,
}: LogoProps) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <div
        className="flex shrink-0 items-center justify-center rounded-xl bg-white ring-1 ring-border shadow-soft overflow-hidden"
        style={{ height: size, width: size }}
      >
        <img
          src={logoUrl}
          alt="Saahas Zero Waste"
          width={size}
          height={size}
          className="h-full w-full object-contain p-1"
          loading="eager"
          decoding="async"
        />
      </div>
      {withWordmark && (
        <div className={cn("min-w-0 leading-tight", wordmarkClassName)}>
          <div className="truncate text-sm font-bold tracking-tight text-foreground">
            Saahas Zero Waste
          </div>
          {tagline && (
            <div className="text-[11px] text-muted-foreground">{tagline}</div>
          )}
        </div>
      )}
    </div>
  );
}

export { logoUrl };
