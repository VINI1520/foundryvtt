/**
 * A special subclass of DataField used to reference an AbstractBaseShader definition.
 */
class ShaderField extends foundry.data.fields.DataField {

  /** @inheritdoc */
  static get _defaults() {
    const defaults = super._defaults;
    defaults.nullable = true;
    defaults.initial = undefined;
    return defaults;
  }

  /** @override */
  _cast(value) {
    if ( !foundry.utils.isSubclass(value, AbstractBaseShader) ) {
      throw new Error("The value provided to a ShaderField must be an AbstractBaseShader subclass.");
    }
    return value;
  }
}

/**
 * A Vision Mode which can be selected for use by a Token.
 * The selected Vision Mode alters the appearance of various aspects of the canvas while that Token is the POV.
 */
class VisionMode extends foundry.abstract.DataModel {
  /**
   * Construct a Vision Mode using provided configuration parameters and callback functions.
   * @param {object} data             Data which fulfills the model defined by the VisionMode schema.
   * @param {object} [options]        Additional options passed to the DataModel constructor.
   */
  constructor(data={}, options={}) {
    super(data, options);
    this.animated = options.animated ?? false;
  }

  /** @inheritDoc */
  static defineSchema() {
    const fields = foundry.data.fields;
    const shaderSchema = () => new fields.SchemaField({
      shader: new ShaderField(),
      uniforms: new fields.ObjectField()
    });
    const lightingSchema = () => new fields.SchemaField({
      visibility: new fields.NumberField({
        initial: this.LIGHTING_VISIBILITY.ENABLED,
        choices: Object.values(this.LIGHTING_VISIBILITY)
      }),
      postProcessingModes: new fields.ArrayField(new fields.StringField()),
      uniforms: new fields.ObjectField()
    });

    // Return model schema
    return {
      id: new fields.StringField({blank: false}),
      label: new fields.StringField({blank: false}),
      tokenConfig: new fields.BooleanField({initial: true}),
      canvas: new fields.SchemaField({
        shader: new ShaderField(),
        uniforms: new fields.ObjectField()
      }),
      lighting: new fields.SchemaField({
        background: lightingSchema(),
        coloration: lightingSchema(),
        illumination: lightingSchema(),
        levels: new fields.ObjectField({
          validate: o => {
            const values = Object.values(this.LIGHTING_LEVELS);
            return Object.entries(o).every(([k, v]) => values.includes(Number(k)) && values.includes(v));
          },
          validationError: "may only contain a mapping of keys from VisionMode.LIGHTING_LEVELS"
        }),
        multipliers: new fields.ObjectField({
          validate: o => {
            const values = Object.values(this.LIGHTING_LEVELS);
            return Object.entries(o).every(([k, v]) => values.includes(Number(k)) && Number.isFinite(v));
          },
          validationError: "must provide a mapping of keys from VisionMode.LIGHTING_LEVELS to numeric multiplier values"
        })
      }),
      vision: new fields.SchemaField({
        background: shaderSchema(),
        coloration: shaderSchema(),
        illumination: shaderSchema(),
        darkness: new fields.SchemaField({
          adaptive: new fields.BooleanField({initial: true})
        }),
        defaults: new fields.ObjectField(),
        preferred: new fields.BooleanField({initial: false})
      })
    };
  }

  /**
   * The lighting illumination levels which are supported.
   * @enum {number}
   */
  static LIGHTING_LEVELS = {
    DARKNESS: -2,
    HALFDARK: -1,
    UNLIT: 0,
    DIM: 1,
    BRIGHT: 2,
    BRIGHTEST: 3
  };

  /**
   * Flags for how each lighting channel should be rendered for the currently active vision modes:
   * - Disabled: this lighting layer is not rendered, the shaders does not decide.
   * - Enabled: this lighting layer is rendered normally, and the shaders can choose if they should be rendered or not.
   * - Required: the lighting layer is rendered, the shaders does not decide.
   * @enum {number}
   */
  static LIGHTING_VISIBILITY = {
    DISABLED: 0,
    ENABLED: 1,
    REQUIRED: 2
  };

  /**
   * A flag for whether this vision source is animated
   * @type {boolean}
   */
  animated = false;

  /**
   * Special activation handling that could be implemented by VisionMode subclasses
   * @param {VisionSource} source   Activate this VisionMode for a specific source
   * @abstract
   */
  _activate(source) {}

  /**
   * Special deactivation handling that could be implemented by VisionMode subclasses
   * @param {VisionSource} source   Deactivate this VisionMode for a specific source
   * @abstract
   */
  _deactivate(source) {}

  /**
   * Special handling which is needed when this Vision Mode is activated for a VisionSource.
   * @param {VisionSource} source   Activate this VisionMode for a specific source
   */
  activate(source) {
    if ( source._visionModeActivated ) return;
    source._visionModeActivated = true;
    this._activate(source);
  }

  /**
   * Special handling which is needed when this Vision Mode is deactivated for a VisionSource.
   * @param {VisionSource} source   Deactivate this VisionMode for a specific source
   */
  deactivate(source) {
    if ( !source._visionModeActivated ) return;
    source._visionModeActivated = false;
    this._deactivate(source);
  }

  /**
   * An animation function which runs every frame while this Vision Mode is active.
   * @param {number} dt         The deltaTime passed by the PIXI Ticker
   */
  animate(dt) {
    return VisionSource.prototype.animateTime.call(this, dt);
  }
}
