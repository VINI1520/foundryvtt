/**
 * Runtime configuration settings for Foundry VTT which exposes a large number of variables which determine how
 * aspects of the software behaves.
 *
 * Unlike the CONST analog which is frozen and immutable, the CONFIG object may be updated during the course of a
 * session or modified by system and module developers to adjust how the application behaves.
 *
 * @type {object}
 */
const CONFIG = globalThis.CONFIG = {

  /**
   * Configure debugging flags to display additional information
   */
  debug: {
    dice: false,
    documents: false,
    fog: false,
    hooks: false,
    av: false,
    avclient: false,
    mouseInteraction: false,
    time: false,
    keybindings: false,
    polygons: false,
    gamepad: false
  },

  /**
   * Configure the verbosity of compatibility warnings generated throughout the software.
   * The compatibility mode defines the logging level of any displayed warnings.
   * The includePatterns and excludePatterns arrays provide a set of regular expressions which can either only
   * include or specifically exclude certain file paths or warning messages.
   * Exclusion rules take precedence over inclusion rules.
   *
   * @see {@link CONST.COMPATIBILITY_MODES}
   * @type {{mode: number, includePatterns: RegExp[], excludePatterns: RegExp[]}}
   *
   * @example Include Specific Errors
   * ```js
   * const includeRgx = new RegExp("/systems/dnd5e/module/documents/active-effect.mjs");
   * CONFIG.compatibility.includePatterns.push(includeRgx);
   * ```
   *
   * @example Exclude Specific Errors
   * ```js
   * const excludeRgx = new RegExp("/systems/dnd5e/");
   * CONFIG.compatibility.excludePatterns.push(excludeRgx);
   * ```
   *
   * @example Both Include and Exclude
   * ```js
   * const includeRgx = new RegExp("/systems/dnd5e/module/actor/");
   * const excludeRgx = new RegExp("/systems/dnd5e/module/actor/sheets/base.js");
   * CONFIG.compatibility.includePatterns.push(includeRgx);
   * CONFIG.compatibility.excludePatterns.push(excludeRgx);
   * ```
   *
   * @example Targeting more than filenames
   * ```js
   * const includeRgx = new RegExp("applyActiveEffects");
   * CONFIG.compatibility.includePatterns.push(includeRgx);
   * ```
   */
  compatibility: {
    mode: CONST.COMPATIBILITY_MODES.WARNING,
    includePatterns: [],
    excludePatterns: []
  },

  /**
   * Configure the DatabaseBackend used to perform Document operations
   * @type {ClientDatabaseBackend}
   */
  DatabaseBackend: new ClientDatabaseBackend(),

  /**
   * Configuration for the Actor document
   */
  Actor: {
    documentClass: Actor,
    collection: Actors,
    compendiumIndexFields: [],
    sidebarIcon: "fas fa-user",
    systemDataModels: {},
    typeLabels: {},
    typeIcons: {},
  },

  /**
   * Configuration for the Adventure document.
   * Currently for internal use only.
   * @private
   */
  Adventure: {
    documentClass: Adventure,
    compendiumIndexFields: [],
    sidebarIcon: "fa-solid fa-folder-tree"
  },

  /**
   * Configuration for the Cards primary Document type
   */
  Cards: {
    collection: CardStacks,
    compendiumIndexFields: [],
    documentClass: Cards,
    sidebarIcon: "fa-solid fa-cards",
    systemDataModels: {},
    presets: {
      pokerDark: {
        type: "deck",
        label: "CARDS.DeckPresetPokerDark",
        src: "cards/poker-deck-dark.json"
      },
      pokerLight: {
        type: "deck",
        label: "CARDS.DeckPresetPokerLight",
        src: "cards/poker-deck-light.json"
      }
    },
    typeLabels: {
      deck: "CARDS.CardsDeck",
      hand: "CARDS.CardsHand",
      pile: "CARDS.CardsPile",
    },
    typeIcons: {
      deck: "fas fa-cards",
      hand: "fa-duotone fa-cards",
      pile: "fa-duotone fa-layer-group"
    }
  },

  /**
   * Configuration for the ChatMessage document
   */
  ChatMessage: {
    documentClass: ChatMessage,
    collection: Messages,
    template: "templates/sidebar/chat-message.html",
    sidebarIcon: "fas fa-comments",
    batchSize: 100
  },

  /**
   * Configuration for the Combat document
   */
  Combat: {
    documentClass: Combat,
    collection: CombatEncounters,
    sidebarIcon: "fas fa-swords",
    initiative: {
      formula: null,
      decimals: 2
    },
    sounds: {
      epic: {
        label: "COMBAT.Sounds.Epic",
        startEncounter: ["sounds/combat/epic-start-3hit.ogg", "sounds/combat/epic-start-horn.ogg"],
        nextUp: ["sounds/combat/epic-next-horn.ogg"],
        yourTurn: ["sounds/combat/epic-turn-1hit.ogg", "sounds/combat/epic-turn-2hit.ogg"]
      },
      mc: {
        label: "COMBAT.Sounds.MC",
        startEncounter: ["sounds/combat/mc-start-battle.ogg", "sounds/combat/mc-start-begin.ogg", "sounds/combat/mc-start-fight.ogg", "sounds/combat/mc-start-fight2.ogg"],
        nextUp: ["sounds/combat/mc-next-itwillbe.ogg", "sounds/combat/mc-next-makeready.ogg", "sounds/combat/mc-next-youare.ogg"],
        yourTurn: ["sounds/combat/mc-turn-itisyour.ogg", "sounds/combat/mc-turn-itsyour.ogg"]
      }
    }
  },

  /**
   * Configuration for dicecoin rolling behaviors in the Foundry VTT client
   * @type {object}
   */
  Dice: {
    types: [Die, FateDie],
    rollModes: Object.entries(CONST.DICE_ROLL_MODES).reduce((obj, e) => {
      let [k, v] = e;
      obj[v] = `CHAT.Roll${k.titleCase()}`;
      return obj;
    }, {}),
    rolls: [Roll],
    termTypes: {DiceTerm, MathTerm, NumericTerm, OperatorTerm, ParentheticalTerm, PoolTerm, StringTerm},
    terms: {
      c: Coin,
      d: Die,
      f: FateDie
    },
    randomUniform: MersenneTwister.random
  },

  /**
   * Configuration for the FogExploration document
   */
  FogExploration: {
    documentClass: FogExploration,
    collection: FogExplorations
  },

  /**
   * Configuration for the Folder document
   */
  Folder: {
    documentClass: Folder,
    collection: Folders,
    sidebarIcon: "fas fa-folder"
  },

  /**
   * Configuration for Item document
   */
  Item: {
    documentClass: Item,
    collection: Items,
    compendiumIndexFields: [],
    sidebarIcon: "fas fa-suitcase",
    systemDataModels: {},
    typeLabels: {},
    typeIcons: {}
  },

  /**
   * Configuration for the JournalEntry document
   */
  JournalEntry: {
    documentClass: JournalEntry,
    collection: Journal,
    compendiumIndexFields: [],
    noteIcons: {
      Anchor: "icons/svg/anchor.svg",
      Barrel: "icons/svg/barrel.svg",
      Book: "icons/svg/book.svg",
      Bridge: "icons/svg/bridge.svg",
      Cave: "icons/svg/cave.svg",
      Castle: "icons/svg/castle.svg",
      Chest: "icons/svg/chest.svg",
      City: "icons/svg/city.svg",
      Coins: "icons/svg/coins.svg",
      Fire: "icons/svg/fire.svg",
      "Hanging Sign": "icons/svg/hanging-sign.svg",
      House: "icons/svg/house.svg",
      Mountain: "icons/svg/mountain.svg",
      "Oak Tree": "icons/svg/oak.svg",
      Obelisk: "icons/svg/obelisk.svg",
      Pawprint: "icons/svg/pawprint.svg",
      Ruins: "icons/svg/ruins.svg",
      Skull: "icons/svg/skull.svg",
      Statue: "icons/svg/statue.svg",
      Sword: "icons/svg/sword.svg",
      Tankard: "icons/svg/tankard.svg",
      Temple: "icons/svg/temple.svg",
      Tower: "icons/svg/tower.svg",
      Trap: "icons/svg/trap.svg",
      Village: "icons/svg/village.svg",
      Waterfall: "icons/svg/waterfall.svg",
      Windmill: "icons/svg/windmill.svg"
    },
    sidebarIcon: "fas fa-book-open"
  },

  /**
   * Configuration for the Macro document
   */
  Macro: {
    documentClass: Macro,
    collection: Macros,
    compendiumIndexFields: [],
    sidebarIcon: "fas fa-code"
  },

  /**
   * Configuration for the Playlist document
   */
  Playlist: {
    documentClass: Playlist,
    collection: Playlists,
    compendiumIndexFields: [],
    sidebarIcon: "fas fa-music",
    autoPreloadSeconds: 20
  },

  /**
   * Configuration for RollTable random draws
   */
  RollTable: {
    documentClass: RollTable,
    collection: RollTables,
    compendiumIndexFields: ["formula"],
    sidebarIcon: "fas fa-th-list",
    resultIcon: "icons/svg/d20-black.svg",
    resultTemplate: "templates/dice/table-result.html"
  },

  /**
   * Configuration for the Scene document
   */
  Scene: {
    documentClass: Scene,
    collection: Scenes,
    compendiumIndexFields: [],
    sidebarIcon: "fas fa-map"
  },

  Setting: {
    documentClass: Setting,
    collection: WorldSettings
  },

  /**
   * Configuration for the User document
   */
  User: {
    documentClass: User,
    collection: Users
  },

  /* -------------------------------------------- */
  /*  Canvas                                      */
  /* -------------------------------------------- */

  /**
   * Configuration settings for the Canvas and its contained layers and objects
   * @type {object}
   */
  Canvas: {
    blurStrength: 8,
    darknessColor: 0x242448,
    daylightColor: 0xEEEEEE,
    brightestColor: 0xFFFFFF,
    darknessLightPenalty: 0.25,
    dispositionColors: {
      HOSTILE: 0xE72124,
      NEUTRAL: 0xF1D836,
      FRIENDLY: 0x43DFDF,
      INACTIVE: 0x555555,
      PARTY: 0x33BC4E,
      CONTROLLED: 0xFF9829
    },
    exploredColor: 0x000000,
    unexploredColor: 0x000000,
    groups: {
      hidden: {
        groupClass: HiddenCanvasGroup,
        parent: "stage"
      },
      rendered: {
        groupClass: RenderedCanvasGroup,
        parent: "stage"
      },
      environment: {
        groupClass: EnvironmentCanvasGroup,
        parent: "rendered"
      },
      primary: {
        groupClass: PrimaryCanvasGroup,
        parent: "environment"
      },
      effects: {
        groupClass: EffectsCanvasGroup,
        parent: "environment"
      },
      interface: {
        groupClass: InterfaceCanvasGroup,
        parent: "rendered"
      }
    },
    layers: {
      weather: {
        layerClass: WeatherEffects,
        group: "primary"
      },
      grid: {
        layerClass: GridLayer,
        group: "interface"
      },
      drawings: {
        layerClass: DrawingsLayer,
        group: "interface"
      },
      templates: {
        layerClass: TemplateLayer,
        group: "interface"
      },
      tiles: {
        layerClass: TilesLayer,
        group: "interface"
      },
      walls: {
        layerClass: WallsLayer,
        group: "interface"
      },
      tokens: {
        layerClass: TokenLayer,
        group: "interface"
      },
      sounds: {
        layerClass: SoundsLayer,
        group: "interface"
      },
      lighting: {
        layerClass: LightingLayer,
        group: "interface"
      },
      notes: {
        layerClass: NotesLayer,
        group: "interface"
      },
      controls: {
        layerClass: ControlsLayer,
        group: "interface"
      }
    },
    lightLevels: {
      dark: 0,
      halfdark: 0.5,
      dim: 0.25,
      bright: 1.0
    },
    fogManager: FogManager,
    colorManager: CanvasColorManager,
    losBackend: ClockwiseSweepPolygon,
    rulerClass: Ruler,
    globalLightConfig: {
      luminosity: 0
    },
    maxZoom: 3.0,
    objectBorderThickness: 4,
    lightAnimations: {
      flame: {
        label: "LIGHT.AnimationFlame",
        animation: LightSource.prototype.animateFlickering,
        illuminationShader: FlameIlluminationShader,
        colorationShader: FlameColorationShader
      },
      torch: {
        label: "LIGHT.AnimationTorch",
        animation: LightSource.prototype.animateTorch,
        illuminationShader: TorchIlluminationShader,
        colorationShader: TorchColorationShader
      },
      pulse: {
        label: "LIGHT.AnimationPulse",
        animation: LightSource.prototype.animatePulse,
        illuminationShader: PulseIlluminationShader,
        colorationShader: PulseColorationShader
      },
      chroma: {
        label: "LIGHT.AnimationChroma",
        animation: LightSource.prototype.animateTime,
        colorationShader: ChromaColorationShader
      },
      wave: {
        label: "LIGHT.AnimationWave",
        animation: LightSource.prototype.animateTime,
        illuminationShader: WaveIlluminationShader,
        colorationShader: WaveColorationShader
      },
      fog: {
        label: "LIGHT.AnimationFog",
        animation: LightSource.prototype.animateTime,
        colorationShader: FogColorationShader
      },
      sunburst: {
        label: "LIGHT.AnimationSunburst",
        animation: LightSource.prototype.animateTime,
        illuminationShader: SunburstIlluminationShader,
        colorationShader: SunburstColorationShader
      },
      dome: {
        label: "LIGHT.AnimationLightDome",
        animation: LightSource.prototype.animateTime,
        colorationShader: LightDomeColorationShader
      },
      emanation: {
        label: "LIGHT.AnimationEmanation",
        animation: LightSource.prototype.animateTime,
        colorationShader: EmanationColorationShader
      },
      hexa: {
        label: "LIGHT.AnimationHexaDome",
        animation: LightSource.prototype.animateTime,
        colorationShader: HexaDomeColorationShader
      },
      ghost: {
        label: "LIGHT.AnimationGhostLight",
        animation: LightSource.prototype.animateTime,
        illuminationShader: GhostLightIlluminationShader,
        colorationShader: GhostLightColorationShader
      },
      energy: {
        label: "LIGHT.AnimationEnergyField",
        animation: LightSource.prototype.animateTime,
        colorationShader: EnergyFieldColorationShader
      },
      roiling: {
        label: "LIGHT.AnimationRoilingMass",
        animation: LightSource.prototype.animateTime,
        illuminationShader: RoilingIlluminationShader
      },
      hole: {
        label: "LIGHT.AnimationBlackHole",
        animation: LightSource.prototype.animateTime,
        illuminationShader: BlackHoleIlluminationShader
      },
      vortex: {
        label: "LIGHT.AnimationVortex",
        animation: LightSource.prototype.animateTime,
        illuminationShader: VortexIlluminationShader,
        colorationShader: VortexColorationShader
      },
      witchwave: {
        label: "LIGHT.AnimationBewitchingWave",
        animation: LightSource.prototype.animateTime,
        illuminationShader: BewitchingWaveIlluminationShader,
        colorationShader: BewitchingWaveColorationShader
      },
      rainbowswirl: {
        label: "LIGHT.AnimationSwirlingRainbow",
        animation: LightSource.prototype.animateTime,
        colorationShader: SwirlingRainbowColorationShader
      },
      radialrainbow: {
        label: "LIGHT.AnimationRadialRainbow",
        animation: LightSource.prototype.animateTime,
        colorationShader: RadialRainbowColorationShader
      },
      fairy: {
        label: "LIGHT.AnimationFairyLight",
        animation: LightSource.prototype.animateTime,
        illuminationShader: FairyLightIlluminationShader,
        colorationShader: FairyLightColorationShader
      },
      grid: {
        label: "LIGHT.AnimationForceGrid",
        animation: LightSource.prototype.animateTime,
        colorationShader: ForceGridColorationShader
      },
      starlight: {
        label: "LIGHT.AnimationStarLight",
        animation: LightSource.prototype.animateTime,
        colorationShader: StarLightColorationShader
      },
      smokepatch: {
        label: "LIGHT.AnimationSmokePatch",
        animation: LightSource.prototype.animateTime,
        illuminationShader: SmokePatchIlluminationShader,
        colorationShader: SmokePatchColorationShader
      }
    },
    pings: {
      types: {
        PULSE: "pulse",
        ALERT: "alert",
        PULL: "chevron",
        ARROW: "arrow"
      },
      styles: {
        alert: {
          class: AlertPing,
          color: "#ff0000",
          size: 1.5,
          duration: 900
        },
        arrow: {
          class: ArrowPing,
          size: 1,
          duration: 900
        },
        chevron: {
          class: ChevronPing,
          size: 1,
          duration: 2000
        },
        pulse: {
          class: PulsePing,
          size: 1.5,
          duration: 900
        }
      },
      pullSpeed: 700
    },
    targeting: {
      size: .15
    },

    /* -------------------------------------------- */

    /**
     * The set of VisionMode definitions which are available to be used for Token vision.
     * @type {Object<VisionMode>}
     */
    visionModes: {

      // Default (Basic) Vision
      basic: new VisionMode({
        id: "basic",
        label: "VISION.ModeBasicVision",
        vision: {
          defaults: { attenuation: 0, contrast: 0, saturation: 0, brightness: 0 },
          preferred: true // Takes priority over other vision modes
        }
      }),

      // Darkvision
      darkvision: new VisionMode({
        id: "darkvision",
        label: "VISION.ModeDarkvision",
        canvas: {
          shader: ColorAdjustmentsSamplerShader,
          uniforms: { contrast: 0, saturation: -1.0, brightness: 0 }
        },
        lighting: {
          levels: {
            [VisionMode.LIGHTING_LEVELS.DIM]: VisionMode.LIGHTING_LEVELS.BRIGHT
          },
          background: { visibility: VisionMode.LIGHTING_VISIBILITY.REQUIRED }
        },
        vision: {
          darkness: { adaptive: false },
          defaults: { attenuation: 0, contrast: 0, saturation: -1.0, brightness: 0 }
        }
      }),

      // Darkvision
      monochromatic: new VisionMode({
        id: "monochromatic",
        label: "VISION.ModeMonochromatic",
        canvas: {
          shader: ColorAdjustmentsSamplerShader,
          uniforms: { contrast: 0, saturation: -1.0, brightness: 0 }
        },
        lighting: {
          background: {
            postProcessingModes: ["SATURATION"],
            uniforms: { saturation: -1.0, tint: [1, 1, 1] }
          },
          illumination: {
            postProcessingModes: ["SATURATION"],
            uniforms: { saturation: -1.0, tint: [1, 1, 1] }
          },
          coloration: {
            postProcessingModes: ["SATURATION"],
            uniforms: { saturation: -1.0, tint: [1, 1, 1] }
          }
        },
        vision: {
          darkness: { adaptive: false },
          defaults: { attenuation: 0, contrast: 0, saturation: -1, brightness: 0 }
        }
      }),

      // Blindness
      blindness: new VisionMode({
        id: "blindness",
        label: "VISION.ModeBlindness",
        tokenConfig: false,
        canvas: {
          shader: ColorAdjustmentsSamplerShader,
          uniforms: { contrast: -0.75, saturation: -1, exposure: -0.3 }
        },
        lighting: {
          background: { visibility: VisionMode.LIGHTING_VISIBILITY.DISABLED },
          illumination: { visibility: VisionMode.LIGHTING_VISIBILITY.DISABLED },
          coloration: { visibility: VisionMode.LIGHTING_VISIBILITY.DISABLED }
        },
        vision: {
          darkness: { adaptive: false },
          defaults: { attenuation: 0, contrast: -0.5, saturation: -1, brightness: -1 }
        }
      }),

      // Tremorsense
      tremorsense: new VisionMode({
        id: "tremorsense",
        label: "VISION.ModeTremorsense",
        canvas: {
          shader: ColorAdjustmentsSamplerShader,
          uniforms: { contrast: 0, saturation: -0.8, exposure: -0.65 }
        },
        lighting: {
          background: { visibility: VisionMode.LIGHTING_VISIBILITY.DISABLED },
          illumination: { visibility: VisionMode.LIGHTING_VISIBILITY.DISABLED },
          coloration: { visibility: VisionMode.LIGHTING_VISIBILITY.DISABLED }
        },
        vision: {
          darkness: { adaptive: false },
          defaults: { attenuation: 0, contrast: 0.2, saturation: -0.3, brightness: 1 },
          background: { shader: WaveBackgroundVisionShader },
          coloration: { shader: WaveColorationVisionShader }
        }
      }, {animated: true}),

      // Light Amplification
      lightAmplification: new VisionMode({
        id: "lightAmplification",
        label: "VISION.ModeLightAmplification",
        canvas: {
          shader: AmplificationSamplerShader,
          uniforms: { saturation: -0.5, tint: [0.38, 0.8, 0.38] }
        },
        lighting: {
          background: {
            visibility: VisionMode.LIGHTING_VISIBILITY.REQUIRED,
            postProcessingModes: ["SATURATION", "EXPOSURE"],
            uniforms: { saturation: -0.5, exposure: 1.5, tint: [0.38, 0.8, 0.38] }
          },
          illumination: {
            postProcessingModes: ["SATURATION"],
            uniforms: { saturation: -0.5 }
          },
          coloration: {
            postProcessingModes: ["SATURATION", "EXPOSURE"],
            uniforms: { saturation: -0.5, exposure: 1.5, tint: [0.38, 0.8, 0.38] }
          },
          levels: {
            [VisionMode.LIGHTING_LEVELS.DIM]: VisionMode.LIGHTING_LEVELS.BRIGHT,
            [VisionMode.LIGHTING_LEVELS.BRIGHT]: VisionMode.LIGHTING_LEVELS.BRIGHTEST
          }
        },
        vision: {
          darkness: { adaptive: false },
          defaults: { attenuation: 0, contrast: 0, saturation: -0.5, brightness: 1 },
          background: { shader: AmplificationBackgroundVisionShader }
        }
      })
    },

    /* -------------------------------------------- */

    /**
     * The set of DetectionMode definitions which are available to be used for visibility detection.
     * @type {Object<DetectionMode>}
     */
    detectionModes: {
      basicSight: new DetectionModeBasicSight({
        id: "basicSight",
        label: "DETECTION.BasicSight",
        type: DetectionMode.DETECTION_TYPES.SIGHT
      }),
      seeInvisibility: new DetectionModeInvisibility({
        id: "seeInvisibility",
        label: "DETECTION.SeeInvisibility",
        type: DetectionMode.DETECTION_TYPES.SIGHT
      }),
      senseInvisibility: new DetectionModeInvisibility({
        id: "senseInvisibility",
        label: "DETECTION.SenseInvisibility",
        walls: false,
        type: DetectionMode.DETECTION_TYPES.OTHER
      }),
      feelTremor: new DetectionModeTremor({
        id: "feelTremor",
        label: "DETECTION.FeelTremor",
        walls: false,
        type: DetectionMode.DETECTION_TYPES.MOVE
      }),
      seeAll: new DetectionModeAll({
        id: "seeAll",
        label: "DETECTION.SeeAll",
        type: DetectionMode.DETECTION_TYPES.SIGHT
      }),
      senseAll: new DetectionModeAll({
        id: "senseAll",
        label: "DETECTION.SenseAll",
        walls: false,
        type: DetectionMode.DETECTION_TYPES.OTHER
      })
    }
  },

  /* -------------------------------------------- */

  /**
   * Configure the default Token text style so that it may be reused and overridden by modules
   * @type {PIXI.TextStyle}
   */
  canvasTextStyle: new PIXI.TextStyle({
    fontFamily: "Signika",
    fontSize: 36,
    fill: "#FFFFFF",
    stroke: "#111111",
    strokeThickness: 1,
    dropShadow: true,
    dropShadowColor: "#000000",
    dropShadowBlur: 2,
    dropShadowAngle: 0,
    dropShadowDistance: 0,
    align: "center",
    wordWrap: false,
    padding: 1
  }),

  /**
   * Available Weather Effects implementations
   * @type {object}
   */
  weatherEffects: {
    leaves: AutumnLeavesWeatherEffect,
    rain: RainWeatherEffect,
    snow: SnowWeatherEffect
  },


  /**
   * The control icons used for rendering common HUD operations
   * @type {object}
   */
  controlIcons: {
    combat: "icons/svg/combat.svg",
    visibility: "icons/svg/cowled.svg",
    effects: "icons/svg/aura.svg",
    lock: "icons/svg/padlock.svg",
    up: "icons/svg/up.svg",
    down: "icons/svg/down.svg",
    defeated: "icons/svg/skull.svg",
    light: "icons/svg/light.svg",
    lightOff: "icons/svg/light-off.svg",
    template: "icons/svg/explosion.svg",
    sound: "icons/svg/sound.svg",
    soundOff: "icons/svg/sound-off.svg",
    doorClosed: "icons/svg/door-closed-outline.svg",
    doorOpen: "icons/svg/door-open-outline.svg",
    doorSecret: "icons/svg/door-secret-outline.svg",
    doorLocked: "icons/svg/door-locked-outline.svg"
  },

  /**
   * @typedef {FontFaceDescriptors} FontDefinition
   * @property {string} urls  An array of remote URLs the font files exist at.
   */

  /**
   * @typedef {object} FontFamilyDefinition
   * @property {boolean} editor          Whether the font is available in the rich text editor. This will also enable it
   *                                     for notes and drawings.
   * @property {FontDefinition[]} fonts  Individual font face definitions for this font family. If this is empty, the
   *                                     font family may only be loaded from the client's OS-installed fonts.
   */

  /**
   * A collection of fonts to load either from the user's local system, or remotely.
   * @type {Object<FontFamilyDefinition>}
   */
  fontDefinitions: {
    Arial: {editor: true, fonts: []},
    Courier: {editor: true, fonts: []},
    "Courier New": {editor: true, fonts: []},
    "Modesto Condensed": {
      editor: true,
      fonts: [
        {urls: ["fonts/modesto-condensed/modesto-condensed.woff2"]},
        {urls: ["fonts/modesto-condensed/modesto-condensed-bold.woff2"], weight: 700}
      ]
    },
    Signika: {
      editor: true,
      fonts: [
        {urls: ["fonts/signika/signika-regular.woff2"]},
        {urls: ["fonts/signika/signika-bold.woff2"], weight: 700}
      ]
    },
    Times: {editor: true, fonts: []},
    "Times New Roman": {editor: true, fonts: []}
  },

  /**
   * @deprecated since v10.
   */
  _fontFamilies: [],

  /**
   * The default font family used for text labels on the PIXI Canvas
   * @type {string}
   */
  defaultFontFamily: "Signika",

  /**
   * An array of status effects which can be applied to a TokenDocument.
   * Each effect can either be a string for an icon path, or an object representing an Active Effect data.
   * @type {Array<string|ActiveEffectData>}
   */
  statusEffects: [
    {
      id: "dead",
      label: "EFFECT.StatusDead",
      icon: "icons/svg/skull.svg"
    },
    {
      id: "unconscious",
      label: "EFFECT.StatusUnconscious",
      icon: "icons/svg/unconscious.svg"
    },
    {
      id: "sleep",
      label: "EFFECT.StatusAsleep",
      icon: "icons/svg/sleep.svg"
    },
    {
      id: "stun",
      label: "EFFECT.StatusStunned",
      icon: "icons/svg/daze.svg"
    },
    {
      id: "prone",
      label: "EFFECT.StatusProne",
      icon: "icons/svg/falling.svg"
    },
    {
      id: "restrain",
      label: "EFFECT.StatusRestrained",
      icon: "icons/svg/net.svg"
    },
    {
      id: "paralysis",
      label: "EFFECT.StatusParalysis",
      icon: "icons/svg/paralysis.svg"
    },
    {
      id: "fly",
      label: "EFFECT.StatusFlying",
      icon: "icons/svg/wing.svg"
    },
    {
      id: "blind",
      label: "EFFECT.StatusBlind",
      icon: "icons/svg/blind.svg"
    },
    {
      id: "deaf",
      label: "EFFECT.StatusDeaf",
      icon: "icons/svg/deaf.svg"
    },
    {
      id: "silence",
      label: "EFFECT.StatusSilenced",
      icon: "icons/svg/silenced.svg"
    },
    {
      id: "fear",
      label: "EFFECT.StatusFear",
      icon: "icons/svg/terror.svg"
    },
    {
      id: "burning",
      label: "EFFECT.StatusBurning",
      icon: "icons/svg/fire.svg"
    },
    {
      id: "frozen",
      label: "EFFECT.StatusFrozen",
      icon: "icons/svg/frozen.svg"
    },
    {
      id: "shock",
      label: "EFFECT.StatusShocked",
      icon: "icons/svg/lightning.svg"
    },
    {
      id: "corrode",
      label: "EFFECT.StatusCorrode",
      icon: "icons/svg/acid.svg"
    },
    {
      id: "bleeding",
      label: "EFFECT.StatusBleeding",
      icon: "icons/svg/blood.svg"
    },
    {
      id: "disease",
      label: "EFFECT.StatusDisease",
      icon: "icons/svg/biohazard.svg"
    },
    {
      id: "poison",
      label: "EFFECT.StatusPoison",
      icon: "icons/svg/poison.svg"
    },
    {
      id: "curse",
      label: "EFFECT.StatusCursed",
      icon: "icons/svg/sun.svg"
    },
    {
      id: "regen",
      label: "EFFECT.StatusRegen",
      icon: "icons/svg/regen.svg"
    },
    {
      id: "degen",
      label: "EFFECT.StatusDegen",
      icon: "icons/svg/degen.svg"
    },
    {
      id: "upgrade",
      label: "EFFECT.StatusUpgrade",
      icon: "icons/svg/upgrade.svg"
    },
    {
      id: "downgrade",
      label: "EFFECT.StatusDowngrade",
      icon: "icons/svg/downgrade.svg"
    },
    {
      id: "invisible",
      label: "EFFECT.StatusInvisible",
      icon: "icons/svg/invisible.svg"
    },
    {
      id: "target",
      label: "EFFECT.StatusTarget",
      icon: "icons/svg/target.svg"
    },
    {
      id: "eye",
      label: "EFFECT.StatusMarked",
      icon: "icons/svg/eye.svg"
    },
    {
      id: "bless",
      label: "EFFECT.StatusBlessed",
      icon: "icons/svg/angel.svg"
    },
    {
      id: "fireShield",
      label: "EFFECT.StatusFireShield",
      icon: "icons/svg/fire-shield.svg"
    },
    {
      id: "coldShield",
      label: "EFFECT.StatusIceShield",
      icon: "icons/svg/ice-shield.svg"
    },
    {
      id: "magicShield",
      label: "EFFECT.StatusMagicShield",
      icon: "icons/svg/mage-shield.svg"
    },
    {
      id: "holyShield",
      label: "EFFECT.StatusHolyShield",
      icon: "icons/svg/holy-shield.svg"
    }
  ],

  /**
   * A mapping of status effect IDs which provide some additional mechanical integration.
   * @enum {string}
   */
  specialStatusEffects: {
    DEFEATED: "dead",
    INVISIBLE: "invisible",
    BLIND: "blind"
  },

  /**
   * A mapping of core audio effects used which can be replaced by systems or mods
   * @type {object}
   */
  sounds: {
    dice: "sounds/dice.wav",
    lock: "sounds/lock.wav",
    notification: "sounds/notify.wav",
    combat: "sounds/drums.wav"
  },

  /**
   * Define the set of supported languages for localization
   * @type {{string, string}}
   */
  supportedLanguages: {
    en: "English"
  },

  /**
   * Configuration for time tracking
   * @type {{turnTime: number}}
   */
  time: {
    turnTime: 0,
    roundTime: 0
  },

  /* -------------------------------------------- */
  /*  Embedded Documents                          */
  /* -------------------------------------------- */

  /**
   * Configuration for the ActiveEffect embedded document type
   */
  ActiveEffect: {
    documentClass: ActiveEffect
  },

  /**
   * Configuration for the Card embedded Document type
   */
  Card: {
    documentClass: Card,
    systemDataModels: {}
  },

  /**
   * Configuration for the TableResult embedded document type
   */
  TableResult: {
    documentClass: TableResult
  },

  /**
   * Configuration for the JournalEntryPage embedded document type.
   */
  JournalEntryPage: {
    documentClass: JournalEntryPage,
    typeLabels: {
      image: "JOURNALENTRYPAGE.TypeImage",
      pdf: "JOURNALENTRYPAGE.TypePDF",
      text: "JOURNALENTRYPAGE.TypeText",
      video: "JOURNALENTRYPAGE.TypeVideo"
    },
    typeIcons: {
      image: "fas fa-file-image",
      pdf: "fas fa-file-pdf",
      text: "fas fa-file-lines",
      video: "fas fa-file-video"
    },
    defaultType: "text",
    sidebarIcon: "fas fa-book-open"
  },

  /**
   * Configuration for the PlaylistSound embedded document type
   */
  PlaylistSound: {
    documentClass: PlaylistSound,
    sidebarIcon: "fas fa-music"
  },

  /**
   * Configuration for the AmbientLight embedded document type and its representation on the game Canvas
   * @enum {Function}
   */
  AmbientLight: {
    documentClass: AmbientLightDocument,
    objectClass: AmbientLight,
    layerClass: LightingLayer
  },

  /**
   * Configuration for the AmbientSound embedded document type and its representation on the game Canvas
   * @enum {Function}
   */
  AmbientSound: {
    documentClass: AmbientSoundDocument,
    objectClass: AmbientSound,
    layerClass: SoundsLayer
  },

  /**
   * Configuration for the Combatant embedded document type within a Combat document
   * @enum {Function}
   */
  Combatant: {
    documentClass: Combatant
  },

  /**
   * Configuration for the Drawing embedded document type and its representation on the game Canvas
   * @enum {Function}
   */
  Drawing: {
    documentClass: DrawingDocument,
    objectClass: Drawing,
    layerClass: DrawingsLayer
  },

  /**
   * Configuration for the MeasuredTemplate embedded document type and its representation on the game Canvas
   * @enum {Function}
   */
  MeasuredTemplate: {
    defaults: {
      angle: 53.13,
      width: 1
    },
    types: {
      circle: "Circle",
      cone: "Cone",
      rect: "Rectangle",
      ray: "Ray"
    },
    documentClass: MeasuredTemplateDocument,
    objectClass: MeasuredTemplate,
    layerClass: TemplateLayer
  },

  /**
   * Configuration for the Note embedded document type and its representation on the game Canvas
   * @enum {Function}
   */
  Note: {
    documentClass: NoteDocument,
    objectClass: Note,
    layerClass: NotesLayer
  },

  /**
   * Configuration for the Tile embedded document type and its representation on the game Canvas
   * @enum {Function}
   */
  Tile: {
    documentClass: TileDocument,
    objectClass: Tile,
    layerClass: TilesLayer
  },

  /**
   * Configuration for the Token embedded document type and its representation on the game Canvas
   * @enum {Function}
   */
  Token: {
    documentClass: TokenDocument,
    objectClass: Token,
    layerClass: TokenLayer,
    prototypeSheetClass: TokenConfig
  },

  /**
   * Configuration for the Wall embedded document type and its representation on the game Canvas
   * @enum {Function}
   */
  Wall: {
    documentClass: WallDocument,
    objectClass: Wall,
    layerClass: WallsLayer
  },

  /* -------------------------------------------- */
  /*  Integrations                                */
  /* -------------------------------------------- */

  /**
   * Default configuration options for TinyMCE editors
   * @type {object}
   */
  TinyMCE: {
    branding: false,
    menubar: false,
    statusbar: false,
    content_css: ["/css/mce.css"],
    plugins: "lists image table code save link",
    toolbar: "styles bullist numlist image table hr link removeformat code save",
    save_enablewhendirty: true,
    table_default_styles: {},
    style_formats: [
      {
        title: "Custom",
        items: [
          {
            title: "Secret",
            block: "section",
            classes: "secret",
            wrapper: true
          }
        ]
      }
    ],
    style_formats_merge: true
  },

  /**
   * @callback TextEditorEnricher
   * @param {RegExpMatchArray} match          The regular expression match result
   * @param {EnrichmentOptions} [options]     Options provided to customize text enrichment
   * @returns {Promise<HTMLElement|null>}     An HTML element to insert in place of the matched text or null to
   *                                          indicate that no replacement should be made.
   */

  /**
   * @typedef {object} TextEditorEnricherConfig
   * @property {RegExp} pattern               The string pattern to match. Must be flagged as global.
   * @property {TextEditorEnricher} enricher  The function that will be called on each match. It is expected that this
   *                                          returns an HTML element to be inserted into the final enriched content.
   */

  /**
   * Rich text editing configuration.
   * @type {object}
   */
  TextEditor: {
    /**
     * A collection of custom enrichers that can be applied to text content, allowing for the matching and handling of
     * custom patterns.
     * @type {TextEditorEnricherConfig[]}
     */
    enrichers: []
  },

  /**
   * Configuration for the WebRTC implementation class
   * @type {object}
   */
  WebRTC: {
    clientClass: SimplePeerAVClient,
    detectPeerVolumeInterval: 50,
    detectSelfVolumeInterval: 20,
    emitVolumeInterval: 25,
    speakingThresholdEvents: 2,
    speakingHistoryLength: 10,
    connectedUserPollIntervalS: 8
  },

  /* -------------------------------------------- */
  /*  Interface                                   */
  /* -------------------------------------------- */

  /**
   * Configure the Application classes used to render various core UI elements in the application.
   * The order of this object is relevant, as certain classes need to be constructed and referenced before others.
   * @type {Object<Application>}
   */
  ui: {
    menu: MainMenu,
    sidebar: Sidebar,
    pause: Pause,
    nav: SceneNavigation,
    notifications: Notifications,
    actors: ActorDirectory,
    cards: CardsDirectory,
    chat: ChatLog,
    combat: CombatTracker,
    compendium: CompendiumDirectory,
    controls: SceneControls,
    hotbar: Hotbar,
    items: ItemDirectory,
    journal: JournalDirectory,
    macros: MacroDirectory,
    players: PlayerList,
    playlists: PlaylistDirectory,
    scenes: SceneDirectory,
    settings: Settings,
    tables: RollTableDirectory,
    webrtc: CameraViews
  }
};

/**
 * @deprecated since v10
 */
CONFIG._fontFamilies = Object.keys(CONFIG.fontDefinitions);
Object.defineProperty(CONFIG, "fontFamilies", {
  get() {
    foundry.utils.logCompatibilityWarning(
      "CONFIG.fontFamilies is deprecated. Please use CONFIG.fontDefinitions instead.", {since: 10, until: 12});
    return CONFIG._fontFamilies;
  }
});
