import { Construction } from 'lucide-react';
import { EmptyState } from '@/components/shared/empty-state';
import { Badge } from '@/components/ui/badge';

export function ModulePlaceholder({
  title,
  description,
  capabilities,
}: {
  title: string;
  description: string;
  capabilities?: string[];
}) {
  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-heading font-semibold tracking-tight">{title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      <EmptyState
        icon={<Construction className="size-5" />}
        title="Module coming online"
        description="The data model and permission scaffolding for this section is in place. Forms and reports land in upcoming releases."
        action={
          capabilities && capabilities.length > 0 ? (
            <div className="flex flex-wrap justify-center gap-1.5">
              {capabilities.map((c) => (
                <Badge key={c} variant="secondary" className="font-mono text-xs tabular">
                  {c}
                </Badge>
              ))}
            </div>
          ) : undefined
        }
      />
    </div>
  );
}
