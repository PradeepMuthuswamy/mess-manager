import { GroceryNav } from './_components/grocery-nav';

export default function GroceryLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-6">
      <GroceryNav />
      <div>{children}</div>
    </div>
  );
}
