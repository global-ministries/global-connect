import nextCoreWebVitals from 'eslint-config-next/core-web-vitals'
import nextTypescript from 'eslint-config-next/typescript'
import security from 'eslint-plugin-security'

// Screens already migrated to the design system (docs/design-system/migration.md).
// Add each area here when it migrates: from then on it cannot go back to the
// legacy primitives. Scoped to migrated files so the rule adds no warnings to
// the existing lint budget.
const migratedToDesignSystem = [
  'app/(auth)/grupos-vida/**',
  'components/grupos/**',
  'components/grupos-vida/**',
  'app/(auth)/admin/dream-team/servidores/**',
  'components/dream-team/servidores/**',
  'app/(auth)/dream-team/mi-equipo/**',
  'components/dream-team/mi-equipo/**',
  'app/(auth)/admin/dream-team/estructura/**',
  'components/dream-team/estructura/**',
  'app/(auth)/estudiantes/**',
  'components/estudiantes/**',
  // Usuarios: list (T8-2), ficha (T8-3) and Editar persona (T10), which also
  // renders Mi perfil "Mis datos".
  'app/(auth)/users/page.tsx',
  'app/(auth)/users/loading.tsx',
  'app/(auth)/users/create/**',
  'components/users/lista/**',
  'components/users/vinculos-pendientes-card.tsx',
  'components/users/familia/**',
  'components/users/familia-pendientes/**',
  'app/(auth)/users/[[]id]/page.tsx',
  'app/(auth)/users/[[]id]/loading.tsx',
  'app/(auth)/users/[[]id]/asistencia/**',
  'components/users/ficha/**',
  'app/(auth)/users/[[]id]/edit/**',
  'components/users/editar/**',
  'app/(auth)/perfil/**',
  'components/ui/filtros-usuarios.tsx',
  // Niños: check-in at the desk (N2a–N2b of odd/tasks/ninos-v2.md) and the one-screen
  // registration, public QR page and desk panel (N4b); the rest of Niños is pending.
  'app/(auth)/ninos/checkin/**',
  'components/ninos/checkin-client.tsx',
  'components/ninos/checkin/**',
  'components/ninos/retiro-panel.tsx',
  'app/ninos/registro/**',
  'components/ninos/registro/**',
  'components/ninos/registro-rapido/**',
  'components/ninos/registrar-familia-form.tsx',
]

const legacyUiImports = {
  patterns: [
    {
      group: ['**/components/ui/button', '**/components/ui/card', '**/components/ui/boton-gradiente'],
      message:
        'Use BotonSistema / TarjetaSistema from @/components/ui/sistema-diseno (see docs/design-system/components.md).',
    },
  ],
}

const eslintConfig = [
  // Coverage reports and other generated artifacts are not source code.
  {
    ignores: ['coverage/**', '**/coverage/**'],
  },
  ...nextCoreWebVitals,
  ...nextTypescript,
  // Security rules for catching common vulnerabilities
  security.configs.recommended,
  {
    rules: {
      // ─── Existing codebase warnings ────────────────────────────────
      // Keep the current codebase reviewable while replacing the removed `next lint`
      // command. These existing violations are still surfaced by `pnpm lint`, but do
      // not block this focused security/dependency maintenance slice.
      // Underscore-prefixed identifiers are intentionally unused (callback signatures,
      // destructured-but-ignored values). Standard pattern from @typescript-eslint.
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-non-null-asserted-optional-chain': 'warn',
      '@typescript-eslint/no-require-imports': 'warn',
      'prefer-const': 'warn',
      'react/no-unescaped-entities': 'warn',
      'react-hooks/purity': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/rules-of-hooks': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/static-components': 'warn',

      // ─── Security plugin overrides ──────────────────────────────────
      // Allow process.env access — Next.js patterns rely on it heavily
      'security/detect-object-injection': 'off',
      // Browser code often uses hardcoded URLs; not a real threat
      'security/detect-non-literal-fs-filename': 'off',
    },
  },
  {
    files: migratedToDesignSystem,
    rules: {
      'no-restricted-imports': ['error', legacyUiImports],
    },
  },
]

export default eslintConfig