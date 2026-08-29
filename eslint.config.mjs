import coreWebVitals from 'eslint-config-next/core-web-vitals'
import nextTypescript from 'eslint-config-next/typescript'

// eslint-config-next 16 is flat-config only — FlatCompat is not needed.
export default [
  ...coreWebVitals,
  ...nextTypescript,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  { ignores: ['.next/', 'src/payload-types.ts', 'src/payload-generated-schema.ts', 'media/'] },
]

