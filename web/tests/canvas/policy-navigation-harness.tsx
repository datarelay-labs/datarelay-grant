import {useEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import '@datarelay-labs/foundation/styles.css';
import '../../src/styles.css';
import {Profiles} from '../../src/policies';
import {createGrantNavigation,type GrantNavigation} from '../../src/grant_navigation';

const editorRoute='/tests/canvas/policy-navigation.html';
function Harness(){
 const [path,setPath]=useState(editorRoute);
 const nav=useRef<GrantNavigation|null>(null);
 useEffect(()=>{
   nav.current=createGrantNavigation(window,setPath);
   return()=>nav.current?.dispose();
 },[]);
 return <main style={{padding:16}}>
   <nav aria-label="Synthetic Grant policy shell">
     <button onClick={()=>nav.current?.navigate('/tests/canvas/other')}>Home destination</button>
     <button onClick={()=>nav.current?.navigate(editorRoute)}>Approval policies destination</button>
   </nav>
   {path===editorRoute?<Profiles/>:<h1>Other page</h1>}
 </main>;
}
createRoot(document.getElementById('root')!).render(<Harness/>);
