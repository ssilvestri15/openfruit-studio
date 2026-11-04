const {app,BrowserWindow,ipcMain}=require('electron');
const fs=require('node:fs'),fsp=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),{spawn,execFileSync}=require('node:child_process'),{deflateSync}=require('node:zlib');
const scratch=fs.mkdtempSync(path.join(os.tmpdir(),'openfruit-media-ui-'));app.setPath('userData',path.join(scratch,'userdata'));
let server,window;
function pixel(r,g,b){const crc=data=>{let c=0xffffffff;for(const n of data){c^=n;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}const out=Buffer.alloc(4);out.writeUInt32BE((c^0xffffffff)>>>0);return out;};const chunk=(tag,body)=>{const size=Buffer.alloc(4);size.writeUInt32BE(body.length);const data=Buffer.concat([Buffer.from(tag),body]);return Buffer.concat([size,data,crc(data)]);};const header=Buffer.alloc(13);header.writeUInt32BE(1,0);header.writeUInt32BE(1,4);header[8]=8;header[9]=6;return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(Buffer.from([0,r,g,b,255]))),chunk('IEND',Buffer.alloc(0))]);}
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(predicate,label,timeout=30000){const end=Date.now()+timeout;let last;while(Date.now()<end){try{const value=await predicate();if(value)return value;}catch(e){last=e;}await delay(100);}throw new Error('Timeout: '+label+(last?' · '+last.message:''));}
async function js(source){return window.webContents.executeJavaScript(source);}
(async()=>{
 await app.whenReady();
 const contracts=path.join(scratch,'contracts.cjs');await require('esbuild').build({stdin:{contents:"export * from './electron/commitHistory';export * from './electron/documents';",resolveDir:process.cwd()},bundle:true,platform:'node',format:'cjs',outfile:contracts});const api=require(contracts);
 const root=path.join(scratch,'repository');fs.mkdirSync(root);const git=args=>execFileSync('git',args,{cwd:root,windowsHide:true,encoding:'utf8'}).trim();
 git(['init','-b','main']);git(['config','core.autocrlf','false']);git(['config','user.name','Test']);git(['config','user.email','test@example.invalid']);fs.writeFileSync(path.join(root,'View.swift'),'let value = 1\n');fs.writeFileSync(path.join(root,'picture.png'),pixel(255,0,0));git(['add','.']);git(['commit','-m','initial']);fs.writeFileSync(path.join(root,'View.swift'),'let value = 2\n');fs.writeFileSync(path.join(root,'picture.png'),pixel(0,0,255));git(['add','.']);git(['commit','-m','Update text and image']);const hash=git(['rev-parse','HEAD']);
 const svg='<svg xmlns="http://www.w3.org/2000/svg" width="16" height="24"><script>window.__svgExecuted=true</script><rect width="100%" height="100%" fill="red"/></svg>';
 const fixture={root,commit:{hash,message:'Update text and image',author:'Test',date:'2026-10-30'},image:await api.readDocument(path.join(root,'picture.png')),svg};
 const preload=path.join(scratch,'preload.cjs');fs.writeFileSync(preload,`const {contextBridge,ipcRenderer}=require('electron');contextBridge.exposeInMainWorld('openfruitApi',{fixture:()=>ipcRenderer.invoke('fixture'),gitCommitFiles:(repoPath,hash,parentIndex)=>ipcRenderer.invoke('commit-files',{repoPath,hash,parentIndex}),gitCommitComparison:(repoPath,hash,parentIndex,filename)=>ipcRenderer.invoke('commit-comparison',{repoPath,hash,parentIndex,filename})});`);
 ipcMain.handle('fixture',()=>fixture);ipcMain.handle('commit-files',(_e,p)=>api.commitDetails(p.repoPath,p.hash,p.parentIndex));ipcMain.handle('commit-comparison',(_e,p)=>api.commitComparison(p.repoPath,p.hash,p.parentIndex,p.filename));
 const port=5187;server=spawn(process.execPath,[path.resolve('node_modules/vite/bin/vite.js'),'--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:process.cwd(),windowsHide:true,env:{...process.env,ELECTRON_RUN_AS_NODE:'1'}});let log='';server.stdout.on('data',b=>log+=b);server.stderr.on('data',b=>log+=b);
 await until(async()=>{try{return (await fetch('http://127.0.0.1:'+port+'/tests/media-ui.html')).ok;}catch{return false;}},'test dev server');
 window=new BrowserWindow({width:1600,height:1050,show:false,webPreferences:{preload,contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false,offscreen:true}});
 const browserErrors=[];window.webContents.on('console-message',event=>{if(event.level==='error')browserErrors.push(event.message);});
 await window.loadURL('http://127.0.0.1:'+port+'/tests/media-ui.html');
 await until(()=>js(`!!document.querySelector('[data-test-ready]')`),'React fixture');
 await until(()=>js(`(()=>{const i=document.querySelector('img[alt="sample.png"]');return i?.complete&&i.naturalWidth===1&&i.naturalHeight===1})()`),'PNG preview decoded');
 await until(()=>js(`(()=>{const i=document.querySelector('img[alt="sample.svg"]');return i?.complete&&i.naturalWidth===16&&i.naturalHeight===24})()`),'SVG preview decoded');
 if(await js(`window.__svgExecuted===true`))throw new Error('SVG script executed in IDE context');
 await js(`(()=>{const e=document.querySelector('textarea[aria-label="Sorgente SVG test"]');const value=e.value.replace('width="16"','width="32"').replace('height="24"','height="40"');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,value);e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
 await until(()=>js(`(()=>{const i=document.querySelector('img[alt="sample.svg"]');return i?.complete&&i.naturalWidth===32&&i.naturalHeight===40})()`),'SVG preview follows edits');
 await js(`document.querySelector('button[aria-label="Mostra file del commit ${hash}"]').click()`);
 await until(()=>js(`document.querySelectorAll('[data-commit-file]').length===2`),'commit expanded files');
 await js(`document.querySelector('[data-commit-file="View.swift"]').click()`);
 await until(()=>js(`window.__lastComparison?.file.path==='View.swift'&&!!document.querySelector('.monaco-diff-editor')`),'commit text comparison');
 const values=await js(`({before:window.__lastComparison.before.content,after:window.__lastComparison.after.content})`);if(values.before!=='let value = 1\n'||values.after!=='let value = 2\n')throw new Error('Wrong historical content: '+JSON.stringify(values));
 await js(`document.querySelector('[data-commit-file="picture.png"]').click()`);
 await until(()=>js(`(()=>{const area=document.querySelector('[aria-label="Confronto file del commit"]');const images=[...(area?.querySelectorAll('img')||[])];return window.__lastComparison?.file.path==='picture.png'&&images.length===2&&images.every(i=>i.complete&&i.naturalWidth===1)&&images[0].src!==images[1].src})()`),'historical image comparison');
 if(await js(`window.__svgExecuted===true`))throw new Error('SVG script executed');
 await delay(500);
 const finalState=await js(`({files:document.querySelectorAll('[data-commit-file]').length,path:window.__lastComparison?.file.path,svg:document.querySelector('textarea[aria-label=\"Sorgente SVG test\"]')?.value})`);
 const screenshot=path.join(scratch,'verified-media-ui.png');await fsp.writeFile(screenshot,(await window.webContents.capturePage()).toPNG());
 const result={success:true,finalState,checks:['PNG preview','SVG preview','SVG source updates image','SVG script remains inert','commit expands changed files','historical text comparison','historical image comparison'],screenshot,browserErrors};fs.writeFileSync(path.join(scratch,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 window.destroy();server.kill();await delay(300);app.exit(0);
})().catch(async error=>{fs.writeFileSync(path.join(scratch,'failure.txt'),error.stack);console.error(error.stack);if(window&&!window.isDestroyed()){try{console.error(await window.webContents.executeJavaScript('document.body.innerText.slice(0,5000)'));}catch{}window.destroy();}if(server)server.kill();app.exit(1);});
