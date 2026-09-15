import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';

const el = document.getElementById('dmp-playtest');
if (el === null) throw new Error('#dmp-playtest is not on the page');
createRoot(el).render(<StrictMode><App /></StrictMode>);
