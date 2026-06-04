import { requireCapability } from '@/lib/auth/require-capability';
import { requireUser } from '@/lib/auth/require-role';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ReceiptText, CreditCard, Download, ArrowUpRight, CheckCircle2, History } from 'lucide-react';

export default async function BillingPage() {
  await requireCapability('billing.read');
  const user = await requireUser();

  const activeInvoices = [
    {
      id: 'INV-2026-05',
      period: 'May 2026',
      dueDate: '10 Jun 2026',
      messing: '₹14,850.00',
      guestRooms: '₹7,500.00',
      barLounge: '₹2,000.00',
      total: '₹24,350.00',
      status: 'unpaid',
    },
    {
      id: 'INV-2026-04',
      period: 'April 2026',
      dueDate: '10 May 2026',
      messing: '₹15,200.00',
      guestRooms: '₹0.00',
      barLounge: '₹3,450.00',
      total: '₹18,650.00',
      status: 'paid',
    },
    {
      id: 'INV-2026-03',
      period: 'March 2026',
      dueDate: '10 Apr 2026',
      messing: '₹16,400.00',
      guestRooms: '₹12,000.00',
      barLounge: '₹1,500.00',
      total: '₹29,900.00',
      status: 'paid',
    },
  ];

  const transactionHistory = [
    { date: '10 May 2026', ref: 'TXN-9823412', method: 'UPI (GPay)', amount: '₹18,650.00', status: 'Success' },
    { date: '08 Apr 2026', ref: 'TXN-7412093', method: 'Net Banking', amount: '₹29,900.00', status: 'Success' },
  ];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-mono uppercase tracking-widest text-primary mb-1">
            Officer Portal
          </p>
          <h1 className="text-3xl font-bold font-heading tracking-tight text-foreground">
            Billing & Invoices
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Review monthly mess bills, download statement PDFs, and make secure dues settlements.
          </p>
        </div>
      </div>

      {/* Main Stats Card */}
      <div className="grid gap-6 md:grid-cols-3">
        <Card className="border-border bg-gradient-to-br from-primary/5 via-transparent to-transparent md:col-span-2">
          <CardHeader>
            <CardTitle className="font-heading text-lg font-semibold flex items-center gap-2">
              <ReceiptText className="size-5 text-primary" /> Outstanding Dues
            </CardTitle>
            <CardDescription>Current Billing Period — May 1 to May 30, 2026</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider font-mono">Amount Payable</p>
                <p className="text-4xl font-black font-mono tracking-tight text-foreground mt-1">₹24,350.00</p>
                <p className="text-xs text-destructive mt-1.5 flex items-center gap-1">
                  Due on or before 10 June 2026
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button className="gap-2 shadow-xs transition-ds hover:opacity-95">
                  <CreditCard className="size-4" /> Pay Outstanding
                </Button>
                <Button variant="outline" className="gap-2">
                  <Download className="size-4" /> Download Statement
                </Button>
              </div>
            </div>

            <div className="h-px bg-border" />

            <div className="grid grid-cols-3 gap-4 text-xs">
              <div>
                <span className="text-muted-foreground block mb-0.5">Messing & Catering</span>
                <span className="font-mono font-bold text-foreground text-sm">₹14,850.00</span>
              </div>
              <div>
                <span className="text-muted-foreground block mb-0.5">Guest Rooms</span>
                <span className="font-mono font-bold text-foreground text-sm">₹7,500.00</span>
              </div>
              <div>
                <span className="text-muted-foreground block mb-0.5">Bar & Lounge</span>
                <span className="font-mono font-bold text-foreground text-sm">₹2,000.00</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardHeader>
            <CardTitle className="font-heading text-base font-semibold flex items-center gap-2">
              <CheckCircle2 className="size-4 text-success" /> Auto-Debit Status
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground space-y-4">
            <p className="leading-relaxed">
              Your billing account is registered for standard officers' monthly payroll auto-debit. Dues are deducted on the 1st of every month directly via base-pay settlement.
            </p>
            <div className="rounded-lg bg-success/5 border border-success/15 p-3 flex gap-2">
              <span className="size-2 rounded-full bg-success mt-1 shrink-0" />
              <div>
                <span className="font-medium text-foreground block">Payroll Link Active</span>
                <span className="text-[10px] text-muted-foreground">Settlement Date: 01 Jun 2026</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Invoices List */}
      <section aria-labelledby="invoices-heading" className="space-y-4">
        <h2 id="invoices-heading" className="text-sm font-semibold font-heading text-foreground uppercase tracking-wide">
          Statement & Invoice History
        </h2>

        <div className="rounded-lg border border-border bg-card shadow-xs overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-muted/40 border-b border-border text-muted-foreground font-semibold text-left">
                <th className="px-4 py-3">Invoice ID</th>
                <th className="px-4 py-3">Billing Cycle</th>
                <th className="px-4 py-3">Due Date</th>
                <th className="px-4 py-3 text-right">Messing</th>
                <th className="px-4 py-3 text-right">Rooms</th>
                <th className="px-4 py-3 text-right">Bar & Lounge</th>
                <th className="px-4 py-3 text-right">Total Invoice</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right w-16">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {activeInvoices.map((inv) => (
                <tr key={inv.id} className="hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-3.5 font-mono font-medium text-foreground">{inv.id}</td>
                  <td className="px-4 py-3.5 text-foreground font-medium">{inv.period}</td>
                  <td className="px-4 py-3.5 text-muted-foreground font-mono">{inv.dueDate}</td>
                  <td className="px-4 py-3.5 text-right font-mono text-muted-foreground">{inv.messing}</td>
                  <td className="px-4 py-3.5 text-right font-mono text-muted-foreground">{inv.guestRooms}</td>
                  <td className="px-4 py-3.5 text-right font-mono text-muted-foreground">{inv.barLounge}</td>
                  <td className="px-4 py-3.5 text-right font-mono font-bold text-foreground">{inv.total}</td>
                  <td className="px-4 py-3.5">
                    <Badge variant={inv.status === 'paid' ? 'success' : 'destructive'} className="text-[10px] px-1.5 py-0">
                      {inv.status === 'paid' ? 'Paid' : 'Unpaid'}
                    </Badge>
                  </td>
                  <td className="px-4 py-3.5 text-right">
                    <Button variant="ghost" size="icon" className="h-6 w-6">
                      <Download className="size-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Transaction Ledger */}
      <section aria-labelledby="ledger-heading" className="space-y-4">
        <h2 id="ledger-heading" className="text-sm font-semibold font-heading text-foreground uppercase tracking-wide flex items-center gap-2">
          <History className="size-4 text-muted-foreground" /> Recent Payments & Credits
        </h2>

        <div className="rounded-lg border border-border bg-card shadow-xs overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-muted/40 border-b border-border text-muted-foreground font-semibold text-left">
                <th className="px-4 py-3">Receipt Date</th>
                <th className="px-4 py-3">Reference ID</th>
                <th className="px-4 py-3">Payment Channel</th>
                <th className="px-4 py-3 text-right">Settled Amount</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {transactionHistory.map((txn, idx) => (
                <tr key={idx} className="hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-3.5 text-muted-foreground">{txn.date}</td>
                  <td className="px-4 py-3.5 font-mono text-foreground font-medium">{txn.ref}</td>
                  <td className="px-4 py-3.5 text-muted-foreground">{txn.method}</td>
                  <td className="px-4 py-3.5 text-right font-mono font-bold text-foreground">{txn.amount}</td>
                  <td className="px-4 py-3.5 text-success font-medium flex items-center gap-1 pt-4">
                    <ArrowUpRight className="size-3.5" /> {txn.status}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
