import Document from "../abstract/document.mjs";
import {mergeObject} from "../utils/helpers.mjs";
import * as CONST from "../constants.mjs";
import * as documents from "./module.mjs";
import * as fields from "../data/fields.mjs";
import {TextureData} from "../data/data.mjs";

/**
 * @typedef {Object} SceneData
 * @property {string} _id                 The _id which uniquely identifies this Scene document
 * @property {string} name                The name of this scene
 * @property {boolean} [active=false]     Is this scene currently active? Only one scene may be active at a given time
 * @property {boolean} [navigation=false] Is this scene displayed in the top navigation bar?
 * @property {number} [navOrder]          The sorting order of this Scene in the navigation bar relative to siblings
 * @property {string} [navName]           A string which overrides Scene name for display in the navigation bar
 * @property {TextureData|null} [background]  An image or video file that provides the background texture for the scene.
 * @property {string|null} [foreground]   An image or video file path providing foreground media for the scene
 * @property {number} [foregroundElevation=20] The elevation of the foreground layer where overhead tiles reside
 *
 * @property {string|null} [thumb]        A thumbnail image which depicts the scene at lower resolution
 * @property {number} [width=4000]        The width of the scene canvas, normally the width of the background media
 * @property {number} [height=3000]       The height of the scene canvas, normally the height of the background media
 * @property {number} [padding=0.25]      The proportion of canvas padding applied around the outside of the scene
 *                                        dimensions to provide additional buffer space
 * @property {{x: number, y: number, scale: number}|null} [initial=null] The initial view coordinates for the scene
 * @property {string|null} [backgroundColor=#999999] The color of the canvas displayed behind the scene background
 * @property {GridData} [grid]            Grid configuration for the scene
 * @property {boolean} [tokenVision=true] Do Tokens require vision in order to see the Scene environment?
 * @property {boolean} [globalLight=false] Is a global source of illumination present which provides dim light to all
 *                                        areas of the Scene?
 * @property {number} [darkness=0]        The ambient darkness level in this Scene, where 0 represents midday
 *                                        (maximum illumination) and 1 represents midnight (maximum darkness)
 * @property {number} [globalLightThreshold] A darkness threshold between 0 and 1. When the Scene darkness level
 *                                        exceeds this threshold Global Illumination is automatically disabled
 *
 * @property {boolean} [fogExploration=true] Should fog exploration progress be tracked for this Scene?
 * @property {number} [fogReset]          The timestamp at which fog of war was last reset for this Scene.
 * @property {string|null} [fogOverlay]   A special overlay image or video texture which is used for fog of war
 * @property {string|null} [fogExploredColor]   A color tint applied to explored regions of fog of war
 * @property {string|null} [fogUnexploredColor] A color tint applied to unexplored regions of fog of war
 *
 * @property {Collection<BaseDrawing>} [drawings=[]]   A collection of embedded Drawing objects.
 * @property {Collection<BaseTile>} [tiles=[]]         A collection of embedded Tile objects.
 * @property {Collection<BaseToken>} [tokens=[]]       A collection of embedded Token objects.
 * @property {Collection<BaseAmbientLight>} [lights=[]] A collection of embedded AmbientLight objects.
 * @property {Collection<BaseNote>} [notes=[]]         A collection of embedded Note objects.
 * @property {Collection<BaseAmbientSound>} [sounds=[]] A collection of embedded AmbientSound objects.
 * @property {Collection<BaseMeasuredTemplate>} [templates=[]] A collection of embedded MeasuredTemplate objects.
 * @property {Collection<BaseWall>} [walls=[]]         A collection of embedded Wall objects
 * @property {BasePlaylist} [playlist]    A linked Playlist document which should begin automatically playing when this
 *                                        Scene becomes active.
 * @property {BasePlaylistSound} [playlistSound]  A linked PlaylistSound document from the selected playlist that will
 *                                                begin automatically playing when this Scene becomes active
 * @property {JournalEntry} [journal]     A JournalEntry document which provides narrative details about this Scene
 * @property {string} [weather]           A named weather effect which should be rendered in this Scene.

 * @property {string|null} folder         The _id of a Folder which contains this Actor
 * @property {number} [sort]              The numeric sort value which orders this Actor relative to its siblings
 * @property {object} [ownership]         An object which configures ownership of this Scene
 * @property {object} [flags]             An object of optional key/value flags
 * @property {DocumentStats} [_stats]     An object of creation and access information
 */

