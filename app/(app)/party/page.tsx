import { requireCapability } from '@/lib/auth/require-capability';
import { ModulePlaceholder } from '../_components/module-placeholder';

export default async function PartyPage() {
  await requireCapability('parties.read');
  return (
    <ModulePlaceholder
      title="Party"
      description="Plan dining-ins, farewells, and formal nights; record attendance and charges."
      capabilities={['parties.read', 'parties.write', 'parties.finalize']}
    />
  );
}
