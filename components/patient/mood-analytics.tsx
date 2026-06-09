"use client"

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  XAxis,
  YAxis,
} from "recharts"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import { moodTrendData, sleepData, checkinData } from "@/lib/data"

const moodConfig = {
  mood: { label: "Mood", color: "var(--chart-1)" },
  anxiety: { label: "Anxiety", color: "var(--chart-4)" },
  depression: { label: "Depression", color: "var(--chart-5)" },
} satisfies ChartConfig

const sleepConfig = {
  hours: { label: "Sleep (hrs)", color: "var(--chart-2)" },
} satisfies ChartConfig

const checkinConfig = {
  checkins: { label: "Check-ins", color: "var(--chart-1)" },
  journals: { label: "Journals", color: "var(--chart-2)" },
} satisfies ChartConfig

export function MoodAnalytics() {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="text-base">Mood, Anxiety &amp; Depression Trend</CardTitle>
          <p className="text-sm text-muted-foreground">8-week rolling self-reported scores (0–10 scale)</p>
        </CardHeader>
        <CardContent>
          <ChartContainer config={moodConfig} className="h-[280px] w-full">
            <LineChart data={moodTrendData} margin={{ left: 0, right: 12, top: 8 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={8} />
              <YAxis domain={[0, 10]} tickLine={false} axisLine={false} width={28} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Line dataKey="mood" stroke="var(--color-mood)" strokeWidth={2.5} dot={false} />
              <Line dataKey="anxiety" stroke="var(--color-anxiety)" strokeWidth={2.5} dot={false} />
              <Line dataKey="depression" stroke="var(--color-depression)" strokeWidth={2.5} dot={false} />
            </LineChart>
          </ChartContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Sleep Patterns</CardTitle>
          <p className="text-sm text-muted-foreground">Hours slept over the past week</p>
        </CardHeader>
        <CardContent>
          <ChartContainer config={sleepConfig} className="h-[220px] w-full">
            <AreaChart data={sleepData} margin={{ left: 0, right: 12, top: 8 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={8} />
              <YAxis domain={[0, 10]} tickLine={false} axisLine={false} width={28} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Area
                dataKey="hours"
                stroke="var(--color-hours)"
                fill="var(--color-hours)"
                fillOpacity={0.15}
                strokeWidth={2.5}
              />
            </AreaChart>
          </ChartContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Daily Check-ins &amp; Journal Activity</CardTitle>
          <p className="text-sm text-muted-foreground">Engagement over 8 weeks</p>
        </CardHeader>
        <CardContent>
          <ChartContainer config={checkinConfig} className="h-[220px] w-full">
            <BarChart data={checkinData} margin={{ left: 0, right: 12, top: 8 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={8} />
              <YAxis tickLine={false} axisLine={false} width={28} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="checkins" fill="var(--color-checkins)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="journals" fill="var(--color-journals)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ChartContainer>
        </CardContent>
      </Card>
    </div>
  )
}
