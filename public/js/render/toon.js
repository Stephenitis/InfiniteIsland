// Shared toon-shading helpers: 3-step gradient map, cached toon materials, inverted-hull outlines.
import * as THREE from 'three';
import { PALETTE, OUTLINE_THICKNESS } from '../config.js';

// ---- Gradient map (3 bands, nearest filtered so the steps stay crisp)
let _gradientMap = null;
export function getGradientMap() {
  if (_gradientMap) return _gradientMap;
  const data = new Uint8Array([
    110, 110, 110, 255,   // shadow
    190, 190, 190, 255,   // mid
    255, 255, 255, 255,   // light
  ]);
  const tex = new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  _gradientMap = tex;
  return tex;
}

// ---- Toon materials, cached by color + options
const _matCache = new Map();

/**
 * Get a shared MeshToonMaterial for a color (hex string, number or THREE.Color).
 * opts are forwarded to the material (e.g. { vertexColors: true, side }).
 * Materials are shared, so do not mutate them; pass different opts for variants.
 */
export function toonMat(color, opts = {}) {
  const c = new THREE.Color(color);
  const key = c.getHexString() + '|' + JSON.stringify(opts);
  let mat = _matCache.get(key);
  if (!mat) {
    mat = new THREE.MeshToonMaterial({ color: c, gradientMap: getGradientMap(), ...opts });
    _matCache.set(key, mat);
  }
  return mat;
}

// ---- Outlines (inverted hull, extruded along normals in the vertex shader)
const _outlineCache = new Map();

function getOutlineMaterial(color, thickness) {
  const c = new THREE.Color(color);
  const key = c.getHexString() + '|' + thickness;
  let mat = _outlineCache.get(key);
  if (mat) return mat;

  mat = new THREE.MeshBasicMaterial({ color: c, side: THREE.BackSide });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.outlineThickness = { value: thickness };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float outlineThickness;')
      .replace(
        '#include <begin_vertex>',
        // Extrude along the (object space) normal so non-uniform shapes get an even line width.
        '#include <begin_vertex>\ntransformed += normalize(normal) * outlineThickness;'
      );
  };
  mat.customProgramCacheKey = () => 'outline';
  _outlineCache.set(key, mat);
  return mat;
}

/**
 * Add an inverted-hull outline to `mesh`. The outline is a child mesh sharing the source geometry
 * (no clone needed, since extrusion happens in the shader). Returns the outline mesh.
 * Note: meshes with hard-edged (non-indexed / split) normals may show small gaps at the edges; use
 * smooth normals (e.g. mergeVertices + computeVertexNormals) for best results on faceted geometry.
 */
export function addOutline(mesh, thickness = OUTLINE_THICKNESS, color = PALETTE.outline) {
  const outline = new THREE.Mesh(mesh.geometry, getOutlineMaterial(color, thickness));
  outline.name = 'outline';
  outline.castShadow = false;
  outline.receiveShadow = false;
  outline.renderOrder = -1;
  mesh.add(outline);
  return outline;
}
