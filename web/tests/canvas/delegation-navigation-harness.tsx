import {useEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import '@datarelay-labs/foundation/styles.css';
import '../../src/styles.css';
import {Delegations} from '../../src/delegations';
import {createGrantNavigation,type GrantNavigation} from '../../src/grant_navigation';
import type {User} from '../../src/types';

const delegationRoute='/tests/canvas/delegation-navigation.html';
const actor:User={id:'actor-1',username:'Test Actor',email:'actor@example.invalid',role:'member',mfa_enabled:false};
function Harness(){
 const [path,setPath]=useState(delegationRoute);
 const navigation=useRef<GrantNavigation|null>(null);
 useEffect(()=>{
  navigation.current=createGrantNavigation(window,setPath);
  return()=>navigation.current?.dispose();
 },[]);
 return <main style={{padding:16}}>
  <nav aria-label="Synthetic Grant member shell">
   <button onClick={()=>navigation.current?.navigate('/tests/canvas/other')}>Home destination</button>
   <button onClick={()=>navigation.current?.navigate(delegationRoute)}>Delegations destination</button>
  </nav>
  {path===delegationRoute?<Delegations user={actor}/>:<h1>Other page</h1>}
 </main>;
}
createRoot(document.getElementById('root')!).render(<Harness/>);
