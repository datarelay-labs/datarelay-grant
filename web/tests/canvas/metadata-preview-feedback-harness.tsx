import {createRoot} from 'react-dom/client';
import '@datarelay-labs/foundation/styles.css';
import '../../src/styles.css';
import {IntegrationDiagnostics} from '../../src/integration_diagnostics';
createRoot(document.getElementById('root')!).render(<main style={{padding:16}}><IntegrationDiagnostics integrations={[]}/></main>);
