// A disposable, demand-rendered R3F character selection vignette. The live game remains the authority.
import React, { Component, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { createCharacter } from '../../public/js/player/character.js';
import { attachVariant, CHARACTER_VARIANTS, normaliseVariant } from '../../public/js/player/characterVariants.js';
import './characters.css';

function Cast({ selected, choose }) {
  const models = useMemo(() => CHARACTER_VARIANTS.map((variant, i) => {
    const character = createCharacter();
    const cleanup = attachVariant(character, variant.id);
    const angle = -1.15 + i * 0.46;
    character.root.position.set(Math.sin(angle) * 4.2, 0.04, -Math.cos(angle) * 2.1);
    character.root.rotation.y = -angle * 0.25;
    return { ...variant, character, cleanup };
  }), []);
  useEffect(() => () => { for (const m of models) { m.cleanup(); m.character.dispose(); } }, [models]);
  return models.map((m) => <group key={m.id}>
    <primitive object={m.character.root} dispose={null} onClick={(e) => { e.stopPropagation(); choose(m.id); }} />
    {m.id === selected && <mesh rotation={[-Math.PI / 2, 0, 0]} position={[m.character.root.position.x, 0.05, m.character.root.position.z]}>
      <ringGeometry args={[0.53, 0.65, 32]} /><meshBasicMaterial color="#f5c86b" side={THREE.DoubleSide} />
    </mesh>}
  </group>);
}

function Campfire() {
  // Static composition: one small canvas, no frame loop, animation or shadow maps.
  return <group position={[0, 0, 1]}>
    {[0, 1, 2].map((i) => <mesh key={i} rotation={[Math.PI / 2, 0, i * Math.PI / 3]} position={[0, 0.13, 0]}>
      <cylinderGeometry args={[0.12, 0.15, 1.15, 8]} /><meshToonMaterial color="#835a43" />
    </mesh>)}
    <mesh position={[0, 0.6, 0]}><coneGeometry args={[0.36, 0.95, 7]} /><meshBasicMaterial color="#f4a45b" /></mesh>
    <mesh position={[0, 0.48, 0.16]}><coneGeometry args={[0.2, 0.64, 7]} /><meshBasicMaterial color="#ffe09a" /></mesh>
  </group>;
}
class CanvasBoundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <p className="cg-character-fallback">The 3D preview is unavailable. You can still choose a character below.</p> : this.props.children; }
}
function CharacterSelect({ current, onChoose, onClose }) {
  const [selected, setSelected] = useState(normaliseVariant(current));
  const panel = useRef(null);
  useEffect(() => {
    const before = document.activeElement;
    panel.current?.querySelector('button')?.focus();
    return () => { if (before?.isConnected) before.focus(); };
  }, []);
  const keyDown = (e) => {
    e.stopPropagation();
    if (e.key === 'Escape') { e.preventDefault(); onClose(); }
    if (e.key === 'Tab') {
      const buttons = [...panel.current.querySelectorAll('button:not(:disabled)')];
      const first = buttons[0], last = buttons[buttons.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  };
  return <section className="cg-character-overlay" role="dialog" aria-modal="true" aria-labelledby="cg-character-heading" onKeyDown={keyDown} onPointerDown={(e) => e.stopPropagation()} onPointerUp={(e) => e.stopPropagation()}>
    <div className="cg-character-panel" ref={panel}>
      <header><div><h1 id="cg-character-heading">A place by the fire</h1><p>Choose a look. Everyone has the same abilities.</p></div><button aria-label="Close character selection" onClick={onClose}>×</button></header>
      <div className="cg-character-preview"><CanvasBoundary>
        <Canvas frameloop="demand" dpr={[1, 1.25]} gl={{ antialias: true, stencil: true }} camera={{ position: [0, 5.5, 11], fov: 40 }}>
          <color attach="background" args={['#dae2d2']} /><ambientLight intensity={2} /><directionalLight position={[4, 7, 6]} intensity={2.2} />
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}><circleGeometry args={[9, 48]} /><meshToonMaterial color="#90ad77" /></mesh>
          <Cast selected={selected} choose={setSelected} /><Campfire />
          <OrbitControls target={[0, 0.65, -0.5]} enablePan={false} enableZoom={false} minPolarAngle={Math.PI / 4} maxPolarAngle={Math.PI / 2.3} minAzimuthAngle={-0.3} maxAzimuthAngle={0.3} />
        </Canvas>
      </CanvasBoundary></div>
      <div className="cg-character-options" aria-label="Character appearance">{CHARACTER_VARIANTS.map((v) => <button key={v.id} aria-pressed={selected === v.id} onClick={() => setSelected(v.id)} style={{ '--character-color': v.color }}><span className="cg-character-dot" /><strong>{v.name}</strong><small>{v.description}</small></button>)}</div>
      <footer><button onClick={onClose}>Keep playing</button><button className="cg-character-confirm" onClick={() => onChoose(selected)}>Play as {CHARACTER_VARIANTS.find((v) => v.id === selected).name}</button></footer>
    </div>
  </section>;
}

export function mountCharacterSelect({ onChoose = () => {}, onClose = () => {}, current = 'original' } = {}) {
  const host = document.createElement('div'); host.id = 'character-selection-root'; document.body.append(host);
  const root = createRoot(host);
  let closed = false;
  const cleanup = () => { if (closed) return; closed = true; root.unmount(); host.remove(); };
  const close = () => { cleanup(); onClose(); };
  const choose = (id) => { cleanup(); onChoose(id); };
  root.render(<CharacterSelect current={current} onChoose={choose} onClose={close} />);
  return cleanup;
}
