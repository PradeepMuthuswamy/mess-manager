import { cookies } from 'next/headers';
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AppSidebar } from './_components/app-sidebar';
import { AppNavbar } from './_components/app-navbar';
import { requireUser } from '@/lib/auth/require-role';
import { ModalStyleProvider } from '@/lib/preferences/modal-style-context';
import { readUiPreferences } from '@/lib/preferences/cookie';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const cookieStore = await cookies();
  const defaultOpen = cookieStore.get('sidebar_state')?.value !== 'false';
  const { modal_style: modalStyle } = await readUiPreferences();

  return (
    <TooltipProvider>
      <ModalStyleProvider value={modalStyle}>
        <SidebarProvider defaultOpen={defaultOpen}>
          <AppSidebar user={user} />
          <SidebarInset>
            <AppNavbar user={user} />
            <main className="flex-1 px-6 py-6 [&>*]:mx-auto [&>*]:max-w-7xl">{children}</main>
          </SidebarInset>
        </SidebarProvider>
      </ModalStyleProvider>
    </TooltipProvider>
  );
}
