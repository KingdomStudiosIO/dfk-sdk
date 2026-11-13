#!/usr/bin/env node
/**
 * Builds the demo page from the local source (so it always shows the current SDK).
 *
 *   npm run demo         # build and serve on http://localhost:5199
 *   npm run demo:build   # build demo/dist only
 */
import * as esbuild from 'esbuild'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DEMO = path.join(ROOT, 'demo')
const serve = process.argv.includes('--serve')

// Serve this checkout's assets (hero rig, item art); the CDN copy only exists once published.
fs.cpSync(path.join(ROOT, 'assets'), path.join(DEMO, 'dist/assets'), { recursive: true })

const options = {
  entryPoints: [path.join(DEMO, 'main.ts')],
  outfile: path.join(DEMO, 'dist/main.js'),
  bundle: true,
  format: 'esm',
  target: 'es2020',
  sourcemap: true,
  minify: !serve,
  logLevel: 'info',
}

if (serve) {
  const ctx = await esbuild.context(options)
  await ctx.watch()
  const { port } = await ctx.serve({ servedir: DEMO, port: Number(process.env.PORT ?? 5199) })
  console.log(`Demo running at http://localhost:${port}`)
  // Stop esbuild's server process too, or it keeps holding the port.
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => ctx.dispose().then(() => process.exit(0)))
} else {
  await esbuild.build(options)
}
