import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/react';
import App from './App.tsx';
import './index.css';
import { installNativeApiBase, isNativeApp } from './lib/native';

installNativeApiBase();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    {/* Vercel's scripts are served by the live site, which the app doesn't load from. */}
    {!isNativeApp && <Analytics />}
    {!isNativeApp && <SpeedInsights />}
  </StrictMode>,
);
