import {useEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import '@datarelay-labs/foundation/styles.css';
import '../../src/styles.css';
import {Notifications} from '../../src/notifications';
import {createGrantNavigation,type GrantNavigation} from '../../src/grant_navigation';
function Harness(){
 const [path,setPath]=useState('/tests/canvas/navigation.html');
 const navigation=useRef<GrantNavigation|null>(null);
 useEffect(()=>{navigation.current=createGrantNavigation(window,setPath);return()=>navigation.current?.dispose();},[]);
 return <main style={{padding:16}}><nav aria-label="Synthetic Grant shell"><button onClick={()=>navigation.current?.navigate('/tests/canvas/other')}>Other page</button>
  <button onClick={()=>navigation.current?.navigate('/tests/canvas/navigation.html')}>Notifications page</button></nav>
  <output aria-label="Current Grant path">{path}</output>{path==='/tests/canvas/navigation.html'?<Notifications/>:<h1>Other page</h1>}</main>;
}
createRoot(document.getElementById('root')!).render(<Harness/>);
