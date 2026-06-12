import { BarNav } from './_components/bar-nav';

export default function BarLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-6">
      <BarNav />
      <div>{children}</div>
    </div>
  );
}
