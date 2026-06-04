import { requireCapability } from '@/lib/auth/require-capability';
import { ModulePlaceholder } from '../_components/module-placeholder';

export default async function BarPage() {
  await requireCapability('bar.read');
  return (
    <ModulePlaceholder
      title="Bar"
      description="Log alcohol and cigar consumption per officer; close monthly bar bills."
      capabilities={['bar.read', 'bar.write', 'bar.finalize']}
    />
  );
}
