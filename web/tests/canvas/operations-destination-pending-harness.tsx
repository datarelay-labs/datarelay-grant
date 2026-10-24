import {createRoot} from 'react-dom/client';
import '@datarelay-labs/foundation/styles.css';
import '../../src/styles.css';
import {Operations} from '../../src/operations';

createRoot(document.getElementById('root')!).render(
 <main><Operations navigate={()=>{}}/></main>
);
