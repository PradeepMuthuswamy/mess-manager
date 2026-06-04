import { ShieldCheck, ScrollText, KeyRound, Building2 } from 'lucide-react';

const trustPoints = [
  { icon: ShieldCheck, label: 'Invitation-only access', delay: '[animation-delay:240ms]' },
  { icon: ScrollText, label: 'Audited end to end', delay: '[animation-delay:300ms]' },
  { icon: KeyRound, label: 'Capability-scoped per appointment', delay: '[animation-delay:360ms]' },
  { icon: Building2, label: 'Multi-unit isolation', delay: '[animation-delay:420ms]' },
];

export function AuthBrandPanel() {
  return (
    <div className="relative hidden overflow-hidden bg-primary text-primary-foreground lg:flex lg:flex-col lg:justify-between lg:p-12 xl:p-16">
      {/* Token-based radial accent, layered subtly behind content */}
      <div
        className="auth-bloom pointer-events-none absolute inset-0 opacity-60"
        aria-hidden="true"
      />

      <div className="relative z-10 animate-in fade-in-0 slide-in-from-left-4 duration-[320ms] ease-[var(--ease-out)] motion-reduce:animate-none motion-reduce:opacity-100 motion-reduce:translate-none">
        <span className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-primary-foreground/80">
          Officers Mess
        </span>
      </div>

      <div className="relative z-10 max-w-md">
        <p className="animate-in fade-in-0 slide-in-from-left-4 text-balance text-3xl font-semibold leading-[1.1] tracking-tight duration-[320ms] [animation-delay:80ms] ease-[var(--ease-out)] motion-reduce:animate-none motion-reduce:opacity-100 motion-reduce:translate-none xl:text-4xl">
          One system for the entire mess.
        </p>
        <p className="animate-in fade-in-0 slide-in-from-left-4 mt-5 text-balance text-sm leading-relaxed text-primary-foreground/80 duration-[320ms] [animation-delay:160ms] ease-[var(--ease-out)] motion-reduce:animate-none motion-reduce:opacity-100 motion-reduce:translate-none">
          Ration, bar, guest rooms, parties and billing — every figure traced to
          a versioned rate, every change on the audit log.
        </p>

        <ul className="mt-10 space-y-px">
          {trustPoints.map(({ icon: Icon, label, delay }) => (
            <li
              key={label}
              className={`flex items-center gap-3 border-t border-primary-foreground/15 py-3 text-sm text-primary-foreground/80 animate-in fade-in-0 slide-in-from-left-4 duration-[320ms] ease-[var(--ease-out)] motion-reduce:animate-none motion-reduce:opacity-100 motion-reduce:translate-none ${delay}`}
            >
              <Icon className="size-5 shrink-0 text-primary-foreground" aria-hidden />
              {label}
            </li>
          ))}
        </ul>
      </div>

      <p className="relative z-10 font-sans text-xs text-primary-foreground/80 animate-in fade-in-0 duration-[320ms] [animation-delay:480ms] ease-[var(--ease-out)] motion-reduce:animate-none motion-reduce:opacity-100">
        Invite-only platform. All access is audited.
      </p>
    </div>
  );
}
