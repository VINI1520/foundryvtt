/**
 * Snow shader effect.
 */
class SnowShader extends AbstractWeatherShader {

  /** @inheritdoc */
  static defaultUniforms = {
    direction: 1.2
  };

  /* -------------------------------------------- */

  /** @inheritdoc */
  static fragmentShader = `
    ${this.FRAGMENT_HEADER}
    uniform float direction;

    // Contribute to snow PRNG
    const mat3 prng = mat3(13.323122, 23.5112, 21.71123, 21.1212, 
                           28.731200, 11.9312, 21.81120, 14.7212, 61.3934);
       
    // Compute snow density according to uv and layer                       
    float computeSnowDensity(in vec2 uv, in float layer) {
      vec3 snowbase = vec3(floor(uv), 31.189 + layer);
      vec3 m = floor(snowbase) / 10000.0 + fract(snowbase);
      vec3 mp = (31415.9 + m) / fract(prng * m);
      vec3 r = fract(mp);
      vec2 s = abs(fract(uv) - 0.5 + 0.9 * r.xy - 0.45) + 0.01 * abs( 2.0 * fract(10.0 * uv.yx) - 1.0); 
      float d = 0.6 * (s.x + s.y) + max(s.x, s.y) - 0.01;
      float edge = 0.005 + 0.05 * min(0.5 * abs(layer - 5.0 - sin(time * 0.1)), 1.0);
      return smoothstep(edge * 2.0, -edge * 2.0, d) * r.x / (0.5 + 0.01 * layer * 1.5);
    }                
 
    void main() {
      ${this.COMPUTE_MASK}
      
      // Snow accumulation
      float accumulation = 0.0;
      
      // Compute layers  
      for ( float i=5.0; i<25.0; i++ ) {
        // Compute uv layerization
        vec2 snowuv = vUvs.xy * (1.0 + i * 1.5);
        snowuv += vec2(snowuv.y * 1.2 * (fract(i * 6.258817) - direction), -time / (1.0 + i * 1.5 * 0.03));
                   
        // Perform accumulation layer after layer    
        accumulation += computeSnowDensity(snowuv, i);
      }
      // Output the accumulated snow pixel
      gl_FragColor = vec4(vec3(accumulation) * tint, 1.0) * mask * alpha;
    }
  `;
}


