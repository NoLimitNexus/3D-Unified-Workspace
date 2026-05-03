import React from 'react';
import { Scene } from './components/Scene';
import { UI } from './components/UI';
import './index.css';

function App() {
  return (
    <>
      <UI />
      <Scene />
      <div style={{ position: 'absolute', top: 10, left: 10, color: 'white', pointerEvents: 'none', background: 'rgba(0,0,0,0.5)', padding: '10px', borderRadius: '5px' }}>
        <h1>Terrain Editor</h1>
        <p>Left Click: Raise Terrain</p>
        <p>Right Click: Lower Terrain</p>
        <p>Use controls panel to change settings</p>
      </div>
    </>
  );
}

export default App;
