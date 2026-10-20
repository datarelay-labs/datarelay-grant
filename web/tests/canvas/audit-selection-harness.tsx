import {createRoot} from 'react-dom/client';
import '@datarelay-labs/foundation/styles.css';
import '../../src/styles.css';
import {AuditExplorer} from '../../src/audit_explorer';
createRoot(document.getElementById('root')!).render(<main style={{padding:16}}><AuditExplorer/></main>);