/**
 * @typedef {object} GridData
 * @property {number} [type=1]         The type of grid, a number from CONST.GRID_TYPES.
 * @property {number} [size=100]       The grid size which represents the width (or height) of a single grid space.
 * @property {string} [color=#000000]  A string representing the color used to render the grid lines.
 * @property {number} [alpha=0.2]      A number between 0 and 1 for the opacity of the grid lines.
 * @property {number} [distance]       The number of distance units which are represented by a single grid space.
 * @property {string} [units]          A label for the units of measure which are used for grid distance.
 */

/**
 * The Document definition for a Scene.
 * Defines the DataSchema and common behaviors for a Scene which are shared between both client and server.
 * @extends abstract.Document
 * @mixes SceneData
 * @memberof documents
 *
 * @param {SceneData} data                        Initial data from which to construct the Scene
 * @param {DocumentConstructionContext} context   Construction context options
 */
class BaseScene extends Document {

  /* -------------------------------------------- */
  /*  Model Configuration                         */
  /* -------------------------------------------- */

  /** @inheritdoc */
  static metadata = Object.freeze(mergeObject(super.metadata, {
    name: "Scene",
    collection: "scenes",
    indexed: true,
    compendiumIndexFields: ["_id", "name", "thumb", "sort", "folder"],
    embedded: {
      AmbientLight: "lights",
      AmbientSound: "sounds",
      Drawing: "drawings",
      MeasuredTemplate: "templates",
      Note: "notes",
      Tile: "tiles",
      Token: "tokens",
      Wall: "walls"
    },
    label: "DOCUMENT.Scene",
    labelPlural: "DOCUMENT.Scenes",
    preserveOnImport: [...super.metadata.preserveOnImport, "active"]
  }, {inplace: false}));

