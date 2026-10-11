import eslint from '@eslint/js'
import importPlugin from 'eslint-plugin-import'
import prettier from 'eslint-plugin-prettier'
import { defineConfig } from 'eslint/config'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default defineConfig(
  eslint.configs.recommended,
  importPlugin.flatConfigs.recommended,
  {
    files: ['**/*.ts'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: globals.node,
      parser: tseslint.parser,
      parserOptions: {
        projectService: true,
      },
    },
    plugins: {
      '@typescript-eslint': tseslint.plugin,
      prettier,
    },
    settings: {
      'import/resolver': {
        typescript: {
          bun: true,
        },
      },
    },
    linterOptions: {
      reportUnusedDisableDirectives: 'warn',
    },
  },
  {
    files: ['**/*.ts'],
    extends: [
      ...tseslint.configs.recommendedTypeChecked,
      ...tseslint.configs.stylisticTypeChecked,
    ],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          ignoreRestSiblings: true,
          varsIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/consistent-type-definitions': 'off',
      '@typescript-eslint/consistent-generic-constructors': 'off',
      'prettier/prettier': 'warn',
    },
  },
  {
    files: ['src/repositories/drizzle/**/*.repo.ts'],
    rules: {
      // SQLite transactions are synchronous; async functions preserve the
      // shared repository contract and turn thrown errors into rejections.
      '@typescript-eslint/require-await': 'off',
    },
  },
  {
    files: ['**/*.js'],
    extends: [tseslint.configs.disableTypeChecked],
  },
  {
    ignores: ['node_modules'],
  },
)
