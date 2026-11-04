import {useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {GitSidebarView} from '../src/components/GitSidebarView';
import {ImagePreview} from '../src/components/ImagePreview';
import {SvgDocumentEditor} from '../src/components/SvgDocumentEditor';
import {CommitDiffView} from '../src/components/CommitDiffView';
import '../src/index.css';
function Harness(){
 const [fixture,setFixture]=useState<any>(),[comparison,setComparison]=useState<any>(),[svg,setSvg]=useState('');
 const api=(window as any).openfruitApi;
 useEffect(()=>{api.fixture().then((value:any)=>{setFixture(value);setSvg(value.svg);});},[]);
 if(!fixture)return <p>Loading fixture…</p>;
 const noop=async()=>{};
 return <main style={{height:'100vh',display:'flex',background:'#262925',color:'#EEEFE5'}} data-test-ready="true"><aside style={{width:320,display:'flex',flexDirection:'column',borderRight:'1px solid #383c34'}}><GitSidebarView branch="main" repositoryPath={fixture.root} stagedFiles={[]} unstagedFiles={[]} diffs={[]} commits={[fixture.commit]} onCommit={noop} onStageFile={noop} onUnstageFile={noop} onStageAll={noop} onUnstageAll={noop} onDiscardFile={noop} onDiscardAll={noop} onOpenCommitComparison={async(hash,parentIndex,path)=>{const value=await api.gitCommitComparison(fixture.root,hash,parentIndex,path);(window as any).__lastComparison=value;setComparison(value);}}/></aside><section style={{flex:1,minWidth:0,display:'flex',flexDirection:'column'}}><div style={{height:330,display:'flex',borderBottom:'1px solid #383c34'}}><div style={{flex:1,minWidth:0}}><ImagePreview name="sample.png" src={fixture.image.dataUrl} bytes={fixture.image.bytes}/></div><div style={{flex:1,minWidth:0}}><SvgDocumentEditor name="sample.svg" content={svg} editor={<textarea aria-label="Sorgente SVG test" style={{width:'100%',height:'100%',background:'#1f221e',color:'#eeefe5',padding:12}} value={svg} onChange={e=>setSvg(e.target.value)}/>}/></div></div><div style={{flex:1,minHeight:0}}>{comparison?<CommitDiffView comparison={comparison} theme="vs-dark" fontSize={13}/>:<p>Espandi il commit e seleziona un file.</p>}</div></section></main>;
}
createRoot(document.getElementById('root')!).render(<Harness/>);
