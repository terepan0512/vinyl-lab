// The texture contains captured PCM (row 0) and captured RMS history (row 1).
uniform sampler2D uSignal;
uniform sampler2D uNoise;
uniform float uHistoryCursor;
uniform vec4 uAudio;
uniform float uFlowTime;
uniform vec4 uFlow;
uniform vec4 uDynamics;
uniform vec4 uAppearance;

// Deterministic spatial structure; it cannot animate without measured audio.
// One bilinear lookup replaces four sine hashes for every noise evaluation.
// Texel centers are the integer lattice; the same cubic interpolation preserves
// smooth liquid pools rather than exposing the stored grid.
float liquidNoise(vec2 p) {
  vec2 cell = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return texture2D(uNoise, (cell + 0.5 + f) / 128.0).r;
}

vec2 liquidDomain(vec2 p) {
  // Integrated live bass/mid/treble forces transport and stretch the pigment.
  // There is no section clock or elapsed-time source in this domain.
  float turn = uFlow.z * (0.22 - length(p) * 0.08);
  mat2 rotate = mat2(cos(turn), -sin(turn), sin(turn), cos(turn));
  vec2 q = rotate * p * 2.5;
  vec2 drift = vec2(uFlow.x * 0.70, -uFlow.y * 0.60);
  vec2 bend = vec2(liquidNoise(q * 0.7 + drift), liquidNoise(q * 0.7 + vec2(3.8, 7.1) - drift));
  q += (bend - 0.5) * (1.3 + uAudio.x * 0.65 + uDynamics.y * 0.30);
  // Audio-integrated strain pulls broad pools into connected liquid filaments.
  float strain = sin(uFlow.w * 0.38) * (0.18 + uAudio.y * 0.22);
  q = mat2(1.0 + strain, 0.16 * sin(uFlow.x * 0.4),
           0.16 * sin(uFlow.y * 0.4), 1.0 - strain * 0.55) * q;
  vec2 curl = vec2(liquidNoise(q * 1.1 + drift.yx + vec2(9.2, 2.6)),
                   liquidNoise(q * 1.1 - drift + vec2(1.4, 8.8))) - 0.5;
  return q + drift * 0.32 + curl * (0.35 + uDynamics.z * 0.25 + uAudio.z * 0.15);
}

float capturedEnergy(float secondsAgo) {
  float x = fract((uHistoryCursor + 0.5 - secondsAgo * 120.0) / 256.0);
  return texture2D(uSignal, vec2(x, 0.75)).r;
}

float capturedBoundary(vec2 p) {
  float radius = length(p);
  return smoothstep(0.35, 0.45, radius) * (1.0 - smoothstep(0.88, 0.976, radius));
}

vec2 capturedFields(vec2 q) {
  return vec2(liquidNoise(q * 0.8 + vec2(1.9, 4.7)),
              liquidNoise(q * 1.55 + vec2(7.3, 2.1)));
}

float capturedRelief(vec2 p, vec2 fields) {
  if (uDynamics.x <= 0.0001) return 0.0;
  float broad = fields.x;
  float folded = fields.y;

  // Neighbouring pools receive softly averaged real energy at different ages.
  // Delay follows the irregular 2D field, never radius or an outward wavefront.
  float age = 0.02 + broad * 0.20;
  float energy = (capturedEnergy(age) + capturedEnergy(age + 0.05)) * 0.5;

  float relief = (broad - 0.5) * uDynamics.x * (0.030 + uAudio.x * 0.025)
              + (folded - 0.5) * (energy * 0.018 + uAudio.y * 0.018) * uDynamics.x
              + (broad - folded) * uDynamics.y * 0.026;
  return relief * capturedBoundary(p) * uAppearance.y;
}

float capturedDetail(vec2 p, float folded) {
  if (uDynamics.x <= 0.0001) return 0.0;
  // Keep the signed capture as very small surface detail, not a replicated ring.
  // These five PCM reads run per vertex; their tiny contribution is interpolated
  // across the surface instead of repeating the capture filtering per pixel.
  float sampleX = clamp(0.10 + folded * 0.80, 2.5 / 256.0, 253.5 / 256.0);
  float pcm = 0.0;
  for (int i = -2; i <= 2; i++) {
    pcm += texture2D(uSignal, vec2(sampleX + float(i) / 256.0, 0.25)).r - 128.0 / 255.0;
  }
  pcm *= 255.0 / (127.0 * 5.0);
  return pcm * uDynamics.x * (0.0008 + uAudio.z * 0.0012) * capturedBoundary(p) * uAppearance.y;
}

