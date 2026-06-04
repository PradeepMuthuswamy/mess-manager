import { AuthBrandPanel } from '@/components/auth/auth-brand-panel';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative grid min-h-[100dvh] w-full overflow-hidden bg-background lg:grid-cols-2">
      {/* Left brand panel — desktop only (server component) */}
      <AuthBrandPanel />

      {/* Right form column */}
      <div className="relative flex items-center justify-center px-4 py-12">
        {/* Subtle radial accent bloom on mobile where the brand panel is hidden */}
        <div
          className="auth-bloom pointer-events-none absolute inset-0 lg:hidden"
          aria-hidden="true"
        />

        <div className="relative z-10 w-full max-w-md">
          {/* Compact brand lockup — mobile only */}
          <div className="mb-8 flex flex-col items-center gap-3 lg:hidden">
            <span className="inline-flex items-center rounded-full border border-border bg-card px-3 py-1 font-sans text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground shadow-xs">
              Officers Mess
            </span>
            <p className="text-center font-sans text-sm text-muted-foreground">
              Invite-only platform. All access is audited.
            </p>
          </div>

          {/* Card with elevation */}
          <div className="rounded-xl border border-border bg-card shadow-lg dark:elevate-hairline animate-in fade-in-0 slide-in-from-bottom-4 duration-[320ms] ease-[var(--ease-out)] motion-reduce:animate-none motion-reduce:opacity-100 motion-reduce:translate-none">
            <div className="px-8 py-8">{children}</div>
          </div>

          {/* Footer note */}
          <p className="mt-6 text-center font-sans text-xs text-muted-foreground">
            Authorised personnel only
          </p>
        </div>
      </div>
    </div>
  );
}
