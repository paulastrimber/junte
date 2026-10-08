import neostandard from 'neostandard'
import reactHooks from 'eslint-plugin-react-hooks'
import globals from 'globals'

// neostandard trae las reglas de JSX (eslint-plugin-react) solo para archivos .jsx:
// por eso los componentes y pantallas usan esa extensión (docs/practicas/estilo-de-codigo.md).
export default [
  ...neostandard({
    ignores: ['node_modules/**', '.expo/**', 'dist/**', 'web-build/**', 'android/**', 'ios/**', 'coverage/**']
  }),
  reactHooks.configs.flat.recommended,
  {
    files: ['src/**/*.{js,jsx}', 'index.js'],
    languageOptions: {
      globals: {
        // Global de React Native: true en desarrollo, false en el APK.
        __DEV__: 'readonly'
      }
    }
  },
  {
    files: ['app.config.js'],
    languageOptions: {
      globals: globals.node
    }
  },
  {
    files: ['**/*.test.{js,jsx}', 'tests/**/*.{js,jsx}'],
    languageOptions: {
      globals: globals.jest
    }
  }
]