  /** @inheritdoc */
  static defineSchema() {
    return {
      _id: new fields.DocumentIdField(),
      name: new fields.StringField({required: true, blank: false, textSearch: true}),

      // Navigation
      active: new fields.BooleanField(),
      navigation: new fields.BooleanField({initial: true}),
      navOrder: new fields.NumberField({required: true, nullable: false, integer: true, initial: 0}),
      navName: new fields.HTMLField({textSearch: true}),

      // Canvas Dimensions
      background: new TextureData(),
      foreground: new fields.FilePathField({categories: ["IMAGE", "VIDEO"]}),
      foregroundElevation: new fields.NumberField({required: false, positive: true, integer: true}),
      thumb: new fields.FilePathField({categories: ["IMAGE"]}),
      width: new fields.NumberField({integer: true, positive: true, initial: 4000}),
      height: new fields.NumberField({integer: true, positive: true, initial: 3000}),
      padding: new fields.NumberField({required: true, nullable: false, min: 0, max: 0.5, step: 0.05, initial: 0.25}),
      initial: new fields.SchemaField({
        x: new fields.NumberField({integer: true, nullable: true, initial: undefined}),
        y: new fields.NumberField({integer: true, nullable: true, initial: undefined}),
        scale: new fields.NumberField({nullable: true, min: 0.25, max: 3, initial: undefined})
      }),
      backgroundColor: new fields.ColorField({initial: "#999999"}),

      // Grid Configuration
      grid: new fields.SchemaField({
        type: new fields.NumberField({required: true, choices: Object.values(CONST.GRID_TYPES),
          initial: CONST.GRID_TYPES.SQUARE, validationError: "must be a value in CONST.GRID_TYPES"}),
        size: new fields.NumberField({required: true, nullable: false, integer: true, min: CONST.GRID_MIN_SIZE,
          initial: 100, validationError: `must be an integer number of pixels, ${CONST.GRID_MIN_SIZE} or greater`}),
        color: new fields.ColorField({required: true, nullable: false, initial: "#000000"}),
        alpha: new fields.AlphaField({initial: 0.2}),
        distance: new fields.NumberField({required: true, nullable: false, positive: true,
          initial: () => game.system.gridDistance || 1}),
        units: new fields.StringField({initial: () => game.system.gridUnits ?? ""})
      }),

      // Vision and Lighting Configuration
      tokenVision: new fields.BooleanField({initial: true}),
      fogExploration: new fields.BooleanField({initial: true}),
      fogReset: new fields.NumberField({nullable: false, initial: Date.now}),
      globalLight: new fields.BooleanField(),
      globalLightThreshold: new fields.AlphaField({nullable: true, initial: null}),
      darkness: new fields.AlphaField({initial: 0}),
      fogOverlay: new fields.FilePathField({categories: ["IMAGE", "VIDEO"]}),
      fogExploredColor: new fields.ColorField({label: "SCENES.FogExploredColor"}),
      fogUnexploredColor: new fields.ColorField({label: "SCENES.FogUnexploredColor"}),

      // Embedded Collections
      drawings: new fields.EmbeddedCollectionField(documents.BaseDrawing),
      tokens: new fields.EmbeddedCollectionField(documents.BaseToken),
      lights: new fields.EmbeddedCollectionField(documents.BaseAmbientLight),
      notes: new fields.EmbeddedCollectionField(documents.BaseNote),
      sounds: new fields.EmbeddedCollectionField(documents.BaseAmbientSound),
      templates: new fields.EmbeddedCollectionField(documents.BaseMeasuredTemplate),
      tiles: new fields.EmbeddedCollectionField(documents.BaseTile),
      walls: new fields.EmbeddedCollectionField(documents.BaseWall),

      // Linked Documents
      playlist: new fields.ForeignDocumentField(documents.BasePlaylist),
      playlistSound: new fields.ForeignDocumentField(documents.BasePlaylistSound, {idOnly: true}),
      journal: new fields.ForeignDocumentField(documents.BaseJournalEntry),
      journalEntryPage: new fields.ForeignDocumentField(documents.BaseJournalEntryPage, {idOnly: true}),
      weather: new fields.StringField(),

      // Permissions
      folder: new fields.ForeignDocumentField(documents.BaseFolder),
      sort: new fields.IntegerSortField(),
      ownership: new fields.DocumentOwnershipField(),
      flags: new fields.ObjectField(),
      _stats: new fields.DocumentStatsField()
    }
  }

  /* -------------------------------------------- */
  /*  Deprecations and Compatibility              */
  /* -------------------------------------------- */

  /** @inheritdoc */
  static migrateData(data) {
    /**
     * Rename permission to ownership
     * @deprecated since v10
     */
    this._addDataFieldMigration(data, "permission", "ownership");

    /**
     * Migration to inner grid schema and TextureData. Can be safely removed in V13+
     * @deprecated since v10
     */
    if ( ("grid" in data) && (typeof data.grid !== "object") ) data.grid = {size: data.grid};
    for ( const [oldKey, newKey] of Object.entries({
      "gridType": "grid.type",
      "gridColor": "grid.color",
      "gridAlpha": "grid.alpha",
      "gridDistance": "grid.distance",
      "gridUnits": "grid.units",
      "img": "background.src",
      "shiftX": "background.offsetX",
      "shiftY": "background.offsetY"
    }) ) this._addDataFieldMigration(data, oldKey, newKey);
    return super.migrateData(data);
  }

  /* ---------------------------------------- */

  /** @inheritdoc */
  static shimData(data, options) {
    const shims = {};
    /**
     * Migration to inner grid schema.
     * @deprecated since v10
     */
    mergeObject(shims, {
      gridType: "grid.type",
      gridColor: "grid.color",
      gridAlpha: "grid.alpha",
      gridDistance: "grid.distance",
      gridUnits: "grid.units"
    });
    /**
     * Migration to TextureData.
     * @deprecated since v10
     */
    mergeObject(shims, {
      img: "background.src",
      shiftX: "background.offsetX",
      shiftY: "background.offsetY"
    });
    /**
     * Rename permission to owners.
     * @deprecated since v10
     */
    shims.permission = "ownership";
    this._addDataFieldShims(data, shims, {since: 10, until: 12});
    return super.shimData(data, options);
  }
}
export default BaseScene;
