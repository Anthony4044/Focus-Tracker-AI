import React from 'react';
import FaceMesh3D from './components/FaceMesh3D.jsx';

export default function App() {
  return (
    <div style={{ minHeight:'100vh', display:'grid', placeItems:'center', padding:'2rem' }}>
      <FaceMesh3D/>
    </div>
  );
}
