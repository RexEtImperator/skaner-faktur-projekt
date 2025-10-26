import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
// Import głównego komponentu aplikacji, który zawiera całą logikę routingu i kontekstu.
import App from './App';
import reportWebVitals from './reportWebVitals';
// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();

// Znajdź główny element 'div' w pliku public/index.html, do którego
// zostanie "zamontowana" cała aplikacja React.
const rootElement = document.getElementById('root');
// Stwórz "korzeń" (root) aplikacji przy użyciu nowoczesnego API ReactDOM.
const root = ReactDOM.createRoot(rootElement);
// Zrenderuj aplikację.
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);