import { hydrateRoot, createRoot } from 'react-dom/client';

import { App } from './App';
import './styles/global.css';

// Matches the watchdog in index.html: mark the bundle as alive so motion
// styles stay enabled.
document.documentElement.classList.add('enhanced');

const container = document.getElementById('root');
if (!container) {
  throw new Error('Missing #root container');
}

// Prerendered build ships markup inside #root (hydrate); dev serves it empty.
if (container.firstElementChild) {
  hydrateRoot(container, <App />);
} else {
  createRoot(container).render(<App />);
}
