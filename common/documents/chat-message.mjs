import Document from "../abstract/document.mjs";
import {mergeObject} from "../utils/helpers.mjs";
import * as fields from "../data/fields.mjs";
import * as CONST from "../constants.mjs";
import * as documents from "./module.mjs";

/**
 * @typedef {Object} ChatMessageData
 * @property {string} _id                 The _id which uniquely identifies this ChatMessage document
 * @property {number} [type=0]            The message type from CONST.CHAT_MESSAGE_TYPES
 * @property {string} user                The _id of the User document who generated this message
 * @property {number} timestamp           The timestamp at which point this message was generated
 * @property {string} [flavor]            An optional flavor text message which summarizes this message
 * @property {string} content             The HTML content of this chat message
 * @property {ChatSpeakerData} speaker    A ChatSpeakerData object which describes the origin of the ChatMessage
 * @property {string[]} whisper           An array of User _id values to whom this message is privately whispered
 * @property {boolean} [blind=false]      Is this message sent blindly where the creating User cannot see it?
 * @property {string[]} [rolls]           Serialized content of any Roll instances attached to the ChatMessage
 * @property {string} [sound]             The URL of an audio file which plays when this message is received
 * @property {boolean} [emote=false]      Is this message styled as an emote?
 * @property {object} [flags]             An object of optional key/value flags
 */

/**
 * @typedef {Object} ChatSpeakerData
 * @property {string} [scene]       The _id of the Scene where this message was created
 * @property {string} [actor]       The _id of the Actor who generated this message
 * @property {string} [token]       The _id of the Token who generated this message
 * @property {string} [alias]       An overridden alias name used instead of the Actor or Token name
 */

/**
 * The Document definition for a ChatMessage.
 * Defines the DataSchema and common behaviors for a ChatMessage which are shared between both client and server.
 * @extends abstract.Document
 * @mixes ChatMessageData
 * @memberof documents
 *
 * @param {ChatMessageData} data                  Initial data from which to construct the ChatMessage
 * @param {DocumentConstructionContext} context   Construction context options
 */
class BaseChatMessage extends Document {

  /* -------------------------------------------- */
  /*  Model Configuration                         */
  /* -------------------------------------------- */

  /** @inheritdoc */
  static metadata = Object.freeze(mergeObject(super.metadata, {
    name: "ChatMessage",
    collection: "messages",
    label: "DOCUMENT.ChatMessage",
    labelPlural: "DOCUMENT.ChatMessages",
    isPrimary: true,
    permissions: {
      create: this.#canCreate,
      update: this.#canUpdate,
      delete: this.#canDelete
    }
  }, {inplace: false}));

  /** @inheritdoc */
  static defineSchema() {
    return {
      _id: new fields.DocumentIdField(),
      type: new fields.NumberField({required: true, choices: Object.values(CONST.CHAT_MESSAGE_TYPES),
        initial: CONST.CHAT_MESSAGE_TYPES.OTHER, validationError: "must be a value in CONST.CHAT_MESSAGE_TYPES"}),
      user: new fields.ForeignDocumentField(documents.BaseUser, {nullable: false, initial: () => game?.user?.id}),
      timestamp: new fields.NumberField({required: true, nullable: false, initial: Date.now}),
      flavor: new fields.HTMLField(),
      content: new fields.HTMLField({textSearch: true}),
      speaker: new fields.SchemaField({
        scene: new fields.ForeignDocumentField(documents.BaseScene, {idOnly: true}),
        actor: new fields.ForeignDocumentField(documents.BaseActor, {idOnly: true}),
        token: new fields.ForeignDocumentField(documents.BaseToken, {idOnly: true}),
        alias: new fields.StringField()
      }),
      whisper: new fields.ArrayField(new fields.ForeignDocumentField(documents.BaseUser, {idOnly: true})),
      blind: new fields.BooleanField(),
      rolls: new fields.ArrayField(new fields.JSONField({validate: BaseChatMessage.#validateRoll})),
      sound: new fields.FilePathField({categories: ["AUDIO"]}),
      emote: new fields.BooleanField(),
      flags: new fields.ObjectField()
    };
  }

  /**
   * Is a user able to create a new chat message?
   * @private
   */
  static #canCreate(user, doc) {
    if ( user.isGM ) return true;
    if ( user.id !== doc._source.user ) return false; // You cannot impersonate a different user
    return user.hasRole("PLAYER");                    // Any player can create messages
  }

  /**
   * Is a user able to update an existing chat message?
   * @private
   */
  static #canUpdate(user, doc, data) {
    if ( user.isGM ) return true;                     // GM users can do anything
    if ( user.id !== doc._source.user ) return false; // Otherwise, message authors
    if ( "user" in data ) return false;               // Message author is immutable
    return true;
  }

  /**
   * Is a user able to delete an existing chat message?
   * @private
   */
  static #canDelete(user, doc) {
    if ( user.isGM ) return true;                     // GM users can do anything
    return user.id === doc._source.user;              // Otherwise, message authors
  }

  /* -------------------------------------------- */

  /**
   * Validate that Rolls belonging to the ChatMessage document are valid
   * @param {string} rollJSON     The serialized Roll data
   */
  static #validateRoll(rollJSON) {
    const roll = JSON.parse(rollJSON);
    if ( !roll.evaluated ) throw new Error(`Roll objects added to ChatMessage documents must be evaluated`);
  }

  /* -------------------------------------------- */
  /*  Deprecations and Compatibility              */
  /* -------------------------------------------- */

  /** @inheritdoc */
  static migrateData(data) {
    /**
     * V10 migration from one roll to many
     * @deprecated since v10
     */
    if ( ("roll" in data) && !("rolls" in data) ) {
      data.rolls = [data.roll];
    }
    return super.migrateData(data);
  }

  /* ---------------------------------------- */

  /** @inheritdoc */
  static shimData(data, options) {
    this._addDataFieldShim(data, "roll", "rolls", {since: 10, until: 12, value: data.rolls?.[0]})
    return super.shimData(data, options);
  }
}
export default BaseChatMessage;
