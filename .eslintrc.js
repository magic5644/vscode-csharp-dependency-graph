module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  plugins: [
    '@typescript-eslint',
  ],
  extends: [
    'eslint:recommended',
    '@typescript-eslint/recommended',
  ],
  rules: {
    '@typescript-eslint/no-var-requires': 'off', // Allow require() in config files
    '@typescript-eslint/explicit-function-return-type': 'off',
  },
  overrides: [
    {
      files: ['webpack.config.js', '.eslintrc.js'],
      env: {
        node: true,
      },
      rules: {
        '@typescript-eslint/no-var-requires': 'off',
      }
    }
  ]
};