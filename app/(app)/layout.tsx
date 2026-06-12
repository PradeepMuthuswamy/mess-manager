import { cookies } from 'next/headers';
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AppSidebar } from './_components/app-sidebar';
import { AppNavbar } from './_components/app-navbar';
import { requireUser } from '@/lib/auth/require-role';
import { createClient } from '@/lib/supabase/server';
import { ModalStyleProvider } from '@/lib/preferences/modal-style-context';
import { readUiPreferences } from '@/lib/preferences/cookie';
import { AppContextProvider } from '@/lib/auth/context';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const cookieStore = await cookies();
  const defaultOpen = cookieStore.get('sidebar_state')?.value !== 'false';
  const { modal_style: modalStyle } = await readUiPreferences();

  // Admins need the list of units for the UnitSwitcher.
  let units: { id: string; name: string; code: string }[] = [];
  if (user.role === 'admin') {
    const supabase = await createClient();
    const { data } = await supabase
      .from('units')
      .select('id, name, code')
      .eq('is_active', true)
      .order('name');
    units = data ?? [];
  }

  return (
    <TooltipProvider>
      <ModalStyleProvider value={modalStyle}>
        <AppContextProvider user={user}>
          <SidebarProvider defaultOpen={defaultOpen}>
            <AppSidebar />
            <SidebarInset>
              <AppNavbar units={units} />
              <main className="flex-1 px-6 py-6 [&>*]:mx-auto [&>*]:max-w-7xl">{children}</main>
            </SidebarInset>
          </SidebarProvider>
        </AppContextProvider>
      </ModalStyleProvider>
    </TooltipProvider>
  );
}
