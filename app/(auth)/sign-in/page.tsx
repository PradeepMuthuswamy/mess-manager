import { SignInForm } from '../_components/sign-in-form';

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const rawNext = params.next;
  const next = typeof rawNext === 'string' ? rawNext : undefined;
  const rawError = params.error;
  const error = typeof rawError === 'string' ? rawError : undefined;

  return (
    <div className="flex flex-col gap-6">
      <div className="space-y-1">
        <h1 className="font-heading text-xl font-semibold tracking-tight text-foreground">
          Sign in
        </h1>
        <p className="text-sm text-muted-foreground">
          Use your invite credentials to continue.
        </p>
      </div>
      {error === 'invalid_link' ? (
        <p role="alert" className="rounded-md border border-destructive/20 bg-destructive/8 px-3 py-2 text-sm text-destructive">
          That link is invalid or expired. Please request a new one.
        </p>
      ) : null}
      <SignInForm next={next} />
    </div>
  );
}
