import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import { BrowserRouter } from 'react-router-dom';

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals

// Znajdź główny element 'div' w pliku public/index.html, do którego
// zostanie "zamontowana" cała aplikacja React.
const rootElement = document.getElementById('root');
// Stwórz "korzeń" (root) aplikacji przy użyciu nowoczesnego API ReactDOM.
const root = ReactDOM.createRoot(rootElement);
// Zrenderuj aplikację.
root.render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);