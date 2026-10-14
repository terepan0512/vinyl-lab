uniform float uTime;
uniform vec4 uAudio;
uniform vec3 uPink;
uniform vec3 uCyan;
uniform vec3 uPurple;

varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vViewDirection;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);

  return mix(
    mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0)), f.x),
    f.y
  );
}

float fbm(vec2 p) {
  float value = 0.0;
  float amplitude = 0.5;
  mat2 turn = mat2(0.8, -0.6, 0.6, 0.8);

  for (int i = 0; i < 4; i++) {
    value += amplitude * noise(p);
    p = turn * p * 2.03 + vec2(7.1, 3.7);
    amplitude *= 0.5;
  }

  return value;
}

void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float radius = length(p);

  // Clear perimeter and dry center label, with antialiased boundaries.
  float edgeWidth = max(fwidth(radius), 0.001);
  float mask = smoothstep(0.35, 0.35 + edgeWidth, radius)
             * (1.0 - smoothstep(0.976 - edgeWidth, 0.976, radius));

  if (mask < 0.001) discard;

  float t = uTime;
  float swirl = t * 0.18 + (1.0 - radius) * (2.0 + uAudio.x * 0.7);
  mat2 turn = mat2(cos(swirl), -sin(swirl), sin(swirl), cos(swirl));
  vec2 q = turn * p * 2.8;

  vec2 warp = vec2(
    fbm(q + vec2(t * 0.17, 0.0)),
    fbm(q + vec2(4.2, -t * 0.14))
  );

  float field = fbm(
    q + (warp - 0.5) * (3.0 + uAudio.y * 0.6)
      + vec2(-t * 0.09, t * 0.12)
  );

  float ribbons = sin(field * 17.0 + radius * 4.0 + warp.y * 3.0);

  vec3 pigment = mix(
    uPurple,
    uPink,
    smoothstep(-0.8, 0.6, ribbons)
  );

  pigment = mix(
    pigment,
    uCyan,
    smoothstep(0.49, 0.72, field + warp.x * 0.16)
  );

  // Thin translucent resin with subtle grooves and glossy internal interfaces.
  float interfaceLight = pow(1.0 - abs(ribbons), 8.0);
  float fresnel = pow(
    1.0 - abs(dot(normalize(vNormal), normalize(vViewDirection))),
    3.0
  );

  float grooves = sin(radius * 650.0) * 0.018;
  vec3 color = pigment * (0.92 + grooves + uAudio.w * 0.12);

  color += vec3(0.3, 0.65, 0.8)
         * interfaceLight
         * (0.12 + uAudio.z * 0.08);

  color += vec3(0.45, 0.7, 0.85) * fresnel * 0.18;

  float alpha = mask * clamp(
    0.66 + field * 0.20 + fresnel * 0.08,
    0.0,
    0.92
  );

  gl_FragColor = vec4(color, alpha);

  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}