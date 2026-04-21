varying vec3 vColor;

void main() {
  // 圆形点（可选）
  float r = distance(gl_PointCoord, vec2(0.5, 0.5));
  if (r > 0.5) discard;

  gl_FragColor = vec4(vColor, 1.0);
}