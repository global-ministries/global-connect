---
name: typescript
description: TypeScript strict mode patterns for GlobalConnect stack (Next.js 15 + Supabase + React 19). Utility types, generics, type narrowing, satisfies, and database type patterns.
metadata:
  author: global-connect
  scope: global
  auto_invoke:
    - Writing TypeScript types or generics
    - Using utility types (Partial, Pick, Omit, Record, Extract)
    - Type narrowing or type guards
    - Adding satisfies keyword
    - Defining API response types
    - Typing Supabase query results
    - Creating reusable generic components or hooks
    - Fixing TypeScript strict mode errors
    - Working with discriminated unions
    - Inferring types from Zod schemas
---

# TypeScript Strict Mode — GlobalConnect

## Stack Context
- TypeScript strict mode enabled
- Next.js 15 App Router (Server Components, Server Actions, Route Handlers)
- Supabase-generated types from `pnpm gen:types`
- Zod for runtime validation, infer types from schemas

## Core Patterns

### 1. Infer types from Zod schemas (single source of truth)
```ts
import { z } from 'zod'
const usuarioSchema = z.object({
  id: z.string().uuid(),
  nombre: z.string().min(1),
  rol: z.enum(['admin', 'lider', 'miembro'])
})
type Usuario = z.infer<typeof usuarioSchema>
```

### 2. Type Supabase results correctly
```ts
import type { Database } from '@/lib/supabase/types'
type Grupo = Database['public']['Tables']['grupos']['Row']
type GrupoInsert = Database['public']['Tables']['grupos']['Insert']
```

### 3. Use `satisfies` for type-safe config objects
```ts
const config = {
  pageSize: 20,
  debounceMs: 400,
} satisfies Record<string, number>
```

### 4. Generic hooks with constraint
```ts
function usePaginatedData<T extends { id: string }>(
  fetcher: (page: number) => Promise<T[]>
) { ... }
```

### 5. Discriminated unions for state
```ts
type RequestState<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: T }
  | { status: 'error'; error: string }
```

### 6. Type narrowing patterns
```ts
function isError(val: unknown): val is { error: string } {
  return typeof val === 'object' && val !== null && 'error' in val
}
```

### 7. Server Action types (Next.js 15)
```ts
type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string }
```

## Decision Tree

1. **Runtime validation needed?** → Use Zod, infer the type
2. **Supabase table type?** → Use `Database['public']['Tables']['x']['Row']`
3. **Multiple states for a feature?** → Discriminated union
4. **Reusable across features?** → Generic with constraint
5. **Config/lookup object?** → `satisfies`

## Key Rules
- ✅ ALWAYS use strict mode (`"strict": true` in tsconfig)
- ✅ Prefer `unknown` over `any`
- ✅ Never use type assertions (`as`) without a type guard
- ✅ Export types, not interfaces (unless extending)
- ❌ Never use `@ts-ignore` — fix the type
