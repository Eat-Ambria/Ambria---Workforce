// Deliberately small.
//
// This repo's failure mode is a name that is used and never declared: an import
// forgotten, a state hook removed by an edit, a const that moved. Vite resolves
// modules, not identifiers, so every one of those builds cleanly and throws at
// render — it happened ten times in a day before this file existed, and one of
// them (setExpanded on the Analytics filters) had been live in the app.
//
// `no-undef` catches all of them in about a second.
//
// `rules-of-hooks` is the second: a hook behind an `if` breaks on the render
// where the condition flips, which is the hardest kind of bug to reproduce.
//
// `exhaustive-deps` is deliberately OFF. Several effects here depend on a subset
// on purpose and say so in a comment; turning it on reports those as problems
// and a config that cries wolf is a config nobody runs.
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'

export default [
  {
    // dev-dist is the PWA's generated service worker, and supabase/ is Deno.
    // Neither is source, and both fail browser-globals checks by design.
    ignores: ['dist/', 'dev-dist/', 'node_modules/', 'supabase/'],
  },
  {
    files: ['**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser, ...globals.node },
    },
    // Those `eslint-disable-next-line react-hooks/exhaustive-deps` comments
    // scattered through the codebase are now unnecessary, since the rule is off
    // — but they document a deliberate choice at each site, and reporting them
    // would be seven warnings telling somebody to delete useful comments.
    linterOptions: { reportUnusedDisableDirectives: 'off' },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'no-undef': 'error',
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'off',
    },
  },
]
