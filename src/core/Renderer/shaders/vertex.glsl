attribute float intensity;
attribute float height;
uniform int uColorMode;      // 0=intensity 1=height 2=semantic
uniform float uMinVal;
uniform float uMaxVal;
uniform float uPointSize;

varying vec3 vColor;

vec3 jetColormap(float v) {
  v = clamp(v, 0.0, 1.0);
  return vec3(
    clamp(1.5 - abs(4.0*v - 3.0), 0.0, 1.0),
    clamp(1.5 - abs(4.0*v - 2.0), 0.0, 1.0),
    clamp(1.5 - abs(4.0*v - 1.0), 0.0, 1.0)
  );
}

void main() {
  float raw = (uColorMode == 0) ? intensity : height;
  float normalized = (uMaxVal > uMinVal)
    ? (raw - uMinVal) / (uMaxVal - uMinVal)
    : 0.0;
  vColor = jetColormap(normalized);

  gl_PointSize = uPointSize;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}