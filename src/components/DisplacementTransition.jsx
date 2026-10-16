import { useEffect, useRef } from 'react';

/**
 * Real displacement / liquid warp transition
 * GLSL inspired by https://gl-transitions.com/transition/displacement
 * Procedural wave instead of external displacementMap texture.
 * Renders full-screen canvas that cross-fades from -> to with sine warp.
 */
export default function DisplacementTransition({ from, to, duration = 1200, onDone }) {
  const canvasRef = useRef(null);
  const rafRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !from || !to) return;

    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (!gl) { onDone?.(); return; }

    const vert = `
      attribute vec2 position;
      varying vec2 v_uv;
      void main(){ v_uv = position*0.5+0.5; v_uv.y = 1.0 - v_uv.y; gl_Position = vec4(position,0.0,1.0); }
    `;
    const frag = `
      precision mediump float;
      uniform sampler2D from;
      uniform sampler2D to;
      uniform float progress;
      uniform float strength;
      varying vec2 v_uv;
      void main(){
        float wave = sin(v_uv.y * 18.0 + progress * 14.0) * 0.5 + cos(v_uv.x * 14.0 - progress * 10.0) * 0.5;
        wave = wave * 0.5 + 0.5;
        float w = strength * 0.38;
        // bell curve for max warp in middle
        float amp = progress * (1.0 - progress) * 4.0;
        vec2 off = vec2(wave * w * amp * 0.9, wave * w * amp * 0.35);
        vec2 uvFrom = v_uv + off * progress;
        vec2 uvTo   = v_uv - off * (1.0 - progress);
        // clamp to avoid sampling outside
        uvFrom = clamp(uvFrom, 0.0, 1.0);
        uvTo = clamp(uvTo, 0.0, 1.0);
        vec4 cFrom = texture2D(from, uvFrom);
        vec4 cTo   = texture2D(to, uvTo);
        float m = smoothstep(0.28, 0.72, progress + (wave - 0.5) * 0.14);
        gl_FragColor = mix(cFrom, cTo, m);
      }
    `;

    function compile(src, type) {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        console.warn('shader', gl.getShaderInfoLog(s));
        return null;
      }
      return s;
    }
    const vs = compile(vert, gl.VERTEX_SHADER);
    const fs = compile(frag, gl.FRAGMENT_SHADER);
    if (!vs || !fs) { onDone?.(); return; }

    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.warn(gl.getProgramInfoLog(prog));
      onDone?.();
      return;
    }
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
    const posLoc = gl.getAttribLocation(prog, 'position');
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    const uProgress = gl.getUniformLocation(prog, 'progress');
    const uStrength = gl.getUniformLocation(prog, 'strength');

    function createTex() {
      const t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      return t;
    }

    const tFrom = createTex();
    const tTo = createTex();
    let loaded = 0;
    let raf = 0;

    function resize() {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = canvas.clientWidth * dpr;
      const h = canvas.clientHeight * dpr;
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w; canvas.height = h;
      }
      gl.viewport(0, 0, canvas.width, canvas.height);
    }
    resize();
    window.addEventListener('resize', resize);

    function draw(p) {
      gl.uniform1f(uProgress, p);
      gl.uniform1f(uStrength, 0.95);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    const imgFrom = new Image(); imgFrom.crossOrigin = 'anonymous';
    const imgTo = new Image(); imgTo.crossOrigin = 'anonymous';

    let start = null;
    function tryStart() {
      if (++loaded < 2) return;
      start = performance.now();
      function frame(now) {
        const t = Math.min(1, (now - start) / duration);
        // easeInOutCubic
        const eased = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
        draw(eased);
        if (t < 1) rafRef.current = requestAnimationFrame(frame);
        else onDone?.();
      }
      rafRef.current = requestAnimationFrame(frame);
    }

    function onLoad(img, tex, unit, uniform) {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
      gl.uniform1i(gl.getUniformLocation(prog, uniform), unit);
    }

    imgFrom.onload = () => { onLoad(imgFrom, tFrom, 0, 'from'); tryStart(); };
    imgFrom.onerror = () => { console.warn('from load fail'); onDone?.(); };
    imgTo.onload = () => { onLoad(imgTo, tTo, 1, 'to'); tryStart(); };
    imgTo.onerror = () => { console.warn('to load fail'); onDone?.(); };

    // placeholder 1x1
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tFrom);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0,0,0,255]));
    gl.activeTexture(gl.TEXTURE0+1); gl.bindTexture(gl.TEXTURE_2D, tTo);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0,0,0,255]));

    imgFrom.src = from;
    imgTo.src = to;

    // fallback if images cached and load already fired sync
    if (imgFrom.complete && imgFrom.naturalWidth) { /* will trigger onload async */ }
    if (imgTo.complete && imgTo.naturalWidth) {}

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener('resize', resize);
      try { gl.deleteProgram(prog); } catch {}
    };
  }, [from, to, duration, onDone]);

  return <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} className="absolute inset-0 w-full h-full" />;
}
