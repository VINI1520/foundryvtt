/**
 * A monochromatic shader
 */
class MonochromaticSamplerShader extends BaseSamplerShader {

  /** @override */
  static classPluginName = "monochromatic";

  static batchVertexShader = `
  precision ${PIXI.settings.PRECISION_VERTEX} float;
  attribute vec2 aVertexPosition;
  attribute vec2 aTextureCoord;
  attribute vec4 aColor;
  attribute float aTextureId;
  
  uniform mat3 projectionMatrix;
  uniform mat3 translationMatrix;
  uniform vec4 tint;
  
  varying vec2 vTextureCoord;
  varying vec4 vColor;
  varying float vTextureId;
  
  void main(void){
      gl_Position = vec4((projectionMatrix * translationMatrix * vec3(aVertexPosition, 1.0)).xy, 0.0, 1.0);
      vTextureCoord = aTextureCoord;
      vTextureId = aTextureId;
      vColor = aColor;
  }`;

  /** @override */
  static batchFragmentShader = `
    precision ${PIXI.settings.PRECISION_FRAGMENT} float;
    varying vec2 vTextureCoord;
    varying vec4 vColor;
    varying float vTextureId;
    uniform sampler2D uSamplers[%count%];
    
    void main(void){
       vec4 color;
       %forloop%
       gl_FragColor = vec4(vColor.rgb, 1.0) * color.a;
    }
  `;

  /** @inheritdoc */
  static fragmentShader = `
    precision ${PIXI.settings.PRECISION_FRAGMENT} float;
    uniform sampler2D sampler;
    uniform vec4 tintAlpha;
    varying vec2 vUvs;
    
    void main() {
      gl_FragColor = vec4(tintAlpha.rgb, 1.0) * texture2D(sampler, vUvs).a;
    }
  `;

  /** @inheritdoc */
  static defaultUniforms = {
    tintAlpha: [1, 1, 1, 1],
    sampler: 0
  };
}
