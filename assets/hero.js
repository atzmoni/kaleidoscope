// Hero: a small live 60-60-60 kaleidoscope. The cell is folded across three mirror lines,
// light fades a little with every reflection, and the eye sees a round field.
(function () {
  const cv = document.getElementById("kc"); if (!cv) return;
  const gl = cv.getContext("webgl", { antialias: false, alpha: false }); if (!gl) { cv.style.background = "radial-gradient(circle at 70% 50%, #1b2a3a, #07090d 70%)"; return; }
  const fs = `precision highp float;
uniform vec2 R; uniform float T; uniform vec2 C;
vec3 cell(vec2 p){
  // drifting pieces of coloured glass on a dark screen
  vec3 c = vec3(.012, .014, .03);
  for (int i = 0; i < 12; i++){
    float f = float(i);
    vec2 o = .3 * vec2(sin(T * .19 * (1. + f * .13) + f * 2.1), cos(T * .15 * (1. + f * .11) + f * 1.3));
    float r = .045 + .04 * fract(f * .618), d = length(p - o);
    vec3 h = .5 + .5 * cos(vec3(0., 2.1, 4.2) + f * 1.9 + T * .04);
    c += h * h * (smoothstep(r, r * .55, d) * .8 + .05 / (1. + d * d * 90.));
  }
  return c;
}
void main(){
  vec2 q = (gl_FragCoord.xy - C * R) / min(R.x, R.y) * 3.6;
  float depth = 0.;
  vec3 n0 = vec3(0., -1., .25), n1 = vec3(.8660254, .5, .25), n2 = vec3(-.8660254, .5, .25);
  for (int k = 0; k < 40; k++){
    float s0 = dot(n0.xy, q) - n0.z, s1 = dot(n1.xy, q) - n1.z, s2 = dot(n2.xy, q) - n2.z;
    if (s0 > 0.){ q -= 2. * s0 * n0.xy; depth++; }
    else if (s1 > 0.){ q -= 2. * s1 * n1.xy; depth++; }
    else if (s2 > 0.){ q -= 2. * s2 * n2.xy; depth++; }
    else break;
  }
  vec3 c = cell(q) * pow(.92, depth);
  float e = min(abs(dot(n0.xy, q) - n0.z), min(abs(dot(n1.xy, q) - n1.z), abs(dot(n2.xy, q) - n2.z)));
  c *= mix(.45, 1., smoothstep(.0, .01, e));
  vec2 v = (gl_FragCoord.xy - C * R) / min(R.x, R.y);
  c *= smoothstep(.5, .36, length(v));
  gl_FragColor = vec4(1. - exp(-c * 1.6), 1.);
}`;
  const sh = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); return o; };
  const p = gl.createProgram(); gl.attachShader(p, sh(gl.VERTEX_SHADER, "attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}")); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) return; gl.useProgram(p);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer()); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  const uR = gl.getUniformLocation(p, "R"), uT = gl.getUniformLocation(p, "T"), uC = gl.getUniformLocation(p, "C");
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let vis = true; new IntersectionObserver(e => { vis = e[0].isIntersecting; }).observe(cv);
  function frame(t) {
    const d = Math.min(1.5, devicePixelRatio), w = Math.round(cv.clientWidth * d), h = Math.round(cv.clientHeight * d);
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; gl.viewport(0, 0, w, h); }
    const wide = cv.clientWidth > 860;
    gl.uniform2f(uR, w, h); gl.uniform1f(uT, still ? 12 : t / 1000); gl.uniform2f(uC, wide ? .3 : .5, wide ? .5 : .62);
    if (vis) gl.drawArrays(gl.TRIANGLES, 0, 3);
    if (!still) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
