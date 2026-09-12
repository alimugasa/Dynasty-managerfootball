import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './app/tokens.css';
import './app/base.css';
import { App } from './App';

const el = document.getElementById('root');
if (!el) throw new Error('#root not found in index.html');
createRoot(el).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
