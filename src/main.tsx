import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { WidgetApp } from './widget';
import { ReminderPopup } from './components/ReminderPopup';
import { ErrorBoundary } from './components/ErrorBoundary';
import './index.css';

const root = document.getElementById('root')!;

if (location.hash === '#widget') {
  ReactDOM.createRoot(root).render(<WidgetApp />);
} else if (location.hash.startsWith('#reminder')) {
  ReactDOM.createRoot(root).render(<ReminderPopup />);
} else {
  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </React.StrictMode>
  );
}
