import { RationNav } from './_components/ration-nav';

export default function RationLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-6">
      <RationNav />
      <div>{children}</div>
    </div>
  );
}
