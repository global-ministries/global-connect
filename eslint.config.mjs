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
  'app/(auth)/estudiantes/**',
  'components/estudiantes/**',
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