// Small non-validating XML reader for Xcode metadata. No DTD, external entities or network access.
export interface XmlNode {name:string;attributes:Record<string,string>;children:XmlNode[]}
export function parseXcodeXml(source:string):XmlNode {
  if(source.length>2*1024*1024||/<!DOCTYPE|<!ENTITY/i.test(source))throw new Error('XML Xcode non supportato o troppo grande');
  const decode=(s:string)=>s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi,(_,s:string)=>{const names:Record<string,string>={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"};if(names[s])return names[s];const n=s.startsWith('#x')?parseInt(s.slice(2),16):Number(s.slice(1));if(!Number.isInteger(n)||n<1||n>0x10ffff)throw new Error('Entità XML non valida');return String.fromCodePoint(n);});
  const root:XmlNode={name:'#root',attributes:{},children:[]},stack=[root];let at=0,count=0;
  while(at<source.length){
    const open=source.indexOf('<',at);if(open<0)break;
    if(source.startsWith('<!--',open)){const end=source.indexOf('-->',open+4);if(end<0)throw new Error('Commento XML non terminato');at=end+3;continue;}
    if(source.startsWith('<?',open)){const end=source.indexOf('?>',open+2);if(end<0)throw new Error('Istruzione XML non terminata');at=end+2;continue;}
    let end=open+1,quote='';for(;end<source.length;end++){const c=source[end];if(quote){if(c===quote)quote='';}else if(c==='"'||c==="'")quote=c;else if(c==='>')break;}
    if(end===source.length)throw new Error('Tag XML non terminato');const tag=source.slice(open+1,end).trim();at=end+1;
    if(tag.startsWith('/')){if(stack.length===1||stack.pop()!.name!==tag.slice(1).trim())throw new Error('Tag XML non corrispondenti');continue;}
    const name=tag.match(/^[A-Za-z_][\w:.-]*/)?.[0];if(!name||++count>50000||stack.length>100)throw new Error('XML Xcode non valido');
    const self=tag.endsWith('/'),rest=tag.slice(name.length,self?-1:undefined),attrs:Record<string,string>=Object.create(null);let pos=0;
    while(pos<rest.length){if(!rest.slice(pos).trim())break;const match=/^\s+([\w:.-]+)\s*=\s*(["'])([\s\S]*?)\2/.exec(rest.slice(pos));if(!match||Object.hasOwn(attrs,match[1]))throw new Error('Attributi XML non validi');attrs[match[1]]=decode(match[3]);pos+=match[0].length;}
    const node={name,attributes:attrs,children:[]};stack.at(-1)!.children.push(node);if(!self)stack.push(node);
  }
  if(stack.length!==1||root.children.length!==1)throw new Error('Documento XML incompleto');return root.children[0];
}
