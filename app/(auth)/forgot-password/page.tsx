import { ForgotPasswordForm } from '../_components/forgot-password-form';

export default function ForgotPasswordPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="space-y-1">
        <h1 className="font-heading text-xl font-semibold tracking-tight text-foreground">
          Forgot password
        </h1>
        <p className="text-sm text-muted-foreground">
          We&apos;ll email you a reset link if your account exists.
        </p>
      </div>
      <ForgotPasswordForm />
    </div>
  );
}
