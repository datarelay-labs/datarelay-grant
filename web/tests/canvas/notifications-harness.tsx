import {createRoot} from 'react-dom/client';
import '@datarelay-labs/foundation/styles.css';
import '../../src/styles.css';
import {Notifications} from '../../src/notifications';
createRoot(document.getElementById('root')!).render(<main style={{padding:16}}><Notifications/></main>);
