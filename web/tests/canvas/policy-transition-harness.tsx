import {createRoot} from 'react-dom/client';
import '@datarelay-labs/foundation/styles.css';
import '../../src/styles.css';
import {Profiles} from '../../src/policies';
createRoot(document.getElementById('root')!).render(<main style={{padding:16}}><Profiles /></main>);
