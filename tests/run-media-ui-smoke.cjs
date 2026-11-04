const {spawn}=require('node:child_process');
const path=require('node:path');
const environment={...process.env};delete environment.ELECTRON_RUN_AS_NODE;
const child=spawn(require('electron'),[path.join(__dirname,'media-ui-smoke.cjs')],{cwd:path.join(__dirname,'..'),env:environment,windowsHide:true,stdio:'inherit'});
child.once('error',error=>{console.error(error);process.exitCode=1;});
child.once('exit',code=>{process.exitCode=code??1;});
