/**
 * A simple shader which purpose is to make the original texture red channel the alpha channel,
 * and still keeping channel informations. Used in cunjunction with the AlphaBlurFilterPass and Fog of War.
 */
class FogSamplerShader extends BaseSamplerShader {
  /** @override */
  static classPluginName = null;

  /** @override */
  static fragmentShader = `
    precision ${PIXI.settings.PRECISION_FRAGMENT} float;
    uniform sampler2D sampler;
    uniform vec4 tintAlpha;
    varying vec2 vUvs;
    void main() {
        vec4 color = texture2D(sampler, vUvs);
        gl_FragColor = vec4(1.0, color.gb, 1.0) * step(0.15, color.r) * tintAlpha;
    }`;
}
