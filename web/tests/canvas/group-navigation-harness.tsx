import {useEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import '@datarelay-labs/foundation/styles.css';
import '../../src/styles.css';
import {Approvers} from '../../src/approvers';
import {createGrantNavigation,type GrantNavigation} from '../../src/grant_navigation';

const groupRoute='/tests/canvas/group-navigation.html';
function Harness(){
 const [path,setPath]=useState(groupRoute);
 const navigation=useRef<GrantNavigation|null>(null);
 useEffect(()=>{
  navigation.current=createGrantNavigation(window,setPath);
  return()=>navigation.current?.dispose();
 },[]);
 return <main style={{padding:16}}>
   <nav aria-label="Synthetic Grant admin shell">
     <button onClick={()=>navigation.current?.navigate('/tests/canvas/other')}>Home destination</button>
     <button onClick={()=>navigation.current?.navigate(groupRoute)}>Approver groups destination</button>
   </nav>
   {path===groupRoute?<Approvers/>:<h1>Other page</h1>}
 </main>;
}
createRoot(document.getElementById('root')!).render(<Harness/>);
