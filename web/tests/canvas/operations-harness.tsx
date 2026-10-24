import {createRoot} from 'react-dom/client';
import '@datarelay-labs/foundation/styles.css';
import '../../src/styles.css';
import {Operations} from '../../src/operations';
createRoot(document.getElementById('root')!).render(<main style={{padding:16}}><Operations navigate={(path)=>{window.history.pushState(null,'',path);}}/></main>);
