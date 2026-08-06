import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Disable mouse wheel changing number inputs globally
document.addEventListener(
  'wheel',
  (event) => {
    const activeElement = document.activeElement as HTMLInputElement | null;

    if (
      activeElement &&
      activeElement.tagName === 'INPUT' &&
      activeElement.type === 'number'
    ) {
      event.preventDefault();
    }
  },
  { passive: false }
);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);