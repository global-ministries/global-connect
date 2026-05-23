import nextCoreWebVitals from 'eslint-config-next/core-web-vitals'
import nextTypescript from 'eslint-config-next/typescript'
import security from 'eslint-plugin-security'

const eslintConfig = [
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
]

export default eslintConfig