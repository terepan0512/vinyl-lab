#include <liquid_surface>

uniform vec3 uColorA;
uniform vec3 uColorB;
uniform vec3 uColorC;
uniform vec3 uPaletteWeights;
uniform vec4 uPigmentQuantilesA;
uniform vec4 uPigmentQuantilesB;
uniform float uGlow;

varying vec2 vSurfacePosition;
varying float vCapturedDetail;
varying vec3 vNormal;
varying vec3 vTangent;
varying vec3 vBitangent;
varying vec3 vViewDirection;

// One height evaluation per fragment. Recover local slopes from screen-space
// derivatives instead of evaluating the complete flow five times per pixel.
vec3 liquidSurface(vec2 p, vec2 q) {
  float height = clamp(capturedRelief(p, capturedFields(q)) + vCapturedDetail, -0.024, 0.045);
  vec2 px = dFdx(p), py = dFdy(p);
  float hx = dFdx(height), hy = dFdy(height);
  float determinant = px.x * py.y - px.y * py.x;
  if (abs(determinant) < 0.0000000001) return vec3(height, 0.0, 0.0);
  return vec3(height, (hx * py.y - hy * px.y) / determinant,
    (hy * px.x - hx * py.x) / determinant);
}

// Quantiles track the current folded field over the visible annulus. A fixed
// historical CDF can privilege Main as the field deforms; live calibration keeps
// the three requested shares useful while their audio-driven boundaries flow.
float pigmentPercentile(float field) {
  vec4 a = uPigmentQuantilesA;
  vec4 b = uPigmentQuantilesB;
  return 0.125 * (
      clamp(field / max(a.x, 0.0001), 0.0, 1.0)
    + clamp((field - a.x) / max(a.y - a.x, 0.0001), 0.0, 1.0)
    + clamp((field - a.y) / max(a.z - a.y, 0.0001), 0.0, 1.0)
    + clamp((field - a.z) / max(a.w - a.z, 0.0001), 0.0, 1.0)
    + clamp((field - a.w) / max(b.x - a.w, 0.0001), 0.0, 1.0)
    + clamp((field - b.x) / max(b.y - b.x, 0.0001), 0.0, 1.0)
    + clamp((field - b.y) / max(b.z - b.y, 0.0001), 0.0, 1.0)
    + clamp((field - b.z) / max(1.0 - b.z, 0.0001), 0.0, 1.0)
  );
}

void main() {
  vec2 p = vSurfacePosition;
  float radius = length(p);

  // Clear perimeter and dry center label, with antialiased boundaries.
  float edgeWidth = max(fwidth(radius), 0.001);
  float mask = smoothstep(0.35, 0.35 + edgeWidth, radius)
             * (1.0 - smoothstep(0.976 - edgeWidth, 0.976, radius));

  if (mask < 0.001) discard;

  // Share one advected domain between the relief and pigment calculations.
  vec2 q = liquidDomain(p);
  vec3 surface = liquidSurface(p, q);
  // The field is normalized to a disc of radius 1; geometry has radius 2.
  vec2 slope = surface.yz * 0.5;
  vec3 normal = normalize(vNormal - slope.x * vTangent - slope.y * vBitangent);
  vec3 viewDirection = normalize(vViewDirection);

  // The same slowly advected domain controls both relief and pigment pools.
  vec2 fold = vec2(liquidNoise(q * 0.9 + vec2(2.1, 6.3)), liquidNoise(q * 0.9 + vec2(7.7, 1.4)));
  float field = liquidNoise(q * 1.25 + (fold - 0.5) * 1.9) * 0.75
              + liquidNoise(q * 0.55 + vec2(4.8, 2.6)) * 0.25;

  // Three separate pigment pools meet at soft boundaries. Each interior can
  // display its actual input color; Accent and Counterpoint are not glazes
  // permanently diluted by Main. Flow moves these pools without changing hue.
  vec3 allocation = max(uPaletteWeights, vec3(0.0));
  allocation /= max(dot(allocation, vec3(1.0)), 0.0001);
  float mainBoundary = allocation.x;
  float counterpointBoundary = allocation.x + allocation.y;
  float selection = pigmentPercentile(field);
  float boundaryWidth = max(0.035, fwidth(selection));
  float accentBlend = smoothstep(mainBoundary - boundaryWidth, mainBoundary + boundaryWidth, selection);
  float counterpointBlend = smoothstep(counterpointBoundary - boundaryWidth, counterpointBoundary + boundaryWidth, selection);
  vec3 pigment = mix(uColorA, uColorB, accentBlend);
  pigment = mix(pigment, uColorC, counterpointBlend);

  // Thin translucent resin with glossy internal interfaces.
  float interfaceLight = exp(-abs(selection - mainBoundary) * 36.0)
                       + exp(-abs(selection - counterpointBoundary) * 40.0) * 0.6;
  float fresnel = pow(
    1.0 - abs(dot(normal, viewDirection)),
    3.0
  );

  // Broad studio reflections follow the gently raised pools.
  vec3 halfA = normalize(normalize(vec3(-0.65, 0.8, 0.75)) + viewDirection);
  vec3 halfB = normalize(normalize(vec3(0.75, 0.35, 0.8)) + viewDirection);
  float glossA = pow(max(dot(normal, halfA), 0.0), 48.0);
  float glossB = pow(max(dot(normal, halfB), 0.0), 64.0);
  vec3 reflection = reflect(-viewDirection, normal);
  float softbox = pow(max(0.0, 1.0 - abs(reflection.x * 0.65 + reflection.y * 0.35 - 0.25)), 32.0);
  // Bounded reflection keeps pale highlights from bleaching the audio palette.
  // The layer is display-referred, so lighting does not rescale the base color.
  float reflectionStrength = clamp(
    interfaceLight * 0.006 + fresnel * 0.008
    + glossA * 0.018 + glossB * 0.020
    + softbox * (0.006 + uGlow * 0.004),
    0.0, 0.035
  );
  // Perceptual brightness and color intensity are applied to each pigment
  // before gamut conversion. Only the bounded surface reflection adds white.
  vec3 color = mix(pigment, vec3(1.0), reflectionStrength);

  // Thinner pools transmit more of the pale resin backing. Bass raises their
  // body, while treble leaves finer transparent edges; the slider sets the base.
  float thickness = clamp(0.90 + (field - 0.5) * 0.16 + uAudio.x * 0.07 - uAudio.z * 0.035, 0.78, 1.0);
  float alpha = mask * clamp(uAppearance.x, 0.25, 1.0) * thickness;

  gl_FragColor = vec4(color, alpha);

  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
