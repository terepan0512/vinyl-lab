#include <liquid_surface>

varying vec2 vSurfacePosition;
varying float vCapturedDetail;
varying vec3 vNormal;
varying vec3 vTangent;
varying vec3 vBitangent;
varying vec3 vViewDirection;

void main() {
  // Use local coordinates so the shared field is independent of geometry UVs.
  vec2 p = position.xy * 0.5;
  vec2 fields = capturedFields(liquidDomain(p));
  vCapturedDetail = capturedDetail(p, fields.y);
  vec3 displaced = position;
  // Keep downward folds above the resin backing even at maximum Relief.
  displaced.z += clamp(capturedRelief(p, fields) + vCapturedDetail, -0.024, 0.045);
  vSurfacePosition = p;

  vec4 viewPosition = modelViewMatrix * vec4(displaced, 1.0);
  vNormal = normalize(normalMatrix * vec3(0.0, 0.0, 1.0));
  vTangent = normalize(normalMatrix * vec3(1.0, 0.0, 0.0));
  vBitangent = normalize(normalMatrix * vec3(0.0, 1.0, 0.0));
  vViewDirection = -viewPosition.xyz;

  gl_Position = projectionMatrix * viewPosition;
}
