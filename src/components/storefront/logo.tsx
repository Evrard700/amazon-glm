import { cn } from "@/lib/utils"

/** Logo Téranga Market : sac de shopping stylisé avec accent ambre. */
export function Logo({ className, light }: { className?: string; light?: boolean }) {
  return (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn(className)}
      role="img"
      aria-label="Logo Téranga Market"
    >
      <rect width="48" height="48" rx="12" className={light ? "fill-white" : "fill-primary"} />
      <path
        d="M15 17h18l-1.6 14.2a3 3 0 0 1-3 2.6h-8.8a3 3 0 0 1-3-2.6L15 17Z"
        className="fill-brand"
      />
      <path
        d="M19.5 17v-2.5a4.5 4.5 0 0 1 9 0V17"
        stroke={light ? "#18181b" : "white"}
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <path d="M20 22.5c.8 1 1.6 1.5 2.3 1.5.9 0 1.4-.8 2-1.5.6-.7 1.1-1.5 2-1.5.9 0 1.7.7 2.7 2" stroke={light ? "#18181b" : "white"} strokeWidth="1.8" strokeLinecap="round" className="opacity-80" />
    </svg>
  )
}
