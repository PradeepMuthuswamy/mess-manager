import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error('Missing env vars');
    process.exit(1);
  }

  const supabase = createClient(url, serviceKey);

  // Query a real unit
  console.log('Querying a real unit from units table...');
  const { data: units, error: uErr } = await supabase.from('units').select('id').limit(1);
  if (uErr || !units || units.length === 0) {
    console.error('Error or no units found:', uErr);
    process.exit(1);
  }
  const realUnitId = units[0].id;
  console.log('Found unit ID:', realUnitId);

  // Check columns of rooms table by attempting a dummy insert
  console.log('Inserting dummy room to inspect schema...');
  const { data, error } = await supabase
    .from('rooms')
    .insert({
      name: 'Temp Test Room Unique Name',
      unit_id: realUnitId,
    })
    .select();

  if (error) {
    console.error('Error inserting dummy room:', error.message, error.details, error.hint);
  } else {
    console.log('Successfully inserted dummy room!');
    console.log('Keys of returned data:', Object.keys(data[0]));
    console.log('Row details:', data[0]);
    // Clean up
    await supabase.from('rooms').delete().eq('id', data[0].id);
  }
}

main().catch(console.error);
