'use client';

import { format } from 'date-fns';
import { TrendingUp } from 'lucide-react';
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import { EmptyState } from '@/components/shared/empty-state';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import type { UnitReportSnapshot } from '@/lib/reports/types';

const chartConfig = {
  rate: {
    label: 'P-rate',
  },
} satisfies ChartConfig;

function parseIsoDate(iso: string) {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(year, (month ?? 1) - 1, day ?? 1);
}

function formatDay(iso: string, pattern = 'dd MMM yyyy') {
  return format(parseIsoDate(iso), pattern);
}

function inr(value: number) {
  return `₹${value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function PRateChart({ pRates, periodStart, periodEnd }: UnitReportSnapshot) {
  const data = [...pRates]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((point) => ({
      date: point.date,
      rate: point.rate,
    }));

  const latest = data.at(-1);
  const average =
    data.length === 0 ? 0 : data.reduce((sum, point) => sum + point.rate, 0) / data.length;
  const periodLabel = `${formatDay(periodStart)} – ${formatDay(periodEnd)}`;

  return (
    <Card className="border-border">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between font-heading text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <span className="inline-flex items-center gap-2">
            <TrendingUp className="size-3.5 text-muted-foreground" aria-hidden />
            Messing P-rate
          </span>
          {latest ? (
            <span className="font-mono text-sm font-semibold normal-case tracking-normal text-foreground tabular">
              {inr(latest.rate)}
            </span>
          ) : null}
        </CardTitle>
        <CardDescription>
          {latest
            ? `Latest ${formatDay(latest.date, 'dd MMM')} · avg ${inr(average)} · ${periodLabel}`
            : periodLabel}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <EmptyState
            icon={<TrendingUp className="size-5" />}
            title="No P-rate snapshots"
            description="Daily P-rate appears here after kitchen expenditure is saved and attendance is finalized."
            className="py-10"
          />
        ) : (
          <ChartContainer
            config={chartConfig}
            className="aspect-[2/1] w-full text-chart-1 sm:aspect-[5/2]"
          >
            <AreaChart
              data={data}
              margin={{ top: 8, right: 8, left: 4, bottom: 0 }}
              accessibilityLayer
            >
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis
                dataKey="date"
                tickLine={false}
                axisLine={false}
                minTickGap={28}
                tickFormatter={(value: string) => formatDay(value, 'dd MMM')}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                width={56}
                tickFormatter={(value: number) =>
                  `₹${value.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
                }
              />
              <ChartTooltip
                cursor={false}
                content={
                  <ChartTooltipContent
                    indicator="line"
                    labelFormatter={(_, payload) => {
                      const date = payload?.[0]?.payload?.date as string | undefined;
                      return date ? formatDay(date) : '';
                    }}
                  />
                }
              />
              <Area
                type="monotone"
                dataKey="rate"
                name="P-rate"
                stroke="currentColor"
                fill="currentColor"
                fillOpacity={0.15}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 3, stroke: 'currentColor', fill: 'currentColor' }}
              />
            </AreaChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}
