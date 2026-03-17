import React from 'react';
import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom';
import Realtime from './pages/Realtime.jsx';
import History from './pages/History.jsx';

export default function App() {
  return (
    <BrowserRouter>
      <nav className="nav">
        <div className="nav-brand">
          🛡️ n8watch
        </div>
        <div className="nav-links">
          <NavLink to="/" end className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}>
            Realtime
          </NavLink>
          <NavLink to="/history" className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}>
            History
          </NavLink>
        </div>
      </nav>
      <Routes>
        <Route path="/" element={<Realtime />} />
        <Route path="/history" element={<History />} />
      </Routes>
    </BrowserRouter>
  );
}
