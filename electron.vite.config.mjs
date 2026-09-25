import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin, bytecodePlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import obfuscator from 'rollup-plugin-obfuscator'

// Strings listed here are hidden inside the compiled bytecode instead of stored as plain text
const protectedStrings = ['DAT_ONE_SECURE_HARDWARE_VAULT_2026']

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin(), bytecodePlugin({ protectedStrings })]
  },
  preload: {
    plugins: [externalizeDepsPlugin(), bytecodePlugin({ protectedStrings })]
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src')
      }
    },
    build: {
      minify: 'esbuild',
      sourcemap: false
    },
    plugins: [
      react(),
      {
        // Obfuscate only our own renderer code (not React/MUI), and only for production builds
        ...obfuscator({
          include: ['src/renderer/**/*.js', 'src/renderer/**/*.jsx'],
          exclude: ['node_modules/**'],
          options: {
            compact: true,
            identifierNamesGenerator: 'hexadecimal',
            renameGlobals: false,
            stringArray: true,
            stringArrayEncoding: ['base64'],
            stringArrayThreshold: 0.75,
            controlFlowFlattening: false,
            deadCodeInjection: false,
            selfDefending: false,
            debugProtection: false
          }
        }),
        apply: 'build'
      }
    ]
  }
})
