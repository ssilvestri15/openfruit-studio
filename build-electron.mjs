import esbuild from 'esbuild';

console.log('Compiling Electron main and preload with esbuild...');

await esbuild.build({
  entryPoints: {
    main: 'electron/main.ts',
    preload: 'electron/preload.ts'
  },
  bundle: true,
  platform: 'node',
  outdir: 'dist-electron',
  outExtension: { '.js': '.cjs' },
  external: ['electron', 'node-pty'],
  format: 'cjs',
  sourcemap: true,
});

console.log('Electron scripts compiled successfully as .cjs into dist-electron/');
