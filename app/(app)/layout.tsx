import { cookies } from 'next/headers';
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AppSidebar } from './_components/app-sidebar';
import { AppNavbar } from './_components/app-navbar';
import { requireUser } from '@/lib/auth/require-role';
import { listActiveUnitsForSwitcher } from '@/lib/units/queries';
import { ModalStyleProvider } from '@/lib/preferences/modal-style-context';
import { readUiPreferences } from '@/lib/preferences/cookie';
import { AppContextProvider } from '@/lib/auth/context';
import { defaultEnabledModules, getEnabledModules } from '@/lib/dashboard/modules';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const cookieStore = await cookies();
  const defaultOpen = cookieStore.get('sidebar_state')?.value !== 'false';
  const { modal_style: modalStyle } = await readUiPreferences();
  const unitId = user.activeUnitId ?? user.homeUnitId;

  const [units, enabledModules] = await Promise.all([
    user.role === 'super_admin'
      ? listActiveUnitsForSwitcher()
      : Promise.resolve([] as { id: string; name: string; code: string }[]),
    unitId
      ? getEnabledModules(unitId).catch(() => defaultEnabledModules())
      : Promise.resolve(defaultEnabledModules()),
  ]);

  return (
    <TooltipProvider>
      <ModalStyleProvider value={modalStyle}>
        <AppContextProvider user={user}>
          <SidebarProvider defaultOpen={defaultOpen}>
            <AppSidebar enabledModules={enabledModules} />
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
