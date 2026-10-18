import './api-bridge'
import React from 'react'
import ReactDOM from 'react-dom/client'
import '@fontsource-variable/outfit'
import App from './App'
import { I18nProvider } from './lib/i18n'
import { UpdateProvider } from './context/UpdateContext'
import './index.css'

// Глобальный перехват ошибок для диагностики
window.onerror = function(msg, url, line, col, error) {
  const el = document.createElement('div')
  el.style = 'position:fixed;top:0;left:0;right:0;bottom:0;background:#1a0505;color:#fca5a5;padding:24px;z-index:999999;font-family:monospace;font-size:14px;white-space:pre-wrap;overflow:auto;'
  el.textContent = 'JavaScript Error:\n' + msg + '\n\nAt: ' + url + ':' + line + ':' + col + '\n\nStack:\n' + (error?.stack || 'no stack')
  document.body.appendChild(el)
}
window.onunhandledrejection = function(e) {
  const el = document.createElement('div')
  el.style = 'position:fixed;top:0;left:0;right:0;bottom:0;background:#1a0505;color:#fca5a5;padding:24px;z-index:999999;font-family:monospace;font-size:14px;white-space:pre-wrap;overflow:auto;'
  el.textContent = 'Unhandled Promise Rejection:\n' + (e.reason?.stack || e.reason || e)
  document.body.appendChild(el)
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <I18nProvider>
      <UpdateProvider>
        <App />
      </UpdateProvider>
    </I18nProvider>
  </React.StrictMode>
)
