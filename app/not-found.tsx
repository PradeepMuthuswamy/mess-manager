import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/shared/error-state";

export default function NotFound() {
  return (
    <main className="min-h-screen grid place-items-center p-6 bg-background">
      <div className="w-full max-w-md space-y-6 text-center">
        <p className="font-heading text-[4rem] font-bold leading-none tracking-tight text-muted-foreground/30 select-none">
          404
        </p>
        <ErrorState
          title="Page not found"
          description="The page you are looking for does not exist or has been moved."
          action={
            <Button asChild>
              <Link href="/">Go home</Link>
            </Button>
          }
        />
      </div>
    </main>
  );
}
