import {useEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import '@datarelay-labs/foundation/styles.css';
import '../../src/styles.css';
import {NewRequest} from '../../src/requests';
import {createGrantNavigation,type GrantNavigation} from '../../src/grant_navigation';

const intakeRoute='/tests/canvas/intake-navigation.html';
function Harness(){
 const [path,setPath]=useState(intakeRoute);
 const router=useRef<GrantNavigation|null>(null);
 useEffect(()=>{
  router.current=createGrantNavigation(window,setPath);
  return()=>router.current?.dispose();
 },[]);
 return <main style={{padding:16}}>
  <nav aria-label="Synthetic Grant requester shell">
   <button onClick={()=>router.current?.navigate('/tests/canvas/other')}>My requests destination</button>
   <button onClick={()=>router.current?.navigate(intakeRoute)}>New request destination</button>
  </nav>
  {path===intakeRoute?<NewRequest navigate={next=>router.current?.navigate(next)}/>:<h1>My requests destination page</h1>}
 </main>;
}
createRoot(document.getElementById('root')!).render(<Harness/>);
