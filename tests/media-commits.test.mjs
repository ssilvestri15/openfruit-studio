import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {build} from 'esbuild';
const scratch=await fs.mkdtemp(path.join(os.tmpdir(),'openfruit-media-'));
const output=path.join(scratch,'contracts.cjs');await build({stdin:{contents:"export * from './electron/documents';export * from './electron/commitHistory';export * from './electron/git';",resolveDir:process.cwd()},bundle:true,platform:'node',format:'cjs',outfile:output});
const require=createRequire(import.meta.url),api=require(output);
after(()=>fs.rm(scratch,{recursive:true,force:true}));
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a2ioAAAAASUVORK5CYII=','base64');
test('document reader returns raster preview bytes and SVG source, never binary text',async()=>{
 const file=path.join(scratch,'sample.png');await fs.writeFile(file,png);const image=await api.readDocument(file);assert.equal(image.kind,'image');assert.equal(image.mime,'image/png');assert.deepEqual(Buffer.from(image.dataUrl.split(',')[1],'base64'),png);
 const svg='<svg xmlns="http://www.w3.org/2000/svg" width="16" height="24"><rect width="16" height="24" fill="red"/></svg>';await fs.writeFile(path.join(scratch,'icon.svg'),svg);const vector=await api.readDocument(path.join(scratch,'icon.svg'));assert.equal(vector.kind,'text');assert.equal(vector.format,'svg');assert.equal(vector.content,svg);
 assert.equal(api.decodeDocument(Buffer.from([0xff,0x00,0x89,0x01]),'unknown.bin').kind,'binary');assert.equal(api.decodeDocument(Buffer.from('invalid image'),'corrupt.png').kind,'binary');
});
test('commit file parser preserves spaces, Unicode and renamed paths with NUL separators',()=>{
 assert.deepEqual(api.parseCommitFiles('M\0src/città name.swift\0R100\0old\tname.txt\0new name.txt\0D\0gone.png\0'),[{path:'src/città name.swift',status:'M'},{path:'new name.txt',oldPath:'old\tname.txt',status:'R100'},{path:'gone.png',status:'D'}]);
});
test('commit expansion and comparison handle root, added/deleted/renamed text, SVG and images independently of worktree',async()=>{
 const root=path.join(scratch,'repository');await fs.mkdir(root);const git=async args=>{const r=await api.execGit(root,args);assert.equal(r.code,0,r.stderr);return r.stdout.trim();};
 await git(['init','-b','main']);await git(['config','core.autocrlf','false']);await git(['config','user.name','Test']);await git(['config','user.email','test@example.invalid']);
 const original=Array.from({length:30},(_,i)=>'line '+i).join('\n')+'\n';await fs.writeFile(path.join(root,'old name.swift'),original);await fs.writeFile(path.join(root,'deleted.txt'),'removed later');await fs.writeFile(path.join(root,'picture.png'),png);await fs.writeFile(path.join(root,'icon.svg'),'<svg xmlns="http://www.w3.org/2000/svg" width="10"/>');await git(['add','.']);await git(['commit','-m','root']);const first=await git(['rev-parse','HEAD']);
 const initial=await api.commitDetails(root,first);assert.equal(initial.parent,null);assert.equal(initial.files.length,4);assert.ok(initial.files.every(f=>f.status==='A'));const added=await api.commitComparison(root,first,0,'picture.png');assert.equal(added.before,null);assert.equal(added.after.kind,'image');
 await fs.rename(path.join(root,'old name.swift'),path.join(root,'new name.swift'));await fs.writeFile(path.join(root,'new name.swift'),original.replace('line 15','modified 15'));await fs.unlink(path.join(root,'deleted.txt'));await fs.writeFile(path.join(root,'added.txt'),'new text');await fs.writeFile(path.join(root,'icon.svg'),'<svg xmlns="http://www.w3.org/2000/svg" width="20"/>');await git(['add','-A']);await git(['commit','-m','changes']);const second=await git(['rev-parse','HEAD']);
 const detail=await api.commitDetails(root,second);assert.equal(detail.parent,first);const rename=detail.files.find(f=>f.path==='new name.swift');assert.ok(rename.status.startsWith('R'));assert.equal(rename.oldPath,'old name.swift');
 await fs.writeFile(path.join(root,'new name.swift'),'unrelated current editor content');const compared=await api.commitComparison(root,second,0,'new name.swift');assert.equal(compared.before.content,original);assert.equal(compared.after.content,original.replace('line 15','modified 15'));
 const deleted=await api.commitComparison(root,second,0,'deleted.txt');assert.equal(deleted.before.content,'removed later');assert.equal(deleted.after,null);
 const addedText=await api.commitComparison(root,second,0,'added.txt');assert.equal(addedText.before,null);assert.equal(addedText.after.content,'new text');
 const vector=await api.commitComparison(root,second,0,'icon.svg');assert.equal(vector.before.format,'svg');assert.equal(vector.after.format,'svg');assert.match(vector.before.content,/width="10"/);assert.match(vector.after.content,/width="20"/);
 await assert.rejects(api.commitComparison(root,second,0,'../outside'));await assert.rejects(api.commitDetails(root,'--help'));
});
test('merge commit expansion selects the requested parent rather than an empty combined diff',async()=>{
 const root=path.join(scratch,'merge');await fs.mkdir(root);const git=async args=>{const r=await api.execGit(root,args);assert.equal(r.code,0,r.stderr);return r.stdout.trim();};
 await git(['init','-b','main']);await git(['config','user.name','Test']);await git(['config','user.email','test@example.invalid']);await fs.writeFile(path.join(root,'base.txt'),'base');await git(['add','.']);await git(['commit','-m','base']);await git(['switch','-c','feature']);await fs.writeFile(path.join(root,'feature.txt'),'feature');await git(['add','.']);await git(['commit','-m','feature']);await git(['switch','main']);await fs.writeFile(path.join(root,'main.txt'),'main');await git(['add','.']);await git(['commit','-m','main']);await git(['merge','--no-ff','--no-edit','feature']);const hash=await git(['rev-parse','HEAD']);
 const first=await api.commitDetails(root,hash,0),second=await api.commitDetails(root,hash,1);assert.equal(first.parents.length,2);assert.deepEqual(first.files.map(f=>f.path),['feature.txt']);assert.deepEqual(second.files.map(f=>f.path),['main.txt']);await assert.rejects(api.commitDetails(root,hash,2));
});
