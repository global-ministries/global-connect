"use client"

/**
 * TabsSistema — Radix tabs with the segmented control look
 * (docs/design-system/components.md, `ControlSegmentado`): the active tab
 * inverts (`bg-foreground text-background`); 36px tabs, 44px on touch.
 */
import * as Tabs from '@radix-ui/react-tabs'
import { cn } from '@/lib/utils'
import React from 'react'

export function TabsSistema({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof Tabs.Root>) {
  return <Tabs.Root className={cn('w-full', className)} {...props} />
}

export function TabsList({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof Tabs.List>) {
  return (
    <Tabs.List
      className={cn(
        'inline-flex items-center rounded-xl border border-border bg-card p-[3px]',
        className
      )}
      {...props}
    />
  )
}

export function TabsTrigger({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof Tabs.Trigger>) {
  return (
    <Tabs.Trigger
      className={cn(
        'focus-ring inline-flex min-h-9 items-center justify-center rounded-md px-3 text-sm font-medium text-muted-foreground transition-colors pointer-coarse:min-h-11',
        'data-[state=active]:bg-foreground data-[state=active]:text-background',
        'data-[state=inactive]:hover:text-foreground',
        className
      )}
      {...props}
    />
  )
}

export function TabsContent({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof Tabs.Content>) {
  return (
    <Tabs.Content className={cn('mt-4', className)} {...props} />
  )
}
