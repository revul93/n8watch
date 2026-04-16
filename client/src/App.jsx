import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { useEffect, useState } from 'react';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import History from './pages/History';
import Alerts from './pages/Alerts';
import ExpiredTargets from './pages/ExpiredTargets';
import Settings from './pages/Settings';
import { useWebSocket } from './hooks/useWebSocket';
import { useVersionCheck } from './hooks/useVersionCheck';

function AppInner() {
  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem('darkMode');
    return saved !== null ? saved === 'true' : true;
  });

  const { configReloadedAt, lastConfigData } = useWebSocket();
  const { updateAvailable } = useVersionCheck();

  useEffect(() => {
    localStorage.setItem('darkMode', darkMode);
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  return (
    <Layout darkMode={darkMode} setDarkMode={setDarkMode} configReloadedAt={configReloadedAt} lastConfigData={lastConfigData} updateAvailable={updateAvailable}>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/history" element={<History />} />
        <Route path="/alerts" element={<Alerts />} />
        <Route path="/expired" element={<ExpiredTargets />} />
          <Route path="/settings" element={<Settings />} />
      </Routes>
    </Layout>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppInner />
    </BrowserRouter>
  );
}
