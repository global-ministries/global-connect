"use client"

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
        'inline-flex items-center gap-1 rounded-2xl bg-white/60 border border-white/30 p-1 shadow-sm backdrop-blur',
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
        'px-3.5 py-2 text-sm font-medium rounded-xl text-gray-600 transition-colors',
        'data-[state=active]:bg-orange-500 data-[state=active]:text-white',
        'hover:bg-orange-50',
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
