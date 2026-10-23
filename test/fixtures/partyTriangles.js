// renderer.info.render.triangles counts submitted triangles, including outline meshes,
// all instances in each submitted InstancedMesh, and geometry submitted to shadow maps.
// The party has one shadow-casting sun: count each visible caster a second time, even
// when its custom depth shader discards hull fragments. No frustum culling here makes
// this conservative. Points / lines do not add triangles; shared sky/FX use a reserve.
export function estimateTriangles(root) {
  let primary = 0, shadow = 0, meshes = 0;
  function visit(o) {
    if (!o.visible) return;
    if (o.isMesh && o.material?.visible !== false) {
      const g = o.geometry, available = g.index?.count ?? g.attributes.position.count;
      const submitted = Math.max(0, Math.min(available - g.drawRange.start, g.drawRange.count));
      const triangles = submitted / 3 * (o.isInstancedMesh ? o.count : 1);
      primary += triangles; if (o.castShadow) shadow += triangles; meshes++;
    }
    for (const child of o.children) visit(child);
  }
  visit(root); return { primary, shadow, total: primary + shadow, meshes };
}
