export type DeviceAction='info'|'log'|'screenshot'|'record'|'install';
export interface DeviceRequest {action:DeviceAction;udid:string;wifiHost?:string;duration?:number}
export function deviceArguments(request:DeviceRequest,file?:string){
 if(!request||!['info','log','screenshot','record','install'].includes(request.action)||typeof request.udid!=='string'||!/^[A-Za-z0-9:-]{4,128}$/.test(request.udid))throw new Error('Dispositivo o azione non validi');
 const args=['device',request.action];if(['screenshot','record','install'].includes(request.action)){if(!file)throw new Error('Percorso richiesto');args.push(file);}
 if(request.wifiHost){if(typeof request.wifiHost!=='string'||request.wifiHost.length>253||!/^[A-Za-z0-9][A-Za-z0-9.-]*$/.test(request.wifiHost))throw new Error('Host Wi-Fi non valido');args.push('--wifi',request.wifiHost);}else args.push('--device',request.udid);
 if(request.action==='record'){const seconds=request.duration??10;if(!Number.isInteger(seconds)||seconds<1||seconds>300)throw new Error('Durata da 1 a 300 secondi');args.push('--duration',String(seconds));}args.push('--diagnostics=json');return args;
}
